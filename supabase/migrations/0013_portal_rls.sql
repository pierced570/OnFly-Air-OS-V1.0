-- Portal RLS: authenticated clients see only their trips (no cost/offers).
-- Dispatcher continues on anon key + anon_all_* policies.

-- Drop broad authenticated staff policies on commerce/trip tables so portal
-- magic-link users cannot read every trip.
drop policy if exists staff_all_trips on trips;
drop policy if exists staff_all_trip_legs on trip_legs;
drop policy if exists staff_all_trip_events on trip_events;
drop policy if exists staff_all_trip_participants on trip_participants;
drop policy if exists staff_all_offers on offers;
drop policy if exists staff_all_quotes on quotes;
drop policy if exists staff_all_invoices on invoices;
drop policy if exists staff_all_documents on documents;

-- Own-client read for portal users
drop policy if exists portal_read_own_trips on trips;
create policy portal_read_own_trips on trips
  for select to authenticated
  using (
    client_id in (
      select pu.client_id from portal_users pu where pu.user_id = (select auth.uid())
    )
  );

drop policy if exists portal_read_own_legs on trip_legs;
create policy portal_read_own_legs on trip_legs
  for select to authenticated
  using (
    trip_id in (
      select t.id from trips t
      where t.client_id in (
        select pu.client_id from portal_users pu where pu.user_id = (select auth.uid())
      )
    )
  );

drop policy if exists portal_read_own_events on trip_events;
create policy portal_read_own_events on trip_events
  for select to authenticated
  using (
    trip_id in (
      select t.id from trips t
      where t.client_id in (
        select pu.client_id from portal_users pu where pu.user_id = (select auth.uid())
      )
    )
  );

drop policy if exists portal_read_own_participants on trip_participants;
create policy portal_read_own_participants on trip_participants
  for select to authenticated
  using (
    trip_id in (
      select t.id from trips t
      where t.client_id in (
        select pu.client_id from portal_users pu where pu.user_id = (select auth.uid())
      )
    )
  );

-- Documents: quote / eta / manifest / pod only (never invoices via raw table)
drop policy if exists portal_read_own_documents on documents;
create policy portal_read_own_documents on documents
  for select to authenticated
  using (
    trip_id in (
      select t.id from trips t
      where t.client_id in (
        select pu.client_id from portal_users pu where pu.user_id = (select auth.uid())
      )
    )
    and coalesce(kind, '') in ('quote', 'eta_sheet', 'manifest', 'pod', 'other')
  );

-- Explicitly no offers / quotes / invoices policies for authenticated → denied.

-- Link auth user → client via contact email (call after magic-link)
create or replace function link_portal_user()
returns portal_users
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_client uuid;
  v_row portal_users;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  select lower(coalesce(u.email, '')) into v_email
  from auth.users u where u.id = v_uid;

  if v_email is null or v_email = '' then
    raise exception 'no email on auth user';
  end if;

  select cc.client_id into v_client
  from client_contacts cc
  where lower(cc.email) = v_email
  order by case when cc.role = 'requester' then 0 else 1 end
  limit 1;

  if v_client is null then
    -- Also try clients.invoice_email / profile later — soft fail
    return null;
  end if;

  insert into portal_users (user_id, client_id, contact_email)
  values (v_uid, v_client, v_email)
  on conflict (user_id) do update
    set client_id = excluded.client_id,
        contact_email = excluded.contact_email
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function link_portal_user() from public;
grant execute on function link_portal_user() to authenticated;

-- Ensure portal_users insert for self after link (policy)
drop policy if exists portal_users_self_write on portal_users;
create policy portal_users_self_write on portal_users
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists portal_users_self_update on portal_users;
create policy portal_users_self_update on portal_users
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant select, insert, update on portal_users to authenticated;
