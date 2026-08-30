-- Sourced Massachusetts pilot fixture. The authority classifies emerald ash borer
-- as an invasive pest established in Massachusetts; checked 2026-08-29.
insert into public.regional_taxon_status (
  jurisdiction,
  scientific_name,
  inaturalist_taxon_id,
  status,
  sensitivity_level,
  authority_name,
  authority_url,
  authority_record_id,
  effective_date,
  last_checked_at,
  notes
)
values (
  'US-MA',
  'Agrilus planipennis',
  '70057',
  'invasive',
  'rounded_public',
  'Massachusetts Department of Conservation and Recreation',
  'https://www.mass.gov/guides/emerald-ash-borer-in-massachusetts',
  'emerald-ash-borer',
  null,
  '2026-08-29T00:00:00Z',
  'Massachusetts DCR identifies emerald ash borer as an invasive pest first detected in the state in 2012.'
)
on conflict (jurisdiction, scientific_name, inaturalist_taxon_id, authority_name)
do update set
  status = excluded.status,
  sensitivity_level = excluded.sensitivity_level,
  authority_url = excluded.authority_url,
  last_checked_at = excluded.last_checked_at,
  notes = excluded.notes;
