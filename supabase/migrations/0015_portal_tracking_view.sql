-- Extend portal-safe trip view with ETA spine fields (still no cost/operator).
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
  t.service_pattern,
  t.promised_delivery,
  t.created_at,
  t.updated_at
from trips t;

grant select on portal_trips to anon, authenticated;
