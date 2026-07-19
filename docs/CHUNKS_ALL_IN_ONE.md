# OnFly OS — All Build Chunks (1–7, combined)

> Same content as the individual CHUNK_*.md files, in one document. Work strictly in order (Chunk 6 may run parallel after Chunk 2). Do not start a chunk until the previous chunk's acceptance checklist passes on the deployed preview.


---

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

---

# CHUNK 2 — The Quote Engine: Tax, ETA Chain, Intake, Routing, Instant Estimate

**Objective:** a dispatcher enters a request (or an email/text creates a draft) and an **estimated quote with an ETA sheet generates in under 60 seconds** — correct tax math, Cheapest/Fastest/Best options from the real fleet, rendered as a client-ready document. All pure logic in `src/domain/` with tests.

## 1. Tax engine (`src/domain/tax.ts`)

`computeTax(input) -> {lines: [{code, base, amount, note}], total}` where input = `{payloadKind, legs: [{international, segments, paxCount}], aircraftMtowLbs, subtotal}`.

Rules (all read from `tax_rates`, never hardcoded):
- Cargo domestic: 6.25% of the full amount charged the client (markup included).
- Pax domestic: 7.5% + segment fee × paxCount × segment count.
- International legs: head tax per pax; no domestic FET/segment stacking (keep simple: any international leg → international regime for that leg; flag for human review).
- §4281 exemption: aircraft MTOW ≤ 6,000 lbs (per `tax_rates.FET_EXEMPT_MTOW`) and not operated on an established line → **zero FET**; add note "FET-exempt under IRC §4281."
- Ground legs billed separately are outside air FET — the quote composer shows ground as its own line.
- Every quote stores the full `tax_breakdown` jsonb (audit trail).

Tests: the worked examples — $10,000 cargo on King Air 200 → $625 FET; same on a C310 (MTOW 5,500) → $0; pax 2 people 2 segments $240 base → $18 + $21.20. Pull expected rates from a seeded test db, not literals.

## 2. ETA chain builder (`src/domain/etaChain.ts`)

`buildChain(trip, routing) -> TripLeg[]` and `recompute(chain, actualUpdate) -> chain`.

- Duration defaults (constants table `leg_defaults`, per-trip overridable): truck load 30m · truck↔aircraft transfer 30m each side · aircraft turnaround 60m per stop · truck unload 30m.
- Drive time: `MapsAdapter.driveMinutes(from, to)` (mock: 40 mph straight-line estimate over haversine; real impl Google Routes later).
- Flight time: haversine(ICAO coords) NM ÷ cruise_kts + 12m taxi allowance. Position leg: operator/aircraft base → origin airport.
- **Merge rule:** at the origin airport, `wheels_up = max(truckArrival + transfer, aircraftInPosition + turnaround)`. Model the chain as a small DAG: two parallel branches joining at the merge node; downstream legs sequential.
- `recompute`: given an actual on any leg, shift all downstream est times; return `{chain, slippedMinutes}` — callers raise exceptions past a threshold (default 20m).
- Time zones: legs store UTC; a formatter (`src/domain/timeFmt.ts`) renders `HH:mm z` local per location (IANA zone from airports table / geocode) + Zulu. Tests: a chain crossing EDT→CDT renders both correctly; a DST-boundary date doesn't shift durations.

## 3. Intake (M2)

**Form (dispatcher, dark UI):** client select (autofills rules + contacts) · payload kind toggle · pieces editor with **dims parser**: a single text input accepting `3 skids 48x40x60 @ 800ea` or `2 crates 30x30x24 250 lbs each` → parsed rows (regex + unit heuristics; always show parsed result for approval — law 3) · pax count if pax · origin/destination: address or ICAO (detect: 4-letter starting with K/C/P + known ICAO = airport; else address) → mode auto-set (a2a/d2d/mixed) · ready time + deadline (entered in local, stored UTC) · hazmat, declared value, forklift, temp control flags · PO number.
Submitting creates the trip in `draft`, then `transition(routed)` fires routing automatically.

**Email/text doors (edge functions `intake-email`, `intake-sms`):** watcher matches sender against `client_contacts.role='requester'` → LLM extraction prompt (structured JSON output: pieces, locations, times, flags; include the raw text) → create draft trip + `needs_info` for anything unparsed → notify the on-shift dispatcher (comms adapter; SMS with deep link `/trips/:id/review`). **The notification is the alarm; the data is already in the system.** Email inbound: use Resend inbound webhook or a forwarding address into the edge function (adapter — mock first). LLM call goes through an `LlmAdapter` (mock returns canned extraction in dev).

