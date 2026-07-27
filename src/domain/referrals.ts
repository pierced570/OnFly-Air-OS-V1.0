/**
 * Referral partners — people who send OnFly work (profit share).
 * Pure TS; amounts owed are tracked on financial_records, not a parallel spine.
 *
 * Payout cadence: entire calendar months (flight date). August 1–31 is one tab,
 * typically remitted in September with a statement of margin math.
 */

export type ReferralShareMode = 'flat' | 'percent_margin'

export type ReferralBanking = {
  bank_name: string
  routing_number: string
  account_number: string
  account_type: 'checking' | 'savings' | ''
}

export type ReferralPerson = {
  id: string
  name: string
  email: string
  cell: string
  /** flat = fixed $ per trip; percent_margin = % of trip gross margin */
  share_mode: ReferralShareMode
  /** Dollars when flat; percent points when percent_margin (e.g. 10 = 10%). */
  share_value: number
  notes: string
  /** W-9 on file for 1099 / remittance. */
  w9_on_file: boolean
  w9_filename: string
  w9_received_at: string | null
  banking: ReferralBanking
  active: boolean
  created_at: string
}

export type ReferralPayoutRow = {
  referral_id: string | null
  referral_name: string
  trip_count: number
  total_share: number
  unpaid_share: number
  paid_share: number
}

/** One calendar month of trips for a referral partner. */
export type ReferralMonthTab = {
  /** YYYY-MM */
  month_key: string
  /** Human label e.g. August 2026 */
  label: string
  trip_count: number
  /** Sum of trip gross margins (client − vendor) */
  gross_margin_total: number
  share_total: number
  unpaid_share: number
  paid_share: number
  /** All trips in the month are marked paid_out */
  fully_paid: boolean
  /** Any unpaid share remains */
  has_unpaid: boolean
  trip_ids: string[]
}

export type ReferralMonthTripLine = {
  id: string
  date_of_flight: string | null
  client_name: string | null
  route_text: string | null
  operator_po: string | null
  client_invoiced_amount: number
  vendor_amount: number
  margin: number
  referral_share_amount: number
  referral_paid_out: boolean
}

export type ReferralMonthStatement = {
  partner_name: string
  partner_email: string
  month_key: string
  label: string
  share_mode: ReferralShareMode
  share_value: number
  share_label: string
  lines: ReferralMonthTripLine[]
  gross_margin_total: number
  share_total: number
  unpaid_share: number
  paid_share: number
  /** Plain-text remittance statement for email / print. */
  body_text: string
}

export function emptyReferralBanking(): ReferralBanking {
  return {
    bank_name: '',
    routing_number: '',
    account_number: '',
    account_type: '',
  }
}

