# Part 135 State Fleet Browser

Network → Operators → **View by state**.

Dispatchers open a state and see every Part 135 operator that flies metal
OnFly uses, with OnFly-approved operators first. Expand an operator for tails.

## Data pack

Primary source: nested JSON `states → operators → aircraft`.

| Key | Meaning |
|-----|---------|
| `faa_cert` | Operator key (stable 4-char FAA designator) |
| `tail` | Aircraft key (N-number) |

Bundled acceptance fixture: `src/fixtures/part135_fleet_by_state.json`
(49 states · 1,244 operators · 5,310 tails · 413 OnFly-approved tails).

OnFly desk export: `src/fixtures/part135_approved_network.json` (52 rows).
The “Your network by state” table merges this CSV with the FAA pack so five
operators not named on the FAA Part 135 holder list still appear (Jet Nexa,
Daniel LaMontagne, Zanesville Aviation, 45 NORTH AVIATION, ENG Aviation /
T4BA on Thunderbird Airways).

**To refresh the pack**, replace the fleet JSON fixture with a regenerated
export. Do not re-derive from the FAA file in-app — the pack already carries
classification and OnFly flags. Refresh the approved CSV the same way.

## Caveats (surfaced in UI)

- `state_source == "fsdo_estimate"` → italic *FSDO estimate* (confirm address).
- FSDO multi-state offices can misplace an operator’s state.
- Four approved names are not on the FAA 135 list as named; ENG Aviation
  (T4BA) flies on Thunderbird Airways’ cert.
- Rows with `state_conflict = CHECK` have a verified address in a different
  state than the network base.
- Aircraft categories come from make / model / series in the pack, not
  operator config.
- Hide jet-card / broker / defunct is **on** by default (never drops approved).
- Hide AK / HI / PR is **on** by default.
