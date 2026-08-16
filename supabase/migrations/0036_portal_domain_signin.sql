-- Portal domain login: allowlist on profile + corporate domains from emails on file.
-- Exact contact / grant still wins. Public mailboxes and onflyair.com never domain-match.

create or replace function link_portal_user()
returns portal_users
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_domain text;
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

  -- 2) Fallback: client_contacts on file (exact address)
  if v_client is null then
    select cc.client_id into v_client
    from client_contacts cc
    where lower(cc.email) = v_email
    order by case when cc.role = 'requester' then 0 else 1 end
    limit 1;
  end if;

  -- 2b) Exact match on clients.email / invoice_email
  if v_client is null then
    select c.id into v_client
    from clients c
    where lower(coalesce(c.email, '')) = v_email
       or lower(coalesce(c.invoice_email, '')) = v_email
    order by c.updated_at desc nulls last
    limit 1;
  end if;

  v_domain := lower(split_part(v_email, '@', 2));

  -- 3) Corporate domain allowlist on client profile (desk + hydrated from on-file)
  if v_client is null
     and v_domain is not null
     and v_domain <> ''
     and position('.' in v_domain) > 0
     and v_domain not in (
       'gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.co.uk',
       'hotmail.com', 'outlook.com', 'live.com', 'icloud.com', 'me.com',
       'aol.com', 'msn.com', 'proton.me', 'protonmail.com', 'onflyair.com'
     )
  then
    select c.id into v_client
    from clients c
    where exists (
      select 1
      from jsonb_array_elements_text(
        coalesce(c.profile->'allowed_email_domains', '[]'::jsonb)
      ) as d(domain)
      where lower(trim(both '@' from trim(both from d.domain))) = v_domain
    )
    order by c.updated_at desc nulls last
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

comment on function link_portal_user() is
  'Link portal user via grant, exact contact/email, or clients.profile.allowed_email_domains (corporate only).';

grant execute on function link_portal_user() to authenticated;
grant execute on function link_portal_user() to anon;
