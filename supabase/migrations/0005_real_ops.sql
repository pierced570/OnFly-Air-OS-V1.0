-- Real operating data: FBO addresses, client legacy keys, intake drafts, shifts notes.

alter table fbos add column if not exists street text;
alter table fbos add column if not exists city text;
alter table fbos add column if not exists state text;
alter table fbos add column if not exists zip text;
alter table fbos add column if not exists lat numeric;
alter table fbos add column if not exists lon numeric;
alter table fbos add column if not exists notes text;

alter table clients add column if not exists legacy_key text;
create unique index if not exists clients_legacy_key_uidx on clients (legacy_key)
  where legacy_key is not null;

alter table clients add column if not exists invoice_email text;
alter table clients add column if not exists last_po text;

-- One rules row per client for upserts
create unique index if not exists client_rules_client_id_uidx on client_rules (client_id);

-- Intake drafts (email/SMS) for durable review queue
create table if not exists intake_drafts (
  id uuid primary key default gen_random_uuid(),
  channel text not null check (channel in ('email','sms')),
  from_addr text not null,
  subject text,
  body text not null,
  status text not null default 'pending_review'
    check (status in ('pending_review','accepted','ignored')),
  extracted jsonb,
  ignore_reason text,
  notified_phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table intake_drafts enable row level security;
drop policy if exists staff_all_intake_drafts on intake_drafts;
create policy staff_all_intake_drafts on intake_drafts
  for all to authenticated using (true) with check (true);

-- Allow anon/authenticated demo writes for staff stub (same as other tables)
grant select, insert, update, delete on intake_drafts to authenticated, anon;

alter table shifts add column if not exists notes text;

-- Comms log already exists; ensure anon can write for demo staff path
grant select, insert, update on comms_messages to authenticated, anon;
grant select, insert, update on clients to authenticated, anon;
grant select, insert, update, delete on client_contacts to authenticated, anon;
grant select, insert, update, delete on client_rules to authenticated, anon;
grant select, insert, update, delete on fbos to authenticated, anon;
grant select, insert, update on shifts to authenticated, anon;
grant select, insert, update on needs_info_tasks to authenticated, anon;
grant select on tax_rates to authenticated, anon;
grant select, insert, update on airports to authenticated, anon;
