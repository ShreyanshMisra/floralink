create schema if not exists extensions;

create extension if not exists postgis with schema extensions;
create extension if not exists pgcrypto with schema extensions;

create type public.location_mode as enum ('point', 'bounding_box', 'unresolved');
create type public.location_source as enum (
  'agent_supplied',
  'device',
  'photo_exif',
  'manual_pin',
  'manual_bbox',
  'relative_derived'
);
create type public.ecological_status as enum (
  'regulated_invasive',
  'invasive',
  'introduced',
  'native',
  'protected',
  'common',
  'unknown'
);
create type public.verification_state as enum (
  'verified',
  'ambiguous',
  'not_found',
  'unavailable',
  'not_requested'
);
create type public.host_status as enum ('healthy', 'damaged', 'dead', 'unknown');
create type public.report_status as enum ('submitted', 'under_review', 'verified', 'rejected');
create type public.sensitivity_level as enum ('rounded_public', 'private');

create table public.verification_runs (
  id uuid primary key default gen_random_uuid(),
  requested_guess text not null check (char_length(requested_guess) between 1 and 200),
  jurisdiction text not null check (char_length(jurisdiction) between 2 and 32),
  candidate_inaturalist_taxon_id text,
  candidate_scientific_name text,
  candidate_common_name text,
  candidate_rank text,
  match_score numeric(4, 3) check (match_score between 0 and 1),
  matched_name text,
  candidate_source_url text check (candidate_source_url is null or candidate_source_url ~ '^https://'),
  state public.verification_state not null,
  ecological_status public.ecological_status not null default 'unknown',
  sensitivity_level public.sensitivity_level not null default 'rounded_public',
  urgency text not null default 'unknown' check (urgency in ('routine', 'review', 'priority', 'unknown')),
  nearby_observation_count integer check (nearby_observation_count is null or nearby_observation_count >= 0),
  nearby_radius_km double precision check (nearby_radius_km is null or nearby_radius_km >= 0),
  warnings jsonb not null default '[]'::jsonb check (jsonb_typeof(warnings) = 'array'),
  sources jsonb not null default '[]'::jsonb check (jsonb_typeof(sources) = 'array'),
  adapter_versions jsonb not null default '{}'::jsonb check (jsonb_typeof(adapter_versions) = 'object'),
  retrieved_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id),
  status public.report_status not null default 'submitted',
  raw_taxon_guess text not null check (char_length(raw_taxon_guess) between 1 and 200),
  scientific_name text,
  common_name text,
  taxon_rank text,
  inaturalist_taxon_id text,
  identification_confidence numeric(4, 3) check (identification_confidence between 0 and 1),
  observed_at timestamptz not null check (observed_at <= now() + interval '5 minutes'),
  location_mode public.location_mode not null,
  location extensions.geography(Point, 4326),
  location_bbox extensions.geometry(Polygon, 4326),
  location_source public.location_source not null,
  accuracy_meters double precision check (accuracy_meters is null or accuracy_meters >= 0),
  rough_location_text text check (rough_location_text is null or char_length(rough_location_text) <= 500),
  host_status public.host_status not null,
  notes text not null default '' check (char_length(notes) <= 2000),
  agent_evidence_summary text check (agent_evidence_summary is null or char_length(agent_evidence_summary) <= 1000),
  ecological_status public.ecological_status not null default 'unknown',
  sensitivity_level public.sensitivity_level not null default 'rounded_public',
  urgency text not null default 'unknown' check (urgency in ('routine', 'review', 'priority', 'unknown')),
  verification_id uuid references public.verification_runs(id),
  human_confirmed_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reports_one_location check (num_nonnulls(location, location_bbox) = 1),
  constraint reports_location_matches_mode check (
    (location_mode = 'point' and location is not null and location_bbox is null and location_source <> 'manual_bbox')
    or
    (location_mode = 'bounding_box' and location is null and location_bbox is not null and location_source in ('agent_supplied', 'manual_bbox'))
  )
);

