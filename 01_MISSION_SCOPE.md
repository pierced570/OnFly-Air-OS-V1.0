# OnFly OS — Mission & Scope

## The mission

Build the operating system for on-demand, time-critical freight: **estimated quotes instantly, hard quotes in 5–10 minutes, door to door.** One dispatcher runs ten concurrent trips per shift and hands off with a login. Every party — crew, FBO, truck driver, charter ops, client — sees the same live picture. The goal is to beat Ascent and ACS on speed of answer, price sharpness, live transparency, and ease of request — and the unfair advantage is data: OnFly already knows what trips cost before asking any operator.

## The five design laws (settle every argument against these)

1. **Two-speed quoting.** Instant estimate from OnFly's own data (424-trip pricing priors, block rates, Fleet Radar position data, FBO fees, drive times). Hard quote at T+5–10 min when operators confirm through the two-step offer flow. The client's answer never waits on an operator's reply.
2. **One Trip spine.** Quote PDF, ETA sheet, load manifest, client tracker, invoice, shift briefing — all generated views of a single Trip object (state machine + ETA chain + append-only event log). Nothing authored twice.
3. **Approve, don't enter.** AI drafts everything (parsed requests, operator shortlists, messages, markups, ETA chains); the dispatcher taps approve/adjust. Every gate is an approval, never data entry.
4. **Passive actuals.** Timestamps arrive without typing: ADS-B wheels up/down, trip-thread texts parsed automatically ("wheels up" becomes a logged actual), one-tap links, calls last. If humans transcribe timestamps, tracking dies.
5. **Route to the role.** Notifications go to "the on-shift dispatcher"; the system resolves who that is. 100% of trip state lives in the system — handoff is a login plus a generated briefing.

## The trip lifecycle (the state machine)

Draft → Routed → Quoted-Estimated → Offers Out → Quoted-Hard → Booked → In Progress → Delivered → Invoiced → Closed (branches: Lost, Cancelled). Full state table in the blueprint §3.1. Every artifact and automation hangs off a state or an ETA-chain checkpoint.

## All the parts (13 modules)

- **M1 Network Database** — operators, 420-aircraft fleet, FBOs/airports, contacts, clients + client_rules, block rates, availability. Guided add-wizards (see M-wizards below).
- **M2 Intake** — four doors (phone form, email parser, text parser, portal), near-zero typing, dims parser. AI drafts the trip; a call/text is only the alarm.
- **M3 Route & Pricing Engine** — candidate routings (airports × aircraft × truck legs), hard filters only for physical impossibility, **flag-don't-exclude** for missing data, score on cost + time, output Cheapest / Fastest / Best with confidence.
- **M4 Trip Offers** — two-step: availability ping (reply 1/AVAILABLE — no links) → trip-specific magic link (time-to-position auto-shows ETA, live leg, price NET, wait). Fast responders earn first look. Stand-downs at booking. Never the word "bid" operator-facing.
- **M5 Quote Composer & Tax Engine** — markup ($ or %), table-driven FET (2026: cargo 6.25%, pax 7.5% + $5.30/segment, intl $23.40; §4281 MTOW ≤ 6,000 lb exemption), carrier unnamed, pax 295.24 disclosure at acceptance.
- **M6 Booking & Confirmation** — accept link → confirmations to all parties, stand-downs to the rest, thread spin-up, docs generated, AP + supply-chain lists notified.
- **M7 Execution Tracker** — ETA chain live, est vs actual per leg, actuals cascade (ADS-B → thread parsing → one-tap → manual), checkpoint tasks (truck T-30/T-5, aircraft T-60/T-30), slippage recompute + exception queue.
- **M8 Trip Comms** — the group chat that's really a relay: dedicated number per trip, membership from assignments + manual add (name/role/cell), fan-out with sender prefix, MMS/POD relay, one operator per thread, transcript = event log.
- **M9 Client Portal** — magic links, live tracker, docs, full request form (pax/cargo, pieces L×W×H/weight/stackable, locations, A2A/D2D, deadline, hazmat, declared value) feeding M2.
- **M10 Documents & Billing** — generated manifest, ETA sheet, quote PDF, QuickBooks invoices, charter agreement. Documents are renders of trip state.
- **M11 Shift Ops** — on-shift selection binds role→person→phone; login generates the briefing; the exception queue is the working surface.
- **M12 Intelligence** — timed WX/NOTAM briefs (booking, T-3h, T-1h), operator scorecards, win-rate-by-margin analytics, est-vs-actual efficiency.
- **M13 Fleet Radar** — ADS-B tracking of all ~470 network tails: position, in-position vs base, last-flew → crew rest heuristics (135.267: 10 hr rest / 14 hr duty), availability confidence. Advisory chips, never legal determination.
- **M-wizards (admin)** — Add Operator (upload D085 → parse tails → prefill specs from type library → per-tail insurance + expiry), Add Client (rules interview), Add FBO (survey walk). Completeness score + NEEDS-INFO tasks.

## Scope boundaries

In scope: everything above, US-first (data model reserves international/customs leg types). Out of scope for now: OBC network, customs workflows, voice notes, custom message center, jet-card/membership billing. **The kill rule: if a proposed feature is not a view of the Trip spine or one of these modules, it stays out.**

## What done looks like

A request arrives by any door → estimated quote with ETA sheet leaves in under a minute → hard quote inside 10 → accept link → every party confirmed + threaded automatically → the trip tracks itself (dispatcher touches only exceptions) → invoice fires from QuickBooks at delivery → the client watched the whole thing live on their portal → the scorecards got smarter. Ten of those at once, one dispatcher, calm screen.
