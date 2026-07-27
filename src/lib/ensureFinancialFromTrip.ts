/**
 * Create / update a financial_records row when a trip is booked.
 * Keeps OFA ledger on the Trip spine (no parallel books).
 */

import { computeReferralShareAmount } from '@/domain/referrals'
import {
  newVendorLine,
  type FinancialRecord,
  type FinancialVendorLine,
} from '@/domain/financials'
import { unifyAircraftType } from '@/lib/aircraftTypeCatalog'
import { getReferral, getReferralByName } from '@/lib/referralStore'
import { upsertFinancial, getFinancial } from '@/lib/financialsStore'
import type { TripStoreRow } from '@/lib/tripStore'

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function flightDateFromTrip(trip: TripStoreRow): string | null {
  const fromQuick = trip.quick?.legs?.[0]?.date
  if (fromQuick) return fromQuick
  const ready = trip.ready_label
  if (/^\d{4}-\d{2}-\d{2}/.test(ready)) return ready.slice(0, 10)
  return new Date().toISOString().slice(0, 10)
}

export function financialIdForTrip(tripId: string): string {
  return `trip-${tripId}`
}

/** Upsert ledger row from a booked trip (QD or accept). */
export function ensureFinancialFromBookedTrip(trip: TripStoreRow): FinancialRecord {
  const id = financialIdForTrip(trip.id)
  const existing = getFinancial(id)

  const clientPrice =
    trip.quick?.client_price ??
    trip.hard_quote?.total ??
    existing?.client_invoiced_amount ??
    0
  const vendorCost =
    trip.quick?.vendor_cost ?? existing?.vendor_amount ?? 0
  const margin = round2(Number(clientPrice) - Number(vendorCost))

  const referralName =
    (trip.referral?.name || trip.quick?.referred_by || existing?.referral_name || '')
      .trim() || null
  const person =
    (trip.referral?.id ? getReferral(trip.referral.id) : undefined) ||
    (referralName ? getReferralByName(referralName) : undefined)

  const shareOverrideRaw =
    trip.referral?.share_amount ?? trip.quick?.referral_share_amount
  const shareOverride =
    shareOverrideRaw != null && Number.isFinite(Number(shareOverrideRaw))
      ? Number(shareOverrideRaw)
      : null

  const referral_share_amount = referralName
    ? computeReferralShareAmount({
        share_mode: person?.share_mode ?? 'flat',
        share_value: person?.share_value ?? 0,
        margin,
        override_amount: shareOverride,
      })
    : 0

  const selected = trip.offers.find((o) => o.state === 'selected')
  const po =
    trip.quick?.po || trip.po_number || existing?.operator_po || null
  const aircraftType =
    unifyAircraftType(
      trip.quick?.aircraft_type ||
        selected?.type_name ||
        existing?.aircraft_type ||
        '',
    ) || null
  const tail =
    trip.quick?.tail || selected?.tail || existing?.tail_number || null
  const vendorName =
    trip.quick?.operator_name ||
    selected?.operator_name ||
    existing?.vendor_name ||
    null
  const payTerms = trip.quick?.pay_terms || existing?.pay_terms || 'Net 30'

  // Keep extra vendors already on the ledger; refresh / seed the primary aircraft line.
  const priorLines = existing?.vendor_lines ?? []
  const nonAircraft = priorLines.filter((l) => l.kind !== 'aircraft')
  const priorAircraft =
    priorLines.find((l) => l.kind === 'aircraft') ?? priorLines[0]
  const aircraftLine: FinancialVendorLine = newVendorLine({
    id: priorAircraft?.id ?? `${id}-aircraft`,
    kind: 'aircraft',
    vendor_name: vendorName ?? priorAircraft?.vendor_name ?? '',
    tail_number: tail,
    aircraft_type: aircraftType,
    amount:
      Number(vendorCost) ||
      priorAircraft?.amount ||
      0,
    pay_terms: payTerms,
    vendor_paid: priorAircraft?.vendor_paid ?? existing?.vendor_paid ?? false,
    bill_logged_in_qb:
      priorAircraft?.bill_logged_in_qb ?? existing?.bill_logged_in_qb ?? false,
    vendor_bill_url:
      priorAircraft?.vendor_bill_url ?? existing?.vendor_bill_url ?? null,
    vendor_bill_verified:
      priorAircraft?.vendor_bill_verified ??
      existing?.vendor_bill_verified ??
      false,
    notes: priorAircraft?.notes ?? null,
  })
  const vendor_lines = [aircraftLine, ...nonAircraft]

  const row: FinancialRecord = {
    id,
    is_legacy: false,
    source: trip.quick ? 'quick_dispatch' : 'live',
    date_of_flight: flightDateFromTrip(trip),
    operator_po: po,
    client_name:
      trip.quick?.client_name ||
      existing?.client_name ||
      null,
    route_text: trip.lane || existing?.route_text || null,
    aircraft_type: aircraftType,
    tail_number: tail,
    vendor_name: vendorName,
    pay_terms: payTerms,
    referral_name: referralName,
    referral_share_amount,
    client_subtotal_pre_tax:
      existing?.client_subtotal_pre_tax ?? (Number(clientPrice) || null),
    tax_total: existing?.tax_total ?? 0,
    tax_breakdown: existing?.tax_breakdown ?? [],
    client_invoiced_amount: Number(clientPrice) || 0,
    vendor_amount: Number(vendorCost) || 0,
    margin,
    funded_by: existing?.funded_by ?? 'Jonny 1%',
    deposited_to: existing?.deposited_to ?? null,
    check_deposit_number: existing?.check_deposit_number ?? null,
    jonnys_profits: existing?.jonnys_profits ?? 0,
    jonny_invested: existing?.jonny_invested ?? 0,
    jonny_money_owed: existing?.jonny_money_owed ?? 0,
    jonny_money_returned: existing?.jonny_money_returned ?? 0,
    ofa_profit_per_trip: existing?.ofa_profit_per_trip ?? 0,
    was_it_paid: existing?.was_it_paid ?? false,
    vendor_paid: existing?.vendor_paid ?? false,
    investor_paid: existing?.investor_paid ?? false,
    has_ofa_seen_profit: existing?.has_ofa_seen_profit ?? false,
    bill_logged_in_qb: existing?.bill_logged_in_qb ?? false,
    referral_paid_out: existing?.referral_paid_out ?? false,
    vendor_bill_url: existing?.vendor_bill_url ?? null,
    vendor_bill_verified: existing?.vendor_bill_verified ?? false,
    notes: trip.quick?.notes || existing?.notes || null,
    vendor_lines,
    qb_invoice_id: existing?.qb_invoice_id,
    qb_invoice_number: existing?.qb_invoice_number,
    invoice_date: existing?.invoice_date,
    due_date: existing?.due_date,
    po_number: po || existing?.po_number,
  }

  upsertFinancial(row)
  return row
}