## 4. Route & pricing engine (M3, `src/domain/routing.ts`)

`generateCandidates(trip) -> Candidate[]`:
1. Airport selection: origin/dest airports = the ICAO given, or (for addresses) nearest N airports with an FBO row within X miles (default 3 airports, 60 mi; both configurable).
2. Aircraft eligibility over the full fleet: **hard filters only for physics** — door_w/h ≥ piece dims (with diagonal-fit allowance), payload ≥ total weight + fuel penalty heuristic (`min(max_payload, mtow-based available load)`; keep a conservative 0.85 factor constant), range ≥ leg + 45m reserve, cargo/pax match, client_rules (dual pilot, multi-engine only, single-engine-turboprop-only, no-single-engine-night vs ETA-chain local night hours, hazmat).
3. **Flag-don't-exclude:** missing door dims / payload / base → candidate stays with `needsInfo: ['door dims']` and a confidence penalty; expired/missing compliance (insurance_expiry past, no COI doc) → `bookingGated: true` (offer allowed, booking blocked until resolved).
4. Cost each candidate: operator cost = circuit NM × best rate (precedence: `rates_block` > per-tail prior > operator×type prior > type prior > `assumption`) + FBO fees (handling + callout if after-hours vs FBO hours) + trucking legs (miles × $3.50/mi default, min $150 — constants) → client price = cost ÷ (1 − target margin 15%).
5. Time each candidate via the ETA chain builder.
6. Output top 3–5 as Cheapest / Fastest / Best (best = weighted 50/35/15 cost/time/operator-usefulness), each with `{operator, tail, cost, price, chain, confidence, reasoning[]}` — reasoning strings shown to the dispatcher ("closest capable: based KCGF 38 NM from origin", "cheapest C310 rate on file −8% vs type median").

## 5. Quote composer + renderer (M5 first half)

Dispatcher review screen: three option cards (gold-accent the recommended), editable markup ($ or %), tax auto-recomputed live, ETA sheet preview. On approve → `transition(quoted_estimated)` → render **quote doc + ETA sheet** as print-CSS HTML (light cream client theme; `@media print`; browser print-to-PDF is fine this chunk — a `pdf` edge function can come later) → log doc in `documents` → send via `EmailAdapter` (mock logs; real Resend later) with accept link (token from `quotes.accept_token`). Carrier NOT named — "a vetted Part 135 carrier." ETA sheet: each stop in stop-local time + Zulu, airline-itinerary style.

## Acceptance checklist

- [ ] Enter the worked example trip (Akron address → Chicago address, 3 skids, ready 09:00 EDT) → estimate + ETA sheet on screen in <60s with the KCAK merge-rule times from blueprint §3.2
- [ ] Tax tests green incl. both FET worked examples; exemption fires from MTOW on real C310 rows
- [ ] Dims parser handles both sample phrasings + shows approval preview
- [ ] Route engine returns candidates with NEEDS-INFO flags visible (never silently drops an operator missing data)
- [ ] Forwarded sample email creates a draft trip and pings the mock comms adapter with a review link
- [ ] ETA sheet renders dual-zone correctly on an EDT→CDT trip; all times stored UTC in db

---

# CHUNK 3 — Offers over RingCentral, Hard Quote, Booking

**Objective:** the two-step offer flow runs end-to-end — availability pings out by SMS/email, operators answer by reply or magic link, the dispatcher compares and selects, the hard quote goes out with an accept link, and acceptance fires confirmations + stand-downs. Mock transport first, RingCentral wired second.

## 1. Comms adapter (`src/adapters/comms/`)

```ts
interface CommsAdapter {
  sendSms(to, body, opts?: {tripId?, mediaUrls?}): Promise<{providerId}>
  sendEmail(to, subject, html, opts?): Promise<{providerId}>
  placeCall?(to, script): Promise<{providerId}>          // not RC v1 — Telnyx later
  parseInboundWebhook(req): InboundMessage               // normalizes provider payloads
}
```

