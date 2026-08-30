create table public.report_submission_receipts (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id),
  idempotency_key text not null check (char_length(idempotency_key) between 8 and 200),
  report_id uuid not null unique references public.reports(id) on delete cascade,
  receipt jsonb not null check (jsonb_typeof(receipt) = 'object'),
  created_at timestamptz not null default now(),
  unique (reporter_id, idempotency_key)
);

alter table public.report_submission_receipts enable row level security;
revoke all on public.report_submission_receipts from anon, authenticated;
grant all on public.report_submission_receipts to service_role;

create function public.submit_sighting_report(
  submission jsonb,
  media jsonb,
  idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  existing_receipt jsonb;
  report_id uuid := gen_random_uuid();
  receipt_id uuid := gen_random_uuid();
  submitted_at timestamptz := now();
  verification_row public.verification_runs%rowtype;
  ecological_status_value public.ecological_status := 'unknown';
  sensitivity_level_value public.sensitivity_level := 'rounded_public';
  urgency_value text := 'unknown';
  location_mode_value public.location_mode;
  location_value extensions.geography(Point, 4326);
  location_bbox_value extensions.geometry(Polygon, 4326);
  storage_path_value text;
  receipt_value jsonb;
  public_location jsonb;
begin
  if caller_id is null or auth.role() <> 'authenticated' then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if idempotency_key is null or char_length(idempotency_key) not between 8 and 200 then
    raise exception 'Invalid idempotency key' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(caller_id::text || ':' || idempotency_key, 0));
  select rsr.receipt into existing_receipt
  from public.report_submission_receipts rsr
  where rsr.reporter_id = caller_id and rsr.idempotency_key = submit_sighting_report.idempotency_key;
  if existing_receipt is not null then
    return existing_receipt;
  end if;

  if submission->>'verificationId' is not null then
    select * into verification_row
    from public.verification_runs
    where id = (submission->>'verificationId')::uuid;
    if not found then
      raise exception 'Verification not found' using errcode = '22023';
    end if;
    ecological_status_value := verification_row.ecological_status;
    sensitivity_level_value := verification_row.sensitivity_level;
    urgency_value := verification_row.urgency;
  end if;

  location_mode_value := (submission->'location'->>'mode')::public.location_mode;
  if location_mode_value = 'point' then
    location_value := extensions.st_setsrid(
      extensions.st_makepoint(
        (submission->'location'->>'longitude')::double precision,
        (submission->'location'->>'latitude')::double precision
      ), 4326
    )::extensions.geography;
    public_location := jsonb_build_object(
      'mode', 'point',
      'latitude', round((submission->'location'->>'latitude')::numeric, 2),
      'longitude', round((submission->'location'->>'longitude')::numeric, 2)
    );
  elsif location_mode_value = 'bounding_box' then
    location_bbox_value := extensions.st_makeenvelope(
      (submission->'location'->>'west')::double precision,
      (submission->'location'->>'south')::double precision,
      (submission->'location'->>'east')::double precision,
      (submission->'location'->>'north')::double precision,
      4326
    );
    public_location := jsonb_build_object(
      'mode', 'bounding_box',
      'south', round((submission->'location'->>'south')::numeric, 2),
      'west', round((submission->'location'->>'west')::numeric, 2),
      'north', round((submission->'location'->>'north')::numeric, 2),
      'east', round((submission->'location'->>'east')::numeric, 2)
    );
  else
    raise exception 'A resolved location is required' using errcode = '22023';
  end if;

  if media is not null and media <> 'null'::jsonb then
    storage_path_value := media->>'storagePath';
    if storage_path_value not like caller_id::text || '/' || (submission->>'stageId') || '/%' then
      raise exception 'Media path does not belong to caller and stage' using errcode = '42501';
    end if;
    if not exists (
      select 1 from storage.objects
      where bucket_id = 'sighting-media' and name = storage_path_value and owner_id = caller_id::text
    ) then
      raise exception 'Uploaded media object was not found' using errcode = '22023';
    end if;
  end if;

  insert into public.reports (
    id, reporter_id, raw_taxon_guess, scientific_name, common_name, taxon_rank,
    inaturalist_taxon_id, identification_confidence, observed_at, location_mode,
    location, location_bbox, location_source, accuracy_meters, rough_location_text,
    host_status, notes, agent_evidence_summary, ecological_status, sensitivity_level,
    urgency, verification_id, human_confirmed_at
  ) values (
    report_id, caller_id, submission->>'rawTaxonGuess', submission->'taxon'->>'scientificName',
    submission->'taxon'->>'commonName', submission->'taxon'->>'rank',
    submission->'taxon'->>'inaturalistTaxonId', (submission->>'identificationConfidence')::numeric,
    (submission->>'observedAt')::timestamptz, location_mode_value, location_value,
    location_bbox_value, (submission->'location'->>'source')::public.location_source,
    (submission->'location'->>'accuracyMeters')::double precision,
    submission->'location'->>'roughDescription', (submission->>'hostStatus')::public.host_status,
    coalesce(submission->>'notes', ''), submission->>'agentEvidenceSummary', ecological_status_value,
    sensitivity_level_value, urgency_value, (submission->>'verificationId')::uuid, submitted_at
  );

  if storage_path_value is not null then
    insert into public.report_media (report_id, owner_id, storage_path, mime_type, size_bytes, width, height)
    values (
      report_id, caller_id, storage_path_value, media->>'mimeType',
      (media->>'sizeBytes')::integer, (media->>'width')::integer, (media->>'height')::integer
    );
  end if;

  receipt_value := jsonb_build_object(
    'receiptId', receipt_id,
    'reportId', report_id,
    'submittedAt', submitted_at,
    'publicReport', jsonb_build_object(
      'id', report_id,
      'displayTaxonName', coalesce(submission->'taxon'->>'commonName', submission->'taxon'->>'scientificName', submission->>'rawTaxonGuess'),
      'ecologicalStatus', ecological_status_value,
      'urgency', urgency_value,
      'location', public_location,
      'locationPrecisionLabel', case when location_mode_value = 'point' then 'rounded point' else 'approximate area' end,
      'observedAt', submission->>'observedAt',
      'hasThumbnail', storage_path_value is not null,
      'createdAt', submitted_at
    )
  );

  insert into public.report_submission_receipts (id, reporter_id, idempotency_key, report_id, receipt)
  values (receipt_id, caller_id, idempotency_key, report_id, receipt_value);
  return receipt_value;
end;
$$;

revoke all on function public.submit_sighting_report(jsonb, jsonb, text) from public;
grant execute on function public.submit_sighting_report(jsonb, jsonb, text) to authenticated, service_role;

create function public.report_location_geojson(report_uuid uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when location is not null then extensions.st_asgeojson(location::extensions.geometry)::jsonb
    else extensions.st_asgeojson(location_bbox)::jsonb
  end
  from public.reports
  where id = report_uuid;
$$;

revoke all on function public.report_location_geojson(uuid) from public;
grant execute on function public.report_location_geojson(uuid) to service_role;
