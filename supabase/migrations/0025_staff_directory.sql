-- Staff directory: phones + section ACL survive deploys (was localStorage-only).
-- Dispatcher UI uses the anon key (local staff gate), same as clients/fbos.

create table if not exists staff_directory (
  id text primary key,
  name text not null,
  phone text not null default '',
  is_admin boolean not null default false,
  sections jsonb not null default '[]'::jsonb,
  active boolean not null default true,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists staff_directory_active_idx
  on staff_directory (active);

alter table staff_directory enable row level security;

drop policy if exists anon_all_staff_directory on staff_directory;
create policy anon_all_staff_directory on staff_directory
  for all to anon, authenticated
  using (true)
  with check (true);

grant select, insert, update, delete on staff_directory to anon, authenticated;

-- Seed roster (phones empty except owner — Pierce sets team phones in Admin).
insert into staff_directory (id, name, phone, is_admin, sections, active) values
  (
    'staff-pierce',
    'Pierce Demetriades',
    '6105092031',
    true,
    '["board","chat","quick_dispatch","financials","referrals","clients","leads","fbos","trips","quotes","network","radar","admin","tasks","vault_keys","staff_access"]'::jsonb,
    true
  ),
  (
    'staff-paige',
    'Paige Miller',
    '',
    false,
    '["board","chat","quick_dispatch","financials","referrals","clients","leads","fbos","trips","quotes","network","radar","briefing","tasks"]'::jsonb,
    true
  ),
  (
    'staff-ben',
    'Ben Miller',
    '',
    false,
    '["board","chat","quick_dispatch","financials","referrals","clients","leads","fbos","trips","quotes","network","radar","briefing","tasks"]'::jsonb,
    true
  ),
  (
    'staff-chris',
    'Chris Hewitt',
    '',
    false,
    '["board","chat","quick_dispatch","financials","referrals","clients","leads","fbos","trips","quotes","network","radar","briefing","tasks"]'::jsonb,
    true
  ),
  (
    'staff-austin',
    'Austin Ouellette',
    '',
    false,
    '["board","clients","network","trips","quotes"]'::jsonb,
    true
  )
on conflict (id) do nothing;
