# OnFly OS Runbook

## When SMS stops
1. Check `VITE_COMMS_ADAPTER` / `COMMS_PROVIDER` (mock vs ringcentral).
2. RingCentral: JWT validity, `RC_FROM_OFFERS` / `RC_FROM_THREADS`, webhook subscription to `comms-inbound`.
3. Inspect `comms_messages.delivery_status` for failures vs silent operators.

## When ADS-B poller dies
1. Confirm `VITE_ADSB_ADAPTER` and provider API key.
2. Cron edge function logs; fixture mock still powers Radar UI.
3. LADD-blocked tails show last-known + badge — not an outage by itself.

## When QuickBooks token expires
1. Re-run OAuth for Intuit app; store refresh token in Supabase secrets.
2. Delivery flow must not block — invoices queue + retry via `qb-sync`.
3. Mock accounting adapter remains the zero-key fallback.

## Database / migrations
- Apply with `npm run db:migrate` using pooler host `aws-1-us-east-2.pooler.supabase.com:6543`.
- Direct `db.<ref>.supabase.co` may be IPv6-only.

## Public token pages
- `/offer/:token`, `/accept/:token`, `/t/:legToken` — rate-limit at the edge before production.
