/**
 * Apply SQL migration files to the linked Supabase Postgres.
 *
 * Requires in .env:
 *   SUPABASE_DB_PASSWORD=...
 *   (optional) SUPABASE_DB_HOST=db.udowzmoswudrqtjebehr.supabase.co
 *
 * Usage: npx tsx scripts/apply-migration.ts [path-to.sql]
 */
import { readFileSync, readdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import { config } from 'dotenv'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
config({ path: resolve(ROOT, '.env') })

const PROJECT_REF = 'udowzmoswudrqtjebehr'
const password = process.env.SUPABASE_DB_PASSWORD
const host =
  process.env.SUPABASE_DB_HOST ?? `db.${PROJECT_REF}.supabase.co`

if (!password) {
  console.error(
    'Missing SUPABASE_DB_PASSWORD in .env\n' +
      'Get it from Supabase → Project Settings → Database → Database password\n' +
      '(or Reset database password if you never saved it).',
  )
  process.exit(1)
}

async function run() {
  const fileArg = process.argv[2]
  const migrationsDir = resolve(ROOT, 'supabase/migrations')
  const files = fileArg
    ? [resolve(fileArg)]
    : readdirSync(migrationsDir)
        .filter((f) => f.endsWith('.sql'))
        .sort()
        .map((f) => resolve(migrationsDir, f))

  const client = new pg.Client({
    host,
    port: 5432,
    database: 'postgres',
    user: 'postgres',
    password,
    ssl: { rejectUnauthorized: false },
  })

  console.log(`Connecting to ${host}…`)
  await client.connect()
  try {
    for (const file of files) {
      const sql = readFileSync(file, 'utf8')
      console.log(`Applying ${file} (${sql.length} chars)…`)
      await client.query(sql)
      console.log(`OK: ${file}`)
    }
  } finally {
    await client.end()
  }
  console.log('Migrations complete.')
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
