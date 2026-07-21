-- Multi-dispatcher presence: who is logged into the dispatcher UI.
-- Board lists names from this table (TTL filtered client-side).

create table if not exists staff_presence (
  staff_id text primary key,
  name text not null,
  phone text,
  last_seen_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table staff_presence enable row level security;

drop policy if exists anon_all_staff_presence on staff_presence;
create policy anon_all_staff_presence on staff_presence
  for all to anon, authenticated
  using (true)
  with check (true);

grant select, insert, update, delete on staff_presence to anon, authenticated;
