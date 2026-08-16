/**
 * Trip → branded invoice email template (ETA-sheet chrome + balance due).
 */

import type { InvoiceEmailTemplate } from '@/domain/invoiceEmail'
import { charterContractUrlFromEnv, invoiceTripFacts } from '@/lib/invoiceTripFacts'
import { buildEtaSheetEmailTemplate } from '@/lib/buildEtaSheetEmail'
import {
  computeEtaSheetFromBookedTrip,
  type EtaSheetContext,
} from '@/lib/etaSheet'
import { invoiceEmailLogoUrl } from '@/lib/invoiceEmailLogo'
import {
  patternLabelForService,
  shortLaneLabel,
  type EtaSheetEmailMilestone,
  type EtaSheetEmailStop,
} from '@/domain/etaSheetEmail'
import type { TripStoreRow } from '@/lib/tripStore'
import { DateTime } from 'luxon'

function shortIcao(code: string | null | undefined): string {
  const c = (code ?? '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (!c) return '—'
  return c.length === 4 && c.startsWith('K') ? c.slice(1) : c
}

function preparedLabel(tz: string): string {
  const zone = tz || 'America/New_York'
  const local = DateTime.utc().setZone(zone)
  return `Prepared ${local.toFormat('ccc LLL d · HH:mm ZZZZ')}`
}

function fallbackStops(
  trip: TripStoreRow,
  originIcao: string,
  destIcao: string,
): { pickup: EtaSheetEmailStop; dropoff: EtaSheetEmailStop } {
  const origin = shortIcao(originIcao)
  const dest = shortIcao(destIcao)
  const pickupAddr = trip.portal_pickup_address?.trim()
  const dropAddr = trip.portal_dropoff_address?.trim()
  return {
    pickup: {
      kind: 'pickup',
      placeBadge: pickupAddr ? 'ADDRESS' : 'AIRPORT',
      title: pickupAddr || `${origin} departure`,
      addressLines: pickupAddr
        ? [pickupAddr]
        : [`Depart via ${origin}`, 'Hangar-side / FBO load as coordinated'],
      footer: `Departs via ${origin}`,
    },
    dropoff: {
      kind: 'dropoff',
      placeBadge: dropAddr ? 'ADDRESS' : 'FBO',
      title: dropAddr || `${dest} arrival`,
      addressLines: dropAddr
        ? [dropAddr]
        : [`Arrive at ${dest}`, 'Your team meets aircraft at FBO ramp'],
      footer: `Arrives at ${dest}`,
    },
  }
}

function fallbackMilestones(
  trip: TripStoreRow,
  originIcao: string,
  destIcao: string,
): EtaSheetEmailMilestone[] {
  const origin = shortIcao(originIcao)
  const dest = shortIcao(destIcao)
  const air = trip.eta_chain.find((l) => l.type === 'air_leg')
  if (air) {
    // Prefer full ETA sheet builder when sheet is available; this is a thin fallback.
    return [
      {
        label: `Wheels up · ${origin}`,
        detail: `Departs ${origin}`,
        projected: null,
        actual: null,
      },
      {
        label: `Landing · ${dest}`,
        detail: `Taxi / FBO ramp at ${dest}`,
        projected: null,
        actual: null,
      },
    ]
  }
  return [
    {
      label: `${origin} → ${dest}`,
      detail: 'Live times on portal',
      projected: null,
      actual: null,
    },
  ]
}

export function buildInvoiceEmailTemplate(opts: {
  trip: TripStoreRow
  portalUrl: string
  amountUsd: number
  poNumber?: string | null
  payUrl?: string | null
  contractUrl?: string | null
  clientName?: string | null
  sheet?: EtaSheetContext | null
}): InvoiceEmailTemplate {
  const { trip, portalUrl } = opts
  const facts = invoiceTripFacts(trip, {
    poNumber: opts.poNumber ?? undefined,
    clientName: opts.clientName ?? undefined,
  })
  const sheet =
    opts.sheet ??
    computeEtaSheetFromBookedTrip(trip, new Date(), { clientFacing: true })

  if (sheet) {
    const eta = buildEtaSheetEmailTemplate({
      trip,
      sheet,
      portalUrl,
    })
    return {
      logoUrl: eta.logoUrl,
      poNumber:
        opts.poNumber?.trim() ||
        eta.poNumber ||
        trip.po_number ||
        trip.quick?.po ||
        `T-${trip.ref}`,
      laneShort: eta.laneShort,
      preparedLabel: eta.preparedLabel,
      patternLabel: eta.patternLabel,
      aircraftType: eta.aircraftType || facts.aircraftType || 'Aircraft TBD',
      aircraftBlurb: eta.aircraftBlurb,
      tail: eta.tail || facts.tail || 'TBD',
      pickup: eta.pickup,
      dropoff: eta.dropoff,
      milestones: eta.milestones,
      portalUrl,
      timezoneNote: eta.timezoneNote,
      phone: eta.phone,
      supportEmail: eta.supportEmail,
      clientName:
        opts.clientName?.trim() ||
        trip.quick?.client_name ||
        null,
      amountUsd: opts.amountUsd,
      payUrl: opts.payUrl ?? null,
      contractUrl: opts.contractUrl ?? charterContractUrlFromEnv(),
      itineraryLines: facts.itineraryLines,
      flightDate: facts.flightDate,
      detailLines: [
        ...(facts.pickupAddress
          ? [`Pick up the part at ${facts.pickupAddress}`]
          : []),
        ...(facts.dropoffAddress
          ? [`Drop off part at ${facts.dropoffAddress}`]
          : []),
        ...(facts.extraNotes ? [facts.extraNotes] : []),
      ],
    }
  }

  const lane = trip.lane || ''
  const air = trip.eta_chain.find((l) => l.type === 'air_leg') ?? null
  const originIcao =
    air?.from.icao ||
    trip.quick?.legs[0]?.origin_icao ||
    lane.split(/→|->/)[0] ||
    'DEP'
  const destIcao =
    air?.to.icao ||
    trip.quick?.legs[0]?.dest_icao ||
    lane.split(/→|->/).pop() ||
    'ARR'
  const tz =
    air?.from.tz || trip.eta_chain[0]?.from.tz || 'America/New_York'
  const stops = fallbackStops(trip, originIcao, destIcao)
  const aircraft =
    facts.aircraftType ||
    trip.quick?.aircraft_type ||
    trip.offers.find((o) => o.state === 'selected')?.type_name ||
    'Aircraft TBD'
  const tail =
    facts.tail ||
    trip.quick?.tail ||
    trip.offers.find((o) => o.state === 'selected')?.tail ||
    'TBD'

  return {
    logoUrl: invoiceEmailLogoUrl(),
    poNumber:
      opts.poNumber?.trim() ||
      trip.po_number?.trim() ||
      trip.quick?.po?.trim() ||
      `T-${trip.ref}`,
    laneShort:
      shortLaneLabel(lane) ||
      `${shortIcao(originIcao)} → ${shortIcao(destIcao)}`,
    preparedLabel: preparedLabel(tz),
    patternLabel: patternLabelForService(trip.service_pattern),
    aircraftType: aircraft,
    aircraftBlurb: 'Cargo configuration',
    tail,
    pickup: stops.pickup,
    dropoff: stops.dropoff,
    milestones: fallbackMilestones(trip, originIcao, destIcao),
    portalUrl,
    timezoneNote: 'Stop-local times · Zulu in parentheses',
    clientName:
      opts.clientName?.trim() || trip.quick?.client_name || null,
    amountUsd: opts.amountUsd,
    payUrl: opts.payUrl ?? null,
    contractUrl: opts.contractUrl ?? charterContractUrlFromEnv(),
    itineraryLines: facts.itineraryLines,
    flightDate: facts.flightDate,
    detailLines: [
      ...(facts.pickupAddress
        ? [`Pick up the part at ${facts.pickupAddress}`]
        : []),
      ...(facts.dropoffAddress
        ? [`Drop off part at ${facts.dropoffAddress}`]
        : []),
      ...(facts.extraNotes ? [facts.extraNotes] : []),
    ],
  }
}
