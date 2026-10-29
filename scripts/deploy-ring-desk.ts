/**
 * Deploy RingCentral ring-desk edge function + set secrets.
 *
 * Requires in .env (never commit):
 *   SUPABASE_ACCESS_TOKEN
 *   RINGCENTRAL_CLIENT_ID (or RC_CLIENT_ID)
 *   RINGCENTRAL_CLIENT_SECRET (or RC_CLIENT_SECRET)
 *   RINGCENTRAL_JWT (or RC_JWT)
 *   RINGCENTRAL_DESK_RING_TO — E.164 desk line that rings (e.g. +18585297860)
 *   RINGCENTRAL_RINGOUT_CONNECT_TO — second leg after desk answers (staff cell / IVR)
 * Optional:
 *   RINGCENTRAL_SMS_FROM
 *   RINGCENTRAL_SERVER_URL
 *   RINGCENTRAL_RINGOUT_PLAY_PROMPT=true
 *
 * Usage:
 *   npm run deploy:ring-desk
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
const deskRing = requireFirst('RINGCENTRAL_DESK_RING_TO', 'RC_DESK_RING_TO')
const connectTo = requireFirst(
  'RINGCENTRAL_RINGOUT_CONNECT_TO',
  'RC_RINGOUT_CONNECT_TO',
)
const smsFrom = firstEnv('RINGCENTRAL_SMS_FROM', 'RC_FROM_OFFERS')
const server =
  firstEnv('RINGCENTRAL_SERVER_URL', 'RC_SERVER_URL') ??
  'https://platform.ringcentral.com'
const playPrompt =
  firstEnv('RINGCENTRAL_RINGOUT_PLAY_PROMPT') ?? 'true'

if (deskRing.replace(/\D/g, '') === connectTo.replace(/\D/g, '')) {
  console.error(
    'RINGCENTRAL_DESK_RING_TO and RINGCENTRAL_RINGOUT_CONNECT_TO must be different numbers.',
  )
  process.exit(1)
}

const env = {
  ...process.env,
  SUPABASE_ACCESS_TOKEN: token,
}

console.log(`Project: ${PROJECT_REF}`)
console.log(`Desk rings: ${deskRing}`)
console.log(`Connect to: ${connectTo}`)
console.log(`RC server: ${server}`)
console.log('Setting secrets…')

const secretArgs = [
  'supabase',
  'secrets',
  'set',
  `RINGCENTRAL_CLIENT_ID=${clientId}`,
  `RINGCENTRAL_CLIENT_SECRET=${clientSecret}`,
  `RINGCENTRAL_JWT=${jwt}`,
  `RINGCENTRAL_DESK_RING_TO=${deskRing}`,
  `RINGCENTRAL_RINGOUT_CONNECT_TO=${connectTo}`,
  `RINGCENTRAL_SERVER_URL=${server}`,
  `RINGCENTRAL_RINGOUT_PLAY_PROMPT=${playPrompt}`,
  '--project-ref',
  PROJECT_REF,
]
if (smsFrom) secretArgs.splice(-2, 0, `RINGCENTRAL_SMS_FROM=${smsFrom}`)

run('npx', secretArgs, env)

console.log('Deploying ring-desk…')
run(
  'npx',
  [
    'supabase',
    'functions',
    'deploy',
    'ring-desk',
    '--project-ref',
    PROJECT_REF,
  ],
  env,
)

console.log(`
Done. App needs:

  VITE_COMMS_ADAPTER=real
  VITE_SUPABASE_URL=https://${PROJECT_REF}.supabase.co
  VITE_SUPABASE_ANON_KEY=<anon key>

RingCentral app must include RingOut permission. JWT user must own / can
RingOut from the desk number (add ${deskRing} as a forwarding number on that
extension if needed).

Kill switch: supabase secrets set DESK_RING_DISABLED=true --project-ref ${PROJECT_REF}
`)
