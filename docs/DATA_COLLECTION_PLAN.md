# OnFly Data Collection Plan — July 14, 2026

State of the aircraft master (420 tails, 47 operators): specs, MTOW, FET status, doors, cabins — **100% filled**. What remains splits three ways: things Claude can fill, things only the team can get, and two datasets that don't exist yet.

## Sprint-critical — needed by Day 5 (the data gate)

These four unblock the instant-quote engine; everything else can trail in.

1. **Block rates from the top 15 operators.** The single highest-value ask. Per operator: $/hr or $/NM by aircraft type, wait-time policy (free hours, then $/hr), after-hours callout premium, holiday premium. Get it however they'll give it — email, phone note, photo of a rate sheet. This powers the instant estimate on types with no trip history (Beech 99, 1900, Metroliner, PC-12, Brasilia, Lear 45, SAAB 340 — 128 aircraft currently have no rate at all).
2. **Confirm the flagged assumed bases** (~12 operators where base was inferred from area code or address: SkyLife, Air Travel Mgmt, Ace, Royal, Priority, Kentucky Airmotive, Sweet, American Jet, PlaneSmart, Speed, AirNet, IFL). One question per operator: "Where do your planes actually sit?" Ameriflight's 110 tails are genuinely floating — skip them; the router treats Ameriflight as quote-on-ask.
3. **SMS/call consent + preferred contact.** One line added to every operator conversation: "We're moving trip offers to text — best cell for offers? OK to text and auto-call?" Log name, cell, channel preference, after-hours number. This is TCPA hygiene AND the two-step offer flow's contact list.
4. **The 8 TBD tail numbers** (45 North + a few small operators) — one email each.

## Team collects — post-sprint, in value order

5. **Cargo vs pax per tail for mixed operators** (164 blank; concentrated: Royal 35, Castle 12, Axio 11, Avcenter 7, Ameristar 7, Sonrise 6). Ask: "Which tails are freighters, which fly people, which do both?"
6. **Crew capability per operator** (0% filled): single-pilot vs dual, night ops policy, typical crew callout time. Feeds client_rules matching (dual-pilot-for-pax clients) and the rest-clock logic.
7. **Cargo conversion realities per tail:** for converted freighters (Royal's King Airs, the Caravans, Metros), confirm actual cargo door dims, floor loading, net/strap config. Published specs assume factory config — conversions differ, and this is what kills a load at the FBO.
8. **Availability rhythm per operator:** how will they report availability — standing weekly sheet, or confirm-on-ping? Who answers at 2 AM? (Fleet Radar covers position; this covers intent.)
9. **Per-tail insurance limits** (liability/hull, 0% filled) — pull from the COIs already on file as they come in; feeds the declared-value check, not just compliance.

## New datasets to stand up (team calls, Claude preps the call sheets)

10. **FBO survey** — the FBOs & Airports tab already has the 100-airport skeleton ranked by your traffic (KCAK, KDAY, KCVG, KCLT, KGSP first). Per FBO: 24hr? forklift + capacity? GL insurance + coverage $? handling/ramp/overnight/callout fees? fees waived with fuel? after-hours phone. ~10 calls/day = done in 2 weeks alongside the sprint.
11. **Ground handlers + hotshot trucking** near the top 20 airports: company, dispatch number, 24hr?, liftgate/forklift, cargo van vs box truck vs flatbed, insurance, rate structure ($/mi + minimums), COI on file. This is the truck leg of every D2D quote — start with the ones you already use.
12. **Client contacts + rules** (PMNY, not team): per client — requester emails/numbers (intake triggers), AP contacts (invoices), supply-chain list (tracker), and hard rules (dual pilot, multi-engine only, no single-engine night, hazmat).

## Claude fills — say the word

- **Assumed market rates** for the 128 aircraft with no rate history (type-level $/hr ballparks, clearly flagged "market assumption — replace with block rate"). Unblocks quoting on those types Day 1; block rates replace them as they arrive.
- **Seats by type** where blank and pax-configured (flagged assumption).
- **FBO directory prefill** for the top 100 airports: FBO names, phones, claimed 24hr status from public sources — so the team's survey calls start from a filled sheet instead of Google.
- **Airport time zones + coordinates** for every ICAO in the system (auto, feeds the ETA chain).
- **Ground-handler candidate lists** near top airports from public directories — team verifies and rates them.
- **Call sheets + scripts** for items 10–11 (the FBO survey script and the block-rate ask script, one page each).

## What Claude cannot fill (don't waste the ask)

Anything that lives in an operator's head or filing cabinet: real block rates, crew policies, conversion specs, consent, availability habits, FBO fee truth (websites lie; the survey call is the source). That's exactly why the team list above exists.
