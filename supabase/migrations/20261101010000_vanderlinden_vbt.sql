-- huurradar: bronnen Van der Linden en VB&T
-- Uitvoeren in Supabase: SQL Editor → plak dit bestand → Run.

insert into public.sources (id, name) values
  ('vanderlinden', 'Van der Linden'),
  ('vbt', 'VB&T')
on conflict (id) do nothing;
