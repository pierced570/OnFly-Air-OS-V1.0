-- Extended client profile from public customer onboarding (lanes, address, billing prefs).
alter table clients add column if not exists profile jsonb not null default '{}'::jsonb;

comment on column clients.profile is
  'Customer onboard extras: address, lanes, emergency, vendor_packet_to, shipping flags — never card numbers.';
