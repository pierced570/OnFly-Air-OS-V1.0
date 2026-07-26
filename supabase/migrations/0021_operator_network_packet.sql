-- Public network packet (/join/:token) may create operators + aircraft
-- (same anon trust model as Network sheet writes; UI is staff-gated for invites).

drop policy if exists anon_insert_operators on operators;
create policy anon_insert_operators on operators
  for insert to anon
  with check (true);

drop policy if exists anon_insert_aircraft on aircraft;
create policy anon_insert_aircraft on aircraft
  for insert to anon
  with check (true);

grant select, insert, update on operators, aircraft to anon;
