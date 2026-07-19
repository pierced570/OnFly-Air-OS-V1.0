-- Fleet directory is dispatcher-facing demo data (operator names + tails).
-- Staff UI uses the anon key (local staff gate, not Supabase Auth), so anon
-- must be able to SELECT the network tables. Writes stay authenticated-only.

drop policy if exists anon_select_operators on operators;
create policy anon_select_operators on operators
  for select to anon
  using (true);

drop policy if exists anon_select_aircraft on aircraft;
create policy anon_select_aircraft on aircraft
  for select to anon
  using (true);

drop policy if exists anon_select_airports on airports;
create policy anon_select_airports on airports
  for select to anon
  using (true);

drop policy if exists anon_select_type_specs on type_specs;
create policy anon_select_type_specs on type_specs
  for select to anon
  using (true);

grant select on operators, aircraft, airports, type_specs to anon;
