/**
 * Sync VITE_* (and selected public) env vars from local .env → Vercel
 * Preview + Production so preview/prod match what’s wired locally.
 *
 * Requires:
 *   VERCEL_TOKEN
 *   VERCEL_ORG_ID / VERCEL_PROJECT_ID  (or run `npx vercel link` first)
 *
 * Usage: npx tsx scripts/sync-vercel-env.ts
 */

import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { config } from 'dotenv'

const ROOT = resolve(process.cwd())
config({ path: resolve(ROOT, '.env') })
config({ path: resolve(ROOT, '.env.local') })

/** Public Vite keys that must match local wiring in preview/prod. */
const VITE_KEYS = [
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_ANON_KEY',
  'VITE_MAPBOX_TOKEN',
  'VITE_APP_URL',
  'VITE_EMAIL_ADAPTER',
  'VITE_MAPS_ADAPTER',
  'VITE_ADSB_ADAPTER',
  'VITE_LLM_ADAPTER',
  'VITE_WX_ADAPTER',
  'VITE_COMMS_ADAPTER',
  'VITE_QB_ADAPTER',
  'VITE_ONBOARD_URL',
  'VITE_SKYIQ_URL',
  'VITE_DISPATCH_ALERT_EMAIL',
] as const

const ENVIRONMENTS = ['preview', 'production'] as const

function readEnvFile(): Record<string, string> {
  const out: Record<string, string> = {}
  for (const file of ['.env', '.env.local']) {
    const p = resolve(ROOT, file)
    if (!existsSync(p)) continue
    const text = readFileSync(p, 'utf8')
    for (const line of text.split('\n')) {
      const t = line.trim()
      if (!t || t.startsWith('#')) continue
      const i = t.indexOf('=')
      if (i < 0) continue
      const k = t.slice(0, i).trim()
      let v = t.slice(i + 1).trim()
      if (
        (v.startsWith("'") && v.endsWith("'")) ||
        (v.startsWith('"') && v.endsWith('"'))
      ) {
        v = v.slice(1, -1)
      }
      out[k] = v
    }
  }
  return out
}

function main() {
  if (!process.env.VERCEL_TOKEN?.trim()) {
    console.error(
      'Missing VERCEL_TOKEN.\n' +
        'Create one at https://vercel.com/account/tokens and export it,\n' +
        'or run: npx vercel link && npx vercel env pull\n' +
        'Then re-run: npx tsx scripts/sync-vercel-env.ts',
    )
    // Still print the checklist for manual Dashboard paste
    const file = readEnvFile()
    console.log('\n--- Vercel Dashboard checklist (Preview + Production) ---')
    for (const k of VITE_KEYS) {
      const v = file[k] ?? process.env[k]
      console.log(`${k}=${v ? '(set locally)' : '(MISSING)'}`)
    }
    process.exit(1)
  }

  const file = readEnvFile()
  let ok = 0
  let fail = 0

  for (const key of VITE_KEYS) {
    const value = file[key] ?? process.env[key]
    if (!value?.trim()) {
      console.warn(`skip ${key} (empty)`)
      continue
    }
    // Production APP_URL should not stay localhost
    let v = value.trim()
    if (key === 'VITE_APP_URL' && /localhost|127\.0\.0\.1/.test(v)) {
      console.warn(
        `skip ${key}=${v} for production sync — set real https URL in Vercel Dashboard`,
      )
      // Still sync to preview if useful
      for (const env of ['preview'] as const) {
        const r = setEnv(key, v, env)
        if (r) ok++
        else fail++
      }
      continue
    }
    for (const env of ENVIRONMENTS) {
      const r = setEnv(key, v, env)
      if (r) ok++
      else fail++
    }
  }

  console.log(`Done. set=${ok} fail=${fail}`)
  if (fail) process.exit(1)
}

function setEnv(key: string, value: string, environment: string): boolean {
  console.log(`> vercel env add ${key} (${environment})`)
  // Remove existing then add (vercel env add is interactive; use API-style stdin)
  spawnSync('npx', ['vercel', 'env', 'rm', key, environment, '--yes'], {
    stdio: 'pipe',
    env: process.env,
  })
  const r = spawnSync(
    'npx',
    ['vercel', 'env', 'add', key, environment, '--force'],
    {
      input: value,
      encoding: 'utf8',
      env: process.env,
    },
  )
  if (r.status !== 0) {
    console.error(r.stderr || r.stdout || `failed ${key}@${environment}`)
    return false
  }
  return true
}

main()
