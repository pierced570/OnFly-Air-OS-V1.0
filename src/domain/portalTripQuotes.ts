/**
 * Build portal-safe logistics quote option cards from trip quote fields.
 * Same view model as /accept and the hard-quote email — no operator names.
 * Pure domain — no tripStore / React imports.
 */

import {
  buildCharterMissionChips,
  buildLogisticsQuoteOption,
  finalizeLogisticsQuoteOptions,
  logisticsQuoteTitle,
  type CharterQuoteMissionChip,
  type LogisticsQuoteOptionView,
} from '@/domain/clientLogisticsQuote'
import { DEFAULT_QUICK_TURN_MIN } from '@/domain/offerQuoteTiming'

export type PortalTripQuoteOptionInput = {
  offer_id: string
  label: string
  client_total: number
  type_name?: string | null
  time_to_position_min?: number | null
  quick_turn_min?: number | null
  live_leg_min?: number | null
}

export type PortalTripQuoteOfferInput = {
  id: string
  state?: string
  type_name?: string | null
  time_to_position_min?: number | null
  quick_turn_min?: number | null
  live_leg_min?: number | null
  replied_at?: string | null
}

export type PortalTripQuoteInput = {
  lane: string
  ref?: number | string | null
  code?: string | null
  promised_delivery?: string | null
  payload_summary?: string | null
  ready_label?: string | null
  portal_pickup_address?: string | null
  portal_dropoff_address?: string | null
  offers?: PortalTripQuoteOfferInput[]
  hard_quote?: {
    total: number
    accept_token?: string | null
    sent_at?: string | null
    payload_kind?: 'cargo' | 'pax' | 'both' | null
    options?: PortalTripQuoteOptionInput[] | null
  } | null
}

export type PortalTripQuoteBundle = {
  title: string
  acceptHref: string | null
  options: LogisticsQuoteOptionView[]
  missionChips: CharterQuoteMissionChip[]
  refLabel: string | null
  /** True when hard quote exists with at least one client-facing option. */
  hasOptions: boolean
}

/** Options + accept link for Pending › Quote ready trips. */
export function buildPortalTripQuoteBundle(
  trip: PortalTripQuoteInput | null | undefined,
): PortalTripQuoteBundle | null {
  if (!trip) return null
  const hq = trip.hard_quote
  if (!hq) return null
  if (!hq.accept_token && !hq.options?.length && !(hq.total > 0)) return null

  const offers = trip.offers ?? []
  const rawOptions =
    hq.options?.length ?
      hq.options
    : [
        {
          offer_id: offers.find((o) => o.state === 'selected')?.id ?? '_',
          label: 'Option A',
          client_total: hq.total,
          type_name: null as string | null,
          time_to_position_min: null as number | null,
          quick_turn_min: null as number | null,
          live_leg_min: null as number | null,
        },
      ]

  const options = finalizeLogisticsQuoteOptions(
    rawOptions.map((opt, i) => {
      const offer = offers.find((o) => o.id === opt.offer_id)
      return buildLogisticsQuoteOption({
        offer_id: opt.offer_id,
        label: opt.label,
        option_index: i,
        type_name: opt.type_name ?? offer?.type_name,
        time_to_position_min:
          opt.time_to_position_min ?? offer?.time_to_position_min,
        quick_turn_min:
          opt.quick_turn_min ?? offer?.quick_turn_min ?? DEFAULT_QUICK_TURN_MIN,
        live_leg_min: opt.live_leg_min ?? offer?.live_leg_min,
        client_total: opt.client_total,
        lane: trip.lane,
        goAtIso: hq.sent_at ?? offer?.replied_at ?? null,
        pickup_location: trip.portal_pickup_address,
        dropoff_location: trip.portal_dropoff_address,
      })
    }),
  )

  const kind = hq.payload_kind ?? 'cargo'
  const missionChips = buildCharterMissionChips({
    payload_kind: kind,
    payload_summary: trip.payload_summary,
    ready_label: trip.ready_label,
  })

  const ref =
    (trip.code ?? '').toString().trim() ||
    (trip.ref != null ? `T-${trip.ref}` : null)

  return {
    title: logisticsQuoteTitle(trip.lane),
    acceptHref: hq.accept_token ? `/accept/${hq.accept_token}` : null,
    options,
    missionChips,
    refLabel: ref,
    hasOptions: options.length > 0,
  }
}
