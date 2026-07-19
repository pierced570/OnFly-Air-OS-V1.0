/**
 * Set vendor secrets + deploy edge functions unlocked by logins-keys.csv.
 *
 * Needs in .env:
 *   SUPABASE_ACCESS_TOKEN
 *   RESEND_API_KEY, EMAIL_FROM
 *   ANTHROPIC_API_KEY (preferred for llm-extract)
 *   OPENAI_API_KEY (optional fallback)
 *   ADSB_RAPIDAPI_KEY (optional — function still deploys)
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
if (process.env.OPENAI_MODEL?.trim()) {
  pairs.push(`OPENAI_MODEL=${process.env.OPENAI_MODEL.trim()}`)
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

for (const fn of ['send-email', 'llm-extract', 'adsb-positions', 'wx-brief']) {
  console.log(`Deploying ${fn}…`)
  run('npx', [
    'supabase',
    'functions',
    'deploy',
    fn,
    '--project-ref',
    PROJECT_REF,
  ])
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

Note: ADS-B RapidAPI returned "not subscribed" when probed — renew
ADSBexchange-com1 on RapidAPI; until then Radar shows no_data flags.
`)