- `MockComms` (dev): writes to `comms_messages`, renders in a dev "phone simulator" panel on the trip screen so the whole flow is demoable with zero keys — build this panel, it's the QA tool for everything comms.
- `RingCentralComms`: RC developer app (SMS + Webhooks permissions), JWT auth flow, send via REST SMS endpoint, inbound via webhook subscription → edge function `comms-inbound`. Delivery status polling/webhook → update `comms_messages.delivery_status`. Config via secrets: `RC_CLIENT_ID/SECRET/JWT`, `RC_FROM_OFFERS`, `RC_FROM_THREADS` (separate numbers per purpose).
- Every outbound/inbound writes `comms_messages` + a `trip_events` row. A silent operator must be distinguishable from a failed delivery.

## 2. Two-step offer flow (M4)

**Step 1 — availability ping.** Dispatcher approves a shortlist from the route candidates (default: top 5) → each operator contact with `consent_sms` gets: `OnFly trip offer: CAK→MDW, ~800 lbs freight, ready 14:00E today. Available to quote? Reply 1 YES / 2 NO.` (Email parallel with one-click buttons hitting an edge function.) Inbound `1/yes/available` → offer.state=`available`; `2/no` → `unavailable`. **Escalation ladder** (queued jobs — use `pg_cron` schedule or Vercel cron hitting an edge function every minute): no reply in 5 min → second SMS; 10 min → task for dispatcher to call (robocall rung comes in Chunk 7). All timings configurable.
**Step 2 — quote link.** On `available`, auto-send: `Great — quote here: https://app.onflyair.com/offer/<magic_token>`. That page (public route, token-auth, mobile-first, large inputs): shows lane, payload, timing → operator enters **time to position** (the page instantly shows the implied ETA using the chain builder), **live leg time** (prefilled from type cruise — editable), **price to aircraft NET**, **wait OK + max wait hrs**, notes → submit → offer.state=`quoted`, dispatcher notified. 60 seconds on a phone; no login, no account.

**Fairness mechanics:** `replied_at - ping_sent_at` latency stored per offer → rolls into operator scorecard (Chunk 7 reads it). Operators with NEEDS-INFO still get pinged; their gaps show on the compare view.

## 3. Compare + hard quote (M5 second half)

Compare view: offers side-by-side — price NET, computed all-in client price at current markup, time-to-position → door-to-door ETA (re-run chain per offer), wait terms, operator usefulness/scorecard, NEEDS-INFO badges, `bookingGated` flags (expired insurance blocks the Select button with the reason). Dispatcher selects → quote upgraded: `kind='hard'`, chosen option locked, tax recomputed, `transition(quoted_hard)` → client gets the hard quote (email/SMS per prefs) with accept link. **Pax trips:** acceptance page auto-includes the 295.24 disclosure block (carrier legal name + OnFly capacity template stored in `quotes.disclosure_text`, timestamped at accept). Cargo: carrier stays unnamed.

## 4. Booking (M6)

Client hits accept (or dispatcher marks PO-accept) → `transition(booked)` fires one automation (edge function `on-booked`):
1. Confirmations to every `trip_participant` (operator ops contact, driver TBD, FBO fax—no, SMS/email per contact prefs) with role-specific detail.
2. **Stand-downs** to every other offer in `available|quoted`: `OnFly trip CAK→MDW is covered — thank you for the fast response. You're first in line on the next one.` → state=`stood_down`.
3. Trip thread creation is Chunk 4 — leave a queued `create_thread` event.
4. Dispatcher task list: "call operator to confirm verbally" + "assign driver/trucking" (manual assignment UI: pick trucking contact or add ad hoc).
5. Docs: regenerate ETA sheet as booked version; manifest comes Chunk 5.
6. Client AP + supply-chain contacts get their respective links (invoice later, tracker link placeholder now).

Also implement `lost` (decline link / dispatcher marks; capture `lost_reason` — required field, picklist + free text) and `cancelled` (post-booking; notify all parties + stand-down language; capture who cancelled).

## Acceptance checklist

- [ ] Full flow in the phone simulator with zero keys: ping 5 → replies (1/2/silence) → escalation fires → quote links → compare → select → hard quote → accept → confirmations + stand-downs, every message visible in `comms_messages` and the event log
- [ ] Offer page works logged-out on a phone; time-to-position input live-updates the implied ETA
- [ ] Expired-insurance operator can be pinged but not selected (gate shows reason)
- [ ] Pax acceptance shows + stores the 295.24 disclosure with timestamp; cargo acceptance names no carrier anywhere
- [ ] RingCentral impl behind the adapter sends/receives against a real RC sandbox number (guarded by env flag `COMMS_PROVIDER=ringcentral|mock`)
- [ ] Hard-quote timer: seed → ping → quote → select → send in under 10 minutes of wall time in a live rehearsal

