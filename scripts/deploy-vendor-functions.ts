/**
 * Set vendor secrets + deploy edge functions unlocked by logins-keys.csv.
 *
 * Needs in .env:
 *   SUPABASE_ACCESS_TOKEN
 *   RESEND_API_KEY, EMAIL_FROM
 *   ANTHROPIC_API_KEY (preferred for llm-extract)
 *   OPENAI_API_KEY (optional fallback)
 *   ADSB_RAPIDAPI_KEY (optional — legacy; prefer FlightAware)
 *   FLIGHTAWARE_AEROAPI_KEY (preferred ADS-B / AeroAPI)
 *   ADSB_PROVIDER (optional — flightaware | adsbx)
 *   ADSB_ALERT_WEBHOOK_URL (optional — FlightAware alert callback)
 *   QB_CLIENT_ID, QB_CLIENT_SECRET (optional — QuickBooks OAuth)
 *   QB_ENVIRONMENT, QB_REDIRECT_URI, INVOICE_EMAIL_FROM (optional)
 *
 * Usage: npx tsx scripts/deploy-vendor-functions.ts
 */

import { config } from 'dotenv'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'

config({ path: resolve(process.cwd(), '.env') })
config({ path: resolve(process.cwd(), '.env.local') })

const PROJECT_REF = 'udowzmoswudrqtjebehr'

function requireEnv(name: string): string {
  const v = process.env[name]?.trim()
  if (!v) {
    console.error(`Missing ${name}`)
    process.exit(1)
  }
  return v
}

function run(cmd: string, args: string[]) {
  console.log(`> ${cmd} ${args.join(' ')}`)
  const r = spawnSync(cmd, args, {
    stdio: 'inherit',
    env: process.env,
    shell: process.platform === 'win32',
  })
  if (r.status !== 0) process.exit(r.status ?? 1)
}

requireEnv('SUPABASE_ACCESS_TOKEN')

const pairs: string[] = []
const emailFrom =
  process.env.EMAIL_FROM?.trim() || 'OnFly Air <info@onflyair.com>'
if (process.env.RESEND_API_KEY?.trim()) {
  pairs.push(`RESEND_API_KEY=${process.env.RESEND_API_KEY.trim()}`)
  pairs.push(`EMAIL_FROM=${emailFrom}`)
}
if (process.env.ANTHROPIC_API_KEY?.trim()) {
  pairs.push(`ANTHROPIC_API_KEY=${process.env.ANTHROPIC_API_KEY.trim()}`)
}
if (process.env.ANTHROPIC_MODEL?.trim()) {
  pairs.push(`ANTHROPIC_MODEL=${process.env.ANTHROPIC_MODEL.trim()}`)
}
if (process.env.OPENAI_API_KEY?.trim()) {
  pairs.push(`OPENAI_API_KEY=${process.env.OPENAI_API_KEY.trim()}`)
}
if (process.env.ADSB_RAPIDAPI_KEY?.trim()) {
  pairs.push(`ADSB_RAPIDAPI_KEY=${process.env.ADSB_RAPIDAPI_KEY.trim()}`)
}
if (process.env.FLIGHTAWARE_AEROAPI_KEY?.trim()) {
  pairs.push(
    `FLIGHTAWARE_AEROAPI_KEY=${process.env.FLIGHTAWARE_AEROAPI_KEY.trim()}`,
  )
  pairs.push(
    `ADSB_PROVIDER=${(process.env.ADSB_PROVIDER ?? 'flightaware').trim()}`,
  )
}
if (process.env.ADSB_ALERT_WEBHOOK_URL?.trim()) {
  pairs.push(
    `ADSB_ALERT_WEBHOOK_URL=${process.env.ADSB_ALERT_WEBHOOK_URL.trim()}`,
  )
}
if (process.env.OPENAI_MODEL?.trim()) {
  pairs.push(`OPENAI_MODEL=${process.env.OPENAI_MODEL.trim()}`)
}
if (process.env.QB_CLIENT_ID?.trim() && process.env.QB_CLIENT_SECRET?.trim()) {
  pairs.push(`QB_CLIENT_ID=${process.env.QB_CLIENT_ID.trim()}`)
  pairs.push(`QB_CLIENT_SECRET=${process.env.QB_CLIENT_SECRET.trim()}`)
  pairs.push(
    `QB_ENVIRONMENT=${(process.env.QB_ENVIRONMENT ?? 'sandbox').trim()}`,
  )
  if (process.env.QB_REDIRECT_URI?.trim()) {
    pairs.push(`QB_REDIRECT_URI=${process.env.QB_REDIRECT_URI.trim()}`)
  }
  const invFrom =
    process.env.INVOICE_EMAIL_FROM?.trim() ||
    'OnFly Air <invoices@onflyair.com>'
  pairs.push(`INVOICE_EMAIL_FROM=${invFrom}`)
}

if (!pairs.length) {
  console.error('No vendor secrets found in .env')
  process.exit(1)
}

console.log('Setting secrets:', pairs.map((p) => p.split('=')[0]).join(', '))
run('npx', [
  'supabase',
  'secrets',
  'set',
  ...pairs,
  '--project-ref',
  PROJECT_REF,
])

const noJwt = new Set([
  'quickbooks-auth',
  'quickbooks-api',
  'send-invoice-email',
  'adsb-alert-webhook',
])
for (const fn of [
  'send-email',
  'llm-extract',
  'adsb-positions',
  'adsb-alert-webhook',
  'wx-brief',
  'quickbooks-auth',
  'quickbooks-api',
  'send-invoice-email',
]) {
  console.log(`Deploying ${fn}…`)
  const args = [
    'supabase',
    'functions',
    'deploy',
    fn,
    '--project-ref',
    PROJECT_REF,
  ]
  if (noJwt.has(fn)) args.push('--no-verify-jwt')
  run('npx', args)
}

console.log(`
Deployed. Enable on Vercel / .env.local:

  VITE_SUPABASE_URL=https://${PROJECT_REF}.supabase.co
  VITE_SUPABASE_ANON_KEY=<anon>
  VITE_MAPBOX_TOKEN=<pk from CSV>
  VITE_EMAIL_ADAPTER=real
  VITE_MAPS_ADAPTER=real
  VITE_LLM_ADAPTER=real
  VITE_ADSB_ADAPTER=real
  VITE_QB_ADAPTER=real   # after Intuit OAuth app + Connect on Financials

QuickBooks redirect URI (Intuit developer app):
  https://${PROJECT_REF}.supabase.co/functions/v1/quickbooks-auth/callback

Note: Prefer FlightAware AeroAPI (FLIGHTAWARE_AEROAPI_KEY). RapidAPI ADSBX
is legacy. After secrets + deploy, set VITE_ADSB_ADAPTER=real and Seed from Radar.
`)
