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
