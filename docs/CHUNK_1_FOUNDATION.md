# CHUNK 1 — Foundation: Scaffold, Schema, State Machine, Importer

**Objective:** a deployed skeleton — repo on GitHub, Vercel serving a preview, Supabase holding the full spine schema, the Trip state machine enforcing transitions, the real 420-aircraft fleet imported, and brand tokens in place. No business features yet; everything after this chunk plugs into what's built here.

## 1. Scaffold

```bash
npm create vite@latest . -- --template react-ts
npm i tailwindcss @tailwindcss/vite react-router-dom @supabase/supabase-js luxon zod date-fns
npx shadcn@latest init
```

- React Router routes: `/` (dispatch board placeholder), `/trips/:id`, `/network` (operators/fleet), `/admin`. Lazy-load route modules.
- Folder structure:

```
src/
  adapters/        # every external service: interface + mock + real impl
  components/      # shadcn + shared UI
  domain/          # pure TS: state machine, tax engine, eta chain, parsers (no React, no Supabase)
  lib/             # supabase client, utils
  pages/
supabase/
  migrations/
  functions/       # edge functions
data/              # seed CSVs
docs/              # this package
```

- **Rule: `src/domain/` is pure TypeScript with unit tests — no imports from React or Supabase.** All business math lives here so it's testable and portable.
- Vitest for tests (`npm i -D vitest`); `npm test` must pass before every push.

### Brand tokens (tailwind config + CSS vars)

Dark-mode-first. Tokens: `--ink: #0C0C0E; --surface: #141414; --gold: #C9A227; --gold-lt: #E3B341; --cream: #F7F2E3;` semantic: `--attn: var(--gold)` (needs attention/CTA), `--late: #C0392B`, `--onplan: #2E7D32`. Monospace stack for tail numbers, ICAO, and times (`font-mono` class `.avionic`). Client-facing docs (later chunks) use light cream theme — define both themes now as CSS variable sets on `[data-theme]`.

### Deploy rails

- Push repo to GitHub → import in Vercel (framework: Vite). Confirm preview deploys on branch push.
- Create Supabase project → `supabase init`, `supabase link --project-ref <ref>`. Envs: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` in Vercel; service-role key only as a Supabase/edge secret, never `VITE_*`.
- `.env.example` listing every variable with a comment. Commit it; never commit `.env`.

## 2. Spine schema (migration 0001)

Write as one migration file. Enable RLS on all tables (policies: authenticated staff full access for now; portal-scoped policies come in Chunk 5). Conventions: `id uuid primary key default gen_random_uuid()`, `created_at/updated_at timestamptz default now()`, all timestamps **timestamptz (UTC)**, money as `numeric(12,2)`, an `needs_info jsonb default '[]'` column wherever flagged gaps live.

```sql
-- enums
create type trip_state as enum ('draft','routed','quoted_estimated','offers_out','quoted_hard',
  'booked','in_progress','delivered','invoiced','closed','lost','cancelled');
create type leg_type as enum ('truck_pickup','air_leg','ground_stop','offload','truck_delivery','customs');
create type leg_status as enum ('pending','active','done','skipped');
create type party_role as enum ('dispatcher','pilot','operator_ops','fbo','driver','client','other');
create type comms_channel as enum ('sms','email','voice','web');
create type rate_source as enum ('history','assumption','block_rate');

-- network
operators(id, name text unique, base_icao text, region text, certificate_no text,
  capabilities jsonb,           -- {cargo,pax,hazmat,medivac,ops24hr,callout_minutes}
  crew_policy jsonb,            -- {single_pilot_ok, dual_available, night_policy}
  onboarding_status text, usefulness int, notes text, needs_info jsonb)
operator_contacts(id, operator_id fk, name, role, cell, email, preferred_channel comms_channel,
  consent_sms bool default false, consent_call bool default false, after_hours bool, quiet_hours jsonb)
aircraft(id, operator_id fk, tail text, type_name text, category text, engines text,
  cargo_pax text, seats int, base_icao text, crew text,
  cruise_kts int, range_nm int, max_payload_lbs int, mtow_lbs int,
  door_type text, door_w_in numeric, door_h_in numeric,
  cabin_l_ft numeric, cabin_w_ft numeric, cabin_h_ft numeric, cabin_vol_cuft numeric,
  liability_limit numeric, hull_value numeric, insurance_expiry date,
  spec_source text, active bool default true, needs_info jsonb,
  unique(operator_id, tail))
