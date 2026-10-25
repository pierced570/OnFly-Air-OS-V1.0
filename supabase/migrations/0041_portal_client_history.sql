-- Client mobile app: history list (delivered / invoiced / closed / lost / cancelled)
-- for work-email domain sessions. Active list stays on portal_trips_for_work_email.

create or replace function portal_trip_history_for_work_email(p_email text)
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
  where pt.state in ('delivered', 'invoiced', 'closed', 'lost', 'cancelled')
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
  limit 100;
end;
$$;

comment on function portal_trip_history_for_work_email(text) is
  'Past portal trips (delivered+) for a work-email domain session — POs / invoices hub.';

revoke all on function portal_trip_history_for_work_email(text) from public;
grant execute on function portal_trip_history_for_work_email(text) to anon, authenticated;
