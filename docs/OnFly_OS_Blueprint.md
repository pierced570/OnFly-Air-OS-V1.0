# OnFly OS — System Blueprint (v1.4, July 14 2026)

> The Operating System for On-Demand, Time-Critical Freight — Internal, Confidential.
> This is the build bible for OnFly OS. Read fully before writing code.

## 1. North Star

**Door-to-door, time-critical freight — estimated quote instantly, hard quote in 5–10 minutes.** One dispatcher runs ten concurrent trips across an eight-hour shift and hands off with a login, not a phone call. Every party on a trip — crew, FBO, driver, charter ops, client — sees the same live picture.

OnFly wins against Ascent and ACS on four axes: speed of answer, price sharpness, live transparency, and ease of request. None of these come from prettier software. They come from a structural advantage the incumbents cannot copy quickly: OnFly already owns the data needed to price a trip before asking anyone.

The moat, today: **424 real trips** with true operator cost per NM over the full circuit, by aircraft type, by operator, by tail; a **470-row fleet database** with doors, cabins, payloads and bases; per-operator compliance status; an FBO/airport survey in progress; and a vetted network of 48 working operators inside a 1,117-operator map. Every trip the system touches makes all of it sharper. That flywheel is the product.

Concentration note: one client is \~95% of revenue. OnFly OS is also the sales weapon that fixes this — the client portal and 5-minute quote are the most demo-able assets OnFly will own. Build the client-facing surfaces like marketing, because they are.

## 2. Operating Principles — the Five Laws

Every design decision in this document reduces to five laws. When a future feature argument starts, settle it against these.

  - **1. Two-speed quoting.** The estimated quote is instant — generated entirely from OnFly's own data (pricing priors, block rates, availability + Fleet Radar position data, FBO fees, drive times) the moment intake is approved. The hard quote lands at T+5–10 min, made possible by the two-step offer flow (reply-to-answer pings, no links, no logins) and by knowing from ADS-B who is actually in position. Never make the client's answer wait on an operator's reply.

  - **2. One Trip spine.** Action sheet, quote PDF, ETA sheet, load manifest, client tracker, invoice, shift briefing — all are generated views of a single Trip object and its ETA chain. Nothing is authored twice.

  - **3. Approve, don't enter.** AI drafts everything — parsed requests, operator shortlists, outreach messages, markups, ETA chains. The dispatcher's job is to tap approve or adjust. Every gate is an approval, never data entry.

  - **4. Passive actuals.** Est-vs-actual tracking survives only if actuals arrive without extra work: ADS-B for wheels up/down, the trip thread parsed automatically (a normal “wheels up” text becomes a logged actual), one-tap links for drivers, calls last. If a human transcribes timestamps, the tracker dies in week two.

  - **5. Route to the role.** Notifications, check-ins and escalations go to “the on-shift dispatcher,” and the system resolves who that is. 100% of trip state lives in the system, so a handoff is a login plus a generated briefing — zero tribal knowledge.

## 3. The Trip Spine

The Trip is the only first-class object in OnFly OS. It carries a state machine, an ETA chain, and an append-only event log.

### 3.1 State machine

|                    |                                                                                                                                                                                                    |                                        |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| **State**          | **What happens here**                                                                                                                                                                              | **Exits when**                         |
| Draft              | Request captured (call, text, email, portal). AI parses addresses, payload, dims, weight, deadline; flags D2D vs A2A, forklift, hazmat, declared value.                                            | Dispatcher approves parsed request     |
| Routed             | Route engine generates candidate routings; hard filters + scoring produce Cheapest / Fastest / Best with confidence bands.                                                                         | Dispatcher approves options to quote   |
| Quoted — Estimated | Client receives the estimated quote instantly with ETA sheet. Carrier unnamed. Offer round opens in parallel.                                                                                      | Offers land / client engages           |
| Offers Out         | Two-step flow: availability ping (reply-to-answer, zero links) → trip-specific quote link for the available. Responses: time to position (auto-ETA shown), live leg, wait tolerance, price NET.    | Dispatcher selects winning operator(s) |
| Quoted — Hard      | Markup applied (custom $ or %), tax engine runs, accept link sent. Carrier stays unnamed; passenger trips auto-attach the Part 295 disclosure at acceptance.                                       | Client accepts (e-accept or PO)        |
| Booked             | Auto-confirmations to all assigned parties; stand-down notices to every other responding operator; dispatcher follow-up calls; trip thread created; docs generated (manifest, ETA sheet).          | First leg starts                       |
| In Progress        | ETA chain fills with actuals (ADS-B, trip-thread check-ins parsed, one-tap links). Checkpoint notifications fire (T-30/T-5 truck, T-60/T-30 air). WX/NOTAM re-briefs at T-3h and T-1h per airport. | POD captured                           |
| Delivered          | POD + final actuals locked. Est-vs-actual scorecard computed.                                                                                                                                      | Invoice issued via QuickBooks          |
| Invoiced → Closed  | Invoice to client AP list; tracker summary to supply-chain list; margin recorded; operator scorecards updated.                                                                                     | Payment reconciled                     |

