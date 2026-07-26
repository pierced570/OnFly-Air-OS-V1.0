-- Where trip-offer / quote links are sent for an operator (desk + pings).
-- Default both; dispatcher can override per send on the desk.

alter table operators
  add column if not exists quote_link_channel text not null default 'both';

alter table operators
  drop constraint if exists operators_quote_link_channel_check;

alter table operators
  add constraint operators_quote_link_channel_check
  check (quote_link_channel in ('sms', 'email', 'both'));

comment on column operators.quote_link_channel is
  'Quote / availability link delivery: sms, email, or both (default).';
