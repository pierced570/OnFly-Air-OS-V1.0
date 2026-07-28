-- Soft-delete for desk "Delete" on the waterfall.
-- trip_events is append-only + FK ON DELETE CASCADE, so hard DELETE trips fails
-- with P0001 and the app retries forever. Discard instead; keep the event log.

alter table trips
  add column if not exists discarded_at timestamptz;

create index if not exists trips_active_idx
  on trips (ref desc)
  where discarded_at is null;

comment on column trips.discarded_at is
  'Desk removed trip from queue (soft delete). Null = active. trip_events stay forever.';
