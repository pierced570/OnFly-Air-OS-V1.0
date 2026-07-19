-- ETA spine: defaults table + trip_eta_nodes (chain on the trip, not candidate).

create table if not exists eta_defaults (
  key text primary key,
  minutes integer not null,
  label text not null default '',
  updated_at timestamptz not null default now(),
  updated_by text
);

insert into eta_defaults (key, minutes, label) values
  ('driver_ttp', 30, 'Driver time-to-position'),
  ('driver_load', 30, 'Loading at shipper'),
  ('driver_unload', 30, 'Unloading at consignee'),
  ('fbo_transfer', 30, 'Truck↔aircraft transfer'),
  ('acft_ttp', 120, 'Aircraft time-to-position (default)'),
  ('acft_turn', 60, 'Aircraft turnaround'),
  ('taxi_pad', 12, 'Taxi pad on air legs'),
  ('slip_threshold', 15, 'Client update slip threshold')
on conflict (key) do nothing;

alter table eta_defaults enable row level security;

drop policy if exists staff_all_eta_defaults on eta_defaults;
create policy staff_all_eta_defaults on eta_defaults
  for all to authenticated using (true) with check (true);

drop policy if exists anon_read_eta_defaults on eta_defaults;
create policy anon_read_eta_defaults on eta_defaults
  for select to anon using (true);

grant select on eta_defaults to anon, authenticated;
grant insert, update, delete on eta_defaults to authenticated;

-- Ordered ETA nodes attached to the trip (copy of winning chain on book).
create table if not exists trip_eta_nodes (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  seq integer not null,
  type text not null,
  branch text not null check (branch in ('truck', 'air', 'merged')),
  label text not null default '',
  event text not null default '',
  from_icao text,
  to_icao text,
  from_tz text,
  to_tz text,
  from_lat double precision,
  from_lon double precision,
  to_lat double precision,
  to_lon double precision,
  est_start timestamptz not null,
  est_end timestamptz not null,
  actual_start timestamptz,
  actual_end timestamptz,
  duration_min integer not null default 0,
  duration_key text,
  source text not null default 'assumed'
    check (source in ('assumed', 'quoted', 'manual', 'actual')),
  distance_mi double precision,
  distance_nm double precision,
  slack_min integer,
  created_at timestamptz not null default now(),
  unique (trip_id, seq)
);

create index if not exists trip_eta_nodes_trip_idx on trip_eta_nodes (trip_id);

alter table trip_eta_nodes enable row level security;

drop policy if exists staff_all_trip_eta_nodes on trip_eta_nodes;
create policy staff_all_trip_eta_nodes on trip_eta_nodes
  for all to authenticated using (true) with check (true);

drop policy if exists anon_read_trip_eta_nodes on trip_eta_nodes;
create policy anon_read_trip_eta_nodes on trip_eta_nodes
  for select to anon using (true);

grant select on trip_eta_nodes to anon, authenticated;
grant insert, update, delete on trip_eta_nodes to authenticated;

-- Trip-level pattern + promised delivery snapshot
alter table trips add column if not exists service_pattern text;
alter table trips add column if not exists promised_delivery timestamptz;
alter table trips add column if not exists eta_defaults_snapshot jsonb;
