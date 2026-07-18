# Vendor sourcing checklist — what to create / buy

Generated from blueprint + wire order. **Only items OnFly OS actually plans to use.**  
Vault logins (Adobe, social, Chase, etc.) stay in Logins & keys — they are not product adapters.

---

## Already good (no new account needed)

| Need | Status | Notes |
|------|--------|-------|
| **Email outbound** | Resend live | From `info@onflyair.com` · edge `send-email` deployed |
| **Drive times** | Mapbox live | `pk` token in vault works · Directions API |
| **METAR / TAF** | aviationweather.gov | No key · already wired as `VITE_WX_ADAPTER=real` |
| **Supabase** | Project live | URL + anon for Vercel; access token for deploys |
| **Domain / hosting** | OnFly owns | Confirm Vercel project + `VITE_*` envs |

---

## Must source next (create these)

### 1. Anthropic Claude — **priority**
- **What:** API key for OnFly OS (not skyIQ / ChatGPT)
- **Used for:** Intake extract, D085 parse → human verify, NOTAM plain English, tax assist
- **Where:** https://console.anthropic.com/ → API keys
- **Env / secret:** `ANTHROPIC_API_KEY` (Supabase secrets) · `VITE_LLM_ADAPTER=real`
- **Do not need:** OpenAI for OS (vault ChatGPT key dead; skyIQ key quota’d — leave for skyIQ)

### 2. ADS-B provider — **pick one commercial path** (skip RapidAPI ADSBX)
Blueprint: trial ~20 tails then commit. RapidAPI “ADSBexchange-com1” is a dead end for us.

| Option | Why consider | What to create |
|--------|--------------|----------------|
| **A. FlightAware AeroAPI** | Reliable commercial, registration + position, good for ~470-tail poll | AeroAPI key + plan that allows scheduled poll of network tails |
| **B. ADS-B Exchange direct API** | Blueprint option; better than RapidAPI middleman | Direct ADSBX API subscription / key (not RapidAPI) |
| **C. airplanes.live** | Cheap/free-ish for experiments | Confirm ToS + rate limits for ~470 tails before relying |

**Recommendation to try first:** FlightAware AeroAPI (or ADSBX **direct** if you already prefer their data).  
**Deliverable we need from you:** provider choice + API key (+ any account email).  
We will re-point `adsb-positions` edge at that provider and delete the RapidAPI path.

### 3. FAA NOTAM access
- **What:** Programmatic NOTAMs for briefing hard flags (closures, TFRs)
- **METAR/TAF already free** via aviationweather.gov — only NOTAMs are missing
- **Where:** FAA SWIM / NAS Data Portal / NOTAM API enrollment (approval can take time)
- **Interim (optional):** if FAA approval is slow, a commercial NOTAM feed (e.g. provider that bundles NOTAMs) — tell us which you prefer
- **Env:** whatever key/URL the chosen feed uses → Supabase secret

### 4. RingCentral (SMS) — if not already API-ready
- **What:** SMS send/receive for trip offers + stand-downs (numbers operators already know)
- **Create / confirm:**
  - RC Developer app (Client ID + Secret)
  - JWT auth (or whatever RC uses for server-to-server today)
  - SMS-capable from-numbers (offers vs trip threads if separate)
  - A2P 10DLC / TCR: check admin — may already be registered
- **Env:** `RINGCENTRAL_CLIENT_ID`, `RINGCENTRAL_CLIENT_SECRET`, `RINGCENTRAL_JWT`, `RINGCENTRAL_SMS_FROM` (and thread from if split)
- **Not sourcing:** Twilio as primary SMS (blueprint: RC first; Twilio vetting already failed a partner)

### 5. Telnyx (voice / robocall) — when escalation lands
- **What:** Programmable voice, TTS, press-1 callouts
- **Create:** Telnyx account + API key + from number
- **Env:** `TELNYX_API_KEY`, `TELNYX_FROM`
- **Defer OK** until SMS offers work

### 6. QuickBooks Online — Intuit developer app
- **What:** OAuth app (vault QB *login* is not enough)
- **Create:**
  - Intuit Developer app → Client ID + Client Secret
  - Redirect URI (e.g. `https://<app>/api/qb/callback` or Supabase function URL)
  - Company / Realm ID after connect
- **Env:** `QB_CLIENT_ID`, `QB_CLIENT_SECRET`, `QB_REDIRECT_URI`, `QB_REALM_ID` (+ refresh token after first OAuth)

### 7. Vercel production env (config, not a new vendor)
Set on Preview + Production:
- `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
- `VITE_MAPBOX_TOKEN`
- `VITE_EMAIL_ADAPTER=real`
- `VITE_MAPS_ADAPTER=real`
- `VITE_LLM_ADAPTER=real` (after Claude)
- `VITE_ADSB_ADAPTER=real` (after ADS-B provider chosen)
- `VITE_WX_ADAPTER=real` (already default)
- `VITE_APP_URL=https://…`

---

## Explicitly **not** sourcing for OS

| Item | Why |
|------|-----|
| OpenAI / ChatGPT for OnFly OS | Prefer Claude; vault keys bad/quota |
| ADS-B Exchange via RapidAPI | Unusable for our case — abandoning |
| Google Maps | Mapbox already covers drive times |
| Twilio SMS primary | RC first; Telnyx for voice later |
| Chromium / PDF service | Deferred — print-CSS fine |
| META / social / Mapbox *login* password | Ops vault only, not adapters |

---

## Suggested gather order

1. **Claude API key** (unblocks intake + D085 + NOTAM English)  
2. **ADS-B provider choice + key** (FlightAware AeroAPI *or* ADSBX direct)  
3. **Vercel env vars** (Supabase + Mapbox + adapter toggles)  
4. **RingCentral API credentials + A2P check**  
5. **FAA NOTAM enrollment** (start early — approval lag)  
6. **QuickBooks Intuit app** (OAuth)  
7. **Telnyx** when ready for robocalls  

Paste keys into Admin → Logins & keys (label only) and/or send here for wiring. Prefer: Claude + ADS-B decision first.
