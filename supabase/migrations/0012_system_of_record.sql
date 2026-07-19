-- System of record: trip persist columns, portal safe views, checkpoints, track tokens.

-- ── enum extensions ──────────────────────────────────────────
do $$ begin
  alter type leg_type add value if not exists 'position';
exception when duplicate_object then null;
end $$;

do $$ begin
  alter type party_role add value if not exists 'client_ap';
exception when duplicate_object then null;
end $$;

do $$ begin
  alter type party_role add value if not exists 'client_supply';
exception when duplicate_object then null;
end $$;

-- ── trip shell columns for dispatcher session parity ─────────
alter table trips add column if not exists lane_label text;
alter table trips add column if not exists payload_summary text;
alter table trips add column if not exists ready_label text;
alter table trips add column if not exists accept_token text;
alter table trips add column if not exists session_meta jsonb not null default '{}'::jsonb;

create unique index if not exists trips_accept_token_uidx
  on trips (accept_token) where accept_token is not null;

alter table trip_legs add column if not exists label text not null default '';
alter table trip_legs add column if not exists one_tap_token text;

create unique index if not exists trip_legs_one_tap_token_uidx
  on trip_legs (one_tap_token) where one_tap_token is not null;

-- Soften offers FK for session stubs that lack a network operator row yet
alter table offers alter column operator_id drop not null;

-- ── portal track tokens (durable magic links) ────────────────
create table if not exists portal_track_tokens (
  token text primary key,
  trip_id uuid not null references trips(id) on delete cascade,
  email text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz
);

create index if not exists portal_track_tokens_trip_idx on portal_track_tokens (trip_id);

alter table portal_track_tokens enable row level security;

drop policy if exists staff_all_portal_track_tokens on portal_track_tokens;
create policy staff_all_portal_track_tokens on portal_track_tokens
  for all to authenticated using (true) with check (true);

drop policy if exists anon_all_portal_track_tokens on portal_track_tokens;
create policy anon_all_portal_track_tokens on portal_track_tokens
  for all to anon using (true) with check (true);

grant select, insert, update, delete on portal_track_tokens to authenticated, anon;

-- portal_users: map auth.uid → client via contact email (magic-link ready)
create table if not exists portal_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  client_id uuid not null references clients(id) on delete cascade,
  contact_email text not null,
  created_at timestamptz not null default now()
);

create index if not exists portal_users_client_idx on portal_users (client_id);

alter table portal_users enable row level security;

drop policy if exists portal_users_self on portal_users;
create policy portal_users_self on portal_users
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists staff_all_portal_users on portal_users;
create policy staff_all_portal_users on portal_users
  for all to authenticated using (true) with check (true);

grant select on portal_users to authenticated;
grant select, insert, update, delete on portal_users to authenticated;

-- Safe views — no cost, margin, or operator identity
create or replace view portal_trips
with (security_invoker = true)
as
select
  t.id,
  t.ref,
  t.state,
  t.lane_label,
  t.payload_summary,
  t.ready_label,
  t.ready_at,
  t.deadline,
  t.po_number,
  t.mode,
  t.payload_kind,
  t.origin,
  t.destination,
  t.client_id,
  t.created_at,
  t.updated_at
from trips t;

create or replace view portal_legs
with (security_invoker = true)
as
select
  l.id,
  l.trip_id,
  l.seq,
  l.type,
  l.status,
  l.label,
  l.from_ref,
  l.to_ref,
  l.est_start,
  l.est_end,
  l.actual_start,
  l.actual_end
from trip_legs l;

create or replace view portal_documents
with (security_invoker = true)
as
select
  d.id,
  d.trip_id,
  d.kind,
  coalesce(d.parsed->>'title', d.kind) as title,
  d.storage_path,
  d.created_at
from documents d
where d.kind in ('quote', 'eta_sheet', 'manifest', 'pod', 'invoice', 'other');

-- Token-based read helpers (SECURITY DEFINER, scoped by token)
create or replace function portal_trip_by_token(p_token text)
returns setof portal_trips
language sql
stable
security definer
set search_path = public
as $$
  select pt.*
  from portal_track_tokens tok
  join portal_trips pt on pt.id = tok.trip_id
  where tok.token = p_token
    and (tok.expires_at is null or tok.expires_at > now())
  limit 1;
$$;

