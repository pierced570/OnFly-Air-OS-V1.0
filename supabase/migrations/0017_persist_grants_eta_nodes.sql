-- Fix column UPDATE grants for fields added after 0012, and allow
-- dispatcher (anon demo key) to write trip_eta_nodes like other trip children.

grant update (
  client_id, mode, payload_kind, pieces, pax_count, hazmat, declared_value,
  origin, destination, ready_at, deadline, po_number,
  assigned_operator_id, assigned_aircraft_id, needs_info, updated_at,
  lane_label, payload_summary, ready_label, accept_token, session_meta,
  service_pattern, promised_delivery, eta_defaults_snapshot,
  thread_number, thread_disbanded_at
) on table trips to anon, authenticated;

drop policy if exists anon_write_trip_eta_nodes on trip_eta_nodes;
create policy anon_write_trip_eta_nodes on trip_eta_nodes
  for all to anon using (true) with check (true);

grant insert, update, delete on trip_eta_nodes to anon;