Terminal branches: **Lost** (quote declined — capture why and the winning competitor if known) and **Cancelled** (post-booking — capture cancellation fees owed both directions). Lost-reason data is the win-rate feedback loop for pricing.

### 3.2 ETA chain

An ordered list of legs, each with estimated and actual start/end, a responsible party, and a status. Leg types: TRUCK\_PICKUP, AIR\_LEG, GROUND\_STOP, OFFLOAD, TRUCK\_DELIVERY (CUSTOMS reserved for international). Planning defaults, all configurable per trip and overridable per leg: truck load at shipper 0:30; truck↔aircraft transfer at the FBO 0:30 each side; aircraft turnaround 1:00 per stop (fuel, load, ready); truck unload at consignee 0:30. Drive time comes from the maps API; flight time = route NM (haversine between ICAOs) ÷ cruise speed + a taxi allowance; the position leg runs operator base → origin.

**The merge rule:** the truck chain and the aircraft chain run in parallel and meet at the origin FBO. Wheels-up = the later of (truck arrival + 0:30 transfer) and (aircraft in position + 1:00 turnaround). Every downstream time flows from that. When an actual lands late, the chain recomputes from the merge node forward; slips beyond threshold hit the exception queue and refresh the client tracker.

**Time zones:** store every timestamp in UTC, always. Each airport and address carries an IANA zone (looked up from ICAO coordinates / geocode), so DST handles itself. Dispatcher UI renders Zulu + local side by side; client-facing ETA sheets render each stop in that stop's local time with the zone label — like an airline itinerary. Offsets are never stored, only zone names.

The chain is the single source for: the quote's ETA sheet, the dispatch action sheet, the client tracker, checkpoint notification timing, the load manifest timeline, and the efficiency scorecard (planned vs actual, per leg, per operator, per FBO).

### 3.3 Event log

Append-only: every state change, message, call, bid, price edit, and check-in with timestamp and actor. The shift briefing, the handoff, and any dispute reconstruction are queries over this log — they are never separately maintained.

## 4. Module Map

Twelve modules hang off the spine. Each is independently testable; none owns data another needs privately.

### M1 — Network Database (in motion now)

Operators, fleet (470 rows), FBOs/airports, contacts, clients + **client\_rules** (dual-pilot for pax, multi-engine only, no single-engine night, hazmat limits), block rates, availability sheets. This is the current backend research workstream — Batches 1–5 in the Fleet & Compliance Master, plus block-rate and availability collection from the operator game plan. Everything else reads from M1.

**Adding records is a guided wizard, never a blank table.** Add Operator: prompts through contacts (cell + text/call consent), base, capabilities (hazmat, 24hr, callout time), crew policy, block-rate ask — then **upload the D085**: the parser extracts every tail number and type from the FAA aircraft listing, creates the aircraft rows, and prefills door/cabin/payload/MTOW from the type-spec library (flagged published-typical; conversions prompt for verification). It then walks per-tail insurance — liability and hull limits plus expiry dates — and expiry drives the compliance alerts and booking gates automatically. Anything skipped becomes a NEEDS-INFO flag with a collection task, so a half-finished onboarding is usable, not broken.

**Add Client is a rules interview:** two pilots required or single OK? Freight only, or pax too? Aircraft constraints (multi-engine only; single-engine acceptable only if turboprop; no single-engine at night)? Hazmat allowed? Typical declared values? Then the people: requester emails/numbers (these arm the intake triggers), AP contacts (invoices), supply-chain list (tracker), notification preferences. Writes client\_rules + client\_contacts — the router enforces the answers on every future quote. **Add FBO** walks the survey checklist: 24hr, forklift + capacity, GL insurance + coverage, handling/ramp/overnight/callout fees, fees-waived-with-fuel, after-hours phone, last-verified date. Every wizard ends with a completeness score and the missing items queued as tasks.

### M2 — Intake

Four doors, one outcome: a Draft trip. (a) Phone: dispatcher uses a near-zero-typing form — address autocomplete, client autofill, a dims parser that accepts “3 skids 48x40x60 @ 800ea”. (b) Email: watcher on flagged requester addresses; AI creates the Draft trip itself and pages the on-shift dispatcher with a review link — the call is the alarm, never the data channel. (c) Text: same treatment for flagged requester numbers; a client can text a request and the AI drafts from it. (d) Client portal request form (Chunk 4+). Entry must stay extremely simple at every door. Voice-AI intake is a later overlay on the same pipeline.

### M3 — Route & Pricing Engine