type_specs(type_name text pk, cruise_kts, range_nm, max_payload_lbs, mtow_lbs, seats,
  door_type, door_w_in, door_h_in, cabin_l_ft, cabin_w_ft, cabin_h_ft, cabin_vol_cuft)
  -- seeded from the distinct types in the CSV; powers wizard autofill (Chunk 6)
airports(icao text pk, name, lat numeric, lon numeric, tz text)  -- tz = IANA zone
fbos(id, icao fk airports, name, phone, after_hours_phone, is_24hr bool, forklift bool,
  forklift_capacity_lbs int, gl_insurance bool, gl_coverage numeric,
  handling_fee numeric, ramp_fee numeric, overnight_fee numeric, callout_fee numeric,
  fees_waived_with_fuel bool, last_verified date, needs_info jsonb)
rates_block(id, operator_id fk, type_name, rate_per_hr numeric, rate_per_nm numeric,
  wait_free_hrs numeric, wait_rate_per_hr numeric, afterhours_premium numeric,
  effective_from date, effective_to date, notes)
availability(id, operator_id fk, aircraft_id fk null, window_start timestamptz, window_end timestamptz,
  status text, source text check (source in ('sheet','ping','standing','adsb_inferred')), as_of timestamptz)

-- clients
clients(id, name, billing_terms text, qb_customer_id text, notes)
client_contacts(id, client_id fk, name, role text check (role in ('requester','ap','supply_chain')),
  email, cell, notify_prefs jsonb)
client_rules(id, client_id fk, dual_pilot_required bool, freight_only bool,
  multi_engine_only bool, single_engine_turboprop_only bool, no_single_engine_night bool,
  hazmat_allowed bool, max_declared_value numeric, other_rules jsonb)

-- the spine
trips(id, ref serial unique, client_id fk, state trip_state default 'draft',
  mode text check (mode in ('a2a','d2d','mixed')), payload_kind text check (payload_kind in ('cargo','pax','both')),
  pieces jsonb,                 -- [{l_in,w_in,h_in,weight_lbs,count,stackable}]
  pax_count int, hazmat bool default false, declared_value numeric,
  origin jsonb, destination jsonb,   -- {kind:'address'|'airport', text, icao?, lat,lon, tz}
  ready_at timestamptz, deadline timestamptz, po_number text,
  assigned_operator_id fk null, assigned_aircraft_id fk null, needs_info jsonb)
trip_legs(id, trip_id fk, seq int, type leg_type, status leg_status default 'pending',
  party party_role, party_ref uuid null,
  from_ref jsonb, to_ref jsonb,
  est_start timestamptz, est_end timestamptz, actual_start timestamptz, actual_end timestamptz,
  duration_source text, notes, unique(trip_id, seq))
trip_events(id, trip_id fk, at timestamptz default now(), actor text, kind text, payload jsonb)
  -- append-only: no updates or deletes, enforce with a trigger
trip_participants(id, trip_id fk, role party_role, name, cell, email,
  operator_contact_id fk null, in_thread bool default true, added_by text, released_at timestamptz null)

-- commerce
offers(id, trip_id fk, operator_id fk, aircraft_id fk null, state text check (state in
  ('pinged','available','unavailable','quoted','selected','stood_down','expired')),
  ping_sent_at, replied_at, time_to_position_min int, live_leg_min int,
  wait_ok bool, max_wait_hrs numeric, price_net numeric, valid_until timestamptz,
  magic_token text unique, notes)
quotes(id, trip_id fk, kind text check (kind in ('estimated','hard')),
  options jsonb,               -- [{label:'cheapest'|'fastest'|'best', operator_id?, aircraft_id?, cost, price, eta_chain}]
  markup_mode text, markup_value numeric, tax_breakdown jsonb, total numeric,
  carrier_disclosed bool default false, disclosure_text text null, disclosure_at timestamptz null,
  accept_token text unique, sent_at, accepted_at, declined_at, lost_reason text)
