# RingCentral — desk ring on portal hard quote

When a client submits a **hard quote** from the website portal (or a desk-alert
portal request), OnFly calls the `ring-desk` edge function. That uses RingCentral
**RingOut** so the company desk line **(858) 529-7860** rings. Soft quotes stay
email-only (no SMS, no ring).

## How RingOut works (why phone-off matters)

RingOut is two-legged:

1. **First leg rings** `RINGCENTRAL_DESK_RING_TO` (`from`) — this must be
   **`+18585297860`**. Desk phones / RC devices on that number ring.
2. **After someone answers**, RC connects to
   `RINGCENTRAL_RINGOUT_CONNECT_TO` (`to`) — usually a staff cell
   (`+16105092031`) or an IVR that always picks up.

If you put your **610 cell as the first leg**, RingOut waits for *your phone*
to answer before it ever touches 858. Phone off → nothing rings. Fix: **858
first, 610 (or IVR) second.**

`ring-desk` reads both numbers from **Supabase Secrets only** — the website
cannot override them.

## Required Supabase Secrets

Exact names (Deno env). **Spaces / friendly labels do not work.**

| Secret name | Value |
|-------------|--------|
| `RINGCENTRAL_CLIENT_ID` | RC app client id |
| `RINGCENTRAL_CLIENT_SECRET` | RC app client secret |
| `RINGCENTRAL_JWT` | JWT for an extension that can RingOut + SMS |
| `RINGCENTRAL_DESK_RING_TO` | `+18585297860` ← **rings first** |
| `RINGCENTRAL_RINGOUT_CONNECT_TO` | `+16105092031` (or IVR) ← **second leg** |
| `RINGCENTRAL_SMS_FROM` | E.164 SMS / caller-ID number (optional but usual) |

Delete or rename any secret like `Ring Central Request Auto Call` — that name
never loads into the edge function.

Also confirm `DESK_RING_DISABLED` is **not** `true`.

## One-time RingCentral setup

1. [developers.ringcentral.com](https://developers.ringcentral.com) → OnFly app
   (REST API, private, JWT).
2. **App permissions** — enable **SMS** + **RingOut**. Save. If JWT already
   existed, **create a new JWT** after adding RingOut.
3. JWT user/extension must:
   - Own / send SMS from `RINGCENTRAL_SMS_FROM`
   - Place RingOut with **858 as `from`** (add 858 as a forwarding / caller-ID
     number on that extension if RingOut rejects it)
4. In the RingCentral phone system, confirm **858-529-7860** rings devices that
   stay on (desk handsets / office softphone) — not only Pierce’s cell. If 858
   currently forwards only to 610, change call handling so the desk line itself
   rings.
5. Copy secrets into Supabase (Project → Edge Functions → Secrets) with the
   exact names above, or set via CLI:
   ```bash
   npx supabase secrets set \
     RINGCENTRAL_CLIENT_ID=… \
     RINGCENTRAL_CLIENT_SECRET=… \
     RINGCENTRAL_JWT=… \
     RINGCENTRAL_DESK_RING_TO=+18585297860 \
     RINGCENTRAL_RINGOUT_CONNECT_TO=+16105092031 \
     RINGCENTRAL_SMS_FROM=+1… \
     --project-ref udowzmoswudrqtjebehr
   ```
6. Deploy the function (paste in dashboard **or** from repo):
   ```bash
   npm run deploy:ring-desk
   ```
7. **Vercel** (Production + Preview):
   - `VITE_COMMS_ADAPTER=real`
   - `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` (already set)
8. Smoke test: submit a **hard quote** on the portal. **858 rings first**; after
   answer you are bridged to `RINGOUT_CONNECT_TO`.

## Kill switch

```bash
npx supabase secrets set DESK_RING_DISABLED=true --project-ref udowzmoswudrqtjebehr
```

Set `false` (or delete the secret) to resume.

## Soft vs hard

| Portal action   | Email | SMS | Desk RingOut |
|-----------------|-------|-----|--------------|
| Soft estimate   | yes   | no  | no           |
| Hard quote      | yes   | no  | **yes**      |
| Desk-alert path | yes   | yes | **yes**      |

## Live checklist (when 858 does not ring)

1. Secrets: `DESK_RING_TO=+18585297860`, `CONNECT_TO` ≠ 858, auth secrets present
   under exact `RINGCENTRAL_*` names.
2. Function redeployed after code paste.
3. App: `VITE_COMMS_ADAPTER=real` on the environment you are testing.
4. RC app has **RingOut** permission; JWT re-issued after enabling it.
5. JWT extension can use 858 as RingOut `from`.
6. Edge logs: Supabase → Edge Functions → `ring-desk` → Logs (look for
   `[ring-desk] … +18585297860 → +1…` or auth / RingOut errors).
