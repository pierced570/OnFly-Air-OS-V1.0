# Chunk status — real operating data push

Updated as we convert mocks → durable/live paths.

| Chunk | Theme | Status now | Still mock / needs keys |
|------:|-------|------------|-------------------------|
| 1 | Foundation | **DONE** spine, fleet import, network, airports+city/state | Direct state revoke hardening |
| 2 | Quote engine | **PARTIAL** — client rules + FBO fees wired into candidates; NM GC readout in reasoning; live airports picker | Maps drive times, pricing priors, tax_rates from DB, quote/doc rows |
| 3 | Offers/booking | **PARTIAL** — accept → confirm + stand-down (mock SMS) + ETA sheet/track links to tracker/supply-chain; **no QB invoice on accept** | RingCentral, QBO invoice, offers table writes |
| 4 | Execution | **PARTIAL** — trip execution UI, one-tap, thread parse | Thread numbers, checkpoints cron, Storage POD |
| 5 | Portal/money | **PARTIAL** — portal form + track; financials ledger; mock QB | Magic-link RLS, QBO OAuth, manifests/render-doc |
| 6 | Admin wizards | **PARTIAL** — operator docs (charter/D085/COI + expiry); COI expiry email; named-insurer toggle @ 3 trips; FBO CSV | D085 real parse edge; Storage upload; persist operators to DB |
| 7 | Intelligence | **PARTIAL** — live METAR/TAF; radar watches network + D085 tails (mock ADS-B takeoff/landing); crew-rest chips removed | Live ADS-B poller, NOTAM FAA API, Telnyx, scorecard MV |

## What went live this pass (no vendor keys)

1. Supabase hydrate/persist for **clients**, **FBOs**, **shifts**, **comms_messages**
2. Migration `0005_real_ops.sql` — FBO address cols, intake_drafts, client legacy_key
3. **WxAdapter** real default → aviationweather.gov METAR/TAF; NOTAM stub honest
4. Briefing page WX watch list + hard flags → exception queue
5. Quote path: **client_rules** + **FBO fees** + circuit NM in reasoning
6. FBO CSV template + `npm`-runnable `scripts/import-fbos-csv.ts`

## On-booked (minus QB) — this pass

- Hard quote accept → confirm selected operator + stand down others (mock SMS)
- ETA sheet + portal track links → client tracker / supply-chain emails (+ QD CC)
- Invoice → AP / QB **not** on accept (manual later)

## Estimated quote + ETA email (request flow)

- Quote composer → **Approve & send estimated quote + ETA sheet** (`sendEstimatedQuote`)
- HTML includes totals + domain ETA chain (stop-local + Zulu); carrier unnamed
- Recipients from request email / client requesters (editable To:)
- Hard quote select also emails quote + ETA + accept link when a chain exists
- Resend when `VITE_EMAIL_ADAPTER=real`

## Radar / D085

- Watched-tail store seeded from network import; Admin D085 confirm adds tails
- Mock ADS-B returns phase + last takeoff / landing; Radar UI filters + logs
- Crew-rest chips removed (FlightChip = airborne / on ground / no ADS-B)

## Operator compliance docs

- Admin wizard **Documents** step: charter cert, D085, COI uploads + expiry dates
- Network → **Docs / COI** per operator (session store; Storage later)
- Expired COI → mock email to ops contact requesting updated copy
- After **3 completed trips** → flag + **Named insurer** toggle
- Migration `0006_operator_compliance.sql` — `operators.named_insurer`

## Operator invite email + public onboard

- Admin → **Invite email**: preview/send network invite
- CTA → `/onboard` form (D085 / COI / charter; **no insured-amount field**)
- SkyIQ footer → `https://info.skyiq.net/`
- Env: `VITE_ONBOARD_URL`, `VITE_SKYIQ_URL`

## Resend (live email path)

