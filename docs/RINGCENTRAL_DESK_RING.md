# RingCentral — desk ring on portal hard quote

**Goal:** client submits a hard quote → **(858) 529-7860 rings**. That is the
whole product. Soft quotes stay email-only (no ring).

## How it works

`ring-desk` uses RingCentral **RingOut** with:

1. **`from` = +18585297860** — this is the number that rings (the alert).
2. **`to` = RINGCENTRAL_RINGOUT_CONNECT_TO** — RingCentral’s API requires a
   *different* second number. It is **not** a staff-cell feature. Set it to any
   other company DID, auto-attendant, or voicemail. Nobody needs to care about
   that leg; the alert is 858 ringing.

Phone numbers come from **Supabase Secrets only** (the website cannot override).

## Required Supabase Secrets

Exact names (no spaces — Deno will not load friendly labels).

| Secret | Value |
|--------|--------|
| `RINGCENTRAL_CLIENT_ID` | RC app client id |
| `RINGCENTRAL_CLIENT_SECRET` | RC app client secret |
| `RINGCENTRAL_JWT` | JWT for an extension that can RingOut |
| `RINGCENTRAL_DESK_RING_TO` | `+18585297860` |
| `RINGCENTRAL_RINGOUT_CONNECT_TO` | any **other** company number RC accepts |

Optional: `RINGCENTRAL_SMS_FROM` (caller ID). Delete any secret named like
`Ring Central Request Auto Call` — that never loads.

Confirm `DESK_RING_DISABLED` is not `true`.

## Go live

1. Set the secrets above (`DESK_RING_TO` must be 858).
2. RC Developer app: enable **RingOut** (and SMS if you use it). Re-issue JWT
   after adding RingOut.
3. JWT extension must be allowed to RingOut with 858 as `from`.
4. Deploy: paste the function in the dashboard **or** `npm run deploy:ring-desk`.
5. Vercel Production + Preview: `VITE_COMMS_ADAPTER=real`.
6. Smoke: submit a hard quote → **858 rings**.

## Kill switch

```bash
npx supabase secrets set DESK_RING_DISABLED=true --project-ref udowzmoswudrqtjebehr
```

## Soft vs hard

| Portal action | Email | Desk ring (858) |
|---------------|-------|-----------------|
| Soft estimate | yes   | no              |
| Hard quote    | yes   | **yes**         |
| Desk-alert    | yes   | **yes**         |
