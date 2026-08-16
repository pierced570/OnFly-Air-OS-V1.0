/**
 * Build QuickBooks invoice lines from a trip — one client-facing all-in line.
 * FET / segment / cargo tax are computed for the financials ledger only.
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
  /** Client PO — included on the charter line description. */
  poNumber?: string | null
  payloadKind?: 'cargo' | 'pax' | 'both'
  mtowLbs?: number | null
  segmentCount?: number
  paxCount?: number
  /** Optional ground / handling add-on (separate line). */
  groundHandlingUsd?: number | null
  rates: TaxRateRow[]
}

export type TripInvoiceTaxBreakdownLine = {
  code: string
  amount: number
  note: string
}

export type TripInvoiceBuildResult = {
  /** QBO SalesItem lines — single charter (all-in) + optional ground. */
  lines: QbInvoiceLineInput[]
  airAmount: number
  taxTotal: number
  /** Internal ledger split (FET vs segment, etc.) — not on the client invoice. */
  taxBreakdown: TripInvoiceTaxBreakdownLine[]
  clientTotal: number
  fetExempt: boolean
}

/**
 * Client QBO invoice: one all-in charter line (+ ground if any).
 * Tax math is returned in taxBreakdown for Financials — never as QBO lines.
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
  const taxBreakdown: TripInvoiceTaxBreakdownLine[] = tax.lines
    .filter((l) => l.amount > 0)
    .map((l) => ({
      code: l.code,
      amount: l.amount,
      note: l.note,
    }))

  const lines = tripInvoiceLines({
    tripRef: input.tripRef,
    lane: input.lane,
    flightDate: input.flightDate,
    airAmount,
    aircraftType: input.aircraftType,
    tail: input.tail,
    poNumber: input.poNumber,
    taxLines: taxBreakdown,
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
    taxBreakdown,
    clientTotal: allIn,
    fetExempt: tax.fetExempt,
  }
}