- Edge: `supabase/functions/send-email` → Resend HTTP API (**deployed**)
- Client: `VITE_EMAIL_ADAPTER=real` → `ResendEmailAdapter` → `functions.invoke('send-email')`
- Secrets (Supabase only): `RESEND_API_KEY`, `EMAIL_FROM=OnFly Air <info@onflyair.com>`
- Deploy: `npm run deploy:send-email`
- Covers: operator invite, ETA sheet, COI expiry, quote preview send

## Staff login + section ACL + Logins & keys

- Gate: name + phone before any dispatcher route (public portal/offer/onboard unchanged)
- Admin → **Staff access**: set phones + per-section toggles (admins get all)
- Admin → **Logins & keys**: restricted vault; import `data/private/logins-keys.csv` (gitignored)
- Sole owner: Pierce Demetriades / (610) 509-2031 — only he manages Staff access grants; others get section toggles he sets

## Network vertical board + mission fit + mobile

- `/network` board/list toggle; category column pills; origin NM rank
- Mission fit from cargo dims + door/payload/distance; top picks strip
- Mobile: hamburger DispatchShell, snap-scroll board columns, stacked tail cards
- Page padding tightened across dispatcher routes

## Storage + portal (this pass)

- Migration `0007_storage_buckets.sql` — private `operator-docs` + `trip-docs`
- Compliance uploads → Storage when Supabase configured (local preview fallback)
- Portal track: ETA / legs+actuals / contacts / live updates — **no pricing**
- Full wire order: [`docs/WIRE_ORDER.md`](WIRE_ORDER.md)

## Customer onboarding (client page — not portal)

- Public shareable form: `/client` — same subjects as Admin Add-client + Clients directory:
  company/address/billing, people (ops/AP/supply/emergency), pay terms + PO prefix,
  routing rules (dual pilot, freight, multi-engine, SE night, hazmat, declared value),
  frequent lanes, update prefs
- Portal is request/track only; send `/client` to new customers (Clients page has copy link)
- Legacy `/portal/onboard` redirects to `/client`
- Submit → `addClient` + `client_rules` + contacts + `clients.profile` jsonb
- Clients detail shows/edits the same profile + full rules
- NEEDS-INFO tasks for review / vendor packet / card-on-file link (never collect cards)
- Migration `0008_client_profile.sql`

## Vendor wiring from logins-keys.csv (2026-07-18) — live flip pass

| Vendor | Status | Notes |
|--------|--------|-------|
| Supabase | **live** | `VITE_SUPABASE_*` in `.env` |
| Resend | **live** | default `VITE_EMAIL_ADAPTER=real` · `send-email` |
| Mapbox | **live** | default `VITE_MAPS_ADAPTER=real` · Directions |
| Claude / Anthropic | **live** | default `VITE_LLM_ADAPTER=real` · `llm-extract` (trip + D085) |
| WX METAR/TAF | **live** | `wx-brief` + aviationweather.gov · flight-cat colors |
| OpenAI | fallback only | Claude preferred |
| ADS-B | **blocked** | RapidAPI dead — leave `VITE_ADSB_ADAPTER=mock` until FlightAware/ADSBX direct |
| QuickBooks | **wired (mock default)** | Edge `quickbooks-auth` / `quickbooks-api` / `send-invoice-email`; Financials Connect + Send Invoice; flip `VITE_QB_ADAPTER=real` after Intuit OAuth app secrets |
| RingCentral / Telnyx | **blocked** | Not sourced — SMS/voice stay mock |
| NOTAMs | **blocked** | FAA API enrollment |
| Twilio | login only | Prefer RC for SMS |

Deploy: `npm run deploy:vendors` · Admin chip strip shows live / wire / mock.

## Next (still to wire)

1. ADS-B provider swap (FlightAware or ADSBX direct)  
2. RingCentral SMS adapter  
3. QuickBooks OAuth app secrets (`QB_CLIENT_ID`/`SECRET`) + Connect on Financials → sandbox invoice smoke test  
4. FAA NOTAM API  
5. Persist trips/offers via `trip_transition`  
6. Resend inbound webhook for intake-email  
7. Vercel env parity (`VITE_*` real toggles + tokens)  

