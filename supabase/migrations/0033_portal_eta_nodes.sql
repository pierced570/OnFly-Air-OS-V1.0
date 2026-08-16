-- Portal-safe ETA chain for magic-link + signed-in tracking.
-- Without these, /portal/track stubs trips with eta_chain=[] and stays STANDING BY.
-- Also expose award/itinerary facts from session_meta (tail, type, stop addresses)
-- so Aircraft / Pickup / Drop-off cards fill in — never costs or operator names.

create or replace view portal_eta_nodes
with (security_invoker = true)
as
select
  n.id,
  n.trip_id,
  n.seq,
  n.type,
  n.branch,
  n.label,
  n.event,
  n.from_icao,
  n.to_icao,
  n.from_tz,
  n.to_tz,
  n.from_lat,
  n.from_lon,
  n.to_lat,
  n.to_lon,
  n.est_start,
  n.est_end,
  n.actual_start,
  n.actual_end,
  n.duration_min,
  n.duration_key,
  n.source,
  n.distance_mi,
  n.distance_nm,
  n.slack_min
from trip_eta_nodes n;

grant select on portal_eta_nodes to anon, authenticated;

create or replace function portal_eta_nodes_by_token(p_token text)
returns setof portal_eta_nodes
language sql
stable
security definer
set search_path = public
as $$
  select pe.*
  from portal_track_tokens tok
  join portal_eta_nodes pe on pe.trip_id = tok.trip_id
  where tok.token = p_token
    and (tok.expires_at is null or tok.expires_at > now())
  order by pe.seq;
$$;

revoke all on function portal_eta_nodes_by_token(text) from public;
grant execute on function portal_eta_nodes_by_token(text) to anon, authenticated;

-- Portal trip shell: ETA spine + client-safe award / stop facts from session_meta.
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
  nullif(trim(coalesce(t.session_meta->'quick'->>'tail', '')), '') as tail,
  nullif(
    trim(
      coalesce(
        t.session_meta->'quick'->>'aircraft_type',
        t.session_meta->'hard_quote'->'options'->0->>'type_name',
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

-- Selected-offer award (tail / type only) for trips without quick meta.
-- Offer desk fields live in notes JSON; aircraft table is the FK fallback.
create or replace function portal_award_by_token(p_token text)
returns table (tail text, aircraft_type text)
language sql
stable
security definer
set search_path = public
as $$
  select
    nullif(
      trim(
        coalesce(
          nullif(o.notes, '')::jsonb->>'tail',
          a.tail,
          ''
        )
      ),
      ''
    ) as tail,
    nullif(
      trim(
        coalesce(
          nullif(o.notes, '')::jsonb->>'type_name',
          a.type_name,
          ''
        )
      ),
      ''
    ) as aircraft_type
  from portal_track_tokens tok
  join offers o on o.trip_id = tok.trip_id
  left join aircraft a on a.id = o.aircraft_id
  where tok.token = p_token
    and (tok.expires_at is null or tok.expires_at > now())
    and o.state = 'selected'
  order by o.updated_at desc nulls last
  limit 1;
$$;

revoke all on function portal_award_by_token(text) from public;
grant execute on function portal_award_by_token(text) to anon, authenticated;
