-- Dispatcher Network sheet edits (anon key + local staff gate).
-- SELECT already granted in 0010; allow UPDATE/INSERT for sheet overlays.

drop policy if exists anon_update_operators on operators;
create policy anon_update_operators on operators
  for update to anon
  using (true)
  with check (true);

drop policy if exists anon_update_aircraft on aircraft;
create policy anon_update_aircraft on aircraft
  for update to anon
  using (true)
  with check (true);

drop policy if exists anon_all_operator_contacts on operator_contacts;
create policy anon_all_operator_contacts on operator_contacts
  for all to anon
  using (true)
  with check (true);

drop policy if exists anon_select_operator_contacts on operator_contacts;
create policy anon_select_operator_contacts on operator_contacts
  for select to anon
  using (true);

grant select, update on operators, aircraft to anon;
grant select, insert, update, delete on operator_contacts to anon;
