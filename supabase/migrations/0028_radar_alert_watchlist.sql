-- Radar last-known + FlightAware alert watchlist (dispatcher-managed).
-- Seed fills last_*; alert_enabled controls who we register for movement alerts.

create table if not exists radar_tracked_tails (
  tail text primary key,
  alert_enabled boolean not null default false,
  provider_alert_id text,
  last_lat numeric,
  last_lon numeric,
  last_alt numeric,
  last_gs numeric,
  last_seen_at timestamptz,
  last_takeoff_at timestamptz,
  last_landing_at timestamptz,
  phase text,
  ladd_blocked boolean not null default true,
  seeded_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists radar_tracked_tails_alert_idx
  on radar_tracked_tails (alert_enabled)
  where alert_enabled = true;

alter table radar_tracked_tails enable row level security;

drop policy if exists staff_all_radar_tracked_tails on radar_tracked_tails;
create policy staff_all_radar_tracked_tails on radar_tracked_tails
  for all using (true) with check (true);

drop policy if exists anon_read_radar_tracked_tails on radar_tracked_tails;
create policy anon_read_radar_tracked_tails on radar_tracked_tails
  for select using (true);

grant select on radar_tracked_tails to anon, authenticated;
grant insert, update, delete on radar_tracked_tails to anon, authenticated;
