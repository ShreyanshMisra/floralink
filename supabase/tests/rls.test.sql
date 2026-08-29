begin;

create extension if not exists pgtap with schema extensions;
select plan(45);

insert into auth.users (id, aud, role, email, created_at, updated_at)
values
  ('11111111-1111-4111-8111-111111111111', 'authenticated', 'authenticated', 'owner@example.test', now(), now()),
  ('22222222-2222-4222-8222-222222222222', 'authenticated', 'authenticated', 'other@example.test', now(), now());

insert into public.verification_runs (
  id, requested_guess, jurisdiction, state, retrieved_at
)
values (
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa0',
  'emerald ash borer',
  'US-MA',
  'verified',
  now()
);

insert into public.reports (
  id, reporter_id, raw_taxon_guess, scientific_name, observed_at,
  location_mode, location, location_source, host_status, sensitivity_level,
  verification_id, human_confirmed_at
)
values
  (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    '11111111-1111-4111-8111-111111111111',
    'emerald ash borer',
    'Agrilus planipennis',
    now() - interval '1 hour',
    'point',
    extensions.st_setsrid(extensions.st_makepoint(-71.06, 42.36), 4326)::extensions.geography,
    'agent_supplied',
    'healthy',
    'rounded_public',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa0',
    now()
  ),
  (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
    '11111111-1111-4111-8111-111111111111',
    'sensitive plant',
    null,
    now() - interval '2 hours',
    'point',
    extensions.st_setsrid(extensions.st_makepoint(-71.07, 42.37), 4326)::extensions.geography,
    'manual_pin',
    'unknown',
    'private',
    null,
    now()
  ),
  (
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
    '22222222-2222-4222-8222-222222222222',
    'other report',
    null,
    now() - interval '3 hours',
    'point',
    extensions.st_setsrid(extensions.st_makepoint(-71.08, 42.38), 4326)::extensions.geography,
    'manual_pin',
    'unknown',
    'rounded_public',
    null,
    now()
  );

select ok((select relrowsecurity from pg_class where oid = 'public.reports'::regclass), 'reports has RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.report_media'::regclass), 'report_media has RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.verification_runs'::regclass), 'verification_runs has RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.regional_taxon_status'::regclass), 'regional_taxon_status has RLS enabled');
select is((select public from storage.buckets where id = 'sighting-media'), false, 'media bucket is private');
select is((select file_size_limit from storage.buckets where id = 'sighting-media'), 3145728::bigint, 'media bucket has a 3 MiB limit');
select is((select allowed_mime_types from storage.buckets where id = 'sighting-media'), array['image/jpeg', 'image/png', 'image/webp']::text[], 'media bucket restricts MIME types');

