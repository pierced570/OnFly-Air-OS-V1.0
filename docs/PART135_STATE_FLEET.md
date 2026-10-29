# Part 135 State Fleet Browser

Network → Operators → **View by state**.

Dispatchers open a state and see every Part 135 operator that flies metal
OnFly uses, with OnFly-approved operators first. Expand an operator for tails.

## Screen (prototype parity)

1. **Header + stats band** — unfiltered pack totals (49 states / 1,244 ops /
   5,310 tails / 413 approved tails).
2. **Your network by state** — approved roster table (CSV export, 52 rows).
3. **State rollup** — unfiltered per-state operator / tail / approved counts.
4. **State by state** — sticky filters + accordion (gold approved band first).
5. **Foot caveats** — FSDO / non-FAA / state_conflict / M/M/S categories.

## Data pack

Primary source: nested JSON `states → operators → aircraft`.

| Key | Meaning |
|-----|---------|
| `faa_cert` | Operator key (stable 4-char FAA designator) |
| `tail` | Aircraft key (N-number) |

Bundled fixtures:

- `src/fixtures/part135_fleet_by_state.json` — full FAA + OnFly pack
- `src/fixtures/part135_approved_network.json` — 52-row approved CSV export
  (same columns as `onfly_approved_operators_by_state.csv`)

Do not re-derive from the FAA file in-app — the pack already carries
classification and OnFly flags. Refresh: regenerate externally, drop new files
over the fixtures, redeploy.

## Caveats (surfaced in UI)

- `state_source == "fsdo_estimate"` → italic *FSDO estimate* (confirm address).
  FSDO multi-state offices can misplace an operator’s state.
- Four approved operators are not on the FAA Part 135 holder list as named
  (45 North, Daniel LaMontagne, Jet Nexa, Zanesville); ENG Aviation (T4BA)
  flies on Thunderbird Airways’ cert and is also absent as ENG. They appear
  only via the approved-network CSV.
- Rows with `state_conflict == CHECK` have a verified address in a different
  state than the network base (Ameristar MI/TX, Aery OH/VA, American Jet
  Charter OK/MO, Ace PA/DE, Gem Air UT/ID) — confirm before pinging.
- Aircraft categories come from make / model / series mapping in the pack.
- Hide jet-card / broker / defunct is **on** by default (never drops approved).
- Hide AK / HI / PR is **on** by default.

Language: dispatchers send a **trip offer** / availability check — never “bid”.
