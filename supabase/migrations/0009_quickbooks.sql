-- QuickBooks Online integration (OFA-aligned)
-- Tokens live in integration_configs.config JSONB — never in VITE_*.

create table if not exists integration_configs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  company_id text not null default 'onfly',
  integration_type text not null,
  is_connected boolean not null default false,
  config jsonb not null default '{}'::jsonb,
  unique (company_id, integration_type)
);

create index if not exists integration_configs_type_idx
  on integration_configs (integration_type);

alter table integration_configs enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'integration_configs'
      and policyname = 'integration_configs_authenticated_all'
  ) then
    create policy integration_configs_authenticated_all on integration_configs
      for all to authenticated using (true) with check (true);
  end if;
end $$;

-- Service role / edge writes also need anon read of is_connected for connect banner
-- (tokens stay in config; client should only read is_connected + environment via edge).

alter table financial_records
  add column if not exists qb_invoice_number text,
  add column if not exists invoice_date date,
  add column if not exists due_date date,
  add column if not exists po_number text,
  add column if not exists client_paid boolean not null default false,
  add column if not exists client_paid_date date;

alter table clients
  add column if not exists po_prefix text;

comment on table integration_configs is
  'OAuth / vendor connection blobs. QuickBooks: access_token, refresh_token, token_expires_at, realm_id, environment.';
