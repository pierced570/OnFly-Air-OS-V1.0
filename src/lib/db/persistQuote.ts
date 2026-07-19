/**
 * Persist quote rows + tax_breakdown to Supabase `quotes` table.
 */

import { canPersist, db, safeQuery } from '@/lib/db/client'

export type PersistQuoteInput = {
  tripId: string
  kind: 'estimated' | 'hard'
  total: number
  airSubtotal: number
  taxLines: Array<{ code?: string; label?: string; amount: number }>
  options: unknown[]
  markupMode?: string | null
  markupValue?: number | null
  acceptToken?: string | null
  carrierDisclosed?: boolean
  disclosureText?: string | null
}

export async function persistQuoteRow(
  input: PersistQuoteInput,
): Promise<string | null> {
  if (!canPersist()) return null
  const tax_breakdown = {
    air_subtotal: input.airSubtotal,
    lines: input.taxLines,
  }
  const inserted = await safeQuery<{ id: string }>('quotes.insert', () =>
    db()
      .from('quotes')
      .insert({
        trip_id: input.tripId,
        kind: input.kind,
        options: input.options,
        markup_mode: input.markupMode ?? null,
        markup_value: input.markupValue ?? null,
        tax_breakdown,
        total: input.total,
        carrier_disclosed: input.carrierDisclosed ?? false,
        disclosure_text: input.disclosureText ?? null,
        accept_token: input.acceptToken ?? null,
        sent_at: new Date().toISOString(),
      })
      .select('id')
      .maybeSingle(),
  )
  if (inserted && typeof inserted === 'object' && 'id' in inserted) {
    return String(inserted.id)
  }
  return null
}

export async function persistInvoiceRow(opts: {
  tripId: string
  qbInvoiceId: string
  total: number
}): Promise<void> {
  if (!canPersist()) return
  await safeQuery('invoices.insert', () =>
    db().from('invoices').insert({
      trip_id: opts.tripId,
      qb_invoice_id: opts.qbInvoiceId,
      total: opts.total,
      sent_at: new Date().toISOString(),
    }),
  )
}