Generate candidate routings: origin airports × destination airports × eligible aircraft, with truck legs bolted on for D2D. Hard filters kill only physical impossibilities: door ≥ cargo dims, available payload (MTOW − fuel for leg, not book max), range with reserves, cargo/pax match, client\_rules. Missing data never excludes — the operator stays in the pool wearing a NEEDS-INFO flag that spawns a collection task, so the network grows instead of shrinking. Known compliance lapses (expired COI, missing D085) allow the availability ping but gate booking until resolved. Hazmat willingness, FBO hours, and a crew-rest plausibility check fed by Fleet Radar's last-flight data (M13) shape scoring. Score survivors on cost (pricing priors + block rates + FBO/callout fees + trucking) and time (position + live legs + stop defaults). Output: Cheapest / Fastest / Best Overall with per-number confidence, top 3–5 operators each with tail, phone, and match reasoning.

### M4 — Trip Offers (two-step flow)

**Step 1 — availability ping, zero friction.** SMS and email to the shortlist with the essentials (lane, payload, timing). No link, no login, no new site: reply 1 / AVAILABLE or 2 / UNAVAILABLE; email gets one-click buttons. Silence escalates on a ladder — second text, then a call. **Step 2 — quoting.** Available operators receive a trip-specific magic link: it shows where the trip is going; as they enter their time to position, the form instantly displays the live ETA that implies; then live leg time, price to aircraft NET, wait OK + max wait, optional notes. Sixty seconds on a phone. This two-step design is what makes hard quotes in 5–10 minutes physically possible.

Operators with missing data are still pinged — wearing their NEEDS-INFO flag (M3) so the gap becomes a collection task, not a lost trip. Every response timestamps into the scorecard; fast responders earn first look on future offers, and are told so. On booking, every other responding operator gets a courteous stand-down notice — automatic, logged, so nobody is left holding an aircraft. **Operator-facing language is “trip offer” / “availability check” — never “bidding”** (per the operator-relations policy: OnFly hand-selects and matches; operators are not pitted against each other). Robocall stays a sparing last rung — volume earns behavior change, robots don't.

### M5 — Quote Composer & Tax Engine

Markup by custom amount or percent per trip; tax engine (Section 6) computes FET, segment fees, and exemptions per leg from effective-dated tables. Quotes stay carrier-unnamed; passenger acceptances auto-attach the Part 295 disclosure (cargo has no naming requirement — see §6.2). Output: quote document + ETA sheet, sent by email/SMS with an accept link. Acceptance triggers Booked automations.

### M6 — Booking & Confirmation

On accept: automatic confirmations to every assigned party (operator, trucking, FBOs), stand-down notices to every other responding operator, dispatcher prompted to make the human follow-up calls, trip thread spun up (M8), documents generated (M10), and client distribution lists notified — invoice + contract to AP, tracker link to supply-chain/AOG list, both routed at the same time.

### M7 — Execution Tracker

The ETA chain goes live. Actuals cascade in priority order: (1) ADS-B wheels up/down from Fleet Radar (M13); (2) trip-thread parsing — when anyone in the group text says “wheels up,” “wheels down,” “package handed off,” the listener logs the timestamped actual, with dispatcher confirmation only when ambiguous. This covers LADD-blocked tails and drivers who won't press buttons, and recipients are asked to confirm hand-offs in-thread so delivery gets logged too; (3) one-tap “arrived / loaded / departed” links; (4) dispatcher entry, last resort. Checkpoint engine fires dispatcher check-in tasks at truck T-30/T-5 and aircraft T-60/T-30/arrival, and client-facing status pushes per the client's preference. Slippage beyond a threshold recomputes downstream ETAs and flags the exception queue.

### M8 — Trip Comms

