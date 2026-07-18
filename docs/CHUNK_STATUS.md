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

- Edge: `supabase/functions/send-email` → Resend HTTP API
- Client: `VITE_EMAIL_ADAPTER=real` → `ResendEmailAdapter` → `functions.invoke('send-email')`
- Secrets (Supabase only): `RESEND_API_KEY`, `EMAIL_FROM`
- Deploy: `npm run deploy:send-email` (needs `SUPABASE_ACCESS_TOKEN` + Resend key in `.env`)
- Covers: operator invite, ETA sheet, COI expiry, quote preview send

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

## Next (priority)

1. Finish Resend go-live: run `deploy:send-email` + set `VITE_EMAIL_ADAPTER=real` on Vercel  
2. Persist trips/offers/quotes via `trip_transition` RPC  
3. Claude LLM adapter + D085 AI verify  
4. Domain/Vercel polish  
5. Google Maps, live ADS-B, NOTAM plain-English  
6. RC → Telnyx → QBO  

