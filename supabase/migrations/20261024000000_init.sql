-- huurradar: initieel schema
-- Uitvoeren in Supabase: SQL Editor → plak dit bestand → Run (of `supabase db push`).

-- ───────────────────────── Tabellen ─────────────────────────

create type public.listing_status as enum ('active', 'closed', 'offline');
-- active  = online en reageren kan
-- closed  = reactietermijn verlopen
-- offline = niet meer in het aanbod van de bron

create table public.sources (
  id                   text primary key,
  name                 text not null,
  last_fingerprint     text,
  last_checked_at      timestamptz,
  last_success_at      timestamptz,
  consecutive_failures int not null default 0,
  last_error           text
);

insert into public.sources (id, name) values ('dak', 'Amsterdam DAK');

create table public.listings (
  id                bigint generated always as identity primary key,
  source_id         text not null references public.sources (id),
  external_id       text not null,
  url               text not null,
  street            text,
  house_number      text,
  postcode          text,
  city              text,
  district          text,
  rent_net          numeric(10, 2),
  rent_gross        numeric(10, 2),
  area_m2           numeric(8, 2),
  rooms             int,
  unit_kind         text,   -- DAK: Woonruimte, Parkeergelegenheid
  dwelling_type     text,   -- bijv. Portiekwoning, Galerijflat, Tussenwoning
  energy_label      text,
  landlord          text,
  allocation_model  text,   -- DAK: Aanbodmodel, Lotingmodel, Vrije sector
  label             text,   -- DAK: bijv. Middenhuur, Voorrang kleine(re) huishoudens
  contract_type     text,
  target_group      text,
  lat               double precision,
  lng               double precision,
  published_at      timestamptz,
  deadline_at       timestamptz,
  raw               jsonb,
  status            public.listing_status not null default 'active',
  missed_count      int not null default 0,
  first_seen_at     timestamptz not null default now(),
  last_seen_at      timestamptz not null default now(),
  status_changed_at timestamptz not null default now(),
  unique (source_id, external_id)
);

create index listings_status_idx on public.listings (status);

create table public.listing_events (
  id         bigint generated always as identity primary key,
  listing_id bigint not null references public.listings (id) on delete cascade,
  kind       text not null check (kind in ('new', 'changed', 'status')),
  old        jsonb,
  new        jsonb,
  at         timestamptz not null default now()
);

