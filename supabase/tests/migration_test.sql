-- Test van schema, matching, ingest en notificatie-claim. Faalt met een exception bij een fout.
\set ON_ERROR_STOP on

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'a@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'b@example.com');

-- Gebruiker A: Amsterdam, max €1.200, min 50 m². Gebruiker B: alles, geen jongerencontract.
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
insert into search_profiles (cities, max_rent, min_area) values ('{Amsterdam}', 1200, 50);
insert into notification_settings (whatsapp_phone, callmebot_apikey) values ('+31600000001', 'key-a');
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
insert into search_profiles (exclude_contract_types) values ('{Jongerencontract}');
reset role;

-- Eerste ingest: drie woningen.
select ingest_listings('dak', '[
  {"external_id":"1","url":"u1","city":"Amsterdam","rent_net":1100,"area_m2":60,"contract_type":"Onbepaalde tijd contract","deadline_at":"2999-01-01T00:00:00Z"},
  {"external_id":"2","url":"u2","city":"Zaandam","rent_net":800,"area_m2":70,"contract_type":"Jongerencontract","deadline_at":"2999-01-01T00:00:00Z"},
  {"external_id":"3","url":"u3","city":"Amsterdam","rent_net":1500,"area_m2":80,"deadline_at":"2999-01-01T00:00:00Z"},
  {"external_id":"P1","url":"up","city":"Amsterdam","rent_net":150,"unit_kind":"Parkeergelegenheid","deadline_at":"2999-01-01T00:00:00Z"}
]'::jsonb, 'fp1', true, now()) as eerste;

do $$ begin
  assert (select count(*) from listings) = 4, 'drie woningen en een parkeerplaats';
  assert (select count(*) from matches m join listings l on l.id = m.listing_id where l.unit_kind = 'Parkeergelegenheid') = 0, 'parkeerplaats matcht nooit';
  assert (select count(*) from matches m join auth.users u on u.id = m.user_id where u.email = 'a@example.com') = 1, 'A matcht alleen woning 1';
  assert (select count(*) from matches m join auth.users u on u.id = m.user_id where u.email = 'b@example.com') = 2, 'B matcht 1 en 3 (2 is jongerencontract)';
end $$;

-- Claim: alleen A heeft WhatsApp-instellingen.
select match_id, whatsapp_phone, listing ->> 'external_id' as woning from claim_notifications(10);
do $$ begin
  assert (select count(*) from matches where notified_at is not null) = 1, 'een melding geclaimd';
  assert (select count(*) from claim_notifications(10)) = 0, 'niets dubbel geclaimd';
end $$;

-- Release zet de melding terug.
select release_notification(array(select id from matches where notified_at is not null), 'test');
do $$ begin assert (select count(*) from claim_notifications(10)) = 1, 'na release opnieuw claimbaar'; end $$;

-- Tweede ingest: woning 3 weg, woning 1 duurder. Na één keer missen nog actief.
select ingest_listings('dak', '[
  {"external_id":"1","url":"u1","city":"Amsterdam","rent_net":1150,"area_m2":60,"deadline_at":"2999-01-01T00:00:00Z"},
  {"external_id":"2","url":"u2","city":"Zaandam","rent_net":800,"area_m2":70,"contract_type":"Jongerencontract","deadline_at":"2999-01-01T00:00:00Z"}
]'::jsonb, 'fp2', true, now()) as tweede;
do $$ begin
  assert (select status from listings where external_id = '3') = 'active', 'na 1x missen nog actief';
  assert (select count(*) from listing_events where kind = 'changed') = 1, 'prijswijziging gelogd';
end $$;

-- Derde ingest: woning 3 nog steeds weg → offline. Woning 2 met verlopen termijn → closed.
select ingest_listings('dak', '[
  {"external_id":"1","url":"u1","city":"Amsterdam","rent_net":1150,"area_m2":60,"deadline_at":"2999-01-01T00:00:00Z"},
  {"external_id":"2","url":"u2","city":"Zaandam","rent_net":800,"area_m2":70,"contract_type":"Jongerencontract","deadline_at":"2000-01-01T00:00:00Z"}
]'::jsonb, 'fp3', true, now()) as derde;
do $$ begin
  assert (select status from listings where external_id = '3') = 'offline', 'na 2x missen offline';
  assert (select status from listings where external_id = '2') = 'closed', 'termijn verlopen';
end $$;

