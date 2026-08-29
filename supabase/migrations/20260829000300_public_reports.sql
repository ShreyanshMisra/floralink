create function public.reports_in_view(
  south double precision,
  west double precision,
  north double precision,
  east double precision
)
returns table (
  report_id uuid,
  display_taxon_name text,
  ecological_status public.ecological_status,
  urgency text,
  location_mode public.location_mode,
  location_geojson jsonb,
  location_precision_label text,
  observed_at timestamptz,
  has_thumbnail boolean,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if south is null or west is null or north is null or east is null
    or south < -90 or north > 90 or west < -180 or east > 180
    or south >= north or west >= east
    or north - south > 10 or east - west > 10 then
    raise exception 'Invalid or unreasonably large viewport bounds' using errcode = '22023';
  end if;

  return query
  select
    r.id,
    coalesce(r.common_name, r.scientific_name, r.raw_taxon_guess),
    r.ecological_status,
    r.urgency,
    r.location_mode,
    case
      when r.location is not null then extensions.st_asgeojson(r.location::extensions.geometry)::jsonb
      else extensions.st_asgeojson(r.location_bbox)::jsonb
    end,
    case when r.location_mode = 'point' then 'rounded point' else 'approximate area' end,
    r.observed_at,
    exists (select 1 from public.report_media rm where rm.report_id = r.id),
    r.created_at
  from public.reports r
  where r.status in ('submitted', 'under_review', 'verified')
    and r.sensitivity_level = 'rounded_public'
    and (
      (r.location is not null and extensions.st_intersects(
        r.location,
        extensions.st_makeenvelope(west, south, east, north, 4326)::extensions.geography
      ))
      or
      (r.location_bbox is not null and extensions.st_intersects(
        r.location_bbox,
        extensions.st_makeenvelope(west, south, east, north, 4326)
      ))
    )
  order by r.created_at desc
  limit 200;
end;
$$;

revoke all on function public.reports_in_view(double precision, double precision, double precision, double precision) from public;
grant execute on function public.reports_in_view(double precision, double precision, double precision, double precision) to anon, authenticated, service_role;

