/**
 * Referral partners — people who send OnFly work (profit share).
 * Pure TS; amounts owed are tracked on financial_records, not a parallel spine.
 */

export type ReferralShareMode = 'flat' | 'percent_margin'

export type ReferralPerson = {
  id: string
  name: string
  email: string
  cell: string
  /** flat = fixed $ per trip; percent_margin = % of trip margin */
  share_mode: ReferralShareMode
  /** Dollars when flat; percent points when percent_margin (e.g. 10 = 10%). */
  share_value: number
  notes: string
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

export function emptyReferralPerson(): Omit<ReferralPerson, 'id' | 'created_at'> {
  return {
    name: '',
    email: '',
    cell: '',
    share_mode: 'flat',
    share_value: 0,
    notes: '',
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
