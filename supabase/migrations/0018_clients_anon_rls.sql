-- Dispatcher UI uses the anon key (local staff gate), same as leads/trips.
-- Grants already exist in 0005; policies were authenticated-only → hydrate saw 0 clients.

drop policy if exists anon_all_clients on clients;
create policy anon_all_clients on clients
  for all to anon
  using (true)
  with check (true);

drop policy if exists anon_all_client_contacts on client_contacts;
create policy anon_all_client_contacts on client_contacts
  for all to anon
  using (true)
  with check (true);

drop policy if exists anon_all_client_rules on client_rules;
create policy anon_all_client_rules on client_rules
  for all to anon
  using (true)
  with check (true);

grant select, insert, update, delete on clients to authenticated, anon;
grant select, insert, update, delete on client_contacts to authenticated, anon;
grant select, insert, update, delete on client_rules to authenticated, anon;
