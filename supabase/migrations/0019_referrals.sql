-- Referral partners directory + profit-share amount on financial ledger.

create table if not exists referrals (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null default '',
  cell text not null default '',
  share_mode text not null default 'flat'
    check (share_mode in ('flat', 'percent_margin')),
  share_value numeric(12,2) not null default 0,
  notes text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists referrals_name_idx on referrals (lower(name));
create index if not exists referrals_active_idx on referrals (active);

alter table referrals enable row level security;

drop policy if exists staff_all_referrals on referrals;
create policy staff_all_referrals on referrals
  for all to authenticated
  using (true)
  with check (true);

-- Dispatcher UI uses anon key (local staff gate), same pattern as leads.
drop policy if exists anon_all_referrals on referrals;
create policy anon_all_referrals on referrals
  for all to anon
  using (true)
  with check (true);

grant select, insert, update, delete on referrals to authenticated, anon;

-- $ owed to referral partner per trip (name already exists on financial_records).
alter table financial_records
  add column if not exists referral_share_amount numeric(12,2) not null default 0;

comment on column financial_records.referral_share_amount is
  'Profit share $ owed to referral_name for this trip';
