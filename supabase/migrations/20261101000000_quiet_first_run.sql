-- huurradar: geen meldingen voor het bestaande aanbod van een nieuwe bron
-- Uitvoeren in Supabase: SQL Editor → plak dit bestand → Run.
--
-- Bij de eerste geslaagde ronde van een bron (sources.last_success_at is nog leeg) worden de matches
-- die daaruit ontstaan als "al gemeld" gemarkeerd. Ze staan wel in de app.

create or replace function public.ingest_listings(
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
  first_run boolean;
begin
  -- Nog nooit gelukt = eerste ronde van een nieuwe bron.
  select last_success_at is null into first_run from sources where id = p_source;

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

  -- Eerste ronde van een nieuwe bron: alles wat er al stond is niet "nieuw" voor de gebruikers.
  -- Matches wel tonen in de app, maar geen melding sturen.
  if first_run then
    update matches m set notified_at = now()
    from listings l
    where l.id = m.listing_id and l.source_id = p_source and m.notified_at is null;
  end if;

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
