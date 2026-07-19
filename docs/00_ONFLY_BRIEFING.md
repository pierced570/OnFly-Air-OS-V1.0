# OnFly Air — Company Briefing

> INTERNAL — CONFIDENTIAL. This doc contains real client names and financials. It exists so the AI building OnFly OS understands the business. Never surface these specifics in client-facing UI copy, marketing strings, or public repos.

## What OnFly Air is

OnFly Air LLC (Delaware LLC, est. 2024, HQ Buckner, KY) is an **air charter broker and time-critical logistics coordinator**. When a freight or passenger movement absolutely cannot wait — an airliner grounded for a part (AOG), a production line down, a medical shipment — OnFly finds the right Part 135 charter aircraft, arranges trucking on both ends, and manages the movement door to door. OnFly does **not** own, operate, crew, or dispatch aircraft and never exercises operational control; it arranges, vets, and monitors. That broker status shapes legal language everywhere (see blueprint §6.2).

## The team (5 people)

Pierce Demetriades (CEO, 50%) — sales/ops, airline pilot background. Paige Miller (Co-Founder, 50%) — key accounts. Ben Miller — Director of Charter Ops & Dispatch. Chris Hewitt — dispatch. Austin Ouellette — bizdev/sales. 24/7 dispatch line: 858-529-7860. Everyone wears multiple hats; dispatchers work other jobs off-hours. **This is why OnFly OS exists: the system must let one dispatcher run ~10 concurrent trips and hand off a shift with a login.**

## The business by the numbers (trailing 12 months, mid-2026)

- Revenue ~$2.38M, projecting $3M. ~$544K lifetime margin on $4.38M invoiced since 2024 (~12.4% avg — target 15%+).
- 400+ documented missions since Jan 2024; 2024→2025 growth +57%; May 2026 busiest month ever (28 missions).
- Median mission ~$8,900; average ~$10.3K; range $3.5K–$58K.
- ~95% of missions are ASAP/time-critical. Average call-to-wheels-up under 2.5 hrs (record: 45 minutes).
- Fleet mix flown: 72% piston twin, 24% turboprop, 4% jet. Cheap light twins (C310s, Barons, Aerostars) are the bread and butter — and most are under 6,000 lbs MTOW, meaning **FET-exempt** (a real pricing edge the tax engine must exploit).
- Client concentration: **PSA Airlines ≈ 86%** of revenue; then Endeavor Air, Kalitta, Trans North, Manning Warren, Piedmont. Concentration is the #1 business risk — OnFly OS's client portal and instant quoting are also the sales weapon to diversify.
- International so far: rare (a few Canada trips, one St. Kitts) — data model supports it, features can wait.

## The operator network

~48 approved/working operators inside a mapped universe of 1,117 CONUS Part 135 certificate holders; 61 operators flown in the last 12 months. Top operators by volume: Sonrise Aviation, Axio, Executive Shuttle (Skys The Limit), Air Z Flying Service / Patriot (Miller Aviation). Data: 420 aircraft catalogued with full specs (see `data/OnFly_Aircraft_Master_Flat.csv`) including per-type door/cabin dims, payload, MTOW, and per-tail cost history where flown. Real trip history: 424 priced trips with true operator cost per NM over the full circuit (base→pickup→dest→base), by type, operator, and tail. Known cost curves (median circuit $/NM → est $/hr): C310 $6.48→$1,166 · Baron 58 $6.49→$1,233 · Aerostar $5.74→$1,234 · King Air 90 $9.13→$2,054 · King Air 200 $13.32→$3,596 · Falcon 20 $10.14→$4,361. Operator price differences are known (e.g., Miller ~8% under type median on C310s; Sonrise ~8% over). **This proprietary cost data is the moat — it's what lets OnFly quote instantly without calling anyone.**

## How a trip works today (the manual process being replaced)

Client calls or emails dispatch → dispatcher scribbles details → calls 3–6 operators one at a time for availability and price → waits → assembles a quote in email, adds markup and tax by hand → client accepts by email → dispatcher calls everyone back to confirm → tracks the trip by phone calls and group texts they create manually → writes ETA updates to the client → invoices through QuickBooks → files everything in spreadsheets. Quotes take 15–30+ minutes of calling; tracking eats a dispatcher alive; nothing is systematized. Every artifact (quote, ETA sheet, manifest, invoice) is authored by hand.

## Operating relationships & tools in use

RingCentral = company phone system (dispatch line, recognized numbers; has a developer API — this is the first comms transport). QuickBooks = invoicing + card processing (Chunk 5 integration). JotForm Sign = contracts today. Google Workspace on onflyair.com (+ onflyreach.com domain). Compliance posture: operator vetting = FAA 135 tail check + charter cert + OpSpec D085 + COI collection (in progress — COIs on file for Sonrise, Patriot/Miller, Axio). Insurance applications (Starr non-owned liability, AeroPRO professional liability) in submission as of July 2026.

## Language and positioning rules (bake into all UI/customer-facing copy)

- Positioning: "time-critical air logistics" — not just airline AOG. Target verticals: defense/aerospace manufacturing, advanced manufacturing (auto/EV/semiconductor — line-down = millions/day), life-critical (medical/organs/clinical), UHNW/executive.
- Public numbers: "500+ vetted operators" (never the raw counts), "400+ missions since 2024." Never name clients in anything client-visible or public.
- **Never** describe operators as "bidding" or "competing" anywhere they can see — OnFly "hand-selects the operator best positioned for the mission." Internal tools may say offers/responses.
- Carrier names are not disclosed on quotes by default ("operated by a vetted Part 135 carrier"); passenger charters auto-attach the required 14 CFR 295.24 disclosure at acceptance (cargo has no such requirement — Part 296).
- Brand: black + gold + cream (exact tokens in the blueprint §12). Premium, aviation-grade, calm. Never navy.

## Why the last system failed

The previous internal tool grew into 20 disconnected features (CRM, content approvals, referral tracking...) with no spine. The lesson is the core design law of OnFly OS: **everything is a view of one Trip object.** If a feature isn't a view of the Trip spine or one of the 13 modules in the blueprint, it doesn't get built.
