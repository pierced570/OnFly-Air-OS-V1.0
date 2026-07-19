-- BD / sales leads — who we talked to at which company, next follow-up.

create table if not exists leads (
  id uuid primary key default gen_random_uuid(),
  company text not null,
  contact_name text not null,
  title text not null default '',
  email text not null default '',
  phone text not null default '',
  kind text not null default 'other'
    check (kind in ('operator', 'client', 'fbo', 'other')),
  status text not null default 'open'
    check (status in ('open', 'warming', 'won', 'lost', 'closed')),
  last_contacted_at timestamptz,
  next_follow_up_at timestamptz,
  notes text not null default '',
  last_touch_note text not null default '',
  owner text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists leads_next_follow_up_idx on leads (next_follow_up_at);
create index if not exists leads_company_idx on leads (lower(company));
create index if not exists leads_status_idx on leads (status);

alter table leads enable row level security;

drop policy if exists staff_all_leads on leads;
create policy staff_all_leads on leads
  for all to authenticated
  using (true)
  with check (true);

-- Dispatcher UI uses anon key (local staff gate).
drop policy if exists anon_all_leads on leads;
create policy anon_all_leads on leads
  for all to anon
  using (true)
  with check (true);

grant select, insert, update, delete on leads to authenticated, anon;
