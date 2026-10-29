# RingCentral — desk ring on portal hard quote

When a client submits a **hard quote** from the website portal (or a desk-alert
portal request), OnFly calls the `ring-desk` edge function. That uses RingCentral
**RingOut** so the company desk line **(858) 529-7860** rings. Soft quotes stay
email-only (no SMS, no ring).

RingOut is two-legged:

1. **Desk rings first** (`RINGCENTRAL_DESK_RING_TO` = `+18585297860`)
2. After answer, RC connects to **`RINGCENTRAL_RINGOUT_CONNECT_TO`** (a staff
   cell or IVR). This must be a **different** number than the desk.

## One-time RingCentral setup

1. Open [developers.ringcentral.com](https://developers.ringcentral.com) → your
   OnFly app (or create one: **REST API App**, private, JWT auth).
2. **App permissions** — enable at least:
   - **SMS** (existing offer pings)
   - **RingOut** (desk ring)
   - Save. If you already had a JWT, **create a new JWT** after adding RingOut.
3. **JWT credential** — Credentials → JWT → create for a user/extension that:
   - Owns / can send SMS from `RINGCENTRAL_SMS_FROM`
   - Can place RingOut calls using the desk number as the first leg
4. Copy into local `.env` (never commit; never `VITE_*`):
   - `RINGCENTRAL_CLIENT_ID`
   - `RINGCENTRAL_CLIENT_SECRET`
   - `RINGCENTRAL_JWT`
   - `RINGCENTRAL_SMS_FROM` (E.164 SMS caller ID)
   - `RINGCENTRAL_DESK_RING_TO=+18585297860`
   - `RINGCENTRAL_RINGOUT_CONNECT_TO=+1…` (staff cell or IVR — **not** 858)
5. In the RingCentral admin / phone system, confirm **858-529-7860** is assigned
   so that extension can RingOut with it as `from`. If RingOut rejects the
   number, add it as a forwarding / caller-ID number on that extension.
6. Deploy:
   ```bash
   npm run deploy:ring-desk
   # or full vendor bundle:
   npm run deploy:vendors
   ```
7. Production app env: `VITE_COMMS_ADAPTER=real` plus existing
   `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`.
8. Smoke test: submit a **hard quote** on the portal. The 858 desk phones should
   ring; after answer you are connected to `RINGOUT_CONNECT_TO`.

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
