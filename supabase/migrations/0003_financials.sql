-- Financial ledger (OFA Financials) — one row per trip
-- Live rows link to trips when available; CSV history imports as is_legacy.

create table if not exists financial_records (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Identity / linkage
  trip_id uuid references trips(id) on delete set null,
  client_id uuid references clients(id) on delete set null,
  is_legacy boolean not null default false,
  source text not null default 'live', -- live | legacy | quick_dispatch

  -- Ops meta (denormalized for sheet speed)
  date_of_flight date,
  operator_po text,
  client_name text,
  route_text text,
  aircraft_type text,
  tail_number text,
  vendor_name text,
  pay_terms text,
  referral_name text,

  -- Money (client side)
  client_subtotal_pre_tax numeric(12,2),
  tax_total numeric(12,2) not null default 0,
  tax_breakdown jsonb not null default '[]'::jsonb,
  client_invoiced_amount numeric(12,2) not null default 0,

  -- Money (operator / margin / investor)
  vendor_amount numeric(12,2) not null default 0,
  margin numeric(12,2) not null default 0,
  funded_by text, -- Jonny 1% | Jonny | OFA | Awaiting $
  deposited_to text,
  check_deposit_number text,
  jonnys_profits numeric(12,2) not null default 0,
  jonny_invested numeric(12,2) not null default 0,
  jonny_money_owed numeric(12,2) not null default 0,
  jonny_money_returned numeric(12,2) not null default 0,
  ofa_profit_per_trip numeric(12,2) not null default 0,

  -- Completeness flags
  was_it_paid boolean not null default false,
  vendor_paid boolean not null default false,
  investor_paid boolean not null default false,
  has_ofa_seen_profit boolean not null default false,
  bill_logged_in_qb boolean not null default false,
  referral_paid_out boolean not null default false,

  -- Vendor bill
  vendor_bill_url text,
  vendor_bill_verified boolean not null default false,

  -- QB mirror ids (write-path later)
  qb_invoice_id text,
  qb_bill_id text,

  notes text
);

create index if not exists financial_records_date_idx on financial_records (date_of_flight desc);
create index if not exists financial_records_po_idx on financial_records (operator_po);
create index if not exists financial_records_client_idx on financial_records (client_name);
create index if not exists financial_records_legacy_idx on financial_records (is_legacy);

alter table financial_records enable row level security;

-- Internal-only stub policy (tighten with has_role later)
do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'financial_records' and policyname = 'financials_authenticated_all'
  ) then
    create policy financials_authenticated_all on financial_records
      for all to authenticated using (true) with check (true);
  end if;
end $$;
