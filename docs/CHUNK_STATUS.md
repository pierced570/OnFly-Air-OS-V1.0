# Chunk status — real operating data push

Updated as we convert mocks → durable/live paths.

| Chunk | Theme | Status now | Still mock / needs keys |
|------:|-------|------------|-------------------------|
| 1 | Foundation | **DONE** spine, fleet import, network, airports+city/state | Direct state revoke hardening |
| 2 | Quote engine | **PARTIAL** — client rules + FBO fees wired into candidates; NM GC readout in reasoning; live airports picker | Maps drive times, pricing priors, tax_rates from DB, quote/doc rows |
| 3 | Offers/booking | **PARTIAL** — flow works; comms log → `comms_messages` | RingCentral, escalation cron, offers table writes |
| 4 | Execution | **PARTIAL** — trip execution UI, one-tap, thread parse | Thread numbers, checkpoints cron, Storage POD |
| 5 | Portal/money | **PARTIAL** — portal form + track; financials ledger; mock QB | Magic-link RLS, QBO OAuth, manifests/render-doc |
| 6 | Admin wizards | **PARTIAL** — operator/client/FBO wizards; NEEDS-INFO; FBO addresses; CSV import | D085 real parse edge, persist operators to DB |
| 7 | Intelligence | **PARTIAL** — live METAR/TAF (aviationweather.gov), briefing WX watch, radar mock ADS-B | ADS-B poller, NOTAM FAA API, Telnyx, scorecard MV |

## What went live this pass (no vendor keys)

1. Supabase hydrate/persist for **clients**, **FBOs**, **shifts**, **comms_messages**
2. Migration `0005_real_ops.sql` — FBO address cols, intake_drafts, client legacy_key
3. **WxAdapter** real default → aviationweather.gov METAR/TAF; NOTAM stub honest
4. Briefing page WX watch list + hard flags → exception queue
5. Quote path: **client_rules** + **FBO fees** + circuit NM in reasoning
6. FBO CSV template + `npm`-runnable `scripts/import-fbos-csv.ts`

## Next (priority)

1. Persist trips/offers/quotes via `trip_transition` RPC  
2. Tax rates + pricing priors from DB  
3. Resend inbound + RingCentral when keys available  
4. QBO OAuth when keys available  
5. ADS-B poller when provider chosen  
