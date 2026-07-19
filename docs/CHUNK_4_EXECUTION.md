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
