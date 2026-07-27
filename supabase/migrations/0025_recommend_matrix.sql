create table if not exists recommend_matrix (
  key text primary key,
  value numeric not null,
  updated_at timestamptz not null default now()
);

insert into recommend_matrix (key, value) values
  ('weight_price', 0.45),
  ('weight_time', 0.3),
  ('weight_radar', 0.25),
  ('target_margin_pct', 15),
  ('recommend_limit', 3),
  ('truck_per_mile', 3.5),
  ('truck_min', 150),
  ('payload_factor', 0.85),
  ('reserve_nm', 45),
  ('door_diagonal_factor', 1.05),
  ('unresolved_base_nm', 2500)
on conflict (key) do nothing;

alter table recommend_matrix enable row level security;

drop policy if exists staff_all_recommend_matrix on recommend_matrix;
create policy staff_all_recommend_matrix on recommend_matrix
  for all using (true) with check (true);

drop policy if exists anon_read_recommend_matrix on recommend_matrix;
create policy anon_read_recommend_matrix on recommend_matrix
  for select using (true);

grant select on recommend_matrix to anon, authenticated;
grant insert, update, delete on recommend_matrix to authenticated;
