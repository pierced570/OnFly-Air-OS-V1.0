-- Referral partner remittance profile: W-9 + banking + default % terms.

alter table referrals
  add column if not exists w9_on_file boolean not null default false,
  add column if not exists w9_filename text not null default '',
  add column if not exists w9_received_at timestamptz,
  add column if not exists bank_name text not null default '',
  add column if not exists routing_number text not null default '',
  add column if not exists account_number text not null default '',
  add column if not exists account_type text not null default ''
    check (account_type in ('', 'checking', 'savings'));

-- Prefer percent-of-margin as the negotiated default for new partners.
alter table referrals
  alter column share_mode set default 'percent_margin';

comment on column referrals.w9_on_file is 'W-9 collected for 1099 / remittance';
comment on column referrals.routing_number is 'ACH routing — desk-only, never portal';
comment on column referrals.account_number is 'ACH account — desk-only, never portal';
