/**
 * Build / send hard-quote client emails (logistics format + brand logo).
 */

import {
  buildLogisticsQuoteOption,
  logisticsQuoteTitle,
  type LogisticsQuoteOptionView,
} from '@/domain/clientLogisticsQuote'
import {
  hardQuoteEmailSubject,
  renderHardQuoteEmailHtml,
  renderHardQuoteEmailText,
  type HardQuoteEmailInput,
} from '@/domain/hardQuoteEmail'
import { DEFAULT_QUICK_TURN_MIN } from '@/domain/offerQuoteTiming'
import { resolveBrandLogoUrl } from '@/lib/clientInviteEmail'
import type { TripStoreRow } from '@/lib/tripStore'

export type HardQuoteEmailOptionInput = {
  offer_id: string
  label: string
  type_name?: string | null
  time_to_position_min?: number | null
  quick_turn_min?: number | null
  live_leg_min?: number | null
  client_total: number
}

function acceptAbsoluteUrl(pathOrUrl: string | null | undefined): string | null {
  if (!pathOrUrl?.trim()) return null
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl
  if (typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}${pathOrUrl.startsWith('/') ? '' : '/'}${pathOrUrl}`
  }
  return pathOrUrl
}

export function buildHardQuoteEmailOptions(
  trip: Pick<TripStoreRow, 'lane' | 'offers'>,
  options: HardQuoteEmailOptionInput[],
  goAtIso?: string | null,
): LogisticsQuoteOptionView[] {
  return options.map((opt) => {
    const offer = trip.offers.find((o) => o.id === opt.offer_id)
    return buildLogisticsQuoteOption({
      offer_id: opt.offer_id,
      label: opt.label,
      type_name: opt.type_name ?? offer?.type_name,
      time_to_position_min:
        opt.time_to_position_min ?? offer?.time_to_position_min,
      quick_turn_min:
        opt.quick_turn_min ?? offer?.quick_turn_min ?? DEFAULT_QUICK_TURN_MIN,
      live_leg_min: opt.live_leg_min ?? offer?.live_leg_min,
      client_total: opt.client_total,
      lane: trip.lane,
      goAtIso: goAtIso ?? offer?.replied_at ?? null,
    })
  })
}

export function buildHardQuoteEmailPayload(input: {
  trip: Pick<TripStoreRow, 'lane' | 'offers'>
  options: HardQuoteEmailOptionInput[]
  acceptUrl?: string | null
  goAtIso?: string | null
  logoUrl?: string | null
  opsNotes?: string[]
}): HardQuoteEmailInput {
  return {
    title: logisticsQuoteTitle(input.trip.lane),
    options: buildHardQuoteEmailOptions(
      input.trip,
      input.options,
      input.goAtIso,
    ),
    acceptUrl: acceptAbsoluteUrl(input.acceptUrl),
    logoUrl: input.logoUrl ?? resolveBrandLogoUrl(),
    opsNotes: input.opsNotes?.length ? input.opsNotes : undefined,
  }
}

export function renderHardQuoteEmail(payload: HardQuoteEmailInput): {
  subject: string
  html: string
  text: string
} {
  return {
    subject: hardQuoteEmailSubject(payload.title),
    html: renderHardQuoteEmailHtml(payload),
    text: renderHardQuoteEmailText(payload),
  }
}
