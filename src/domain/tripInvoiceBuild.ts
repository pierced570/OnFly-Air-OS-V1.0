/**
 * Build QuickBooks invoice lines from a trip — air + table-driven tax.
 * Pure TS; rates come from tax_rates (never literals in callers).
 */

import {
  airSubtotalFromClientTotal,
  computeTax,
  type TaxRateRow,
} from '@/domain/tax'
import { tripInvoiceLines, type QbInvoiceLineInput } from '@/domain/qbInvoice'

export type TripInvoiceBuildInput = {
  tripRef: number
  lane: string
  flightDate: string | null
  /** Client all-in total (hard quote / QD client price). */
  clientTotal: number
  aircraftType?: string | null
  tail?: string | null
  payloadKind?: 'cargo' | 'pax' | 'both'
  mtowLbs?: number | null
  segmentCount?: number
  paxCount?: number
  /** Optional ground / handling add-on (separate line). */
  groundHandlingUsd?: number | null
  rates: TaxRateRow[]
}

export type TripInvoiceBuildResult = {
  lines: QbInvoiceLineInput[]
  airAmount: number
  taxTotal: number
  clientTotal: number
  fetExempt: boolean
}

/**
 * Split client all-in into air + FET/tax lines for QBO SalesItem lines.
 * Ground handling (if any) is a separate line and not taxed here.
 */
export function buildTripInvoiceLines(
  input: TripInvoiceBuildInput,
): TripInvoiceBuildResult {
  const ground = Math.max(0, Number(input.groundHandlingUsd ?? 0) || 0)
  const allIn = Math.max(0, Number(input.clientTotal) || 0)
  const taxableTotal = Math.max(0, allIn - ground)

  const payloadKind = input.payloadKind ?? 'cargo'
  const segments = Math.max(1, input.segmentCount ?? 1)
  const paxCount = Math.max(1, input.paxCount ?? 1)

  const taxBase = {
    payloadKind,
    legs: [{ international: false, segments, paxCount }],
    aircraftMtowLbs: input.mtowLbs ?? null,
    rates: input.rates,
  }

  const airAmount = airSubtotalFromClientTotal(taxableTotal, taxBase)
  const tax = computeTax({ ...taxBase, airSubtotal: airAmount })

  const lines = tripInvoiceLines({
    tripRef: input.tripRef,
    lane: input.lane,
    flightDate: input.flightDate,
    airAmount,
    aircraftType: input.aircraftType,
    tail: input.tail,
    taxLines: tax.lines.map((l) => ({
      code: l.code,
      amount: l.amount,
      note: l.note,
    })),
  })

  if (ground > 0) {
    lines.push({
      description: `Ground handling · T-${input.tripRef}`,
      amount: Math.round(ground * 100) / 100,
    })
  }

  return {
    lines,
    airAmount,
    taxTotal: tax.total,
    clientTotal: allIn,
    fetExempt: tax.fetExempt,
  }
}
