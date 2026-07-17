-- Operator compliance: named insurer flag + document kind conventions.
-- File bytes live in Storage later; metadata uses documents table.

alter table operators
  add column if not exists named_insurer boolean not null default false,
  add column if not exists named_insurer_at timestamptz,
  add column if not exists ops_email text;

comment on column operators.named_insurer is
  'OnFly listed as named insured on operator COI (toggle after 3+ completed trips)';

-- documents.kind convention for operator packs:
--   charter_cert | d085 | coi
comment on column documents.kind is
  'trip: quote|eta_sheet|manifest|pod|other; operator: charter_cert|d085|coi';

comment on column documents.expires_on is
  'COI (and other cert) expiry — ops emails operator when COI expires';

notify pgrst, 'reload schema';
