-- Trip thread pool (M8) + contact bank for post-trip retention.

create table if not exists thread_numbers (
  number text primary key,
  purpose text not null default 'trip_thread',
  active boolean not null default true,
  trip_id uuid references trips(id) on delete set null,
  assigned_at timestamptz,
  release_after timestamptz,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists thread_numbers_trip_idx on thread_numbers (trip_id)
  where trip_id is not null;

alter table thread_numbers enable row level security;

drop policy if exists staff_all_thread_numbers on thread_numbers;
create policy staff_all_thread_numbers on thread_numbers
  for all to authenticated using (true) with check (true);

drop policy if exists anon_read_thread_numbers on thread_numbers;
create policy anon_read_thread_numbers on thread_numbers
  for select to anon using (true);

grant select on thread_numbers to anon, authenticated;
grant insert, update, delete on thread_numbers to authenticated;

-- Seed mock pool numbers (replace with real RC DIDs in production)
insert into thread_numbers (number, purpose, active, notes) values
  ('+15557100001', 'trip_thread', true, 'mock pool 1'),
  ('+15557100002', 'trip_thread', true, 'mock pool 2'),
  ('+15557100003', 'trip_thread', true, 'mock pool 3'),
  ('+15557100004', 'trip_thread', true, 'mock pool 4'),
  ('+15557100005', 'trip_thread', true, 'mock pool 5')
on conflict (number) do nothing;

alter table trips add column if not exists thread_number text;
alter table trips add column if not exists thread_disbanded_at timestamptz;

-- Durable contact bank (people met on trips, retained after disband)
create table if not exists contact_bank (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('client', 'operator')),
  client_id uuid references clients(id) on delete set null,
  operator_id uuid references operators(id) on delete set null,
  name text not null default '',
  cell text,
  email text,
  role text not null default 'other',
  source_trip_id uuid references trips(id) on delete set null,
  source_trip_ref integer,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists contact_bank_client_idx on contact_bank (client_id);
create index if not exists contact_bank_cell_idx on contact_bank (cell);

alter table contact_bank enable row level security;

drop policy if exists staff_all_contact_bank on contact_bank;
create policy staff_all_contact_bank on contact_bank
  for all to authenticated using (true) with check (true);

grant select, insert, update, delete on contact_bank to authenticated;