export function emptyReferralPerson(): Omit<ReferralPerson, 'id' | 'created_at'> {
  return {
    name: '',
    email: '',
    cell: '',
    share_mode: 'percent_margin',
    share_value: 10,
    notes: '',
    w9_on_file: false,
    w9_filename: '',
    w9_received_at: null,
    banking: emptyReferralBanking(),
    active: true,
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/** Resolve $ share for a trip from person defaults + trip margin. */
export function computeReferralShareAmount(opts: {
  share_mode: ReferralShareMode
  share_value: number
  margin: number
  /** Explicit override when dispatcher sets a one-off amount. */
  override_amount?: number | null
}): number {
  if (opts.override_amount != null && Number.isFinite(opts.override_amount)) {
    return round2(Math.max(0, opts.override_amount))
  }
  const v = Math.max(0, opts.share_value || 0)
  if (opts.share_mode === 'percent_margin') {
    return round2(Math.max(0, opts.margin) * (v / 100))
  }
  return round2(v)
}

export function summarizeReferralPayouts(
  rows: Array<{
    referral_name: string | null
    referral_share_amount?: number | null
    referral_paid_out: boolean
  }>,
  people: Array<{ id: string; name: string }>,
): ReferralPayoutRow[] {
  const byKey = new Map<string, ReferralPayoutRow>()
  const idByName = new Map(
    people.map((p) => [p.name.trim().toLowerCase(), p.id] as const),
  )

  for (const r of rows) {
    const name = (r.referral_name ?? '').trim()
    if (!name) continue
    const key = name.toLowerCase()
    const share = Math.max(0, Number(r.referral_share_amount) || 0)
    let row = byKey.get(key)
    if (!row) {
      row = {
        referral_id: idByName.get(key) ?? null,
        referral_name: name,
        trip_count: 0,
        total_share: 0,
        unpaid_share: 0,
        paid_share: 0,
      }
      byKey.set(key, row)
    }
    row.trip_count += 1
    row.total_share = round2(row.total_share + share)
    if (r.referral_paid_out) {
      row.paid_share = round2(row.paid_share + share)
    } else {
      row.unpaid_share = round2(row.unpaid_share + share)
    }
  }

  return [...byKey.values()].sort((a, b) =>
    b.unpaid_share !== a.unpaid_share
      ? b.unpaid_share - a.unpaid_share
      : a.referral_name.localeCompare(b.referral_name),
  )
}

/** Flight-date → YYYY-MM (UTC calendar month). Blank dates → "unknown". */
export function referralFlightMonthKey(
  dateOfFlight: string | null | undefined,
): string {
  const raw = (dateOfFlight ?? '').trim()
  if (!raw) return 'unknown'
  // Prefer YYYY-MM-DD prefix without timezone shift.
  const m = /^(\d{4})-(\d{2})/.exec(raw)
  if (m) return `${m[1]}-${m[2]}`
  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) return 'unknown'
  const y = d.getUTCFullYear()
  const mo = String(d.getUTCMonth() + 1).padStart(2, '0')
  return `${y}-${mo}`
}

export function referralMonthLabel(monthKey: string): string {
  if (monthKey === 'unknown') return 'Unknown flight date'
  const m = /^(\d{4})-(\d{2})$/.exec(monthKey)
  if (!m) return monthKey
  const months = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ]
  const idx = Number(m[2]) - 1
  const name = months[idx] ?? m[2]
  return `${name} ${m[1]}`
}

export function shareTermsLabel(
  mode: ReferralShareMode,
  value: number,
): string {
  if (mode === 'percent_margin') return `${value}% of gross margin`
  return `${usdPlain(value)} flat per trip`
}

