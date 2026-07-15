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
