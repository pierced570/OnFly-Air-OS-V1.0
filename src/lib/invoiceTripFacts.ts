/**
 * Trip → invoice email / QBO memo facts (desk + portal).
 */

import {
  buildInvoiceItineraryLines,
  buildInvoiceStopNotes,
} from '@/domain/qbInvoice'
import { parseLooseDurationMinutes } from '@/domain/quickDispatchChain'
import { formatClientLocal } from '@/domain/timeFmt'
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

function shortIcao(code: string | null | undefined): string {
  const c = (code ?? '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (!c) return ''
  return c.length === 4 && c.startsWith('K') ? c.slice(1) : c
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

  const pickupAddress = trip.portal_pickup_address?.trim() || null
  const dropoffAddress = trip.portal_dropoff_address?.trim() || null

  // Local wheels-up clock at origin (fills "ETA (ENTER ETA in LOCAL TIME)").
  const pickupEtaIso = airLeg?.est_start || positionLeg?.est_end || null
  const pickupTz =
    airLeg?.from.tz || positionLeg?.to.tz || positionLeg?.from.tz || 'UTC'
  const pickupEtaLocal = pickupEtaIso
    ? formatClientLocal(pickupEtaIso, pickupTz).local
    : null

  const pickupFbo =
    pickupAddress ||
    (shortIcao(originIcao) ? shortIcao(originIcao) : null)
  const dropoffFbo =
    dropoffAddress ||
    (shortIcao(destIcao) ? shortIcao(destIcao) : null)

  const itineraryLines = buildInvoiceItineraryLines({
    lane,
    pickupEtaMin,
    liveLegMin,
    originIcao,
    destIcao,
    pickupFbo,
    dropoffFbo,
    pickupEtaLocal,
  })

  const stopNotes = buildInvoiceStopNotes({
    pickupAddress,
    dropoffAddress,
  })
  const notes = trip.quick?.notes?.trim() || null
  // Prefer structured stop notes; keep freeform notes if they aren't duplicates.
  // Never pass through leftover QBO (ENTER …) template paste.
  const extraNotes =
    notes &&
    !/\(\s*ENTER[^)]*\)/i.test(notes) &&
    !stopNotes.some((s) => notes.toLowerCase().includes(s.toLowerCase()))
      ? notes
      : null

  // Always emit itinerary from QD legs even when ETA clocks are still TBD —
  // never leave the QBO memo / email middle as blank (ENTER …) template copy.
  const safeItinerary =
    itineraryLines.length > 0
      ? itineraryLines
      : buildInvoiceItineraryLines({
          lane,
          originIcao: quickLeg?.origin_icao || null,
          destIcao: quickLeg?.dest_icao || null,
          pickupFbo: pickupAddress || shortIcao(quickLeg?.origin_icao) || null,
          dropoffFbo: dropoffAddress || shortIcao(quickLeg?.dest_icao) || null,
          liveLegMin:
            quickLeg != null
              ? parseLooseDurationMinutes(quickLeg.live_leg_time)
              : null,
          pickupEtaMin:
            quickLeg != null
              ? parseLooseDurationMinutes(quickLeg.repo_time)
              : null,
        })

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
    itineraryLines: safeItinerary,
    pickupAddress,
    dropoffAddress,
    extraNotes,
    contractUrl: charterContractUrlFromEnv(),
  }
}
