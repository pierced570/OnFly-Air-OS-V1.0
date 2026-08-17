-- Portal trip shell: prefer quick.tail, then hard_quote option tail, then blank.
-- Fixes QD live track showing Tail Pending when session_meta.quick lagged.

create or replace view portal_trips
with (security_invoker = true)
as
select
  t.id,
  t.ref,
  t.state,
  t.lane_label,
  t.payload_summary,
  t.ready_label,
  t.ready_at,
  t.deadline,
  t.po_number,
  t.mode,
  t.payload_kind,
  t.origin,
  t.destination,
  t.client_id,
  t.service_pattern,
  t.promised_delivery,
  nullif(trim(coalesce(t.session_meta->>'code', '')), '') as code,
  nullif(
    trim(
      coalesce(
        nullif(t.session_meta->'quick'->>'tail', ''),
        nullif(t.session_meta->'hard_quote'->'options'->0->>'tail', ''),
        ''
      )
    ),
    ''
  ) as tail,
  nullif(
    trim(
      coalesce(
        nullif(t.session_meta->'quick'->>'aircraft_type', ''),
        nullif(t.session_meta->'hard_quote'->'options'->0->>'type_name', ''),
        ''
      )
    ),
    ''
  ) as aircraft_type,
  nullif(
    trim(coalesce(t.session_meta->>'portal_pickup_address', '')),
    ''
  ) as portal_pickup_address,
  nullif(
    trim(coalesce(t.session_meta->>'portal_dropoff_address', '')),
    ''
  ) as portal_dropoff_address,
  t.session_meta->'portal_pickup_stop' as portal_pickup_stop,
  t.session_meta->'portal_dropoff_stop' as portal_dropoff_stop,
  coalesce(t.session_meta->'portal_pax_names', '[]'::jsonb) as portal_pax_names,
  nullif(trim(coalesce(t.session_meta->'quick'->>'notes', '')), '') as cargo_notes,
  case
    when (t.session_meta->'quick'->>'cargo_only') = 'true' then true
    when (t.session_meta->'quick'->>'cargo_only') = 'false' then false
    else null
  end as cargo_only,
  t.created_at,
  t.updated_at
from trips t;

grant select on portal_trips to anon, authenticated;
