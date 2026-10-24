-- huurradar: meldingen via Telegram
-- Uitvoeren in Supabase: SQL Editor → plak dit bestand → Run (na 20261024000000_init.sql).

alter table public.notification_settings
  add column telegram_chat_id bigint unique,
  -- Persoonlijke code voor de link t.me/<bot>?start=<code>; koppelt de Telegram-chat aan deze gebruiker.
  add column telegram_link_code text not null unique default replace(gen_random_uuid()::text, '-', '');

-- Gebruikers mogen hun Telegram-koppeling niet zelf zetten (anders kun je andermans chat-ID invullen).
-- Koppelen gaat via de bot (link_telegram), ontkoppelen via unlink_telegram.
revoke insert, update on public.notification_settings from authenticated;
grant insert (user_id, whatsapp_phone, callmebot_apikey, enabled, updated_at) on public.notification_settings to authenticated;
grant update (whatsapp_phone, callmebot_apikey, enabled, updated_at) on public.notification_settings to authenticated;

-- Worker: iemand heeft de bot gestart met zijn code. Geeft true als de code bestaat.
create function public.link_telegram(p_code text, p_chat_id bigint)
returns boolean
language plpgsql
set search_path = public
as $$
begin
  if not exists (select from notification_settings where telegram_link_code = p_code) then
    return false;
  end if;
  -- Een chat hoort bij één gebruiker: eerst eventuele oude koppeling van deze chat weghalen.
  update notification_settings set telegram_chat_id = null
  where telegram_chat_id = p_chat_id and telegram_link_code <> p_code;
  update notification_settings set telegram_chat_id = p_chat_id, updated_at = now()
  where telegram_link_code = p_code;
  return true;
end;
$$;

-- Gebruiker: Telegram ontkoppelen.
create function public.unlink_telegram()
returns void
language sql
security definer
set search_path = public
as $$
  update notification_settings set telegram_chat_id = null, updated_at = now() where user_id = auth.uid();
$$;

-- Worker: knop in een Telegram-bericht ("Gereageerd", "Niet interessant").
-- Geeft het aantal bijgewerkte matches; 0 als de chat niet gekoppeld is of de woning niet bij deze gebruiker hoort.
create function public.set_match_status_by_chat(p_chat_id bigint, p_listing_id bigint, p_status text)
returns int
language plpgsql
set search_path = public
as $$
declare
  n int;
begin
  update matches m set user_status = p_status
  from notification_settings s
  where s.telegram_chat_id = p_chat_id
    and m.user_id = s.user_id
    and m.listing_id = p_listing_id;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- Meldingen claimen: nu ook voor gebruikers met alleen Telegram.
drop function public.claim_notifications(int);

create function public.claim_notifications(p_limit int default 50)
returns table (
  match_id         bigint,
  user_id          uuid,
  telegram_chat_id bigint,
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
      and (s.telegram_chat_id is not null or (s.whatsapp_phone is not null and s.callmebot_apikey is not null))
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
    upd.id, upd.user_id, s.telegram_chat_id, s.whatsapp_phone, s.callmebot_apikey, to_jsonb(l) - 'raw'
  from upd
  join listings l on l.id = upd.listing_id
  join notification_settings s on s.user_id = upd.user_id
  order by upd.user_id, l.id, upd.id
$$;

revoke execute on function public.link_telegram(text, bigint) from public, anon, authenticated;
revoke execute on function public.set_match_status_by_chat(bigint, bigint, text) from public, anon, authenticated;
revoke execute on function public.claim_notifications(int) from public, anon, authenticated;
revoke execute on function public.unlink_telegram() from public, anon;
grant execute on function public.link_telegram(text, bigint) to service_role;
grant execute on function public.set_match_status_by_chat(bigint, bigint, text) to service_role;
grant execute on function public.claim_notifications(int) to service_role;
grant execute on function public.unlink_telegram() to authenticated;