create table public.search_profiles (
  id                      uuid primary key default gen_random_uuid(),
  user_id                 uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name                    text not null default 'Mijn zoekprofiel',
  active                  boolean not null default true,
  cities                  text[] not null default '{}',  -- leeg = alle plaatsen
  min_rent                numeric(10, 2),
  max_rent                numeric(10, 2),
  min_area                numeric(8, 2),
  min_rooms               int,
  allocation_models       text[] not null default '{}',  -- leeg = alle modellen
  exclude_contract_types  text[] not null default '{}',
  exclude_target_groups   text[] not null default '{}',
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create index search_profiles_user_idx on public.search_profiles (user_id);

create table public.notification_settings (
  user_id          uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  whatsapp_phone   text,   -- internationaal formaat, bijv. +31612345678
  callmebot_apikey text,
  enabled          boolean not null default true,
  updated_at       timestamptz not null default now()
);

create table public.matches (
  id              bigint generated always as identity primary key,
  profile_id      uuid not null references public.search_profiles (id) on delete cascade,
  listing_id      bigint not null references public.listings (id) on delete cascade,
  user_id         uuid not null references auth.users (id) on delete cascade,
  created_at      timestamptz not null default now(),
  notified_at     timestamptz,
  notify_attempts int not null default 0,
  notify_error    text,
  user_status     text not null default 'new'
                  check (user_status in ('new', 'seen', 'reacted', 'dismissed')),
  unique (profile_id, listing_id)
);

create index matches_user_idx on public.matches (user_id);
create index matches_unnotified_idx on public.matches (created_at) where notified_at is null;

create table public.scrape_runs (
  id          bigint generated always as identity primary key,
  source_id   text not null references public.sources (id),
  started_at  timestamptz not null,
  finished_at timestamptz not null default now(),
  ok          boolean not null,
  changed     boolean,
  items       int,
  new_items   int,
  error       text
);

create index scrape_runs_source_idx on public.scrape_runs (source_id, started_at desc);

-- ───────────────────────── Matching ─────────────────────────

create function public.listing_matches_profile(l public.listings, p public.search_profiles)
returns boolean
language sql
stable
as $$
  select p.active
    and l.status = 'active'
    and coalesce(l.unit_kind, 'Woonruimte') = 'Woonruimte'   -- geen parkeerplaatsen
    and (cardinality(p.cities) = 0 or l.city = any (p.cities))
    and (p.min_rent is null or l.rent_net >= p.min_rent)
    and (p.max_rent is null or l.rent_net <= p.max_rent)
    and (p.min_area is null or l.area_m2 >= p.min_area)
    and (p.min_rooms is null or l.rooms >= p.min_rooms)
    and (cardinality(p.allocation_models) = 0 or l.allocation_model = any (p.allocation_models))
    and not coalesce(l.contract_type = any (p.exclude_contract_types), false)
    and not coalesce(l.target_group = any (p.exclude_target_groups), false)
$$;

-- Nieuwe of gewijzigde woning: match tegen alle actieve profielen.
create function public.match_listing()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into matches (profile_id, listing_id, user_id)
  select p.id, new.id, p.user_id
  from search_profiles p
  where listing_matches_profile(new, p)
  on conflict (profile_id, listing_id) do nothing;
  return null;
end;
$$;

create trigger listings_match
after insert or update of status, rent_net, area_m2, rooms, unit_kind, city, allocation_model, contract_type, target_group
on public.listings
for each row execute function public.match_listing();

-- Nieuw of gewijzigd profiel: match tegen het huidige aanbod. Deze matches tellen als al gemeld,
-- zodat een nieuw profiel geen stortvloed aan WhatsApp-berichten geeft. Ze staan wel in de app.
-- Matches die niet meer passen en nog niet bekeken zijn, verdwijnen.
create function public.match_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at := now();
  if tg_op = 'UPDATE' then
    delete from matches m
    using listings l
    where m.profile_id = new.id
      and m.listing_id = l.id
      and m.user_status = 'new'
      and not listing_matches_profile(l, new);
  end if;
  return new;
end;
$$;

create function public.match_profile_after()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into matches (profile_id, listing_id, user_id, notified_at)
  select new.id, l.id, new.user_id, now()
  from listings l
  where listing_matches_profile(l, new)
  on conflict (profile_id, listing_id) do nothing;
  return null;
end;
$$;

create trigger search_profiles_before
before insert or update on public.search_profiles
for each row execute function public.match_profile();

create trigger search_profiles_after
after insert or update on public.search_profiles
for each row execute function public.match_profile_after();

-- ───────────────────────── Functies voor de worker ─────────────────────────

-- Verwerkt de volledige lijst van een bron in één transactie.
-- p_items: array van objecten met de kolomnamen van listings (external_id, url, city, ...).
-- p_complete: true als p_items het volledige aanbod is; alleen dan worden ontbrekende woningen
-- als gemist geteld (na 2 keer gemist: offline).
create function public.ingest_listings(
  p_source text,
  p_items jsonb,
  p_fingerprint text,
  p_complete boolean,
  p_started_at timestamptz
)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  item     jsonb;
  r        listings%rowtype;
  old_row  listings%rowtype;
  n_new    int := 0;
  n_change int := 0;
  n_gone   int := 0;
  n_closed int := 0;
  ids      text[];
begin
  for item in select * from jsonb_array_elements(p_items) loop
    r := jsonb_populate_record(null::listings, item);
    select * into old_row from listings where source_id = p_source and external_id = r.external_id;

    if not found then
      insert into listings (
        source_id, external_id, url, street, house_number, postcode, city, district,
        rent_net, rent_gross, area_m2, rooms, unit_kind, dwelling_type, energy_label, landlord,
        allocation_model, label, contract_type, target_group, lat, lng, published_at, deadline_at, raw, status
      ) values (
        p_source, r.external_id, r.url, r.street, r.house_number, r.postcode, r.city, r.district,
        r.rent_net, r.rent_gross, r.area_m2, r.rooms, r.unit_kind, r.dwelling_type, r.energy_label,
        r.landlord, r.allocation_model,
        r.label, r.contract_type, r.target_group, r.lat, r.lng, r.published_at, r.deadline_at, r.raw,
        case when r.deadline_at < now() then 'closed'::listing_status else 'active' end
      )
      returning id into r.id;
      insert into listing_events (listing_id, kind, new)
      values (r.id, 'new', jsonb_build_object('rent_net', r.rent_net, 'deadline_at', r.deadline_at));
      n_new := n_new + 1;
    else
      if (old_row.rent_net, old_row.deadline_at, old_row.label)
         is distinct from (r.rent_net, r.deadline_at, r.label) then
        insert into listing_events (listing_id, kind, old, new)
        values (
          old_row.id, 'changed',
          jsonb_build_object('rent_net', old_row.rent_net, 'deadline_at', old_row.deadline_at, 'label', old_row.label),
          jsonb_build_object('rent_net', r.rent_net, 'deadline_at', r.deadline_at, 'label', r.label)
        );
        n_change := n_change + 1;
      end if;
      update listings set
        url = r.url, street = r.street, house_number = r.house_number, postcode = r.postcode,
        city = r.city, district = r.district, rent_net = r.rent_net, rent_gross = r.rent_gross,
        area_m2 = r.area_m2, rooms = r.rooms, unit_kind = r.unit_kind, dwelling_type = r.dwelling_type,
        energy_label = r.energy_label, landlord = r.landlord,
        allocation_model = r.allocation_model, label = r.label, contract_type = r.contract_type,
        target_group = r.target_group, lat = r.lat, lng = r.lng, published_at = r.published_at,
        deadline_at = r.deadline_at, raw = r.raw, missed_count = 0, last_seen_at = now(),
        status = case when r.deadline_at < now() then 'closed'::listing_status else 'active' end,
        status_changed_at = case
          when old_row.status is distinct from
               (case when r.deadline_at < now() then 'closed'::listing_status else 'active' end)
          then now() else old_row.status_changed_at end
      where id = old_row.id;
    end if;
  end loop;

  if p_complete then
    select array_agg(x ->> 'external_id') into ids from jsonb_array_elements(p_items) x;
    with gone as (
      update listings set
        missed_count = missed_count + 1,
        status = case when missed_count + 1 >= 2 then 'offline'::listing_status else status end,
        status_changed_at = case when missed_count + 1 >= 2 then now() else status_changed_at end
      where source_id = p_source
        and status <> 'offline'
        and not (external_id = any (coalesce(ids, '{}')))
      returning id, status
    )
    select count(*) filter (where status = 'offline') into n_gone from gone;
  end if;

  -- Reactietermijn verlopen.
  with c as (
    update listings set status = 'closed', status_changed_at = now()
    where source_id = p_source and status = 'active' and deadline_at < now()
    returning id
  )
  select count(*) into n_closed from c;

  update sources set
    last_fingerprint = p_fingerprint,
    last_checked_at = now(),
    last_success_at = now(),
    consecutive_failures = 0,
    last_error = null
  where id = p_source;

  insert into scrape_runs (source_id, started_at, ok, changed, items, new_items)
  values (p_source, p_started_at, true, true, jsonb_array_length(p_items), n_new);

  delete from scrape_runs where started_at < now() - interval '14 days';

  return jsonb_build_object('new', n_new, 'changed', n_change, 'offline', n_gone, 'closed', n_closed);
end;
$$;

-- Run zonder wijzigingen (vingerafdruk gelijk) of mislukte run.
create function public.record_run(
  p_source text,
  p_started_at timestamptz,
  p_ok boolean,
  p_error text default null,
  p_items int default null
)
returns int
language plpgsql
set search_path = public
as $$
declare
  failures int;
begin
  update sources set
    last_checked_at = now(),
    last_success_at = case when p_ok then now() else last_success_at end,
    consecutive_failures = case when p_ok then 0 else consecutive_failures + 1 end,
    last_error = case when p_ok then null else p_error end
  where id = p_source
  returning consecutive_failures into failures;

  -- Gelijke vingerafdruk: verlopen reactietermijnen toch bijwerken.
  if p_ok then
    update listings set status = 'closed', status_changed_at = now()
    where source_id = p_source and status = 'active' and deadline_at < now();
  end if;

  insert into scrape_runs (source_id, started_at, ok, changed, items, error)
  values (p_source, p_started_at, p_ok, false, p_items, p_error);

  return failures;
end;
$$;

-- Pakt nog niet gemelde matches (max. 1 dag oud) van gebruikers met WhatsApp-instellingen
-- en markeert ze als gemeld. Mislukt het versturen, dan zet release_notification ze terug.
create function public.claim_notifications(p_limit int default 50)
returns table (
  match_id         bigint,
  user_id          uuid,
  whatsapp_phone   text,
  callmebot_apikey text,
  listing          jsonb
)
language sql
set search_path = public
as $$
  with picked as (
    select m.id
    from matches m
    join listings l on l.id = m.listing_id
    join notification_settings s on s.user_id = m.user_id
    where m.notified_at is null
      and m.notify_attempts < 5
      and m.created_at > now() - interval '1 day'
      and l.status = 'active'
      and s.enabled
      and s.whatsapp_phone is not null
      and s.callmebot_apikey is not null
    order by m.created_at
    limit p_limit
    for update of m skip locked
  ),
  upd as (
    update matches m set notified_at = now(), notify_attempts = m.notify_attempts + 1
    from picked
    where m.id = picked.id
    returning m.id, m.user_id, m.listing_id
  )
  -- Eén melding per gebruiker per woning, ook als die op meerdere profielen matcht.
  select distinct on (upd.user_id, l.id)
    upd.id, upd.user_id, s.whatsapp_phone, s.callmebot_apikey, to_jsonb(l) - 'raw'
  from upd
  join listings l on l.id = upd.listing_id
  join notification_settings s on s.user_id = upd.user_id
  order by upd.user_id, l.id, upd.id
$$;

create function public.release_notification(p_match_ids bigint[], p_error text)
returns void
language sql
set search_path = public
as $$
  update matches set notified_at = null, notify_error = p_error where id = any (p_match_ids);
$$;

-- ───────────────────────── Rechten en RLS ─────────────────────────

alter table public.sources enable row level security;
alter table public.listings enable row level security;
alter table public.listing_events enable row level security;
alter table public.search_profiles enable row level security;
alter table public.notification_settings enable row level security;
alter table public.matches enable row level security;
alter table public.scrape_runs enable row level security;

revoke all on all tables in schema public from anon;

create policy "ingelogd: bronnen lezen" on public.sources
  for select to authenticated using (true);

create policy "ingelogd: woningen lezen" on public.listings
  for select to authenticated using (true);

create policy "ingelogd: runs lezen" on public.scrape_runs
  for select to authenticated using (true);

create policy "eigen profielen" on public.search_profiles
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "eigen meldingsinstellingen" on public.notification_settings
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "eigen matches lezen" on public.matches
  for select to authenticated using (user_id = auth.uid());

create policy "eigen matches bijwerken" on public.matches
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Gebruikers mogen van een match alleen de status wijzigen.
revoke insert, update, delete on public.matches from authenticated;
grant update (user_status) on public.matches to authenticated;

-- Worker-functies alleen voor de service role.
revoke execute on function public.ingest_listings(text, jsonb, text, boolean, timestamptz) from public, anon, authenticated;
revoke execute on function public.record_run(text, timestamptz, boolean, text, int) from public, anon, authenticated;
revoke execute on function public.claim_notifications(int) from public, anon, authenticated;
revoke execute on function public.release_notification(bigint[], text) from public, anon, authenticated;
grant execute on function public.ingest_listings(text, jsonb, text, boolean, timestamptz) to service_role;
grant execute on function public.record_run(text, timestamptz, boolean, text, int) to service_role;
grant execute on function public.claim_notifications(int) to service_role;
grant execute on function public.release_notification(bigint[], text) to service_role;

-- Realtime voor de web-app.
alter publication supabase_realtime add table public.matches, public.listings;
