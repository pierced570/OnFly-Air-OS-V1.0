/**
 * Upsert financial_records from the fixture JSON (built from the OFA CSV).
 * Usage: npm run import:financials
 */
import { readFileSync } from 'node:fs'
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
  process.env.SUPABASE_DB_HOST ?? 'aws-1-us-east-2.pooler.supabase.com'
const port = Number(process.env.SUPABASE_DB_PORT ?? 6543)
const user = process.env.SUPABASE_DB_USER ?? `postgres.${PROJECT_REF}`

type Row = {
  id: string
  is_legacy: boolean
  source: string
  date_of_flight: string | null
  operator_po: string | null
  client_name: string | null
  route_text: string | null
  aircraft_type: string | null
  tail_number: string | null
  vendor_name: string | null
  pay_terms: string | null
  referral_name: string | null
  client_invoiced_amount: number
  vendor_amount: number
  margin: number
  funded_by: string | null
  deposited_to: string | null
  check_deposit_number: string | null
  jonnys_profits: number
  jonny_invested: number
  jonny_money_owed: number
  jonny_money_returned: number
  was_it_paid: boolean
  vendor_paid: boolean
  investor_paid: boolean
  has_ofa_seen_profit: boolean
  bill_logged_in_qb: boolean
  referral_paid_out: boolean
}

async function main() {
  if (!password) {
    console.error('Need SUPABASE_DB_PASSWORD')
    process.exit(1)
  }
  const fixturePath = resolve(ROOT, 'src/fixtures/financials.json')
  const { records } = JSON.parse(readFileSync(fixturePath, 'utf8')) as {
    records: Row[]
  }

  const client = new pg.Client({
    host,
    port,
    database: 'postgres',
    user,
    password,
    ssl: { rejectUnauthorized: false },
  })
  await client.connect()
  try {
    // Clear prior CSV seed (idempotent re-import of this historical set)
    await client.query(`delete from financial_records where source in ('live','legacy')`)
    let n = 0
    for (const r of records) {
      await client.query(
        `insert into financial_records (
          id, is_legacy, source, date_of_flight, operator_po, client_name, route_text,
          aircraft_type, tail_number, vendor_name, pay_terms, referral_name,
          client_invoiced_amount, vendor_amount, margin, funded_by, deposited_to,
          check_deposit_number, jonnys_profits, jonny_invested, jonny_money_owed,
          jonny_money_returned, was_it_paid, vendor_paid, investor_paid,
          has_ofa_seen_profit, bill_logged_in_qb, referral_paid_out, tax_total, tax_breakdown
        ) values (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,
          $13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,0,'[]'::jsonb
        )`,
        [
          r.id,
          r.is_legacy,
          r.source,
          r.date_of_flight,
          r.operator_po,
          r.client_name,
          r.route_text,
          r.aircraft_type,
          r.tail_number,
          r.vendor_name,
          r.pay_terms,
          r.referral_name,
          r.client_invoiced_amount,
          r.vendor_amount,
          r.margin,
          r.funded_by,
          r.deposited_to,
          r.check_deposit_number,
          r.jonnys_profits,
          r.jonny_invested,
          r.jonny_money_owed,
          r.jonny_money_returned,
          r.was_it_paid,
          r.vendor_paid,
          r.investor_paid,
          r.has_ofa_seen_profit,
          r.bill_logged_in_qb,
          r.referral_paid_out,
        ],
      )
      n++
    }
    console.log(`Imported ${n} financial rows`)
  } finally {
    await client.end()
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
