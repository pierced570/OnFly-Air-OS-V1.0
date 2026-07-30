/**
 * Trip → invoice email / QBO memo facts (desk + portal).
 */

import {
  buildInvoiceItineraryLines,
  buildInvoiceStopNotes,
} from '@/domain/qbInvoice'
import { parseLooseDurationMinutes } from '@/domain/quickDispatchChain'
import type { TripStoreRow } from '@/lib/tripStore'

export type InvoiceTripFacts = {
  clientName: string
  lane: string
  poNumber: string
  amountUsd: number
  flightDate: string | null
  aircraftType: string | null
  tail: string | null
  payTerms: string
  itineraryLines: string[]
  pickupAddress: string | null
  dropoffAddress: string | null
  extraNotes: string | null
  contractUrl: string | null
}

export function charterContractUrlFromEnv(): string | null {
  const raw = import.meta.env.VITE_CHARTER_CONTRACT_URL
  if (typeof raw === 'string') {
    const u = raw.trim()
    if (u.startsWith('https://') || u.startsWith('http://')) return u
  }
  return null
}

export function invoiceTripFacts(
  trip: TripStoreRow,
  opts?: { poNumber?: string; clientName?: string },
): InvoiceTripFacts {
  const selected =
    trip.offers.find((o) => o.state === 'selected') ??
    trip.offers.find((o) => o.state === 'quoted')
  const amountUsd =
    trip.quick?.client_price ?? trip.hard_quote?.total ?? trip.invoice?.total ?? 0
  const lane = trip.lane || ''
  const flightDate = trip.quick?.legs[0]?.date ?? null
  const aircraftType =
    trip.quick?.aircraft_type || selected?.type_name || null
  const tail = trip.quick?.tail || selected?.tail || null
  const payTerms = trip.quick?.pay_terms || 'Net 30'

  const positionLeg = trip.eta_chain.find(
    (l) => l.type === 'position' || l.duration_key === 'acft_ttp',
  )
  const airLeg = trip.eta_chain.find((l) => l.type === 'air_leg')
  const quickLeg = trip.quick?.legs[0]
  const pickupEtaMin =
    positionLeg?.duration_min ??
    (quickLeg ? parseLooseDurationMinutes(quickLeg.repo_time) : null) ??
    selected?.time_to_position_min ??
    null
  const liveLegMin =
    airLeg?.duration_min ??
    (quickLeg ? parseLooseDurationMinutes(quickLeg.live_leg_time) : null) ??
    selected?.live_leg_min ??
    null
  const originIcao =
    airLeg?.from.icao ||
    quickLeg?.origin_icao ||
    positionLeg?.to.icao ||
    null
  const destIcao = airLeg?.to.icao || quickLeg?.dest_icao || null

  const itineraryLines = buildInvoiceItineraryLines({
    lane,
    pickupEtaMin,
    liveLegMin,
    originIcao,
    destIcao,
  })

  const pickupAddress =
    trip.portal_pickup_address?.trim() ||
    null
  const dropoffAddress =
    trip.portal_dropoff_address?.trim() ||
    null

  const stopNotes = buildInvoiceStopNotes({
    pickupAddress,
    dropoffAddress,
  })
  const notes = trip.quick?.notes?.trim() || null
  // Prefer structured stop notes; keep freeform notes if they aren't duplicates.
  const extraNotes =
    notes &&
    !stopNotes.some((s) => notes.toLowerCase().includes(s.toLowerCase()))
      ? notes
      : null

  return {
    clientName: opts?.clientName?.trim() || trip.quick?.client_name || 'Client',
    lane,
    poNumber:
      opts?.poNumber?.trim() ||
      trip.po_number?.trim() ||
      trip.quick?.po?.trim() ||
      '',
    amountUsd,
    flightDate,
    aircraftType,
    tail,
    payTerms,
    itineraryLines,
    pickupAddress,
    dropoffAddress,
    extraNotes,
    contractUrl: charterContractUrlFromEnv(),
  }
}