function usdPlain(n: number): string {
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

type Financialish = {
  id: string
  date_of_flight: string | null
  client_name: string | null
  route_text: string | null
  operator_po: string | null
  client_invoiced_amount: number
  vendor_amount: number
  margin: number
  referral_name: string | null
  referral_share_amount: number
  referral_paid_out: boolean
}

/** Monthly running tabs for one partner (newest month first). */
export function buildReferralMonthTabs(
  rows: Financialish[],
  partnerName: string,
): ReferralMonthTab[] {
  const needle = partnerName.trim().toLowerCase()
  if (!needle) return []
  const byMonth = new Map<
    string,
    {
      trip_ids: string[]
      gross_margin_total: number
      share_total: number
      unpaid_share: number
      paid_share: number
    }
  >()

  for (const r of rows) {
    if ((r.referral_name ?? '').trim().toLowerCase() !== needle) continue
    const key = referralFlightMonthKey(r.date_of_flight)
    let bucket = byMonth.get(key)
    if (!bucket) {
      bucket = {
        trip_ids: [],
        gross_margin_total: 0,
        share_total: 0,
        unpaid_share: 0,
        paid_share: 0,
      }
      byMonth.set(key, bucket)
    }
    const share = Math.max(0, Number(r.referral_share_amount) || 0)
    const margin = Number(r.margin) || 0
    bucket.trip_ids.push(r.id)
    bucket.gross_margin_total = round2(bucket.gross_margin_total + margin)
    bucket.share_total = round2(bucket.share_total + share)
    if (r.referral_paid_out) {
      bucket.paid_share = round2(bucket.paid_share + share)
    } else {
      bucket.unpaid_share = round2(bucket.unpaid_share + share)
    }
  }

  return [...byMonth.entries()]
    .map(([month_key, b]) => ({
      month_key,
      label: referralMonthLabel(month_key),
      trip_count: b.trip_ids.length,
      gross_margin_total: b.gross_margin_total,
      share_total: b.share_total,
      unpaid_share: b.unpaid_share,
      paid_share: b.paid_share,
      fully_paid: b.unpaid_share <= 0 && b.share_total > 0,
      has_unpaid: b.unpaid_share > 0,
      trip_ids: b.trip_ids,
    }))
    .sort((a, b) => b.month_key.localeCompare(a.month_key))
}

/** Statement with trip-level margin math for remittance to the partner. */
export function buildReferralMonthStatement(opts: {
  person: Pick<
    ReferralPerson,
    'name' | 'email' | 'share_mode' | 'share_value'
  >
  monthKey: string
  rows: Financialish[]
}): ReferralMonthStatement {
  const needle = opts.person.name.trim().toLowerCase()
  const lines: ReferralMonthTripLine[] = opts.rows
    .filter(
      (r) =>
        (r.referral_name ?? '').trim().toLowerCase() === needle &&
        referralFlightMonthKey(r.date_of_flight) === opts.monthKey,
    )
    .sort((a, b) =>
      (a.date_of_flight ?? '').localeCompare(b.date_of_flight ?? ''),
    )
    .map((r) => ({
      id: r.id,
      date_of_flight: r.date_of_flight,
      client_name: r.client_name,
      route_text: r.route_text,
      operator_po: r.operator_po,
      client_invoiced_amount: Number(r.client_invoiced_amount) || 0,
      vendor_amount: Number(r.vendor_amount) || 0,
      margin: Number(r.margin) || 0,
      referral_share_amount: Math.max(0, Number(r.referral_share_amount) || 0),
      referral_paid_out: Boolean(r.referral_paid_out),
    }))

  const gross_margin_total = round2(
    lines.reduce((s, l) => s + l.margin, 0),
  )
  const share_total = round2(
    lines.reduce((s, l) => s + l.referral_share_amount, 0),
  )
  const unpaid_share = round2(
    lines
      .filter((l) => !l.referral_paid_out)
      .reduce((s, l) => s + l.referral_share_amount, 0),
  )
  const paid_share = round2(share_total - unpaid_share)
  const share_label = shareTermsLabel(
    opts.person.share_mode,
    opts.person.share_value,
  )
  const label = referralMonthLabel(opts.monthKey)

  const lineBits = lines.map((l) => {
    const math =
      opts.person.share_mode === 'percent_margin'
        ? `margin ${usdPlain(l.margin)} × ${opts.person.share_value}% = ${usdPlain(l.referral_share_amount)}`
        : `flat share ${usdPlain(l.referral_share_amount)}`
    return [
      `${l.date_of_flight ?? '—'}  ${l.client_name ?? '—'}  ${l.route_text ?? '—'}`,
      `  Client ${usdPlain(l.client_invoiced_amount)} − Vendor ${usdPlain(l.vendor_amount)} = Gross margin ${usdPlain(l.margin)}`,
      `  ${math}${l.referral_paid_out ? '  [PAID]' : ''}`,
    ].join('\n')
  })

  const body_text = [
    `OnFly Air — Referral payout statement`,
    `Partner: ${opts.person.name}`,
    opts.person.email ? `Email: ${opts.person.email}` : null,
    `Period: ${label} (${opts.monthKey === 'unknown' ? 'dates TBD' : opts.monthKey})`,
    `Terms: ${share_label}`,
    ``,
    ...lineBits,
    ``,
    `Gross margin total: ${usdPlain(gross_margin_total)}`,
    `Share total: ${usdPlain(share_total)}`,
    unpaid_share > 0 ? `Amount due: ${usdPlain(unpaid_share)}` : `Amount due: $0.00 (paid)`,
    paid_share > 0 && unpaid_share > 0
      ? `Already paid within period: ${usdPlain(paid_share)}`
      : null,
  ]
    .filter((x) => x != null)
    .join('\n')

  return {
    partner_name: opts.person.name,
    partner_email: opts.person.email,
    month_key: opts.monthKey,
    label,
    share_mode: opts.person.share_mode,
    share_value: opts.person.share_value,
    share_label,
    lines,
    gross_margin_total,
    share_total,
    unpaid_share,
    paid_share,
    body_text,
  }
}

/** Partner profile readiness for payout (W-9 + email + banking). */
export function referralPayoutReady(person: ReferralPerson): {
  ready: boolean
  missing: string[]
} {
  const missing: string[] = []
  if (!person.email.trim()) missing.push('email')
  if (!person.w9_on_file) missing.push('W-9')
  if (!person.banking.routing_number.trim()) missing.push('routing number')
  if (!person.banking.account_number.trim()) missing.push('account number')
  return { ready: missing.length === 0, missing }
}
