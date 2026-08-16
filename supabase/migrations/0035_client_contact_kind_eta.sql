-- Client contacts: Person/DL kind, job title, airport-scoped ETA autopopulate.
alter table client_contacts
  add column if not exists kind text not null default 'person'
    check (kind in ('person', 'dl'));

alter table client_contacts
  add column if not exists title text;

alter table client_contacts
  add column if not exists eta_icaos jsonb not null default '[]'::jsonb;

comment on column client_contacts.kind is 'person | dl (distribution list)';
comment on column client_contacts.title is 'Job title / desk label (e.g. MX Supervisor)';
comment on column client_contacts.eta_icaos is 'ICAOs — include on ETA sheet when trip uses these airports';
