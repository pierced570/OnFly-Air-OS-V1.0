/**
 * Push FlightAware AeroAPI key to Supabase edge secrets + deploy ADS-B functions.
 *
 * Needs in .env (gitignored):
 *   SUPABASE_ACCESS_TOKEN
 *   FLIGHTAWARE_AEROAPI_KEY
 *
 * Usage: npx tsx scripts/set-flightaware-secret.ts
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
    console.error(`Missing ${name} — add it to .env (gitignored)`)
    process.exit(1)
  }
  return v
}

function run(cmd: string, args: string[]) {
  console.log(`> ${cmd} ${args.filter((a) => !a.includes('KEY=')).join(' ')}`)
  const r = spawnSync(cmd, args, {
    stdio: 'inherit',
    env: process.env,
    shell: process.platform === 'win32',
  })
  if (r.status !== 0) process.exit(r.status ?? 1)
}

requireEnv('SUPABASE_ACCESS_TOKEN')
const faKey = requireEnv('FLIGHTAWARE_AEROAPI_KEY')
const provider = (process.env.ADSB_PROVIDER ?? 'flightaware').trim()

const pairs = [
  `FLIGHTAWARE_AEROAPI_KEY=${faKey}`,
  `ADSB_PROVIDER=${provider}`,
]
if (process.env.ADSB_ALERT_WEBHOOK_URL?.trim()) {
  pairs.push(
    `ADSB_ALERT_WEBHOOK_URL=${process.env.ADSB_ALERT_WEBHOOK_URL.trim()}`,
  )
}

console.log('Setting secrets: FLIGHTAWARE_AEROAPI_KEY, ADSB_PROVIDER' +
  (pairs.length > 2 ? ', ADSB_ALERT_WEBHOOK_URL' : ''))
run('npx', [
  'supabase',
  'secrets',
  'set',
  ...pairs,
  '--project-ref',
  PROJECT_REF,
])

for (const fn of ['adsb-positions', 'adsb-alert-webhook'] as const) {
  const args = [
    'supabase',
    'functions',
    'deploy',
    fn,
    '--project-ref',
    PROJECT_REF,
  ]
  if (fn === 'adsb-alert-webhook') args.push('--no-verify-jwt')
  run('npx', args)
}

const webhook =
  `https://${PROJECT_REF}.supabase.co/functions/v1/adsb-alert-webhook`
console.log(`
Done. Next:
  1. Optionally: ADSB_ALERT_WEBHOOK_URL=${webhook}
     then re-run this script so FlightAware can POST movement alerts.
  2. Vercel / .env.local: VITE_ADSB_ADAPTER=real
  3. Radar → Seed last-known → toggle Alert on tails you want tracked.
`)
