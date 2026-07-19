-- CHUNK 1 — OnFly OS spine schema
-- Apply: supabase db push  OR  paste into SQL editor on a fresh project

create extension if not exists "pgcrypto";

-- ── enums ────────────────────────────────────────────────────
create type trip_state as enum (
  'draft','routed','quoted_estimated','offers_out','quoted_hard',
  'booked','in_progress','delivered','invoiced','closed','lost','cancelled'
);
create type leg_type as enum (
  'truck_pickup','air_leg','ground_stop','offload','truck_delivery','customs'
);
create type leg_status as enum ('pending','active','done','skipped');
create type party_role as enum (
  'dispatcher','pilot','operator_ops','fbo','driver','client','other'
);
create type comms_channel as enum ('sms','email','voice','web');
create type rate_source as enum ('history','assumption','block_rate');

-- ── helpers ──────────────────────────────────────────────────
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ── network ──────────────────────────────────────────────────
create table operators (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  base_icao text,
  region text,
  certificate_no text,
  capabilities jsonb default '{}'::jsonb,
  crew_policy jsonb default '{}'::jsonb,
  onboarding_status text,
  usefulness int,
  notes text,
  needs_info jsonb default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table operator_contacts (
  id uuid primary key default gen_random_uuid(),
  operator_id uuid not null references operators(id) on delete cascade,
  name text,
  role text,
  cell text,
  email text,
  preferred_channel comms_channel,
  consent_sms bool default false,
  consent_call bool default false,
  after_hours bool,
  quiet_hours jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table aircraft (
  id uuid primary key default gen_random_uuid(),
  operator_id uuid not null references operators(id) on delete cascade,
  tail text not null,
  type_name text,
  category text,
  engines text,
  cargo_pax text,
  seats int,
  base_icao text,
  crew text,
  cruise_kts int,
  range_nm int,
  max_payload_lbs int,
  mtow_lbs int,
  door_type text,
  door_w_in numeric,
  door_h_in numeric,
  cabin_l_ft numeric,
  cabin_w_ft numeric,
  cabin_h_ft numeric,
  cabin_vol_cuft numeric,
  liability_limit numeric,
  hull_value numeric,
  insurance_expiry date,
  spec_source text,
  active bool default true,
  needs_info jsonb default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (operator_id, tail)
);

create table type_specs (
  type_name text primary key,
  cruise_kts int,
  range_nm int,
  max_payload_lbs int,
  mtow_lbs int,
  seats int,
  door_type text,
  door_w_in numeric,
  door_h_in numeric,
  cabin_l_ft numeric,
  cabin_w_ft numeric,
  cabin_h_ft numeric,
  cabin_vol_cuft numeric
);

create table airports (
  icao text primary key,
  name text,
  lat numeric,
  lon numeric,
  tz text
);

create table fbos (
  id uuid primary key default gen_random_uuid(),
  icao text not null references airports(icao),
  name text,
  phone text,
  after_hours_phone text,
  is_24hr bool,
  forklift bool,
  forklift_capacity_lbs int,
  gl_insurance bool,
  gl_coverage numeric,
  handling_fee numeric,
  ramp_fee numeric,
  overnight_fee numeric,
  callout_fee numeric,
  fees_waived_with_fuel bool,
  last_verified date,
  needs_info jsonb default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table rates_block (
  id uuid primary key default gen_random_uuid(),
  operator_id uuid not null references operators(id) on delete cascade,
  type_name text,
  rate_per_hr numeric,
  rate_per_nm numeric,
  wait_free_hrs numeric,
  wait_rate_per_hr numeric,
  afterhours_premium numeric,
  effective_from date,
  effective_to date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table availability (
  id uuid primary key default gen_random_uuid(),
  operator_id uuid not null references operators(id) on delete cascade,
  aircraft_id uuid references aircraft(id) on delete set null,
  window_start timestamptz,
  window_end timestamptz,
  status text,
  source text check (source in ('sheet','ping','standing','adsb_inferred')),
  as_of timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── clients ──────────────────────────────────────────────────
create table clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  billing_terms text,
  qb_customer_id text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table client_contacts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  name text,
  role text check (role in ('requester','ap','supply_chain')),
  email text,
  cell text,
  notify_prefs jsonb default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table client_rules (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  dual_pilot_required bool default false,
  freight_only bool default false,
  multi_engine_only bool default false,
  single_engine_turboprop_only bool default false,
  no_single_engine_night bool default false,
  hazmat_allowed bool default false,
  max_declared_value numeric,
  other_rules jsonb default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── the spine ────────────────────────────────────────────────
create table trips (
  id uuid primary key default gen_random_uuid(),
  ref serial unique,
  client_id uuid references clients(id),
  state trip_state not null default 'draft',
  mode text check (mode in ('a2a','d2d','mixed')),
  payload_kind text check (payload_kind in ('cargo','pax','both')),
  pieces jsonb default '[]'::jsonb,
  pax_count int,
  hazmat bool default false,
  declared_value numeric,
  origin jsonb,
  destination jsonb,
  ready_at timestamptz,
  deadline timestamptz,
  po_number text,
  assigned_operator_id uuid references operators(id),
  assigned_aircraft_id uuid references aircraft(id),
  needs_info jsonb default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table trip_legs (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  seq int not null,
  type leg_type not null,
  status leg_status not null default 'pending',
  party party_role,
  party_ref uuid,
  from_ref jsonb,
  to_ref jsonb,
  est_start timestamptz,
  est_end timestamptz,
  actual_start timestamptz,
  actual_end timestamptz,
  duration_source text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (trip_id, seq)
);

create table trip_events (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  at timestamptz not null default now(),
  actor text,
  kind text not null,
  payload jsonb default '{}'::jsonb
);

create table trip_participants (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  role party_role not null,
  name text,
  cell text,
  email text,
  operator_contact_id uuid references operator_contacts(id),
  in_thread bool default true,
  added_by text,
  released_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- append-only: no updates or deletes on trip_events
create or replace function forbid_trip_events_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'trip_events is append-only';
end;
$$;

create trigger trip_events_no_update
  before update on trip_events
  for each row execute function forbid_trip_events_mutation();

create trigger trip_events_no_delete
  before delete on trip_events
  for each row execute function forbid_trip_events_mutation();

-- ── commerce ─────────────────────────────────────────────────
create table offers (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  operator_id uuid not null references operators(id),
  aircraft_id uuid references aircraft(id),
  state text check (state in (
    'pinged','available','unavailable','quoted','selected','stood_down','expired'
  )),
  ping_sent_at timestamptz,
  replied_at timestamptz,
  time_to_position_min int,
  live_leg_min int,
  wait_ok bool,
  max_wait_hrs numeric,
  price_net numeric,
  valid_until timestamptz,
  magic_token text unique,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table quotes (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  kind text check (kind in ('estimated','hard')),
  options jsonb default '[]'::jsonb,
  markup_mode text,
  markup_value numeric,
  tax_breakdown jsonb,
  total numeric,
  carrier_disclosed bool default false,
  disclosure_text text,
  disclosure_at timestamptz,
  accept_token text unique,
  sent_at timestamptz,
  accepted_at timestamptz,
  declined_at timestamptz,
  lost_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table invoices (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  qb_invoice_id text,
  total numeric,
  sent_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table documents (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid references trips(id) on delete set null,
  operator_id uuid references operators(id) on delete set null,
  kind text,
  storage_path text,
  parsed jsonb,
  expires_on date,
  rendered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── ops ──────────────────────────────────────────────────────
create table tax_rates (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  description text,
  rate_pct numeric,
  flat_amount numeric,
  applies_to text,
  effective_from date,
  effective_to date
);

create table comms_messages (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid references trips(id) on delete set null,
  direction text,
  channel comms_channel,
  from_ref text,
  to_ref text,
  body text,
  media jsonb,
  provider_id text,
  delivery_status text,
  at timestamptz not null default now()
);

create table shifts (
  id uuid primary key default gen_random_uuid(),
  person text,
  phone text,
  starts_at timestamptz,
  ends_at timestamptz,
  active bool default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table flight_sessions (
  id uuid primary key default gen_random_uuid(),
  aircraft_id uuid references aircraft(id) on delete set null,
  tail text,
  first_seen timestamptz,
  last_seen timestamptz,
  origin_guess text,
  dest_guess text,
  last_lat numeric,
  last_lon numeric,
  source text,
  ladd_blocked bool default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table needs_info_tasks (
  id uuid primary key default gen_random_uuid(),
  entity text not null,
  entity_id uuid not null,
  field text not null,
  note text,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

-- pricing priors staging + view
create table trip_history (
  id uuid primary key default gen_random_uuid(),
  trip_date date,
  operator text,
  operator_id uuid references operators(id),
  tail text,
  type_name text,
  route_nm numeric,
  repo_nm numeric,
  circuit_nm numeric,
  invoiced numeric,
  op_cost numeric,
  rate_source rate_source,
  created_at timestamptz not null default now()
);

create or replace view pricing_priors as
select
  type_name,
  operator_id,
  count(*) as n,
  avg(case when circuit_nm > 0 then op_cost / circuit_nm end) as avg_op_per_nm,
  percentile_cont(0.5) within group (
    order by case when circuit_nm > 0 then op_cost / circuit_nm end
  ) as med_op_per_nm
from trip_history
where circuit_nm is not null and op_cost is not null
group by grouping sets ((type_name), (operator_id, type_name));

-- ── updated_at triggers ──────────────────────────────────────
do $$
declare
  t text;
begin
  foreach t in array array[
    'operators','operator_contacts','aircraft','fbos','rates_block','availability',
    'clients','client_contacts','client_rules','trips','trip_legs','trip_participants',
    'offers','quotes','invoices','documents','shifts','flight_sessions'
  ]
  loop
    execute format(
      'create trigger %I_updated_at before update on %I
       for each row execute function set_updated_at()',
      t, t
    );
  end loop;
end $$;

-- ── tax seed (2026) ──────────────────────────────────────────
insert into tax_rates (code, description, rate_pct, flat_amount, applies_to, effective_from) values
  ('FET_CARGO', 'Federal Excise Tax — cargo', 6.25, null, 'cargo', '2026-01-01'),
  ('FET_PAX', 'Federal Excise Tax — passenger', 7.5, null, 'pax', '2026-01-01'),
  ('SEG_FEE_DOM', 'Domestic segment fee per person', null, 5.30, 'pax_segment', '2026-01-01'),
  ('INTL_HEAD', 'International departure/arrival head tax', null, 23.40, 'pax_intl', '2026-01-01'),
  ('FET_EXEMPT_MTOW', 'IRC §4281 MTOW exemption threshold (lbs)', null, 6000, 'rule', '2026-01-01');

-- ── trip state machine RPC ───────────────────────────────────
-- Transition map (blueprint §3.1):
-- draft → routed → quoted_estimated → offers_out → quoted_hard → booked → in_progress → delivered → invoiced → closed
-- lost from: quoted_estimated, offers_out, quoted_hard
-- cancelled from: booked, in_progress

create or replace function trip_transition(
  p_trip_id uuid,
  p_to_state trip_state,
  p_actor text,
  p_payload jsonb default '{}'::jsonb
)
returns trips
language plpgsql
security definer
as $$
declare
  v_trip trips;
  v_from trip_state;
  v_ok boolean := false;
begin
  select * into v_trip from trips where id = p_trip_id for update;
  if not found then
    raise exception 'trip not found: %', p_trip_id;
  end if;

  v_from := v_trip.state;

  if v_from = p_to_state then
    raise exception 'already in state %', p_to_state;
  end if;

  v_ok := case
    when v_from = 'draft' and p_to_state = 'routed' then true
    when v_from = 'routed' and p_to_state = 'quoted_estimated' then true
    when v_from = 'quoted_estimated' and p_to_state in ('offers_out','lost') then true
    when v_from = 'offers_out' and p_to_state in ('quoted_hard','lost') then true
    when v_from = 'quoted_hard' and p_to_state in ('booked','lost') then true
    when v_from = 'booked' and p_to_state in ('in_progress','cancelled') then true
    when v_from = 'in_progress' and p_to_state in ('delivered','cancelled') then true
    when v_from = 'delivered' and p_to_state = 'invoiced' then true
    when v_from = 'invoiced' and p_to_state = 'closed' then true
    else false
  end;

  if not v_ok then
    raise exception 'illegal transition: % → %', v_from, p_to_state;
  end if;

  update trips
    set state = p_to_state
    where id = p_trip_id
    returning * into v_trip;

  insert into trip_events (trip_id, actor, kind, payload)
  values (
    p_trip_id,
    p_actor,
    'state_transition',
    coalesce(p_payload, '{}'::jsonb) || jsonb_build_object('from', v_from, 'to', p_to_state)
  );

  return v_trip;
end;
$$;

-- Block direct state writes outside the RPC (application + policy note).
-- DB-level: revoke update on trips.state from authenticated; staff use RPC.
-- For Chunk 1 stub: authenticated staff full access; portal policies arrive in Chunk 5.

alter table operators enable row level security;
alter table operator_contacts enable row level security;
alter table aircraft enable row level security;
alter table type_specs enable row level security;
alter table airports enable row level security;
alter table fbos enable row level security;
alter table rates_block enable row level security;
alter table availability enable row level security;
alter table clients enable row level security;
alter table client_contacts enable row level security;
alter table client_rules enable row level security;
alter table trips enable row level security;
alter table trip_legs enable row level security;
alter table trip_events enable row level security;
alter table trip_participants enable row level security;
alter table offers enable row level security;
alter table quotes enable row level security;
alter table invoices enable row level security;
alter table documents enable row level security;
alter table tax_rates enable row level security;
alter table comms_messages enable row level security;
alter table shifts enable row level security;
alter table flight_sessions enable row level security;
alter table needs_info_tasks enable row level security;
alter table trip_history enable row level security;

-- Authenticated staff: full access stub
do $$
declare
  t text;
begin
  foreach t in array array[
    'operators','operator_contacts','aircraft','type_specs','airports','fbos',
    'rates_block','availability','clients','client_contacts','client_rules',
    'trips','trip_legs','trip_events','trip_participants','offers','quotes',
    'invoices','documents','tax_rates','comms_messages','shifts',
    'flight_sessions','needs_info_tasks','trip_history'
  ]
  loop
    execute format(
      'create policy staff_all_%I on %I for all to authenticated using (true) with check (true)',
      t, t
    );
  end loop;
end $$;

grant execute on function trip_transition(uuid, trip_state, text, jsonb) to authenticated;
