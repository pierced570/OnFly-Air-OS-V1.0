-- Multiple vendors (aircraft / ground / FBO) under one PO / financial mission.

create table if not exists financial_vendor_lines (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  financial_record_id uuid not null references financial_records(id) on delete cascade,
  trip_id uuid references trips(id) on delete set null,
  po_number text,

  kind text not null default 'aircraft'
    check (kind in ('aircraft', 'ground', 'fbo', 'other')),
  vendor_name text not null default '',
  tail_number text,
  aircraft_type text,
  amount numeric(12,2) not null default 0,
  pay_terms text,

  vendor_paid boolean not null default false,
  bill_logged_in_qb boolean not null default false,
  vendor_bill_url text,
  vendor_bill_verified boolean not null default false,
  notes text
);

create index if not exists financial_vendor_lines_record_idx
  on financial_vendor_lines (financial_record_id);
create index if not exists financial_vendor_lines_po_idx
  on financial_vendor_lines (po_number);
create index if not exists financial_vendor_lines_trip_idx
  on financial_vendor_lines (trip_id);

alter table financial_vendor_lines enable row level security;

drop policy if exists financial_vendor_lines_authenticated_all on financial_vendor_lines;
create policy financial_vendor_lines_authenticated_all on financial_vendor_lines
  for all to authenticated using (true) with check (true);

drop policy if exists anon_all_financial_vendor_lines on financial_vendor_lines;
create policy anon_all_financial_vendor_lines on financial_vendor_lines
  for all to anon using (true) with check (true);

grant select, insert, update, delete on financial_vendor_lines to authenticated, anon;
