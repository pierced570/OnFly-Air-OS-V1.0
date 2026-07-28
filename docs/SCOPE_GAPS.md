# Scope gaps — what to add beyond the mock OS shell

This is the checklist of things easy to miss when scoping OnFly OS.  
**Pages + mock infrastructure for schema/stubs are largely in place.** Live vendor connections are intentionally not.

## Already covered (mock UI + session/domain logic)

| Area | Where |
|------|--------|
| Board + exception queue + shifts | `/` |
| Quick Dispatch | `/quick-dispatch` |
| Full quote path + offers phone sim | `/trips/new`, `/trips/:id/offers`, `/offer/:token`, `/accept/:token` |
| Trip execution (legs, thread, docs, state, mock invoice) | `/trips/:id` |
| One-tap + POD note | `/t/:legToken` |
| Portal request + track | `/portal`, `/portal/request`, `/portal/track/:token` |
| Clients + ring/invoice/tracker flags + rules | `/clients` |
| FBOs + cargo rank | `/fbos` |
| Admin wizards (operator/D085 mock, client rules, FBO) | `/admin` |
| NEEDS-INFO tasks (seeded from network import) | `/admin/tasks` |
| Intake email/SMS simulator + review | `/intake`, `/intake/:id` |
| Financials ledger | `/financials` |
| Network read, Radar, Briefing | `/network`, `/radar`, `/briefing` |
| Spine schema + fleet/financials import | Supabase migrations + scripts |

## Live connections (explicitly later)

- RingCentral SMS/voice + inbound webhooks  
- Resend (or similar) inbound email + outbound  
- QuickBooks Online OAuth, customer sync, paid→closed poll — **wired** (mock default; `VITE_QB_ADAPTER=real` + edge secrets for live)
- Wait-time adjustment UI → invoice line  
- Telnyx robocalls  
- Live ADS-B poller → `flight_sessions`  
- Google/Maps Routes (drive times)  
- Real WX / NOTAM / TFR providers  
- Chromium PDF / `render-doc` edge function  
- Portal magic-link auth + RLS safe views  
- Persist session stores → Supabase (trips, clients, FBOs, tasks, intake)

## Gaps people often forget (add to scope)

1. **TCPA / consent enforcement** — offer ladder must refuse SMS/call without `consent_sms` / `consent_call`; quiet hours.
2. **Escalation timers** — no reply → next contact → voice; delivery failure ≠ no answer.
3. **Lost / cancelled UX** — required `lost_reason`; stand-down SMS to all held operators; who cancelled.
4. **Wait-time adjustments** after accept — hard quote vs actual wait → QB credit/rebill.
5. **Vendor bill upload** private storage + match to financial row (AP side).
6. **Tax rates from DB** — quotes still use fixture `TEST_TAX_RATES_2026`, not `tax_rates` table.
7. **Pricing priors** — `trip_history` / `pricing_priors` view unused in route scoring.
8. **FBO fees in route score** — directory exists; scoring not fully wired into `/trips/new`.
9. **Client rules → route filter** — chips show on trip; engine enforcement incomplete.
10. **Checkpoint cron** — Board exceptions are heuristic; no scheduled slip/watchdog jobs.
11. **Manifest generator** — document kind exists; no cargo manifest builder.
12. **COI / insurance expiry alerts** — schema + wizard notes; no compliance dashboard.
13. **Shift handoff package** — Briefing notes are local; no auto packet (open trips, exceptions, WX).
14. **Idempotent inbound** — email Message-ID / SMS dedupe so retries don’t double-create drafts.
15. **Audit export** — `trip_events` append-only is there; no CSV/compliance export UI.
16. **Multi-dispatcher presence** — single on-shift row; no claim/lock on a trip.
17. **Sandbox vs prod adapter modes** — `adapters/types` stub; flip switches per env.
18. **Runbook / on-call** — Chunk 7 hardening: who gets paged when intake ring fails.

## Suggested next build order (still mock-first)

1. Wire client rules + FBO rank into quote/routing engine  
2. Persist clients/contacts/tasks/trips to Supabase  
3. Offer escalation timer UI + consent gates  
4. Lost/cancelled + stand-down flows  
5. Then swap mock adapters for live QB / RC / Resend one at a time  
