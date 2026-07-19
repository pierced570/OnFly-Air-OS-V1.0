# Wire order — what to knock out next

Decisions locked from ops:

- **Yes:** QB, Resend, domain + Vercel, Supabase Storage, Google Maps, live ADS-B, NOTAMs (plain English via Claude), Claude LLM, portal auth (ETA/updates/contacts — **no pricing**), D085 AI-parse + human verify, tax AI + priors, Telnyx (patch in), RC if needed for native SMS.
- **Defer:** Chromium PDF (print-CSS is fine until branded PDFs matter), heavy TCPA/quiet-hours (24/7 B2B — keep consent flags on contacts, skip quiet-hour engine for now).

**Chromium** = headless browser used later to turn HTML quotes into PDF files. Not a product you install for users.

---

## Knock-out order (importance × dependency)

| # | Work | Why this slot | Needs from you |
|---|------|---------------|----------------|
| **1** | **Supabase Storage** + portal track (no price) | Unblocks docs + client visibility; keys already in env | Apply migration |
| **2** | **Persist trips/operators/docs** to Supabase | Everything else is fake without a system of record | — |
| **3** | **Domain + Vercel** | Real URLs for portal + email links | DNS + Vercel project |
| **4** | **Resend** | ETA / COI / quote / invite email that actually sends | **DONE** edge deployed · `EMAIL_FROM=info@onflyair.com` · flip `VITE_EMAIL_ADAPTER=real` |
| **5** | **LLM adapter** | Powers intake extract, NOTAM plain English, tax assist | **Re-target to Claude** — OpenAI was interim only; source `ANTHROPIC_API_KEY` |
| **6** | **D085 AI parse → verify UI** | Operator onboarding quality | Needs Claude |
| **7** | **Maps / drive times** | Real drive times in ETA chain | **DONE (Mapbox)** — Google Maps not required |
| **8** | **Live ADS-B** | Required fleet truth on Radar | **Abandon RapidAPI ADSBX** — source FlightAware AeroAPI or ADSBX *direct* (see `SOURCING_CHECKLIST.md`) |
| **9** | **NOTAMs + plain English** | Briefing / hard flags | METAR/TAF already free · source FAA NOTAM API + Claude |
| **10** | **RingCentral SMS** | Offer pings / stand-downs on real phones | RC JWT + from numbers |
| **11** | **Telnyx** | Robocall / escalation layer | Telnyx key |
| **12** | **QuickBooks** | Invoices / AP — after trip truth is solid | Intuit app + OAuth |
| **13** | **Portal magic-link auth + RLS** | Each client only sees their live trips | Resend + domain |
| **14** | **Tax AI + pricing priors** | Quote accuracy from history + Claude assist | Claude + trip history in DB |
| **15** | **PDF / Chromium** (optional later) | Branded downloadable docs | — |

---

## Easiest quick wins (do these first)

1. **Storage buckets** — migration + upload path (in progress / this PR)  
2. **Portal track UX** — ETA, legs, actuals, contacts, live events; strip all pricing  
3. **Claude adapter stub** behind `VITE_LLM_ADAPTER=real`  
4. **D085 verify screen** using Claude extract → checkbox confirm  
5. **Domain + Vercel** whenever DNS is ready (parallel, no code blocker)

Harder / wait on vendor: ADS-B provider pick, QB OAuth, FAA NOTAM approval, RC webhooks.

**Full create/buy list:** [`docs/SOURCING_CHECKLIST.md`](SOURCING_CHECKLIST.md)

---

## This pass started

- `0007_storage_buckets.sql` — `operator-docs` + `trip-docs`  
- Upload wire from Network / Admin compliance docs  
- Portal track rebuilt: ETAs, trip sections + actual times, contacts, live updates — **no pricing**