One thread per trip, via the relay model: each trip is assigned a dedicated number from a small pool (assigned so no participant ever has two active trips on the same number). On assignment, every party — crew, FBO, driver, dispatch — gets an intro text from the trip number: “You're on OnFly Trip \#347. This thread reaches everyone on the trip. Reply here.” Anything texted to that number is logged and fanned out to everyone else, prefixed with the sender's name and role (“\[Pilot — N331SB\] Wheels up in 10”). MMS relays too, so freight photos and PODs land in the thread and archive to the trip record automatically. The dispatcher reads and types from the trip screen as \[OnFly Dispatch\]. Membership comes two ways: automatically from trip assignments (operator contact, driver, FBO — numbers pulled from M1), and manually — a Participants panel on the trip screen where the dispatcher adds anyone by name, role, and cell (a mechanic, a client's dock contact, a one-off handler). Everyone added gets the intro text; a swapped or removed participant gets a courtesy release and stops receiving; the replacement gets the intro.

**Boundaries: exactly one operator per thread.** Operators being offered the same trip never share a thread — offer-stage comms stay strictly 1:1 (consistent with the no-bidding posture). Client supply-chain contacts get the live tracker link, not the ops thread (optional per client). The thread is also an instrument: the M7 listener reads it for status keywords, so a normal human check-in becomes a logged actual with zero extra work. If relay gets clumsy at high concurrency, the contained upgrade is a managed group-messaging API (Twilio Conversations) inside the CommsAdapter — participants notice nothing. Stack decisions in Section 7.

### M9 — Client Portal

Per-client view: live trips on the ETA chain, history, documents (quotes, invoices, manifests, PODs), and a request form that feeds M2. Per-client distribution lists control who sees tracking vs who receives invoices. Auth: magic links (decided — no password support burden).

**The request form collects everything a quote needs in one pass:** pax or cargo; pieces (count, L×W×H, weight each, stackable); pickup location(s) — street address or origin airport; destination — address or airport; A2A vs D2D (auto-detected from the location types); ready time and hard deadline; hazmat; declared value; special handling (forklift, temperature, AOG reference/PO number). Submitting creates a Draft trip straight into the M2 pipeline with the client's rules already attached — the portal client skips the phone call entirely and still hits the instant-quote path.

### M10 — Documents & Billing

Generated, never authored: load manifest (payload, dims, weights, hazmat flags — for crews and handlers), ETA sheet, quote PDF, invoice via QuickBooks, charter agreement. Every document is a render of trip state at a timestamp, so regeneration is always safe.

### M11 — Shift Ops & Briefing

On-shift selection binds the dispatcher role to a person and phone number. Login generates the briefing: active trips and where each stands, next checkpoints in time order, exceptions, pending offers, unsent quotes. The exception queue — not the trip list — is the working surface: a dispatcher touches only what deviates from plan. This is what makes 1:10 possible.

### M12 — Intelligence

Timed WX/NOTAM briefs per airport (at booking, T-3h, T-1h) from FAA/aviationweather.gov feeds, with TFR/closure flags checked against the ETA chain. Operator scorecards: response time, on-time %, quote-vs-actual drift, cancellation rate. Pricing analytics: win rate by margin band per lane — the feedback that tunes markup policy. Efficiency: est-vs-actual by leg type, operator, FBO, and dispatcher.

### M13 — Fleet Radar (network ADS-B tracker)

A live map of every tail in the network (\~470 aircraft): current position, in-position vs home base, and — the part that changes quoting — **when each aircraft last flew.** The radar ingests ADS-B into per-tail flight sessions (first-seen / last-seen per flight), which yields three signals nobody else in the market is using: (a) position — is this operator actually where the database says, can they cover the origin; (b) availability confidence — a tail that landed 20 minutes ago is home and real, a sheet updated last Tuesday is a guess; (c) crew rest heuristics per 14 CFR 135.267 — crews need 10 consecutive hours of rest in the 24 before planned completion, inside a max 14-hour duty window, so a tail that's been running legs all day probably can't take a 9 PM launch. Status chips: likely rested / rest clock running / unknown.

**Advisory, not adjudication:** crew swaps are invisible to ADS-B and the operator always remains responsible for legality — the radar exists so OnFly stops wasting offer cycles on crews that can't go, and targets pings at aircraft that are in position and rested. LADD/blocked tails show last-known position and lean on thread-parsed check-ins (M7). Feeds: availability (M1), routing scores (M3), offer targeting (M4), live-leg actuals (M7). Provider (ADS-B Exchange / airplanes.live / FlightAware AeroAPI) chosen at build via a small trial. Poll the tail list on a schedule; store flight sessions, not the raw firehose.

## 5. Data Model (core tables)

Supabase/Postgres. The xlsx master remains the human progress tracker; the app reads flat, formula-free tables. Names final enough to build against.

|                      |                                                                                                                                                                                                                                          |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Table**            | **Purpose / key fields**                                                                                                                                                                                                                 |
| clients              | Client orgs; billing terms, QB customer ref.                                                                                                                                                                                             |
| client\_rules        | Per-client hard filters: dual pilot pax, multi-engine only, no single-engine night, hazmat limits. Read by M3. (Planned in the master workbook; does not exist yet.)                                                                     |
| client\_contacts     | People + roles: requester (email-intake trigger list), AP (invoice list), supply\_chain (tracker list).                                                                                                                                  |
| operators / aircraft | Imported from Fleet & Compliance Master: compliance docs + expiries, insurance $, capability flags, bases; per-tail specs (door W/H, cabin L/W/H/vol, payload, cruise, range), MTOW (add — drives FET exemption), per-tail $/NM history. |
| operator\_contacts   | Dispatch/owner/pilot numbers + preferred channel, quiet hours.                                                                                                                                                                           |
| fbos\_airports       | One row per FBO: 24hr, forklift, GL insurance + coverage, handling/ramp/overnight/callout fees, fees-waived-with-fuel, last verified.                                                                                                    |
| rates\_block         | Operator × type block rates: $/hr or $/NM, effective dates, terms.                                                                                                                                                                       |
| availability         | Operator/tail availability windows + staleness timestamp; source (sheet, ping, standing, ADS-B-inferred).                                                                                                                                |
| flight\_sessions     | Per-tail ADS-B flight sessions (first/last seen, off/on estimates) + last position; drives in-position status, last-flew, rest-clock chips. LADD/blocked flag per tail.                                                                  |
| trips                | The spine: state, client, payload (pax/cargo, dims, weight, declared value, hazmat), D2D/A2A, deadline.                                                                                                                                  |
| trip\_legs           | ETA chain rows: type, sequence, party, est/actual start-end, status, location refs.                                                                                                                                                      |
| trip\_events         | Append-only log: actor, type, payload, ts.                                                                                                                                                                                               |
| trip\_participants   | Who's on the trip + thread membership; drives M8 add/remove.                                                                                                                                                                             |
| offers / bids        | RFQ per operator: channel history, time\_to\_position, live\_leg, wait\_ok, max\_wait, price\_net, valid\_until, response latency.                                                                                                       |
| quotes               | Indicative/firm, options (cheapest/fastest/best), markup, tax breakdown, Part 295 disclosure record, accept token, outcome + lost\_reason.                                                                                               |
| invoices / documents | QB refs; generated artifacts (manifest, ETA sheet, POD) with render timestamps; uploaded operator docs (D085, COIs) with parsed extractions + expiry dates.                                                                              |
| tax\_rates           | Effective-dated FET %, segment fees, intl head tax, exemption params. Never hardcoded.                                                                                                                                                   |
| comms\_messages      | All SMS/email/call records, linked to trip + participant.                                                                                                                                                                                |
| shifts               | On-shift rotation; role→person→phone resolution for notifications.                                                                                                                                                                       |
| pricing\_priors      | Materialized from trip history: median/mean $/NM circuit by type, operator×type, tail; refreshed as trips close.                                                                                                                         |

## 6. Tax Engine

Table-driven, effective-dated, per-leg. Rates change every year — the segment fee alone moved $5.20 → $5.30 into 2026 — so the engine reads **tax\_rates**, never constants.

### 6.1 Current rates (calendar 2026)

|                                  |                          |                                                                                                                                                                                               |
| -------------------------------- | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Item**                         | **Rate (2026)**          | **Notes**                                                                                                                                                                                     |
| Cargo FET (domestic property)    | 6.25%                    | On the total amount paid for air transportation of property — including OnFly's markup.                                                                                                       |
| Passenger FET (domestic)         | 7.5%                     | On total amount paid, including markup.                                                                                                                                                       |
| Domestic segment fee             | $5.30 / person / segment | Indexed annually. Per segment, per passenger.                                                                                                                                                 |
| International head tax           | $23.40 / person          | Applies where transport begins or ends in the US; different regime — no 7.5%/segment-fee stack.                                                                                               |
| Small-aircraft exemption (§4281) | FET-exempt               | Aircraft MTOW ≤ 6,000 lbs, not operated on an established line. Much of the light-twin fleet (C310, Baron 58, C340) qualifies — a real price edge on light cargo. Engine reads MTOW per tail. |

Worked example: $10,000 cargo charter on a King Air 200 → FET $625, invoice $10,625. Same load fitting a C310 (MTOW ≤ 6,000 lbs) → FET $0 — the exemption compounds the “smallest plane it fits in” strategy. Ground legs billed separately as ground transportation are outside air FET; bundling rules deserve a CPA pass before launch.

### 6.2 Compliance guardrails (Part 295 and adjacent)

  - **Part 295 applies to passenger charters only.** Cargo brokerage operates under Part 296 property/forwarder authority, which has no equivalent carrier-disclosure regime — the \~95% cargo book was never subject to 295.24, so nothing has been missed there. Passenger trips DO require disclosing the direct air carrier's corporate name and OnFly's capacity before contract. The fix is structural, not behavioral: quotes stay carrier-unnamed everywhere (as preferred), and passenger acceptances auto-attach the 295.24 disclosure text with a stored timestamp at the accept step. Confirm the template once with an aviation attorney.

  - **On-request disclosures (pax):** broker-carrier relationships, total cost breakdown, known third-party fees — keep them one click away in the quote view so any request is answered instantly.

  - **Duty/rest flag (135.267):** 10 consecutive hours of rest required in the 24 before planned completion; 14-hour duty window; extended-rest steps when exceeded. The router flags multi-leg chains that plausibly bust these (or need a double crew) rather than silently quoting an impossible timeline — informed by Fleet Radar's last-flew data (M13).

  - **Declared value vs liability:** intake captures cargo declared value; the system flags when it exceeds the operator's cargo liability/insurance — protection first, cargo-insurance upsell second.

## 7. Comms Stack — Decided

**Decisions: RingCentral first as transport (it is already OnFly's phone system); Twilio layered in only when a chunk demands what RC can't do; orchestration straight in code (n8n skipped); SMS group threads per trip.** What matters now is deliverability — the unglamorous registrations that decide whether messages actually arrive.

### 7.1 Transport: RingCentral first, Twilio when earned

OnFly already runs on RingCentral — numbers operators recognize and save, and a real developer API: send/receive SMS, delivery status, inbound webhooks, with A2P 10DLC/TCR registration handled through RC. That covers everything Chunks 1–2 need — availability pings, keyword replies (“1 / AVAILABLE”), quote links, dispatcher notifications — with no new vendor, and the existing business-SMS registration may already satisfy A2P (check the RC admin; if so, the longest lead-time item in the plan disappears). What RC's API does not do: programmable robocalls (TTS + press-1 gathering) and managed group-SMS threads. Trip threads (Chunk 3) therefore start as an RC relay — participants text the trip number, the system fans the message out to the others and logs it, attribution by sender's active trip — and graduate to Twilio Conversations if concurrent-trip volume makes the relay clumsy. Twilio (Telnyx fallback) joins only when robocalls and voice-AI arrive at Chunk 5, riding the same adapter. The comms layer is a thin adapter precisely so adding or swapping transports is a week, not a rewrite.

### 7.2 Orchestration = code

Escalation ladders, checkpoint timers, stand-downs, notification routing — all in the app as queued jobs and cron, versioned and testable like everything else. Nothing here needs a visual workflow tool.

### 7.3 Deliverability — do these before writing features

  - **A2P 10DLC registration.** US carriers require brand + campaign registration for business SMS; without it, messages get silently filtered. Check the RingCentral admin first: OnFly's existing business-SMS registration may already cover this use case, deleting the longest pole in the plan. If a new campaign is needed, TCR via RC can run \~25 days — file it before writing any code.

  - **STIR/SHAKEN + branded caller ID.** Register for full attestation and CNAM branding so OnFly calls and robocalls display as OnFly Air — not “Spam Likely.” A robocall system that lands as spam is worse than no robocall system.

  - **Numbers per purpose.** Separate numbers for trip threads, offers, and alerts, so one purpose's carrier reputation never poisons another. Operators can save “OnFly Trips” once.

  - **Delivery webhooks.** Sent / delivered / failed logged to trip\_events, so a silent operator is distinguishable from an unreachable one — the escalation ladder keys off this.

  - **Quiet hours + channel preference** per contact, respected by the ladder (24/7 operators exempt by their own flag).

**Robocalls (the airline reserve-callout pattern — automated call, TTS message, press-1 to accept):** Telnyx is the named programmable-voice provider — same primitives as Twilio (TTS, digit gathering, call-status webhooks), 40–70% cheaper on its own carrier network, and a materially faster, more accommodating approval process (relevant: Twilio's vetting has already rejected one partner account). Plivo and SignalWire are runners-up. Zero-code stopgap if callout is wanted before Chunk 5: staffing-notification services (Text-Em-All, DialMyCalls, CallFire) do press-1 campaigns via simple APIs and carry the telecom compliance themselves — same adapter, less flexibility, fine at OnFly's volumes. Operator onboarding should include a call/text consent line (TCPA hygiene). Voice-AI intake vendors: evaluate at Chunk 5. Voice notes in threads: deferred, revisit after Chunk 3 real-world use.

## 8. Roadmap — One Chunk at a Time, Each Tested Start-to-Finish

Matches how you said you'll work: finish the data research, then test each slice end-to-end until the whole process runs. Each chunk has a definition of done that is a real-world test, not a feature list. Build is a fresh, standalone application (decided) — its own repo, its own database, nothing inherited. Chunks ship to a live preview URL from day one, so every change is visible in a browser minutes after it's made; existing tooling keeps running the business untouched until OnFly OS replaces it module by module.

|                                  |                                                                                                                                                                                                                                               |                                                                                                                                                                                                                           |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Chunk**                        | **Scope**                                                                                                                                                                                                                                     | **Definition of done (the test)**                                                                                                                                                                                         |
| 0 — Data Foundation (now)        | Finish Fleet & Compliance batches 1–5; collect block rates + availability sheets per the operator game plan; add MTOW per tail; create client\_rules; export flat AI tables (aircraft, operators, trips, FBOs, rules).                        | Given a surprise test trip, a human using only the database picks the top-3 operators and prices the trip within 10 minutes — no phone calls, no memory.                                                                  |
| 1 — Intake → Instant Estimate    | Structured intake form + email/text parser; route candidates; flag-don't-exclude filters; pricing from priors + block rates + FBO fees + trucking; tax engine; quote doc + ETA sheet generation.                                              | Re-quote 20 historical trips blind: engine lands within 10% of real operator cost on 15+. Then one live request on a known lane: estimated quote generated instantly (≤60 s from approved intake), sent to a real client. |
| 2 — Offers → Hard Quote → Booked | Two-step offer flow (reply-to-answer ping + trip-specific quote link with auto-ETA); Fleet Radar v1 (positions, last-flew, in-position status); compare view; markup; accept link; booking automations + stand-downs + dispatcher call layer. | One real trip runs request → offers → hard quote in ≤10 min → client accept → all-party confirmations + stand-downs entirely through the system. Availability replies ≥50% within 5 minutes, zero robocalls.              |
| 3 — Execution & Comms            | ETA chain live; ADS-B actuals via Fleet Radar; trip SMS thread + status-keyword parsing (wheels up/down, handed off → logged actuals); one-tap links; checkpoint notifications (T-30/T-5 truck, T-60/T-30 air); exception queue.              | One trip tracked start to finish with zero typed timestamps, and the client never calls asking “where is it?” because the tracker answered first.                                                                         |
| 4 — Money & Client Face          | QuickBooks invoice auto-generation; AP vs supply-chain distribution routing; client portal (live tracker, docs, request form); load manifest generator.                                                                                       | A client goes quote → tracker → invoice with no manually assembled document anywhere, and books their next trip through the portal.                                                                                       |
| 5 — Intelligence & Scale         | WX/NOTAM timed briefs; Fleet Radar rest-clock heuristics + alerts; operator scorecards; margin/win-rate analytics; shift briefing + handoff; voice-AI intake; robocall as sparing escalation.                                                 | One dispatcher comfortably runs 5+ concurrent live trips in a shift (10 is the end-state target), and a shift handoff happens with a login and briefing only.                                                             |

Scope discipline: if a proposed feature is not a view of the Trip spine or one of the thirteen modules, it stays out. Cargo-fit checking, for example, is not a separate feature — it lives inside M3 as the door/cabin fit filter, where it belongs.

## 9. Scoreboard

|                                        |                                |                                                                |
| -------------------------------------- | ------------------------------ | -------------------------------------------------------------- |
| **Metric**                             | **Target**                     | **Why it matters**                                             |
| Time to estimated quote                | Instant (≤ 60 s from intake)   | The headline promise; the reason clients call OnFly first.     |
| Time to hard quote                     | ≤ 10 min                       | Two-step offers + Fleet Radar closing the loop.                |
| Availability-ping reply rate / latency | ≥ 50% within 5 min (post ramp) | Health of the operator network + comms design.                 |
| Quote win rate by margin band          | tracked per lane               | Tunes markup policy with data, not vibes.                      |
| ETA accuracy at T-1h                   | ± 15 min                       | The credibility of the tracker and the portal.                 |
| Passive actuals share                  | ≥ 80% of timestamps untyped    | Law 4; leading indicator the tracker survives.                 |
| Trips per dispatcher per shift         | 10 (end-state)                 | The 1:10 economic engine.                                      |
| Average margin                         | ≥ 15% (from 12.4% today)       | Sharper pricing priors + FET-exempt routing + FBO fee capture. |

## 10. Blindspot Register

|                                                       |                                                                                                                                         |              |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| **Risk**                                              | **Mitigation**                                                                                                                          | **Where**    |
| 5-min promise collides with operator response reality | Two-speed quoting; block rates + availability sheets power the indicative number                                                        | Law 1; M3/M5 |
| Robocall fatigue poisons operator relationships       | Ladder (SMS → email → call); 4-field prefilled form; speed earns first look; “trip offer” framing, never “bidding”                      | M4           |
| Tracker dies on manual timestamps                     | ADS-B + one-tap links; ≥80% passive target                                                                                              | M7; Law 4    |
| Dispatcher becomes the bottleneck                     | Every gate is approve/adjust; AI drafts all artifacts                                                                                   | Law 3        |
| Email-intake robocall carries data by voice           | AI creates the Draft trip; the call is only the alarm                                                                                   | M2           |
| Quoting physically impossible trips                   | Payload = MTOW − fuel; duty-day flag; hazmat willingness; FBO hours in filters                                                          | M3           |
| Part 295 / FET missteps at speed                      | Pax-only 295 disclosure auto-attached at acceptance; carrier unnamed everywhere else; effective-dated tax tables; MTOW-driven exemption | M5; §6       |
| Stale availability data poisons estimated quotes      | Fleet Radar position + last-flew inference; staleness timestamps; confidence bands widen with age; confirm-on-ping                      | M13/M1/M3    |
| Client concentration (\~95% one client)               | Portal + 5-min quote as the sales demo; lost-quote reasons feed pricing                                                                 | §1; M9/M12   |
| Building a message center nobody joins                | SMS-first threads; custom center only if proven insufficient                                                                            | §7           |
| LADD/blocked tails invisible to ADS-B                 | Thread-parsed check-ins as first-class actuals; last-known position + confirm asks                                                      | M7/M13       |
| Carrier spam filtering kills SMS/robocalls            | A2P 10DLC + STIR/SHAKEN + branded caller ID registered before launch; per-purpose numbers; delivery webhooks                            | §7.3         |
| Rest-clock heuristic mistaken for legal truth         | Advisory chips only; crew swaps invisible to ADS-B; operator remains responsible — the radar just saves wasted offers                   | M13          |

## 11. Decisions Locked (July 14, 2026)

  - **Quote speed targets:** estimated quote instant; hard quote in 5–10 minutes.

  - **Build:** a fresh, standalone application — its own repo and database, nothing inherited; live preview deployments from day one.

  - **Comms:** RingCentral first — existing account, recognized numbers, API SMS + webhooks — behind a thin adapter; Telnyx named for programmable voice (robocalls, press-1 callouts, later voice-AI) when those chunks arrive — not Twilio, whose vetting already rejected a partner account. Orchestration in code; n8n skipped.

  - **Offer flow:** two-step — reply-to-answer availability ping (no links), then trip-specific quote link with auto-ETA for the available.

  - **Missing operator info:** never excludes — NEEDS-INFO flag + collection task; compliance lapses gate booking, not pings.

  - **Stand-downs:** automatic courteous notice to all non-selected responders at booking.

  - **Carrier naming:** unnamed by default everywhere; passenger acceptances auto-attach the required 295.24 disclosure (cargo has no naming requirement).

  - **Client auth:** magic links.

  - **Voice notes:** deferred. **OBC network:** later — data model reserves space. **FET/segment-fee refresh:** internal January task, not in-app.

### Still open

  - **ADS-B data provider** — trial at Chunk 2 (ADS-B Exchange / airplanes.live / FlightAware AeroAPI) with \~20 tails before committing.

  - **Voice-AI vendor** — evaluate at Chunk 5; rides the same Twilio numbers.

  - **Number strategy detail** — per-purpose pool sizing once A2P registration clears.

## 12. Design Language

OnFly OS should look like OnFly: black, gold, and calm. Premium and aviation-grade — an instrument, not a SaaS dashboard. Zero decoration that doesn't carry information.

  - **Palette.** Near-black base \#0C0C0E–\#141414; gold \#C9A227 as the primary accent (light gold \#E3B341 for hovers and highlights); white and cream \#F7F2E3 for text and light surfaces. Never navy.

  - **Dispatcher UI: dark-mode-first.** Dispatch runs 24/7 in dark rooms — dark base, high-contrast type, information-dense but calm. Color carries meaning and nothing else: gold = needs attention / primary action, red = exception or running late, green = on plan. If everything glows, nothing does.

  - **Instrument details.** Monospace for tail numbers, ICAO codes, and times; big scannable tables; the exception queue visually first on the working screen; one timestamp format everywhere (Zulu + local).

  - **Client-facing surfaces: light and premium.** Portal, quote PDFs, ETA sheets, and invoices on cream/white with black headers and gold accents — the same family as OnFly's capability statement and existing client documents.

  - **Language.** Operator-facing: “trip offer” / “availability check,” never “bidding.” Client-facing: “a vetted Part 135 carrier,” unnamed by default.

## 13. Build Notes — Taking This to Code

The handoff list for the build sessions, in order:

  - **Scaffold fresh.** New repo: Vite + React + TypeScript + Tailwind + shadcn/ui; a new Supabase project (Postgres, auth with magic links, edge functions); Vercel with preview deployments. Every push gets a live preview URL in minutes — the see-it-instantly feel, kept. Brand tokens from §12 go into the Tailwind config on day one.

  - **Every external service behind a thin adapter with a mock.** Email, SMS/voice, maps, ADS-B, accounting — one small file each, mock implementation first. The whole system runs and demos on mocks before a single API key exists; connecting the real service later means swapping the implementation and setting an environment variable, not rewiring the app.

  - **The reconnect list (in effort order).** Magic links: built into Supabase Auth, nothing to buy. Drive times: Google Maps key + one endpoint. Email in/out: Resend — outbound in an hour, inbound webhook feeding the M2 parser in about a half-day. SMS/voice: Twilio behind the adapter; start A2P 10DLC + caller-ID registration in parallel (weeks of lead time, zero code). ADS-B: provider trial at Chunk 2 with \~20 tails. QuickBooks: OAuth at Chunk 4 — the fiddliest, budget a full session.

  - **Seed data before features.** When the backend research lands: import the trip history, fleet exports (with the MTOW column per tail — it drives the FET exemption), FBO survey, and block rates; materialize pricing\_priors. Until then the fixture pack stands in, and nothing blocks.

  - **Chunk 1 ticket seeds:** tax\_rates table + engine with §4281 MTOW check; intake form with dims parser; pricing\_priors queries; route candidate generator with flag-don't-exclude filters; quote + ETA-sheet renderer; blind re-quote harness (runs once real trip history is imported — the Chunk 1 definition-of-done test).

  - **Discipline that replaces luck:** feature branches and PR merges even solo; dev/prod environment separation; secrets in env vars, never in git; migrations committed to the repo so the schema's history is the repo's history.

Sources: IRS Form 720 instructions (June 2026 rev.) and NATA 2026 FET rates for §6 figures; 14 CFR Part 295 / 295.24 (passenger charter broker disclosures) and Part 296 (indirect air transportation of property) for §6.2 scope; 14 CFR 135.267 for crew rest/duty limits. Fleet, pricing, and trip figures from OnFly's Fleet & Compliance Master and 2024–2026 trip financials.
