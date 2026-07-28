/**
 * Deploy RingCentral send-sms edge function + set secrets.
 *
 * Requires in env / .env (never commit):
 *   SUPABASE_ACCESS_TOKEN
 *   RINGCENTRAL_CLIENT_ID (or RC_CLIENT_ID)
 *   RINGCENTRAL_CLIENT_SECRET (or RC_CLIENT_SECRET)
 *   RINGCENTRAL_JWT (or RC_JWT)
 *   RINGCENTRAL_SMS_FROM (or RC_FROM_OFFERS) — E.164, e.g. +16105551212
 * Optional:
 *   RINGCENTRAL_SERVER_URL — default https://platform.ringcentral.com
 *
 * Usage:
 *   npx tsx scripts/deploy-send-sms.ts
 */

import { config } from 'dotenv'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'

config({ path: resolve(process.cwd(), '.env') })
config({ path: resolve(process.cwd(), '.env.local') })

const PROJECT_REF = 'udowzmoswudrqtjebehr'

function firstEnv(...names: string[]): string | undefined {
  for (const n of names) {
    const v = process.env[n]?.trim()
    if (v) return v
  }
  return undefined
}

function requireFirst(...names: string[]): string {
  const v = firstEnv(...names)
  if (!v) {
    console.error(`Missing ${names.join(' or ')}. Add to .env then re-run.`)
    process.exit(1)
  }
  return v
}

function run(cmd: string, args: string[], env: NodeJS.ProcessEnv) {
  console.log(
    `> ${cmd} ${args.filter((a) => !/=/.test(a) || a.startsWith('--')).join(' ')}`,
  )
  const r = spawnSync(cmd, args, {
    stdio: 'inherit',
    env,
    shell: process.platform === 'win32',
  })
  if (r.status !== 0) process.exit(r.status ?? 1)
}

const token = requireFirst('SUPABASE_ACCESS_TOKEN')
const clientId = requireFirst('RINGCENTRAL_CLIENT_ID', 'RC_CLIENT_ID')
const clientSecret = requireFirst(
  'RINGCENTRAL_CLIENT_SECRET',
  'RC_CLIENT_SECRET',
)
const jwt = requireFirst('RINGCENTRAL_JWT', 'RC_JWT')
const smsFrom = requireFirst('RINGCENTRAL_SMS_FROM', 'RC_FROM_OFFERS')
const server =
  firstEnv('RINGCENTRAL_SERVER_URL', 'RC_SERVER_URL') ??
  'https://platform.ringcentral.com'

const env = {
  ...process.env,
  SUPABASE_ACCESS_TOKEN: token,
}

console.log(`Project: ${PROJECT_REF}`)
console.log(`SMS from: ${smsFrom}`)
console.log(`RC server: ${server}`)
console.log('Setting secrets…')

run(
  'npx',
  [
    'supabase',
    'secrets',
    'set',
    `RINGCENTRAL_CLIENT_ID=${clientId}`,
    `RINGCENTRAL_CLIENT_SECRET=${clientSecret}`,
    `RINGCENTRAL_JWT=${jwt}`,
    `RINGCENTRAL_SMS_FROM=${smsFrom}`,
    `RINGCENTRAL_SERVER_URL=${server}`,
    '--project-ref',
    PROJECT_REF,
  ],
  env,
)

console.log('Deploying send-sms…')
run(
  'npx',
  [
    'supabase',
    'functions',
    'deploy',
    'send-sms',
    '--project-ref',
    PROJECT_REF,
  ],
  env,
)

console.log(`
Done. Flip the app to live SMS:

  VITE_COMMS_ADAPTER=real
  VITE_SUPABASE_URL=https://${PROJECT_REF}.supabase.co
  VITE_SUPABASE_ANON_KEY=<anon key>

Set the same on Vercel (Preview + Production). RingCentral secrets stay in
Supabase only — never VITE_*.

JWT must belong to the extension that owns RINGCENTRAL_SMS_FROM (SmsSender).
`)
