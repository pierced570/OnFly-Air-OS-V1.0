/**
 * Deploy Resend edge function + set secrets.
 *
 * Requires in env / .env (never commit):
 *   SUPABASE_ACCESS_TOKEN  — https://supabase.com/dashboard/account/tokens
 *   RESEND_API_KEY         — https://resend.com/api-keys
 *   EMAIL_FROM             — verified domain, e.g. "OnFly Air <ops@onflyair.com>"
 *
 * Usage:
 *   npx tsx scripts/deploy-send-email.ts
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
    console.error(`Missing ${name}. Add it to .env then re-run.`)
    process.exit(1)
  }
  return v
}

function run(cmd: string, args: string[], env: NodeJS.ProcessEnv) {
  console.log(`> ${cmd} ${args.join(' ')}`)
  const r = spawnSync(cmd, args, {
    stdio: 'inherit',
    env,
    shell: process.platform === 'win32',
  })
  if (r.status !== 0) {
    process.exit(r.status ?? 1)
  }
}

const token = requireEnv('SUPABASE_ACCESS_TOKEN')
const resendKey = requireEnv('RESEND_API_KEY')
const emailFrom =
  process.env.EMAIL_FROM?.trim() || 'OnFly Air <info@onflyair.com>'

const env = {
  ...process.env,
  SUPABASE_ACCESS_TOKEN: token,
}

console.log(`Project: ${PROJECT_REF}`)
console.log(`EMAIL_FROM: ${emailFrom}`)
console.log('Setting secrets…')

run(
  'npx',
  [
    'supabase',
    'secrets',
    'set',
    `RESEND_API_KEY=${resendKey}`,
    `EMAIL_FROM=${emailFrom}`,
    '--project-ref',
    PROJECT_REF,
  ],
  env,
)

console.log('Deploying send-email…')
run(
  'npx',
  [
    'supabase',
    'functions',
    'deploy',
    'send-email',
    '--project-ref',
    PROJECT_REF,
  ],
  env,
)

console.log(`
Done. Flip the app to live email:

  VITE_EMAIL_ADAPTER=real
  VITE_SUPABASE_URL=https://${PROJECT_REF}.supabase.co
  VITE_SUPABASE_ANON_KEY=<anon key from dashboard>

Set the same on Vercel (Preview + Production). RESEND_API_KEY stays in Supabase secrets only — never VITE_*.
`)
