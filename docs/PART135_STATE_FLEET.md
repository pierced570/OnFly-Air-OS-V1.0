# Part 135 State Fleet Browser

Network → Operators → **View by state**.

Dispatchers open a state and see every Part 135 operator that flies metal
OnFly uses, with OnFly-approved operators first. Expand an operator for tails.

Language: dispatchers send a **trip offer** / availability check — never “bid”.

## Screen (prototype parity)

1. **Header + stats band** — unfiltered pack totals (49 states / 1,244 ops /
   5,310 tails / 413 approved tails).
2. **Your network by state** — approved roster table (CSV export, 52 rows).
3. **State rollup** — unfiltered per-state operator / tail / approved counts.
4. **State by state** — sticky filters + accordion (gold approved band first).
5. **Foot caveats** — FSDO / non-FAA / state_conflict / M/M/S categories.

## Data pack (29 Oct 2026) — INTERNAL

| File | One row per | Use it for |
|------|-------------|------------|
| `part135_fleet_by_state.csv` | tail (5,310) | every piston / turboprop / VLJ / light jet / cargo-specialist tail on a Part 135 cert, with state + OnFly flags |
| `part135_operators_by_state.csv` | operator per state (~1,200) | state-by-state operator picker; category counts, workhorse types, fleet summary |
| `part135_state_rollup.csv` | state | headline counts per state |
| `part135_fleet_by_state.json` | nested `{states: {ST: [operator{aircraft:[…]}]}}` | same data, app import |
| `onfly_approved_operators_by_state.csv` | approved operator (52) | OnFly network from the 29 Oct 2026 approved-operators export, by state, with FAA cert cross-reference |

Bundled in-app:

- `src/fixtures/part135_fleet_by_state.json` — full FAA + OnFly pack
- `src/fixtures/part135_approved_network.json` — 52-row approved CSV
  (same columns as `onfly_approved_operators_by_state.csv`)

Do not re-derive from the FAA file in-app. Refresh: regenerate externally,
drop new files over the fixtures, redeploy.

### Keys

| Key | Meaning |
|-----|---------|
| `faa_cert` | Stable 4-char FAA designator (operator key) |
| `tail` | N-number (aircraft key) |
| `state_source` | `onfly_approved_base` · `operator_base_lookup` · `fsdo_estimate` |
| `onfly_status` | `approved` · `prospect` · `skip_jetcard_fractional` · `skip_broker_nonop` · `skip_defunct` · `air_medical` · `unclassified` |
| `category` | `SEP` · `MEP` · `SET` · `MET` · `VLJ` · `Light Jet` · `CARGO` |
| `workhorse` | Types OnFly runs most (310/340/402/404/414/421, Baron 58, King Air 90/100/200, Navajo, Cheyenne, Aerostar, MU-2, Caravan, PC-12, Metroliner, Beech 99/1900, Falcon 20, Lear 35/36) |

Sort in the CSV: state → OnFly-approved first → category
(MEP, MET, SET, Light Jet, VLJ, CARGO, SEP) → workhorse first → operator →
type → tail.

### Left out (6,209 tails)

Helicopters, drones, midsize+ business jets (Citation XLS/Sovereign/Latitude/X,
Challenger, Global, Gulfstream, Falcon 50/900/2000/7X, Hawker 800+, Lear 55/60,
Legacy/Praetor, ERJ/CRJ), and rows with no aircraft type on the certificate.
Midsize+ jets are kept only when the type is a cargo specialist (`CARGO`).

### Caveats (surfaced in UI)

- DC-9s, 727s and other Part 121 freighters are not in this pack (Part 121
  supplemental). One 737-200 shows up under 121/135.
- `state` for `fsdo_estimate` rows is the FSDO’s state. Multi-state districts
  (Portland ME → NH, Philadelphia → DE/S. NJ, Albuquerque → El Paso, etc.)
  misplace some operators. **1,219 of 5,310** rows use this.
- Four approved operators are not on the FAA list under any matching name or
  tail: **45 North Aviation**, **Daniel LaMontagne**, **Jet Nexa**,
  **Zanesville Aviation**. They appear only in the approved CSV with
  `in_faa_135_list = no`. **ENG Aviation** uses tails on Thunderbird Airways’
  cert (`cert_note` / T4BA) and is also absent as ENG.
- `state_conflict = CHECK` marks operators whose listed base and verified
  address are in different states (Ameristar MI/TX, Aery OH/VA, American Jet
  Charter OK/MO, Ace PA/DE, Gem Air UT/ID) — Pierce to rule.
- Aircraft categories come from the M/M/S code, not how a tail is configured.
- Hide jet-card / broker / defunct is **on** by default (never drops approved).
- Hide AK / HI / PR is **on** by default.

### Sources

FAA certificated aircraft operators — legal Part 135 holders (xlsx, Oct 2026) ·
OnFly approved-operators export 2026-10-29 · OnFly Operator Master Database
(base lookup + USING/PROSPECT/SKIP) · OnFly Fleet Compliance Master Trip Log
(flown types, Jan 2024–Jul 2026).