create or replace function portal_legs_by_token(p_token text)
returns setof portal_legs
language sql
stable
security definer
set search_path = public
as $$
  select pl.*
  from portal_track_tokens tok
  join portal_legs pl on pl.trip_id = tok.trip_id
  where tok.token = p_token
    and (tok.expires_at is null or tok.expires_at > now())
  order by pl.seq;
$$;

revoke all on function portal_trip_by_token(text) from public;
revoke all on function portal_legs_by_token(text) from public;
grant execute on function portal_trip_by_token(text) to anon, authenticated;
grant execute on function portal_legs_by_token(text) to anon, authenticated;

-- Portal role (authenticated) may read safe views for their client_id
drop policy if exists portal_read_own_trips on trips;
create policy portal_read_own_trips on trips
  for select to authenticated
  using (
    client_id in (
      select pu.client_id from portal_users pu where pu.user_id = (select auth.uid())
    )
  );

grant select on portal_trips to anon, authenticated;
grant select on portal_legs to anon, authenticated;
grant select on portal_documents to anon, authenticated;

-- ── checkpoints (edge cron source of truth) ──────────────────
create table if not exists checkpoints (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  leg_id uuid references trip_legs(id) on delete set null,
  key text not null,
  kind text not null,
  fire_at timestamptz not null,
  status text not null default 'scheduled'
    check (status in ('scheduled','fired','acked','cancelled')),
  title text not null default '',
  detail text not null default '',
  fired_at timestamptz,
  exception_id text,
  created_at timestamptz not null default now(),
  unique (trip_id, key)
);

create index if not exists checkpoints_fire_at_idx
  on checkpoints (fire_at) where status = 'scheduled';

alter table checkpoints enable row level security;

drop policy if exists staff_all_checkpoints on checkpoints;
create policy staff_all_checkpoints on checkpoints
  for all to authenticated using (true) with check (true);

drop policy if exists anon_all_checkpoints on checkpoints;
create policy anon_all_checkpoints on checkpoints
  for all to anon using (true) with check (true);

grant select, insert, update, delete on checkpoints to authenticated, anon;

-- Intake drafts: message-id for Resend idempotency
alter table intake_drafts add column if not exists message_id text;
create unique index if not exists intake_drafts_message_id_uidx
  on intake_drafts (message_id) where message_id is not null;

drop policy if exists anon_all_intake_drafts on intake_drafts;
create policy anon_all_intake_drafts on intake_drafts
  for all to anon using (true) with check (true);

-- Staff/anon trip write path (dispatcher uses anon key today)
grant select, insert, update, delete on trips to authenticated, anon;
grant select, insert, update, delete on trip_legs to authenticated, anon;
grant select, insert on trip_events to authenticated, anon;
grant select, insert, update, delete on trip_participants to authenticated, anon;
grant select, insert, update, delete on offers to authenticated, anon;
grant select, insert, update, delete on quotes to authenticated, anon;
grant select, insert, update, delete on documents to authenticated, anon;
grant select on tax_rates to authenticated, anon;
grant select on pricing_priors to authenticated, anon;
grant select on trip_history to authenticated, anon;

drop policy if exists anon_all_trips on trips;
create policy anon_all_trips on trips
  for all to anon using (true) with check (true);

drop policy if exists anon_all_trip_legs on trip_legs;
create policy anon_all_trip_legs on trip_legs
  for all to anon using (true) with check (true);

drop policy if exists anon_insert_trip_events on trip_events;
create policy anon_insert_trip_events on trip_events
  for insert to anon with check (true);

drop policy if exists anon_select_trip_events on trip_events;
create policy anon_select_trip_events on trip_events
  for select to anon using (true);

drop policy if exists anon_all_offers on offers;
create policy anon_all_offers on offers
  for all to anon using (true) with check (true);

drop policy if exists anon_all_documents on documents;
create policy anon_all_documents on documents
  for all to anon using (true) with check (true);

-- Prefer RPC for state changes: block direct UPDATE of trips.state for anon/authenticated
-- (INSERT still allowed with an initial state; trip_transition is SECURITY DEFINER.)
revoke update on table trips from anon, authenticated;
grant update (
  client_id, mode, payload_kind, pieces, pax_count, hazmat, declared_value,
  origin, destination, ready_at, deadline, po_number,
  assigned_operator_id, assigned_aircraft_id, needs_info, updated_at,
  lane_label, payload_summary, ready_label, accept_token, session_meta
) on table trips to anon, authenticated;

grant execute on function trip_transition(uuid, trip_state, text, jsonb) to anon, authenticated;
