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
- Seeded admin: Pierce Demetriades / (610) 509-2031 — set others' phones after first login

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

## Customer onboarding (portal)

- Public form: `/portal/onboard` (company, people roles, billing, lanes, prefs)
- Submit → `addClient` + contacts (ops/AP/supervisors) + `clients.profile` jsonb
- Binds browser portal session → home shows company; request form seeds frequent lane
- NEEDS-INFO tasks for review / vendor packet / card-on-file link (never collect cards)
- Migration `0008_client_profile.sql`

## Vendor wiring from logins-keys.csv (2026-07-18)

| Vendor | Status | Notes |
|--------|--------|-------|
| Supabase | **keys loaded** | Management API → `VITE_SUPABASE_*` in local `.env` |
| Resend | **live** | `send-email` deployed · From `info@onflyair.com` |
| Mapbox | **live path** | Directions adapter · `VITE_MAPBOX_TOKEN` (pk.*) |
| OpenAI | **wired / quota** | `llm-extract` deployed · OnFly ChatGPT key 401 · skyIQ key models-ok but chat **quota exceeded** — add billing or new key |
| ADS-B Exchange | **wired / unsubscribed** | `adsb-positions` deployed · RapidAPI returns not subscribed — renew ADSBexchange-com1 |
| QuickBooks | blocked | Vault has login only — need OAuth app ids |
| RingCentral / Telnyx / Anthropic | missing | Not in CSV |
| Twilio | login only | Prefer RC for SMS |

Deploy: `npm run deploy:vendors` · toggles in `.env.local` / Vercel.

## Next (priority)

1. Set Vercel envs (`VITE_SUPABASE_*`, `VITE_MAPBOX_TOKEN`, adapter=real)  
2. Renew ADS-B RapidAPI subscription  
3. Persist trips/offers/quotes via `trip_transition` RPC  
4. D085 AI verify UI on `llm-extract`  
5. Replace skyIQ OpenAI key with dedicated OnFly key  
6. RC → Telnyx → QBO OAuth  

