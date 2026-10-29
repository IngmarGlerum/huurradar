-- huurradar: zelf een account aanmaken met een uitnodigingscode
-- Uitvoeren in Supabase: SQL Editor → plak dit bestand → Run.
-- Stel daarna je eigen code in (zie onderaan) en zet in Authentication de registratie aan.

-- Instellingen van de app. Geen RLS-policies: alleen leesbaar via de functies hieronder.
create table public.app_config (
  id          boolean primary key default true check (id),  -- precies één rij
  invite_code text  -- null = registreren met code uitgeschakeld
);
insert into public.app_config (invite_code) values (null);

alter table public.app_config enable row level security;
revoke all on public.app_config from anon, authenticated;

-- Voor het registratieformulier: klopt de code? (Geeft geen informatie over de code zelf.)
create function public.check_invite_code(p_code text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select invite_code from app_config) = p_code, false)
$$;

revoke execute on function public.check_invite_code(text) from public;
grant execute on function public.check_invite_code(text) to anon, authenticated;

-- Afdwingen bij elke nieuwe gebruiker.
-- Is er een code ingesteld, dan moet elke nieuwe gebruiker die meesturen; ook gebruikers die je in het
-- dashboard aanmaakt (die laten zich dan gewoon via de app registreren).
-- Zonder code (null) wordt er niets gecontroleerd: zet dan ook "Allow new users to sign up" uit,
-- anders kan iedereen met de URL een account aanmaken.
create function public.enforce_invite_code()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  code text;
begin
  select invite_code into code from public.app_config;
  if code is null then
    return new;
  end if;
  if coalesce(new.raw_user_meta_data ->> 'invite_code', '') <> code then
    raise exception 'Ongeldige uitnodigingscode';
  end if;
  -- De code hoort niet bij het profiel van de gebruiker te blijven staan.
  new.raw_user_meta_data := new.raw_user_meta_data - 'invite_code';
  return new;
end;
$$;

create trigger enforce_invite_code
before insert on auth.users
for each row execute function public.enforce_invite_code();

-- ─────────────────────────────────────────────────────────────────────────────
-- Je eigen code instellen (en later wijzigen), in een nieuwe query:
--   update public.app_config set invite_code = 'kies-een-lange-code';
-- Registreren weer uitzetten:
--   update public.app_config set invite_code = null;
-- ─────────────────────────────────────────────────────────────────────────────
