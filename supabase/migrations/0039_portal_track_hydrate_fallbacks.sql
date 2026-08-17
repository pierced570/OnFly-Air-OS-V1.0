-- Portal track hydrate: recover ETA / award when child tables lag session_meta.
-- Magic-link guests were seeing PO + lane but Tail Pending / Origin / Destination
-- because trip_eta_nodes + selected offers were empty while session_meta had facts.
-- Also read trip_eta_nodes directly (SECURITY DEFINER) so security_invoker views
-- cannot block anon token RPCs.

-- 1) portal_trips: hard_quote tail fallback + portal-safe eta_chain snapshot
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
  -- Portal-safe ETA spine backup (times + ICAOs only; no money fields).
  case
    when jsonb_typeof(t.session_meta->'eta_chain') = 'array'
      then t.session_meta->'eta_chain'
    else '[]'::jsonb
  end as eta_chain,
  t.created_at,
  t.updated_at
from trips t;

grant select on portal_trips to anon, authenticated;

-- 2) ETA-by-token: read base table as definer (bypass invoker-view RLS quirks)
create or replace function portal_eta_nodes_by_token(p_token text)
returns setof portal_eta_nodes
language sql
stable
security definer
set search_path = public
as $$
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
  from portal_track_tokens tok
  join trip_eta_nodes n on n.trip_id = tok.trip_id
  where tok.token = p_token
    and (tok.expires_at is null or tok.expires_at > now())
  order by n.seq;
$$;

revoke all on function portal_eta_nodes_by_token(text) from public;
grant execute on function portal_eta_nodes_by_token(text) to anon, authenticated;

-- 3) Award-by-token: always return a row; coalesce offer notes → aircraft → session_meta
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
          case
            when o.notes is not null
              and length(trim(o.notes)) > 1
              and left(trim(o.notes), 1) = '{'
            then nullif(trim(o.notes::jsonb->>'tail'), '')
            else null
          end,
          nullif(trim(coalesce(a.tail, '')), ''),
          nullif(trim(coalesce(t.session_meta->'quick'->>'tail', '')), ''),
          nullif(
            trim(
              coalesce(
                t.session_meta->'hard_quote'->'options'->0->>'tail',
                ''
              )
            ),
            ''
          ),
          ''
        )
      ),
      ''
    ) as tail,
    nullif(
      trim(
        coalesce(
          case
            when o.notes is not null
              and length(trim(o.notes)) > 1
              and left(trim(o.notes), 1) = '{'
            then nullif(trim(o.notes::jsonb->>'type_name'), '')
            else null
          end,
          nullif(trim(coalesce(a.type_name, '')), ''),
          nullif(
            trim(coalesce(t.session_meta->'quick'->>'aircraft_type', '')),
            ''
          ),
          nullif(
            trim(
              coalesce(
                t.session_meta->'hard_quote'->'options'->0->>'type_name',
                ''
              )
            ),
            ''
          ),
          ''
        )
      ),
      ''
    ) as aircraft_type
  from portal_track_tokens tok
  join trips t on t.id = tok.trip_id
  left join lateral (
    select o2.notes, o2.aircraft_id, o2.updated_at
    from offers o2
    where o2.trip_id = t.id
      and o2.state = 'selected'
    order by o2.updated_at desc nulls last
    limit 1
  ) o on true
  left join aircraft a on a.id = o.aircraft_id
  where tok.token = p_token
    and (tok.expires_at is null or tok.expires_at > now())
  limit 1;
$$;

revoke all on function portal_award_by_token(text) from public;
grant execute on function portal_award_by_token(text) to anon, authenticated;
