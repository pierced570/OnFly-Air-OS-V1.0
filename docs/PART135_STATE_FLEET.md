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

Bundled acceptance fixture: `src/fixtures/part135_fleet_by_state.json`.

**To load the full reviewed pack**, replace that fixture with
`part135_fleet_by_state.json` from the prototype folder (or copy it to the
same path). Do not re-derive from the FAA file in-app — the pack already
carries classification and OnFly flags.

Refresh: regenerate the pack externally, drop the new JSON over the fixture,
redeploy.

## Caveats (surfaced in UI)

- `state_source == "fsdo_estimate"` → italic *FSDO estimate* (confirm address).
- Hide jet-card / broker / defunct is **on** by default (never drops approved).
- Hide AK / HI / PR is **on** by default.