create table public.report_media (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.reports(id) on delete cascade,
  owner_id uuid not null references auth.users(id),
  storage_path text not null unique check (
    char_length(storage_path) between 1 and 1024
    and storage_path like owner_id::text || '/%'
  ),
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  size_bytes integer not null check (size_bytes > 0 and size_bytes <= 3145728),
  width integer not null check (width > 0),
  height integer not null check (height > 0),
  created_at timestamptz not null default now()
);

create table public.regional_taxon_status (
  id uuid primary key default gen_random_uuid(),
  jurisdiction text not null check (char_length(jurisdiction) between 2 and 32),
  scientific_name text not null check (char_length(scientific_name) between 1 and 200),
  inaturalist_taxon_id text,
  status public.ecological_status not null,
  sensitivity_level public.sensitivity_level not null,
  authority_name text not null check (char_length(authority_name) between 1 and 300),
  authority_url text not null check (authority_url ~ '^https://'),
  authority_record_id text,
  effective_date date,
  last_checked_at timestamptz not null,
  notes text not null default '',
  unique nulls not distinct (jurisdiction, scientific_name, inaturalist_taxon_id, authority_name)
);

create index reports_location_gist_idx on public.reports using gist (location);
create index reports_location_bbox_gist_idx on public.reports using gist (location_bbox);
create index reports_status_created_at_idx on public.reports (status, created_at desc);
create index reports_inaturalist_taxon_id_idx on public.reports (inaturalist_taxon_id);
create index reports_reporter_id_idx on public.reports (reporter_id);
create index report_media_report_id_idx on public.report_media (report_id);
create index report_media_owner_id_idx on public.report_media (owner_id);
create index regional_taxon_lookup_idx on public.regional_taxon_status (jurisdiction, inaturalist_taxon_id, scientific_name);

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger reports_set_updated_at
before update on public.reports
for each row execute function public.set_updated_at();

create function public.enforce_report_media_owner()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.reports
    where reports.id = new.report_id
      and reports.reporter_id = new.owner_id
  ) then
    raise exception 'report media owner must match report owner' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger report_media_enforce_owner
before insert or update on public.report_media
for each row execute function public.enforce_report_media_owner();

alter table public.reports enable row level security;
alter table public.report_media enable row level security;
alter table public.verification_runs enable row level security;
alter table public.regional_taxon_status enable row level security;

revoke all on public.reports from anon, authenticated;
revoke all on public.report_media from anon, authenticated;
revoke all on public.verification_runs from anon, authenticated;
revoke all on public.regional_taxon_status from anon, authenticated;

grant select, insert on public.reports to authenticated;
grant select, insert, delete on public.report_media to authenticated;
grant select on public.verification_runs to authenticated;
grant select on public.regional_taxon_status to anon, authenticated;

grant all on public.reports to service_role;
grant all on public.report_media to service_role;
grant all on public.verification_runs to service_role;
grant all on public.regional_taxon_status to service_role;

create policy "Report owners can insert reports"
on public.reports for insert
to authenticated
with check ((select auth.uid()) = reporter_id);

create policy "Report owners can select reports"
on public.reports for select
to authenticated
using ((select auth.uid()) = reporter_id);

create policy "Report owners can insert media"
on public.report_media for insert
to authenticated
with check (
  (select auth.uid()) = owner_id
  and exists (
    select 1
    from public.reports
    where reports.id = report_media.report_id
      and reports.reporter_id = (select auth.uid())
  )
);

create policy "Report owners can select media"
on public.report_media for select
to authenticated
using (
  (select auth.uid()) = owner_id
  and exists (
    select 1
    from public.reports
    where reports.id = report_media.report_id
      and reports.reporter_id = (select auth.uid())
  )
);

create policy "Report owners can delete media"
on public.report_media for delete
to authenticated
using (
  (select auth.uid()) = owner_id
  and exists (
    select 1
    from public.reports
    where reports.id = report_media.report_id
      and reports.reporter_id = (select auth.uid())
  )
);

create policy "Report owners can select attached verification runs"
on public.verification_runs for select
to authenticated
using (
  exists (
    select 1
    from public.reports
    where reports.verification_id = verification_runs.id
      and reports.reporter_id = (select auth.uid())
  )
);

create policy "Regional taxon status is publicly readable"
on public.regional_taxon_status for select
to anon, authenticated
using (true);
