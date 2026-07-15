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
