-- Domain portal sign-in has no auth.uid, so RLS on portal_trips never returns rows.
-- SECURITY DEFINER helper: verify work email is allowed, then return safe trip cards.
-- Also includes trips where the email is a client-facing participant (ETA / requester).

create or replace function portal_email_authorized_for_client(
  p_email text,
  p_client_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_domain text;
begin
  if v_email = '' or position('@' in v_email) = 0 or p_client_id is null then
    return false;
  end if;

  if exists (
    select 1
    from portal_access_grants g
    where g.client_id = p_client_id
      and lower(g.email) = v_email
  ) then
    return true;
  end if;

  if exists (
    select 1
    from client_contacts cc
    where cc.client_id = p_client_id
      and lower(cc.email) = v_email
  ) then
    return true;
  end if;

  if exists (
    select 1
    from clients c
    where c.id = p_client_id
      and (
        lower(coalesce(c.email, '')) = v_email
        or lower(coalesce(c.invoice_email, '')) = v_email
      )
  ) then
    return true;
  end if;

  v_domain := lower(split_part(v_email, '@', 2));
  if v_domain is null
     or v_domain = ''
     or position('.' in v_domain) = 0
     or v_domain in (
       'gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.co.uk',
       'hotmail.com', 'outlook.com', 'live.com', 'icloud.com', 'me.com',
       'aol.com', 'msn.com', 'proton.me', 'protonmail.com', 'onflyair.com'
     )
  then
    return false;
  end if;

  return exists (
    select 1
    from clients c
    where c.id = p_client_id
      and exists (
        select 1
        from jsonb_array_elements_text(
          coalesce(c.profile->'allowed_email_domains', '[]'::jsonb)
        ) as d(domain)
        where lower(trim(both '@' from trim(both from d.domain))) = v_domain
      )
  );
end;
$$;

comment on function portal_email_authorized_for_client(text, uuid) is
  'True when work email may open this client portal (grant, contact, or corporate domain).';

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

comment on function portal_trips_for_work_email(text) is
  'Safe portal trip cards for a work-email domain session (no auth.uid).';

revoke all on function portal_email_authorized_for_client(text, uuid) from public;
revoke all on function portal_trips_for_work_email(text) from public;
grant execute on function portal_email_authorized_for_client(text, uuid) to anon, authenticated;
grant execute on function portal_trips_for_work_email(text) to anon, authenticated;