---

# CHUNK 4 — Execution: Live Tracker, Trip Threads, Parsed Actuals, Checkpoints

**Objective:** a booked trip tracks itself. The group thread works over SMS, human check-ins become logged actuals automatically, checkpoint notifications fire on schedule, and the dispatcher works an exception queue instead of babysitting trips.

## 1. Trip threads (M8 — the relay)

- **Number pool:** table `thread_numbers(number, purpose, active)` seeded with the RC numbers reserved for threads. Assignment: on `create_thread`, pick a pool number not currently used by any *other active trip sharing a participant* (query trip_participants × active trips). Release on `closed/cancelled` (+24h grace).
- **Membership:** `trip_participants` (auto from assignment + the manual Participants panel: name, role, cell — one input row, add button). On add → intro SMS from the trip number: `You're on OnFly Trip #347 (CAK→MDW). This thread reaches everyone on the trip — dispatch, crew, ground. Reply here.` On remove/swap → courtesy release text, `released_at` set, fan-out stops.
- **Fan-out (edge function `thread-inbound`):** inbound SMS to a thread number → resolve trip by (number, sender in participants) → write `comms_messages` + `trip_events` → relay to every other active participant prefixed `[Pilot — Mike]:`. MMS media (freight photos, signed PODs) relayed and stored to `documents(kind='pod'|'photo')` via Supabase storage.
- Ambiguity guard: sender on two active trips using the same number should be impossible by assignment rule; if it ever happens, ask the sender: `Which trip? Reply A (#347 CAK→MDW) or B (#352 ...)`.
- Dispatcher UI: thread rendered chat-style on the trip screen (dark theme, role-colored prefixes), send box posts as `[OnFly Dispatch]`.

## 2. Parsed actuals (M7 listener)

Pipeline on every inbound thread message, before fan-out:
1. Keyword/regex pass: `wheels up|airborne|departed`, `wheels down|landed|on the ground`, `loaded|loading complete`, `handed off|delivered|POD`, `arrived|on site|at the FBO`, `leaving|en route`, plus `in 2 hrs|in 45 min|at 14:30` relative/absolute time extraction.
2. Map to the trip's ETA chain: sender role + trip state + leg status → which leg/timestamp this is (pilot + active air leg + "wheels up" → `actual_start`; "landing in 2 hrs" → revised `est_end`). Confidence score.
3. High confidence → write the actual/estimate, `recompute` downstream, fire tracker updates. Low confidence → dispatcher confirm card ("Log 'landing in 2 hrs' as HPN arrival 16:35E?" one-tap yes/no).
4. Always relay the human text regardless of parse result.
Use the `LlmAdapter` for step 1–2 with the regex pass as fallback/mock — tests run on the regex path with a fixture set of ~20 real-world phrasings.

## 3. One-tap check-ins

For drivers/handlers without chatty habits: checkpoint SMS includes a link `https://app.onflyair.com/t/<leg_token>` → single giant button page ("ARRIVED AT PICKUP" / "LOADED" / "DELIVERED — capture POD photo") → logs actual + optional camera upload. No login. Tokens per leg+party, expire at trip close.

## 4. Checkpoint engine + exception queue (M7/M11 core)

- Scheduler (cron edge function each minute): for each active trip, generate/maintain `checkpoints` derived from the ETA chain: truck T-30/T-5, aircraft T-60/T-30/at-arrival, plus "no actual received X min past est" watchdogs.
- Each checkpoint → notification to the **on-shift dispatcher** (resolve via `shifts.active`; route-to-role, never a hardcoded person): SMS + in-app. Dispatcher check-in tasks show as a time-ordered queue on the Board.
- **Exception queue = the Board's left column:** slipped legs (> threshold), unanswered watchdogs, failed deliveries, low-confidence parses, booking gates. Everything else runs silent. Card actions: call (tel: link), text thread, adjust leg, acknowledge.
- Client status pushes: on wheels-up/wheels-down/POD (per client notify_prefs), from the tracker not the thread.

