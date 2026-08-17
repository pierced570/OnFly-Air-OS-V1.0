-- Client ↔ OnFly portal chat (per trip). Stored in session_meta.portal_chat
-- and mirrored on append-only trip_events. Never expose operator / money fields.

-- 1) Safe column on portal_trips (messages only — no costs / operator names)
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
  case
    when jsonb_typeof(t.session_meta->'eta_chain') = 'array'
      then t.session_meta->'eta_chain'
    else '[]'::jsonb
  end as eta_chain,
  case
    when jsonb_typeof(t.session_meta->'portal_chat') = 'array'
      then t.session_meta->'portal_chat'
    else '[]'::jsonb
  end as portal_chat,
  t.created_at,
  t.updated_at
from trips t;

grant select on portal_trips to anon, authenticated;

-- Recreate token / work-email readers so setof portal_trips picks up portal_chat.
create or replace function portal_trip_by_token(p_token text)
returns setof portal_trips
language sql
stable
security definer
set search_path = public
as $$
  select pt.*
  from portal_track_tokens tok
  join portal_trips pt on pt.id = tok.trip_id
  where tok.token = p_token
    and (tok.expires_at is null or tok.expires_at > now())
  limit 1;
$$;

create or replace function portal_trips_for_work_email(p_email text)
returns setof portal_trips
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
begin
  if v_email = '' or position('@' in v_email) = 0 then
    return;
  end if;

  return query
  select pt.*
  from portal_trips pt
  where pt.state not in ('closed', 'lost', 'cancelled')
    and (
      portal_email_authorized_for_client(v_email, pt.client_id)
      or exists (
        select 1
        from trip_participants tp
        where tp.trip_id = pt.id
          and lower(coalesce(tp.email, '')) = v_email
          and tp.role in ('client', 'client_ap', 'client_supply')
          and tp.released_at is null
      )
    )
  order by pt.ref desc
  limit 50;
end;
$$;

grant execute on function portal_trip_by_token(text) to anon, authenticated;
grant execute on function portal_trips_for_work_email(text) to anon, authenticated;

-- 2) Append-only chat write (jsonb merge — does not replace the rest of session_meta)
create or replace function append_portal_chat_message(
  p_trip_id uuid,
  p_role text,
  p_body text,
  p_from_label text default null,
  p_token text default null,
  p_email text default null,
  p_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := lower(trim(coalesce(p_role, '')));
  v_body text := trim(coalesce(p_body, ''));
  v_label text := trim(coalesce(p_from_label, ''));
  v_token text := trim(coalesce(p_token, ''));
  v_email text := lower(trim(coalesce(p_email, '')));
  v_id text := nullif(trim(coalesce(p_id, '')), '');
  v_uid uuid := auth.uid();
  v_ok boolean := false;
  v_client uuid;
  v_at timestamptz := now();
  v_msg jsonb;
  v_existing jsonb;
begin
  if p_trip_id is null then
    raise exception 'trip required';
  end if;
  if v_role not in ('client', 'onfly') then
    raise exception 'invalid role';
  end if;
  if v_body = '' then
    raise exception 'message required';
  end if;
  if char_length(v_body) > 4000 then
    v_body := left(v_body, 4000);
  end if;
  if char_length(v_label) > 80 then
    v_label := left(v_label, 80);
  end if;

  select t.client_id into v_client from trips t where t.id = p_trip_id;
  if v_client is null and not exists (select 1 from trips t where t.id = p_trip_id) then
    raise exception 'trip not found';
  end if;

  if v_token <> '' then
    if v_role <> 'client' then
      raise exception 'token may only post as client';
    end if;
    select true into v_ok
    from portal_track_tokens tok
    where tok.token = v_token
      and tok.trip_id = p_trip_id
      and (tok.expires_at is null or tok.expires_at > now())
    limit 1;
    if not coalesce(v_ok, false) then
      raise exception 'invalid tracking token';
    end if;
  elsif v_email <> '' then
    if v_role <> 'client' then
      raise exception 'email may only post as client';
    end if;
    v_ok := portal_email_authorized_for_client(v_email, v_client)
      or exists (
        select 1
        from trip_participants tp
        where tp.trip_id = p_trip_id
          and lower(coalesce(tp.email, '')) = v_email
          and tp.role in ('client', 'client_ap', 'client_supply')
          and tp.released_at is null
      );
    if not v_ok then
      raise exception 'email not authorized for this trip';
    end if;
  elsif v_uid is not null then
    if v_role <> 'client' then
      raise exception 'portal user may only post as client';
    end if;
    v_ok := exists (
      select 1 from portal_users pu
      where pu.user_id = v_uid and pu.client_id = v_client
    );
    if not v_ok then
      raise exception 'not authorized for this trip';
    end if;
  else
    -- Desk (anon key, no token) — same trust model as other desk writes.
    if v_role <> 'onfly' then
      raise exception 'desk may only post as onfly without a portal token';
    end if;
  end if;

  if v_label = '' then
    v_label := case when v_role = 'onfly' then 'OnFly' else 'Client' end;
  end if;
  if v_id is null then
    v_id := gen_random_uuid()::text;
  end if;

  select e.elem into v_existing
  from trips t
  left join lateral jsonb_array_elements(
    case
      when jsonb_typeof(t.session_meta->'portal_chat') = 'array'
        then t.session_meta->'portal_chat'
      else '[]'::jsonb
    end
  ) as e(elem) on e.elem->>'id' = v_id
  where t.id = p_trip_id
  limit 1;

  if v_existing is not null then
    return v_existing;
  end if;

  v_msg := jsonb_build_object(
    'id', v_id,
    'at', to_char(v_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'role', v_role,
    'from_label', v_label,
    'body', v_body
  );

  update trips
  set session_meta = jsonb_set(
    coalesce(session_meta, '{}'::jsonb),
    '{portal_chat}',
    coalesce(
      case
        when jsonb_typeof(session_meta->'portal_chat') = 'array'
          then session_meta->'portal_chat'
        else '[]'::jsonb
      end,
      '[]'::jsonb
    ) || jsonb_build_array(v_msg),
    true
  ),
      updated_at = now()
  where id = p_trip_id;

  insert into trip_events (trip_id, at, actor, kind, payload)
  values (p_trip_id, v_at, v_label, 'portal_chat_message', v_msg);

  return v_msg;
end;
$$;

comment on function append_portal_chat_message(uuid, text, text, text, text, text, text) is
  'Append a client or OnFly portal-chat message onto session_meta.portal_chat + trip_events.';

revoke all on function append_portal_chat_message(uuid, text, text, text, text, text, text) from public;
grant execute on function append_portal_chat_message(uuid, text, text, text, text, text, text) to anon, authenticated;
