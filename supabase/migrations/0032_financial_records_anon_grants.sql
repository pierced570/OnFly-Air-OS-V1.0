-- Dispatcher app uses the anon key (no Supabase Auth session).
-- financial_vendor_lines already has anon_all_*; financial_records did not,
-- so ledger edits could never round-trip to Postgres.

drop policy if exists anon_all_financial_records on financial_records;
create policy anon_all_financial_records on financial_records
  for all to anon using (true) with check (true);

grant select, insert, update, delete on financial_records to anon, authenticated;

-- Ensure vendor lines stay writable alongside parent rows.
grant select, insert, update, delete on financial_vendor_lines to anon, authenticated;
