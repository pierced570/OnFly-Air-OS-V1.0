# OnFly OS

Operating system for OnFly Air — time-critical air charter brokerage.

**Start here:** [docs/README_START_HERE.md](docs/README_START_HERE.md)

| Path | Contents |
|------|----------|
| `docs/` | Briefing, mission scope, blueprint, and build chunks |
| `data/` | Fleet seed CSV |
| `.cursor/rules/onfly.mdc` | Always-on Cursor constraints |
| `src/` | Vite + React + TypeScript app (Chunk 1+) |
| `supabase/` | Migrations and edge functions |

Build order: Chunk 1 Foundation → Chunk 2 Quote Engine → … → Chunk 7 Intelligence.