-- Nieuw profiel: matcht bestaand aanbod, maar telt als al gemeld.
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
insert into search_profiles (name) values ('alles');
reset role;
do $$ begin
  assert (select count(*) from matches m join search_profiles p on p.id = m.profile_id
          where p.name = 'alles' and m.notified_at is null) = 0, 'backfill niet melden';
end $$;

-- RLS: A ziet alleen eigen matches en mag alleen user_status wijzigen.
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
do $$ begin
  assert (select count(*) from matches where user_id <> auth.uid()) = 0, 'geen matches van anderen';
  assert (select count(*) from notification_settings) = 1, 'alleen eigen instellingen';
end $$;
update matches set user_status = 'dismissed' where listing_id = (select id from listings where external_id = '1');
do $$ begin
  begin
    update matches set notified_at = null;
    raise exception 'notified_at had niet bijgewerkt mogen worden';
  exception when insufficient_privilege then null;
  end;
  begin
    perform ingest_listings('dak', '[]'::jsonb, 'x', false, now());
    raise exception 'ingest had niet aanroepbaar mogen zijn';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- Profiel aanpassen: niet meer passende, onbekeken matches verdwijnen.
update search_profiles set cities = '{Weesp}' where name = 'alles';
do $$ begin
  assert (select count(*) from matches m join search_profiles p on p.id = m.profile_id where p.name = 'alles' and m.user_status = 'new') = 0,
    'onbekeken matches weg na profielwijziging';
  assert (select count(*) from matches m join search_profiles p on p.id = m.profile_id
          where p.name = 'alles' and m.user_status = 'dismissed') = 1,
    'verwijderde match blijft bestaan (komt niet terug)';
end $$;

-- Lege lijst, onvolledig: verandert niets.
select record_run('dak', now(), false, 'test-fout');
do $$ begin assert (select consecutive_failures from sources where id = 'dak') = 1, 'fout geteld'; end $$;

-- ───── Telegram ─────
-- B heeft alleen Telegram: na koppelen krijgt B ook meldingen.
do $$
declare code text;
begin
  insert into notification_settings (user_id) values ('22222222-2222-2222-2222-222222222222');
  select telegram_link_code into code from notification_settings where user_id = '22222222-2222-2222-2222-222222222222';
  assert length(code) = 32, 'linkcode aangemaakt';
  assert link_telegram(code, 555) = true, 'koppelen met geldige code';
  assert link_telegram('bestaat-niet', 555) = false, 'onbekende code';
  assert (select telegram_chat_id from notification_settings where user_id = '22222222-2222-2222-2222-222222222222') = 555, 'chat gekoppeld';
end $$;

select ingest_listings('dak', '[
  {"external_id":"1","url":"u1","city":"Amsterdam","rent_net":1150,"area_m2":60,"deadline_at":"2999-01-01T00:00:00Z"},
  {"external_id":"2","url":"u2","city":"Zaandam","rent_net":800,"area_m2":70,"contract_type":"Jongerencontract","deadline_at":"2000-01-01T00:00:00Z"},
  {"external_id":"4","url":"u4","city":"Amsterdam","rent_net":900,"area_m2":55,"deadline_at":"2999-01-01T00:00:00Z"}
]'::jsonb, 'fp4', true, now()) as vierde;
do $$
declare n int;
begin
  select count(*) into n from claim_notifications(10) c
  where c.telegram_chat_id = 555 and c.listing ->> 'external_id' = '4';
  assert n = 1, 'Telegram-gebruiker krijgt melding voor woning 4';
  assert set_match_status_by_chat(555, (select id from listings where external_id = '4'), 'reacted') = 1, 'knop gereageerd';
  assert set_match_status_by_chat(999, (select id from listings where external_id = '4'), 'reacted') = 0, 'onbekende chat doet niets';
end $$;

-- Gebruiker kan telegram_chat_id niet zelf zetten, wel ontkoppelen.
set role authenticated;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
do $$ begin
  begin
    update notification_settings set telegram_chat_id = 1;
    raise exception 'telegram_chat_id had niet zelf gezet mogen worden';
  exception when insufficient_privilege then null;
  end;
  begin
    perform link_telegram('x', 1);
    raise exception 'link_telegram had niet aanroepbaar mogen zijn';
  exception when insufficient_privilege then null;
  end;
end $$;
update notification_settings set enabled = true;
select unlink_telegram();
reset role;
do $$ begin
  assert (select telegram_chat_id from notification_settings where user_id = '22222222-2222-2222-2222-222222222222') is null, 'ontkoppeld';
end $$;

select 'ALLE TESTS GESLAAGD' as resultaat;
