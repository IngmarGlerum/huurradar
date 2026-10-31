-- huurradar: bronnen Vesteda en MVGM (ikwilhuren.nu)
-- Uitvoeren in Supabase: SQL Editor → plak dit bestand → Run.

insert into public.sources (id, name) values
  ('vesteda', 'Vesteda'),
  ('mvgm', 'MVGM')
on conflict (id) do nothing;
