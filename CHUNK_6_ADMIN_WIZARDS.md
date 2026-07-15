# CHUNK 6 — Admin Wizards: Add Operator (D085), Add Client, Add FBO

**Objective:** adding network records is a guided interview, never a blank table. The operator wizard parses an uploaded D085 into aircraft rows with specs prefilled. Every wizard ends with a completeness score and NEEDS-INFO tasks for whatever was skipped. (Can build in parallel with Chunks 3–5; requires Chunk 2's type_specs + needs_info machinery.)

## 1. Wizard framework (build once, use three times)

`src/components/wizard/`: multi-step shell — progress rail, per-step validation (zod schemas), skip-with-flag on any non-required field (skipping writes a `needs_info_tasks` row), summary step with **completeness score** (% of fields filled, gold ring visual) and the task list of gaps. Saves draft state per step (resume later). All three wizards are configs over this shell.

## 2. Add Operator

Steps:
1. **Identity** — legal name, DBA, certificate number, base ICAO (typeahead from airports), region.
2. **Contacts** — repeating rows: name, role (ops/owner/pilot/after-hours), cell, email, preferred channel, **consent checkboxes: "OK to text trip offers" / "OK to auto-call"** (writes consent_sms/consent_call — the comms ladder refuses channels without consent), quiet hours, 24hr flag.
3. **Capabilities** — cargo/pax/both, hazmat willing, medivac, 24hr ops, typical callout minutes, service area notes.
4. **Crew policy** — single-pilot OK?, dual crews available?, night policy.
5. **D085 upload** — see below; creates the fleet.
6. **Per-tail insurance** — for each created aircraft: liability limit, hull value, **expiry date** (drives compliance: expiry within 30 days → gold alert; past → `bookingGated`). COI PDF upload per operator → `documents(kind='coi', expires_on)`.
7. **Rates** — block rates per type if known (writes `rates_block`); skip = NEEDS-INFO task "get block rates."
8. **Summary** — completeness score, task list, Save.

### D085 parsing (edge function `parse-d085`)

The FAA OpSpec **D085 is the certificate's aircraft listing** — one row per authorized aircraft: registration (N-number), serial, make/model. Pipeline:
1. Upload PDF → Supabase storage → `documents(kind='d085', operator_id)`.
2. Extract text (`pdf-parse`/`unpdf` in the edge function). D085s are text-based; if extraction yields <50 chars (scanned), fall back to LLM-vision via `LlmAdapter` (page images → structured rows) — mock returns fixture rows in dev.
3. Parse rows: regex `N[0-9]{1,5}[A-Z]{0,2}` for tails + adjacent make/model strings; normalize model names against `type_specs.type_name` using the same alias map as the CSV importer (BE-58/Baron/B58 → Baron 58 etc. — extract that map into `src/domain/typeAlias.ts`, shared).
4. Review table (law 3 — approve, don't auto-commit): parsed tail | matched type | spec prefill preview | conflict flags (tail already exists under another operator; unknown type → manual type pick + NEEDS-INFO "verify specs").
5. Confirm → upsert `aircraft` rows: specs (door/cabin/payload/MTOW/cruise/range/seats) prefilled from `type_specs`, `spec_source='published typical — via D085 wizard'`; **cargo conversions**: if operator capabilities = cargo and type is a known conversion candidate (King Airs, Caravans, Metros, Navajos), auto-add NEEDS-INFO "verify cargo door dims + floor config per tail."

## 3. Add Client — the rules interview

Conversational one-question-per-screen flow (fast, keyboardable):
1. Company + billing terms + QB customer link (search existing QB customers via adapter, or create later).
2. **Crew rule** — "Two pilots required, or is single-pilot OK?" (dual_pilot_required)
3. **Payload** — "Freight only, or passengers too?" (freight_only)
4. **Aircraft constraints** — multi-select: multi-engine only · single-engine OK only if turboprop · no single-engine at night · category minimums (free rule rows → other_rules jsonb, rendered as filter chips)
5. **Hazmat** — allowed? notes.
6. **Declared value** norms + insurance expectations.
7. **People** — repeating contact rows with role: requester (⚠ these emails/numbers arm the intake triggers — show that warning), AP, supply_chain; notify prefs per contact (wheels-up/down/POD pushes on/off).
8. Summary + score. Saved rules render as chips on every future quote screen for this client; the route engine enforces them from the next trip.

## 4. Add FBO

Airport-first: pick/search ICAO (create airport row if new — auto lat/lon/tz) → FBO fields in survey order: name, phone, after-hours phone, 24hr?, forklift? + capacity lbs, GL insurance? + coverage $, fees (handling/ramp/overnight/callout), fees-waived-with-fuel?, notes, **last_verified auto-set today**. Multiple FBOs per airport supported; the route engine prefers 24hr + forklift + insured on cargo trips (already in Chunk 2 scoring — verify the wiring here).

## 5. NEEDS-INFO task surface

`/admin/tasks`: all open `needs_info_tasks` grouped by entity, one-tap "resolve" opens the exact wizard step prefilled. The Data Collection Plan's team workflow lives here — this page is what the team works through daily.

## Acceptance checklist

- [ ] Add Operator end-to-end with a real D085 PDF: tails parsed, types matched, review table shown, aircraft created with prefilled specs + conversion flags; re-upload same D085 → zero duplicates
- [ ] Skipping insurance on one tail creates a task; setting an expiry in the past booking-gates that tail in the compare view (Chunk 3 wiring)
- [ ] Client interview produces client_rules that visibly filter the next quote's candidates (test: dual-pilot client excludes single-pilot-only operators)
- [ ] Requester contact added → their email immediately triggers the intake watcher (Chunk 2 wiring)
- [ ] FBO added with forklift+24hr floats to the top of airport choice on a cargo test trip
- [ ] Every wizard shows a completeness score; /admin/tasks lists and resolves gaps