set local role anon;
select throws_ok('select * from public.reports', '42501', null, 'anon cannot select exact reports');
select throws_ok(
  $$insert into public.reports (reporter_id, raw_taxon_guess, observed_at, location_mode, location, location_source, host_status, human_confirmed_at)
    values ('11111111-1111-4111-8111-111111111111', 'anon', now(), 'point', extensions.st_setsrid(extensions.st_makepoint(-71, 42), 4326)::extensions.geography, 'manual_pin', 'unknown', now())$$,
  '42501', null, 'anon cannot insert reports'
);
select throws_ok('select * from public.report_media', '42501', null, 'anon cannot select report media');
select throws_ok('select * from public.verification_runs', '42501', null, 'anon cannot select verification runs');
select results_eq(
  $$select count(*) from storage.objects where bucket_id = 'sighting-media'$$,
  array[0::bigint],
  'anon cannot select private storage objects'
);
select ok((select count(*) > 0 from public.regional_taxon_status), 'anon can read regional status');
select throws_ok(
  $$insert into public.regional_taxon_status (jurisdiction, scientific_name, status, sensitivity_level, authority_name, authority_url, last_checked_at)
    values ('US-MA', 'No write', 'unknown', 'rounded_public', 'test', 'https://example.test', now())$$,
  '42501', null, 'anon cannot write regional status'
);
select results_eq(
  $$select count(*) from public.reports_in_view(41, -73.5, 43.5, -69)$$,
  array[2::bigint],
  'anon viewport RPC omits private reports'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
select lives_ok(
  $$insert into public.reports (reporter_id, raw_taxon_guess, observed_at, location_mode, location, location_source, host_status, human_confirmed_at)
    values (auth.uid(), 'own insert', now(), 'point', extensions.st_setsrid(extensions.st_makepoint(-71.1, 42.4), 4326)::extensions.geography, 'manual_pin', 'unknown', now())$$,
  'owner can insert their report'
);
select throws_ok(
  $$insert into public.reports (reporter_id, raw_taxon_guess, observed_at, location_mode, location, location_source, host_status, human_confirmed_at)
    values ('22222222-2222-4222-8222-222222222222', 'wrong owner', now(), 'point', extensions.st_setsrid(extensions.st_makepoint(-71.1, 42.4), 4326)::extensions.geography, 'manual_pin', 'unknown', now())$$,
  '42501', null, 'owner cannot insert for another user'
);
select results_eq('select count(*) from public.reports', array[3::bigint], 'owner selects only their reports');
select throws_ok(
  $$update public.reports set status = 'verified' where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'$$,
  '42501', null, 'owner cannot update report status'
);
select throws_ok(
  $$delete from public.reports where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'$$,
  '42501', null, 'owner cannot delete reports directly'
);
select lives_ok(
  $$insert into public.report_media (report_id, owner_id, storage_path, mime_type, size_bytes, width, height)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', auth.uid(), '11111111-1111-4111-8111-111111111111/report.jpg', 'image/jpeg', 1024, 100, 100)$$,
  'owner can insert media for their report'
);
select throws_ok(
  $$insert into public.report_media (report_id, owner_id, storage_path, mime_type, size_bytes, width, height)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1', auth.uid(), '11111111-1111-4111-8111-111111111111/wrong.jpg', 'image/jpeg', 1024, 100, 100)$$,
  '23514', null, 'owner cannot attach media to another report'
);
select results_eq('select count(*) from public.report_media', array[1::bigint], 'owner selects their media');
select lives_ok(
  $$delete from public.report_media where report_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'$$,
  'owner can delete their report media'
);
select results_eq('select count(*) from public.verification_runs', array[1::bigint], 'owner selects an attached verification');
select throws_ok(
  $$insert into public.verification_runs (requested_guess, jurisdiction, state, retrieved_at) values ('client forged', 'US-MA', 'verified', now())$$,
  '42501', null, 'client cannot create verification runs'
);
select ok((select count(*) > 0 from public.regional_taxon_status), 'authenticated user can read regional status');
select throws_ok(
  $$insert into public.regional_taxon_status (jurisdiction, scientific_name, status, sensitivity_level, authority_name, authority_url, last_checked_at)
    values ('US-MA', 'No auth write', 'unknown', 'rounded_public', 'test', 'https://example.test', now())$$,
  '42501', null, 'authenticated user cannot write regional status'
);
select lives_ok(
  $$insert into storage.objects (bucket_id, name) values ('sighting-media', '11111111-1111-4111-8111-111111111111/evidence.jpg')$$,
  'owner can insert an object beneath their storage prefix'
);
select throws_ok(
  $$insert into storage.objects (bucket_id, name) values ('sighting-media', '22222222-2222-4222-8222-222222222222/evidence.jpg')$$,
  '42501', null, 'owner cannot insert beneath another storage prefix'
);
select results_eq(
  $$select count(*) from storage.objects where bucket_id = 'sighting-media'$$,
  array[1::bigint],
  'owner selects their storage objects'
);
select results_eq(
  $$with changed as (update storage.objects set metadata = '{}' where bucket_id = 'sighting-media' returning 1) select count(*) from changed$$,
  array[0::bigint],
  'owner cannot update or upsert storage objects'
);
select ok(
  exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Owners can delete sighting media'
      and cmd = 'DELETE'
      and 'authenticated' = any(roles)
      and qual like '%sighting-media%'
      and qual like '%auth.uid()%'
  ),
  'owner-scoped storage delete policy is installed for authenticated users'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
select results_eq('select count(*) from public.reports', array[1::bigint], 'other user selects only their report');
select results_eq('select count(*) from public.report_media', array[0::bigint], 'other user cannot select owner media');
select results_eq('select count(*) from public.verification_runs', array[0::bigint], 'other user cannot select owner verification');
select results_eq(
  $$select count(*) from storage.objects where bucket_id = 'sighting-media'$$,
  array[0::bigint],
  'other user cannot select owner storage objects'
);
reset role;

set local role service_role;
select lives_ok(
  $$insert into public.reports (reporter_id, raw_taxon_guess, observed_at, location_mode, location, location_source, host_status, human_confirmed_at)
    values ('22222222-2222-4222-8222-222222222222', 'service insert', now(), 'point', extensions.st_setsrid(extensions.st_makepoint(-71.2, 42.5), 4326)::extensions.geography, 'manual_pin', 'unknown', now())$$,
  'service role can insert reports for a user'
);
select results_eq('select count(*) from public.reports', array[5::bigint], 'service role can select all reports');
select lives_ok(
  $$insert into public.report_media (report_id, owner_id, storage_path, mime_type, size_bytes, width, height)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1', '22222222-2222-4222-8222-222222222222', '22222222-2222-4222-8222-222222222222/service.jpg', 'image/jpeg', 1024, 100, 100)$$,
  'service role can insert valid report media'
);
select results_eq('select count(*) from public.report_media', array[1::bigint], 'service role can select all report media');
select lives_ok(
  $$insert into public.verification_runs (requested_guess, jurisdiction, state, retrieved_at) values ('service run', 'US-MA', 'not_requested', now())$$,
  'service role can create verification runs'
);
select lives_ok(
  $$insert into public.regional_taxon_status (jurisdiction, scientific_name, status, sensitivity_level, authority_name, authority_url, last_checked_at)
    values ('US-MA', 'Service fixture', 'unknown', 'rounded_public', 'test authority', 'https://example.test/source', now())$$,
  'service role can write regional status'
);
select lives_ok(
  $$insert into storage.objects (bucket_id, name) values ('sighting-media', '22222222-2222-4222-8222-222222222222/service.jpg')$$,
  'service role can insert storage objects'
);
select results_eq(
  $$select count(*) from storage.objects where bucket_id = 'sighting-media'$$,
  array[2::bigint],
  'service role can select all storage objects'
);
reset role;

select * from finish();
rollback;
