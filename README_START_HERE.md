# OnFly OS — Cursor Build Package

**How to use this folder.** Everything Cursor needs, in upload order. The build: Cursor writes code → push to GitHub → Vercel auto-deploys → Supabase (linked to Vercel) runs the database + edge functions.

## One-time setup (before any chunk)

1. Create an empty GitHub repo `onfly-os` (private). Clone it. Open the folder in Cursor.
2. Copy into the repo:
   - `docs/` ← `00_ONFLY_BRIEFING.md`, `01_MISSION_SCOPE.md`, `OnFly_OS_Blueprint.md`, all `CHUNK_*.md` files
   - `data/` ← `OnFly_Aircraft_Master_Flat.csv`
   - `.cursor/rules/onfly.mdc` ← contents of `cursor_rules_onfly.md` (this makes the core constraints apply to every Cursor conversation automatically)
3. In Cursor, open Agent mode and start with:
   > Read docs/00_ONFLY_BRIEFING.md, docs/01_MISSION_SCOPE.md, and docs/OnFly_OS_Blueprint.md in full. Then read docs/CHUNK_1_FOUNDATION.md and implement it completely. Work through it top to bottom, commit in small steps, and stop when you reach the acceptance checklist — run through it and show me the results.

## Chunk order

| File | Builds | Depends on |
|---|---|---|
| CHUNK_1_FOUNDATION.md | Scaffold, schema, state machine, CSV importer, fixtures | — |
| CHUNK_2_QUOTE_ENGINE.md | Tax engine, ETA chain, intake, routing, instant quote | 1 |
| CHUNK_3_OFFERS_BOOKING.md | Comms adapter (RingCentral), two-step offers, hard quote, booking, stand-downs | 2 |
| CHUNK_4_EXECUTION.md | Live tracker, trip group threads, keyword parsing, checkpoints, exceptions | 3 |
| CHUNK_5_PORTAL_MONEY.md | Client portal + request form, QuickBooks invoicing, manifests | 4 |
| CHUNK_6_ADMIN_WIZARDS.md | Add Operator (D085 parse), Add Client (rules interview), Add FBO | 2 (can run parallel to 3–5) |
| CHUNK_7_INTELLIGENCE.md | Fleet Radar (ADS-B + rest clocks), WX/NOTAM, scorecards, shift briefing, robocalls | 4 |

Feed Cursor **one chunk file at a time**. Each chunk ends with an acceptance checklist — do not move to the next chunk until every box passes on the deployed Vercel preview.

## The deployment loop

- `git push` to a feature branch → Vercel builds a preview URL automatically. Merge to `main` → production deploy.
- Database changes ship as migration files in `supabase/migrations/` — apply with `supabase db push` (CLI, linked project) or paste into the Supabase SQL editor. Never edit the schema by hand in the dashboard without writing the migration file.
- Edge functions live in `supabase/functions/<name>/` — deploy with `supabase functions deploy <name>`. Webhooks (RingCentral, email inbound, one-tap links) all terminate at edge functions.
- Secrets: Vercel env vars for the frontend (`VITE_*` only — nothing sensitive), Supabase secrets (`supabase secrets set`) for edge functions. `.env.example` documents every variable; real values never committed.

## Non-negotiables (also in the Cursor rules file)

Every external service behind a thin adapter with a mock (the app must demo fully with zero API keys). All state changes through the Trip state machine — no direct status writes. Store UTC only; IANA zones per location. Missing data flags records (NEEDS-INFO), never excludes them. Operator-facing copy says "trip offer," never "bid." Brand: black `#0C0C0E–#141414`, gold `#C9A227`, cream `#F7F2E3`, never navy; dispatcher UI dark-mode-first.

## Parallel human tasks (not Cursor's job)

Check RingCentral admin for existing TCR/A2P SMS registration · collect block rates / bases / consent per `DATA_COLLECTION_PLAN.md` · QuickBooks developer app + OAuth creds (needed at Chunk 5) · pick ADS-B provider trial (Chunk 7).
