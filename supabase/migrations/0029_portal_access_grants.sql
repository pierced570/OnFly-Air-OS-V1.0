-- Portal access grants: desk assigns which emails may open which company in the client portal.
-- link_portal_user prefers these grants, then falls back to client_contacts.

create table if not exists portal_access_grants (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  client_id uuid not null references clients (id) on delete cascade,
  -- Optional display name for the person (desk-facing).
  label text,
  created_at timestamptz not null default now(),
  created_by text
);

create unique index if not exists portal_access_grants_email_lower_uidx
  on portal_access_grants (lower(email));

create index if not exists portal_access_grants_client_idx
  on portal_access_grants (client_id);

alter table portal_access_grants enable row level security;

drop policy if exists anon_all_portal_access_grants on portal_access_grants;
create policy anon_all_portal_access_grants on portal_access_grants
  for all to anon using (true) with check (true);

drop policy if exists staff_all_portal_access_grants on portal_access_grants;
create policy staff_all_portal_access_grants on portal_access_grants
  for all to authenticated using (true) with check (true);

comment on table portal_access_grants is
  'Desk-managed email → client company grants for client portal magic-link login.';

grant select, insert, update, delete on portal_access_grants to anon, authenticated;

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

  -- 1) Explicit portal access grant (Admin → Portal access)
  select g.client_id into v_client
  from portal_access_grants g
  where lower(g.email) = v_email
  limit 1;

  -- 2) Fallback: client_contacts on file
  if v_client is null then
    select cc.client_id into v_client
    from client_contacts cc
    where lower(cc.email) = v_email
    order by case when cc.role = 'requester' then 0 else 1 end
    limit 1;
  end if;

  if v_client is null then
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

grant execute on function link_portal_user() to authenticated;
grant execute on function link_portal_user() to anon;