## 5. Shift handoff (M11 v1)

On-shift toggle (who's on now, phone number binding), and the **briefing view**: active trips one-liners (state, next checkpoint, exceptions), pending offers, unsent quotes. Auto-renders from live data — this is the handoff. Full analytics briefing waits for Chunk 7.

## Acceptance checklist

- [ ] Booked test trip auto-creates thread; participants added by panel receive intro (simulator); pilot message fans out with prefix to everyone but sender
- [ ] "wheels up" from pilot logs the air-leg actual and recomputes downstream ETAs; "landing in 2 hrs" revises est_end and pushes a tracker update; a nonsense message just relays
- [ ] MMS POD photo lands in documents and shows on the trip screen
- [ ] One-tap driver link logs ARRIVED without login; token dies at trip close
- [ ] T-30 truck checkpoint fires to whoever's on-shift (swap shifts, verify rerouting)
- [ ] Exception queue shows a manufactured 30-min slip; acknowledging clears it; the trip screen ETA chain shows est vs actual side by side
- [ ] Zero typed timestamps end-to-end on the rehearsal trip

---

# CHUNK 5 — Client Portal, Request Form, QuickBooks, Manifests

**Objective:** clients self-serve — request trips through the portal, watch them live, and receive invoices generated from QuickBooks automatically. The manifest generator closes the document set.

## 1. Client portal (M9)

- **Auth: Supabase magic links** (email OTP), scoped to `client_contacts.email`. RLS policies: portal users read only their client's trips/documents (`client_id` match via a `portal_users` mapping view); no operator cost, margin, or operator identity columns exposed — create **safe views** (`portal_trips`, `portal_legs`, `portal_documents`) and grant portal role only those. Never ship raw tables to the portal.
- **Light premium theme** (cream/white, black headers, gold accents — the client-doc family, `data-theme="client"`).
- Pages: **Active trips** (cards: state chip, next milestone, live ETA) · **Trip detail** = the tracker: ETA chain rendered stop-by-stop in stop-local time, est vs actual, status pushes timeline, documents (quote, ETA sheet, invoice, POD when delivered) · **History** with search · **Request a trip**.
- Distribution list behavior: `supply_chain` contacts get tracker links + status pushes; `ap` contacts get invoices only; `requester` sees request form + their trips.

## 2. Request form (feeds M2)

One page, sections: (1) What — cargo/pax toggle; pieces editor (same dims parser component as dispatch, plus per-piece rows: count, L×W×H in, weight ea, stackable toggle); pax count/names optional; (2) Where — pickup: address OR airport (autodetect, multiple pickups allowed → additional stops); destination same; A2A/D2D badge auto-shows; (3) When — ready time (their local, auto-zone from address), hard deadline toggle + time; (4) Details — hazmat (triggers DG note), declared value, forklift needed, temp control, PO/reference, notes. Submit → draft trip with `client_rules` pre-attached + requester identity → **instant-quote path runs automatically** → on-shift dispatcher notified with review link; if the estimate needs no touch-ups (all confidence high), dispatcher one-tap approves and the client sees "estimate arriving now" — target under 5 minutes from portal submit to estimate email even with the human gate.

## 3. QuickBooks (`src/adapters/accounting/`)

```ts
interface AccountingAdapter { ensureCustomer(client): qbId; createInvoice(trip, quote): {qbInvoiceId, url};
  invoiceStatus(qbInvoiceId): 'sent'|'viewed'|'paid'; }
```
- Mock first (fake IDs, simulator panel). Real: QuickBooks Online API — OAuth2 (Intuit developer app; store refresh token as Supabase secret; token refresh in the edge function `qb-sync`), `Invoice` create with line items: air transportation (+ FET tax lines exactly as quoted — map `tax_breakdown`), ground handling separate line, terms NET30 default from `clients.billing_terms`.
- Trigger: `transition(delivered)` → generate invoice from the locked hard quote + any dispatcher-approved adjustments (wait time actually used at the quoted wait rate — adjustment UI with reason required) → send to `ap` contacts → `transition(invoiced)`. `paid` webhook/poll → `closed`.
- **This is the fiddliest integration — timebox the OAuth plumbing, keep the mock as fallback, never block delivery flow on QB availability (queue + retry).**

## 4. Load manifest generator (M10)

Render from trip state at booking (regenerate on payload edits): OnFly header (black/gold), trip ref, aircraft type + tail, operator (this doc is internal/crew-facing — carrier appears here), pieces table (dims, weight ea, total, stackable, hazmat UN class if flagged), total payload vs available payload check line, origin/dest FBO blocks (name, phone, after-hours), ETA chain summary, emergency contacts (24/7 dispatch). Distribute to crew + handlers via thread as PDF link at booking.

## 5. Document polish

Move quote/ETA-sheet/manifest rendering to a single `render-doc` edge function (HTML→PDF via headless engine — evaluate `@sparticuz/chromium` + puppeteer on Vercel function instead if cold starts hurt; keep interface stable). All docs stored in Supabase storage under `trips/<id>/`, rows in `documents`.

## Acceptance checklist

- [ ] Magic-link login as a seeded client contact → sees only their trips; SQL probe confirms RLS blocks cross-client reads and never exposes cost/margin/operator columns
- [ ] Portal request (D2D, 2 pickups, hazmat) → draft trip with rules attached → estimate emailed after dispatcher one-tap, wall time < 5 min in rehearsal
- [ ] Delivered trip → QB mock invoice with FET lines matching the stored tax_breakdown → AP contact receives it; supply_chain contact got tracker, never the invoice
- [ ] Wait-time adjustment flows into the invoice with reason logged in trip_events
- [ ] Manifest PDF renders with real piece data + payload check; posted to the thread at booking
- [ ] Real QBO sandbox invoice created behind `ACCOUNTING_PROVIDER=quickbooks` flag

---

# CHUNK 6 — Admin Wizards: Add Operator (D085), Add Client, Add FBO

**Objective:** adding network records is a guided interview, never a blank table. The operator wizard parses an uploaded D085 into aircraft rows with specs prefilled. Every wizard ends with a completeness score and NEEDS-INFO tasks for whatever was skipped. (Can build in parallel with Chunks 3–5; requires Chunk 2's type_specs + needs_info machinery.)

## 1. Wizard framework (build once, use three times)

`src/components/wizard/`: multi-step shell — progress rail, per-step validation (zod schemas), skip-with-flag on any non-required field (skipping writes a `needs_info_tasks` row), summary step with **completeness score** (% of fields filled, gold ring visual) and the task list of gaps. Saves draft state per step (resume later). All three wizards are configs over this shell.

## 2. Add Operator

Steps:
1. **Identity** — legal name, DBA, certificate number, base ICAO (typeahead from airports), region.
2. **Contacts** — repeating rows: name, role (ops/owner/pilot/after-hours), cell, email, preferred channel, **consent checkboxes: "OK to text trip offers" / "OK to auto-call"** (writes consent_sms/consent_call — the comms ladder refuses channels without consent), quiet hours, 24hr flag.
3. **Capabilities** — cargo/pax/both, hazmat willing, medivac, 24hr ops, typical callout minutes, service area notes.
4. **Crew policy** — single-pilot OK?, dual crews available?, night policy.
5. **D085 upload** — see below; creates the fleet.
6. **Per-tail insurance** — for each created aircraft: liability limit, hull value, **expiry date** (drives compliance: expiry within 30 days → gold alert; past → `bookingGated`). COI PDF upload per operator → `documents(kind='coi', expires_on)`.
7. **Rates** — block rates per type if known (writes `rates_block`); skip = NEEDS-INFO task "get block rates."
8. **Summary** — completeness score, task list, Save.

### D085 parsing (edge function `parse-d085`)

The FAA OpSpec **D085 is the certificate's aircraft listing** — one row per authorized aircraft: registration (N-number), serial, make/model. Pipeline:
1. Upload PDF → Supabase storage → `documents(kind='d085', operator_id)`.
2. Extract text (`pdf-parse`/`unpdf` in the edge function). D085s are text-based; if extraction yields <50 chars (scanned), fall back to LLM-vision via `LlmAdapter` (page images → structured rows) — mock returns fixture rows in dev.
3. Parse rows: regex `N[0-9]{1,5}[A-Z]{0,2}` for tails + adjacent make/model strings; normalize model names against `type_specs.type_name` using the same alias map as the CSV importer (BE-58/Baron/B58 → Baron 58 etc. — extract that map into `src/domain/typeAlias.ts`, shared).
4. Review table (law 3 — approve, don't auto-commit): parsed tail | matched type | spec prefill preview | conflict flags (tail already exists under another operator; unknown type → manual type pick + NEEDS-INFO "verify specs").
5. Confirm → upsert `aircraft` rows: specs (door/cabin/payload/MTOW/cruise/range/seats) prefilled from `type_specs`, `spec_source='published typical — via D085 wizard'`; **cargo conversions**: if operator capabilities = cargo and type is a known conversion candidate (King Airs, Caravans, Metros, Navajos), auto-add NEEDS-INFO "verify cargo door dims + floor config per tail."

## 3. Add Client — the rules interview

Conversational one-question-per-screen flow (fast, keyboardable):
1. Company + billing terms + QB customer link (search existing QB customers via adapter, or create later).
2. **Crew rule** — "Two pilots required, or is single-pilot OK?" (dual_pilot_required)
3. **Payload** — "Freight only, or passengers too?" (freight_only)
4. **Aircraft constraints** — multi-select: multi-engine only · single-engine OK only if turboprop · no single-engine at night · category minimums (free rule rows → other_rules jsonb, rendered as filter chips)
5. **Hazmat** — allowed? notes.
6. **Declared value** norms + insurance expectations.
7. **People** — repeating contact rows with role: requester (⚠ these emails/numbers arm the intake triggers — show that warning), AP, supply_chain; notify prefs per contact (wheels-up/down/POD pushes on/off).
8. Summary + score. Saved rules render as chips on every future quote screen for this client; the route engine enforces them from the next trip.

## 4. Add FBO

Airport-first: pick/search ICAO (create airport row if new — auto lat/lon/tz) → FBO fields in survey order: name, phone, after-hours phone, 24hr?, forklift? + capacity lbs, GL insurance? + coverage $, fees (handling/ramp/overnight/callout), fees-waived-with-fuel?, notes, **last_verified auto-set today**. Multiple FBOs per airport supported; the route engine prefers 24hr + forklift + insured on cargo trips (already in Chunk 2 scoring — verify the wiring here).

## 5. NEEDS-INFO task surface

`/admin/tasks`: all open `needs_info_tasks` grouped by entity, one-tap "resolve" opens the exact wizard step prefilled. The Data Collection Plan's team workflow lives here — this page is what the team works through daily.

## Acceptance checklist

- [ ] Add Operator end-to-end with a real D085 PDF: tails parsed, types matched, review table shown, aircraft created with prefilled specs + conversion flags; re-upload same D085 → zero duplicates
- [ ] Skipping insurance on one tail creates a task; setting an expiry in the past booking-gates that tail in the compare view (Chunk 3 wiring)
- [ ] Client interview produces client_rules that visibly filter the next quote's candidates (test: dual-pilot client excludes single-pilot-only operators)
- [ ] Requester contact added → their email immediately triggers the intake watcher (Chunk 2 wiring)
- [ ] FBO added with forklift+24hr floats to the top of airport choice on a cargo test trip
- [ ] Every wizard shows a completeness score; /admin/tasks lists and resolves gaps

---

# CHUNK 7 — Intelligence: Fleet Radar, WX/NOTAM, Scorecards, Briefing, Robocalls

**Objective:** the system gets eyes and judgment — live fleet positions with rest-clock chips, weather awareness against the ETA chain, operator scorecards feeding offer targeting, a real shift briefing, and the robocall escalation rung.

## 1. Fleet Radar (M13)

- **AdsbAdapter** interface: `positions(tails[]) -> [{tail, lat, lon, alt, gs, seenAt}]`. Impl candidates: ADS-B Exchange (RapidAPI), airplanes.live, FlightAware AeroAPI — **trial with ~20 tails first** (light twins at small fields are the coverage test, not airliners). Mock: replayable fixture tracks.
- **Poller** (cron edge function, every 2–5 min for the ~470-tail list, batched): upsert `flight_sessions` — session segmentation: a tail seen moving (gs > 50) starts/extends a session; gap > 20 min ends it (`last_seen` = session end). Store last position + `ladd_blocked=true` for tails that never return data.
- **Derived signals** (view `fleet_status`): in-position (last known within X NM of base or of a queried origin) · last-flew (latest session end) · **rest chip** per 135.267 heuristic: session activity within the last 10 hrs → `rest clock running`; none in 10+ hrs → `likely rested`; no data → `unknown`. Duty-day plausibility: sessions spanning > 14 hrs today → flag. **Advisory only — surface as chips with a tooltip: "estimate from ADS-B; operator confirms legality."**
- **UI:** Radar page — map (MapLibre + free tiles) with gold aircraft dots, filter by operator/type/in-position/rested; and **inline chips everywhere that matters**: route candidates (Chunk 2), offer shortlist + compare (Chunk 3). Offer targeting boost: in-position + likely-rested candidates rank higher; stale-availability confidence penalty shrinks when radar confirms position.

## 2. WX/NOTAM briefs (M12)

- `WxAdapter`: METAR/TAF from aviationweather.gov data API (free, no key). NOTAMs: FAA NOTAM API requires an approved application — apply (human task); until granted, stub returns "NOTAMs unavailable" honestly. TFRs: tfr.faa.gov list parse.
- Brief generation at booking, T-3h, T-1h per airport on the chain (scheduler already exists): fetch → LLM one-paragraph plain-English summary via LlmAdapter ("KCAK 23Z: 800 OVC rain, marginal for the 23:30 arrival; KMDW fine") + hard flags (TAF below approach mins near ETA ±1h, TFR overlapping, field closure NOTAM) → dispatcher notification + gold banner on the trip; hard flags → exception queue.
- Store briefs in `trip_events` (kind='wx_brief') so the client tracker can show "weather checked ✓ 14:02Z."

## 3. Operator scorecards (M12)

Materialized view + nightly refresh: per operator — offer response rate, median response latency, quote→actual price drift, on-time % (est vs actual wheels-up/down from tracked trips), cancellation count, trips completed, margin contribution. Surface: Network page cards, compare view column, and **offer-targeting weight** (replace the static usefulness score component with scorecard blend once ≥5 data points). Fairness loop from the blueprint: fast responders visibly rank higher — show operators their own stats in the offer page footer ("You respond in ~4 min — top 10% of the network").

## 4. Shift briefing + analytics (M11/M12 close-out)

- Briefing page v2 (on login / shift start): active trips w/ next checkpoints, exceptions, pending offers/quotes, **today's WX watch list**, handoff notes (free text from outgoing dispatcher, stored on shift row).
- Analytics: margin by client/lane/type, win-rate by margin band (the markup tuner — chart: quotes sent vs won bucketed by margin %), est-vs-actual accuracy trend by leg type, FET-exempt utilization (are we routing to exempt tails when possible?). Keep it one dashboard page, Recharts, no BI sprawl.

## 5. Robocall escalation (Telnyx)

- Extend CommsAdapter with `placeCall(to, script)` — Telnyx Programmable Voice: TTS the script, gather DTMF (`press 1 to open the quote link — we'll text it now`), status webhook. Secrets `TELNYX_API_KEY`, `TELNYX_FROM`.
- Wire as the **final ladder rung only** (offer silent > 10 min AND trip urgency high) and for **dispatch alarms** (draft trip unacknowledged > 5 min → call the on-shift phone, TTS "New trip request from PSA, check your texts", repeat twice). Respect consent_call + quiet hours (24hr contacts exempt).
- Alternative kept honest: if Telnyx approval stalls, the notification-service fallback (Text-Em-All/DialMyCalls API) slots behind the same `placeCall` signature.

## 6. Hardening pass (ship-readiness)

Error boundary + Sentry (or Supabase log drains) · rate-limit public token pages · backup/PITR confirm on Supabase · load test the cron functions with 20 concurrent active trips · a `runbook.md` in docs: what to check when SMS stops, when ADS-B poller dies, when QB token expires.

## Acceptance checklist

- [ ] Radar page shows live (or fixture) positions for trial tails; rest chips render with tooltips; LADD tails show last-known + badge
- [ ] Route candidates + compare views show in-position/rest chips and rank accordingly (A/B a rested vs unrested same-type pair)
- [ ] Booked trip generates WX briefs at the scheduled offsets; a manufactured TAF-below-mins hits the exception queue
- [ ] Scorecards populate from historical + new offer data; offer page footer shows the operator their response stat
- [ ] Robocall fires in a live Telnyx sandbox after simulated 10-min silence, and the dispatch alarm calls the on-shift number for an unacked draft (env-flagged)
- [ ] Briefing page cold-loads everything a fresh dispatcher needs in one screen; handoff note round-trips between shifts
