/**
 * Scratchpad notes → TripRequestDraft for "Push to trip requests".
 * Pure TypeScript — heuristic extract only (approve/edit on New trip).
 */

import { resolvePlaceToAirport } from '@/domain/resolvePlace'
import { extractFromScratchNotes } from '@/domain/scratchParse'
import {
  emptyTripRequestDraft,
  newLeg,
  type TripRequestDraft,
} from '@/domain/tripRequest'

function placeToIcao(text: string | undefined): string {
  const raw = (text ?? '').trim()
  if (!raw) return ''
  const hit = resolvePlaceToAirport(raw)
  if (hit?.icao) return hit.icao
  // Keep short codes as typed when catalog miss (dispatcher can fix).
  if (/^[A-Za-z]{3,4}$/.test(raw)) return raw.toUpperCase()
  return ''
}

/** Map scratch notes into a dispatch trip-request draft. */
export function tripRequestDraftFromScratchNotes(
  body: string,
): TripRequestDraft {
  const text = body.trim()
  const ex = extractFromScratchNotes(text)
  const draft = emptyTripRequestDraft()
  draft.client_name = ex.client_name?.trim() || null
  draft.timing = ex.asap === false ? 'scheduled' : 'asap'
  draft.hazmat = Boolean(ex.hazmat)
  draft.notes = text
  draft.cargo_notes = (ex.pieces_text ?? '').trim()
  const stops =
    Array.isArray(ex.stop_texts) && ex.stop_texts.length >= 2
      ? ex.stop_texts
      : [ex.origin_text, ex.destination_text]
  const stopIcaos = stops
    .map((s) => placeToIcao(s))
    .filter((icao, i, arr) => icao && (i === 0 || icao !== arr[i - 1]))
  if (stopIcaos.length >= 2) {
    draft.legs = []
    for (let i = 0; i < stopIcaos.length - 1; i++) {
      draft.legs.push(
        newLeg({
          origin_icao: stopIcaos[i]!,
          dest_icao: stopIcaos[i + 1]!,
        }),
      )
    }
  } else {
    draft.legs = [
      newLeg({
        origin_icao: placeToIcao(ex.origin_text),
        dest_icao: placeToIcao(ex.destination_text),
      }),
    ]
  }

  const paxCount = ex.pax_count ?? 0
  if (paxCount > 0 || ex.payload_kind === 'pax' || ex.payload_kind === 'both') {
    draft.cargo_only = ex.payload_kind === 'cargo'
    if (paxCount > 0) {
      draft.cargo_only = false
      draft.pax = Array.from({ length: Math.min(paxCount, 20) }, () => ({
        name: '',
        weight_lbs: '' as number | '',
        dob: '',
      }))
    }
  }

  return draft
}
