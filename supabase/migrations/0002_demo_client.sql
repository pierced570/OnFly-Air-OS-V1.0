-- Seed Demo Freight Co + requester / AP / supply_chain (idempotent)

do $$
declare
  cid uuid;
begin
  select id into cid from clients where name = 'Demo Freight Co' limit 1;
  if cid is null then
    insert into clients (name, billing_terms, notes)
    values (
      'Demo Freight Co',
      'NET30',
      'Seeded demo client for portal + intake.'
    )
    returning id into cid;
  end if;

  if not exists (
    select 1 from client_contacts
    where client_id = cid and email = 'requester@demo-freight.test'
  ) then
    insert into client_contacts (client_id, name, role, email, cell, notify_prefs)
    values (
      cid,
      'Alex Requester',
      'requester',
      'requester@demo-freight.test',
      '+15551234567',
      '{"wheels_up": true, "wheels_down": true, "pod": true}'::jsonb
    );
  end if;

  if not exists (
    select 1 from client_contacts
    where client_id = cid and email = 'ap@demo-freight.test'
  ) then
    insert into client_contacts (client_id, name, role, email, cell, notify_prefs)
    values (
      cid,
      'Blake AP',
      'ap',
      'ap@demo-freight.test',
      '+15551234568',
      '{"invoice": true}'::jsonb
    );
  end if;

  if not exists (
    select 1 from client_contacts
    where client_id = cid and email = 'supply@demo-freight.test'
  ) then
    insert into client_contacts (client_id, name, role, email, cell, notify_prefs)
    values (
      cid,
      'Casey Supply',
      'supply_chain',
      'supply@demo-freight.test',
      '+15551234569',
      '{"tracker": true, "wheels_up": true, "pod": true}'::jsonb
    );
  end if;

  if not exists (select 1 from client_rules where client_id = cid) then
    insert into client_rules (
      client_id, dual_pilot_required, freight_only, multi_engine_only,
      hazmat_allowed, max_declared_value
    ) values (
      cid, false, true, false, true, 500000
    );
  end if;
end $$;
