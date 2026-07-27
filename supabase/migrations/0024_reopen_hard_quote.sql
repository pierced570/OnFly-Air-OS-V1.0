-- Allow desk to reopen a lost trip to send another hard quote
-- (client declined / quote abandoned). Mirrors src/domain/stateMachine.ts.

create or replace function trip_transition(
  p_trip_id uuid,
  p_to_state trip_state,
  p_actor text,
  p_payload jsonb default '{}'::jsonb
)
returns trips
language plpgsql
security definer
as $$
declare
  v_trip trips;
  v_from trip_state;
  v_ok boolean := false;
begin
  select * into v_trip from trips where id = p_trip_id for update;
  if not found then
    raise exception 'trip not found: %', p_trip_id;
  end if;

  v_from := v_trip.state;

  if v_from = p_to_state then
    raise exception 'already in state %', p_to_state;
  end if;

  v_ok := case
    when v_from = 'draft' and p_to_state = 'routed' then true
    when v_from = 'routed' and p_to_state = 'quoted_estimated' then true
    when v_from = 'quoted_estimated' and p_to_state in ('offers_out','lost') then true
    when v_from = 'offers_out' and p_to_state in ('quoted_hard','lost') then true
    when v_from = 'quoted_hard' and p_to_state in ('booked','lost') then true
    when v_from = 'booked' and p_to_state in ('in_progress','cancelled') then true
    when v_from = 'in_progress' and p_to_state in ('delivered','cancelled') then true
    when v_from = 'delivered' and p_to_state = 'invoiced' then true
    when v_from = 'invoiced' and p_to_state = 'closed' then true
    when v_from = 'lost' and p_to_state in ('quoted_hard','offers_out') then true
    else false
  end;

  if not v_ok then
    raise exception 'illegal transition: % → %', v_from, p_to_state;
  end if;

  update trips
    set state = p_to_state
    where id = p_trip_id
    returning * into v_trip;

  insert into trip_events (trip_id, actor, kind, payload)
  values (
    p_trip_id,
    p_actor,
    'state_transition',
    coalesce(p_payload, '{}'::jsonb) || jsonb_build_object('from', v_from, 'to', p_to_state)
  );

  return v_trip;
end;
$$;