invoices(id, trip_id fk, qb_invoice_id text, total numeric, sent_at, paid_at)
documents(id, trip_id fk null, operator_id fk null, kind text,   -- quote_pdf|eta_sheet|manifest|pod|d085|coi
  storage_path text, parsed jsonb, expires_on date null, rendered_at timestamptz)

-- ops
tax_rates(id, code text, description, rate_pct numeric null, flat_amount numeric null,
  applies_to text, effective_from date, effective_to date null)
comms_messages(id, trip_id fk null, direction text, channel comms_channel, from_ref text, to_ref text,
  body text, media jsonb, provider_id text, delivery_status text, at timestamptz default now())
shifts(id, person text, phone text, starts_at, ends_at, active bool)
flight_sessions(id, aircraft_id fk, tail text, first_seen timestamptz, last_seen timestamptz,
  origin_guess text, dest_guess text, last_lat numeric, last_lon numeric, source text, ladd_blocked bool default false)
needs_info_tasks(id, entity text, entity_id uuid, field text, note text, resolved_at timestamptz null)
```

Also: `pricing_priors` **view**: per type_name and per (operator_id,type_name) median/avg of historical circuit $/NM (source table `trip_history` arrives later — create the view over a `trip_history` staging table with the same columns as the old trip log: date, operator, tail, type, route_nm, repo_nm, circuit_nm, invoiced, op_cost).

Seed `tax_rates` (2026): `FET_CARGO` 6.25% · `FET_PAX` 7.5% · `SEG_FEE_DOM` $5.30/segment/person · `INTL_HEAD` $23.40 · rule constant `FET_EXEMPT_MTOW_LBS = 6000` (store as a row, `code='FET_EXEMPT_MTOW'`, flat_amount=6000).

## 3. Trip state machine (`src/domain/stateMachine.ts`)

- Transition map exactly per blueprint §3.1 (draft→routed→quoted_estimated→offers_out→quoted_hard→booked→in_progress→delivered→invoiced→closed; lost allowed from any quoted/offers state; cancelled from booked/in_progress).
- `transition(trip, to, actor, payload?)`: validates against the map, writes the trip row and a `trip_events` row **in one RPC** (write a Postgres function `trip_transition(trip_id, to_state, actor, payload)` so it's atomic; the TS wrapper calls it). Direct `update trips set state=...` anywhere else is forbidden — add a lint note in the Cursor rules.
- Unit tests: every legal transition passes; illegal ones throw; event row written per transition.

## 4. CSV importer (edge function or script `scripts/import.ts`)

Per the data contract (README): parse `data/OnFly_Aircraft_Master_Flat.csv` → upsert `operators` (distinct names) → upsert `aircraft` on `(operator, tail)`; blanks → NULL + `needs_info` entries + `needs_info_tasks` rows; `tail = TBD` rows import individually flagged; recompute FET-relevance from `mtow_lbs` (do NOT trust the CSV's `fet_status` — flag mismatches); rate columns land tagged `history`/`assumption`; also seed `type_specs` from distinct types and `airports` for every ICAO referenced (lat/lon/tz via the `airportsdata` npm package or a bundled ICAO→tz JSON — generate it in the script, commit the JSON).
**Idempotency test: run twice, row counts identical, no duplicates.**

## 5. Minimal UI shell

Dark dispatch shell: left nav (Board, Trips, Network, Admin), a Network page listing imported operators/aircraft with NEEDS-INFO badges (gold), and a Trip detail page that renders the state machine position + empty ETA chain + event log. Nothing fancy — this is scaffolding for later chunks, but it must be real data.

## Acceptance checklist

- [ ] Vercel preview URL loads the dark shell with brand tokens
- [ ] `supabase/migrations/0001` applies clean on a fresh project
- [ ] Importer run → 47 operators, 420 aircraft visible in the Network page with NEEDS-INFO badges; run again → no dupes
- [ ] `npm test` green: state machine transitions, importer idempotency (against local/branch db), tz lookup returns IANA zone for KCAK
- [ ] `trip_transition` RPC writes trips + trip_events atomically; direct state writes rejected by grep audit
- [ ] `.env.example` complete; no secrets in git history
