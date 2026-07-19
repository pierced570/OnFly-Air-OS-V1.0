/**
 * From an intake draft → resolve airports + rank operator/aircraft candidates.
 */

import { createMapsAdapter } from '@/adapters/maps'
import { parseDims } from '@/domain/dimsParser'
import { generateCandidates, type Candidate } from '@/domain/routing'
import { resolvePlaceToAirport } from '@/domain/resolvePlace'
import type { AirportInfo } from '@/domain/airports'
import { fleetStatusByTail } from '@/lib/fleetRadar'
import { loadFleetForRouting } from '@/lib/fleetRouting'
import { fboFeesForAirport } from '@/lib/fboStore'
import type { IntakeDraft } from '@/lib/intakeStore'

export type IntakeRecommendation = {
  origin: AirportInfo | null
  destination: AirportInfo | null
  originText: string
  destText: string
  piecesText: string
  candidates: Candidate[]
  error?: string
}

export async function recommendForIntake(
  draft: IntakeDraft,
): Promise<IntakeRecommendation> {
  const originText = String(draft.extracted?.origin_text ?? '').trim()
  const destText = String(draft.extracted?.destination_text ?? '').trim()
  const piecesText = String(
    draft.extracted?.pieces_text ?? draft.extracted?.pieces ?? '',
  ).trim()

  const origin = resolvePlaceToAirport(originText)
  const destination = resolvePlaceToAirport(destText)

  if (!origin || !destination) {
    return {
      origin,
      destination,
      originText,
      destText,
      piecesText,
      candidates: [],
      error: !origin
        ? `Could not resolve origin airport from “${originText || '—'}”`
        : `Could not resolve destination airport from “${destText || '—'}”`,
    }
  }

  const parsed = parseDims(piecesText || '1 skid 48x40x48 @ 500')
  const pieces = parsed.pieces
  const fleet = await loadFleetForRouting()
  if (!fleet.length) {
    return {
      origin,
      destination,
      originText,
      destText,
      piecesText,
      candidates: [],
      error: 'No fleet loaded — import aircraft / check network data',
    }
  }

  const maps = createMapsAdapter()
  const radar = await fleetStatusByTail(fleet.map((a) => a.tail))
  const originFees = fboFeesForAirport(origin.icao)
  const destFees = fboFeesForAirport(destination.icao)
  const readyAt = new Date().toISOString()

  try {
    const candidates = await generateCandidates(
      {
        mode: 'a2a',
        payload_kind: 'cargo',
        pieces,
        pax_count: 0,
        hazmat: Boolean(draft.extracted?.hazmat),
        ready_at: readyAt,
        origin: {
          kind: 'airport',
          text: originText || origin.icao,
          icao: origin.icao,
          lat: origin.lat,
          lon: origin.lon,
          tz: origin.tz,
        },
        destination: {
          kind: 'airport',
          text: destText || destination.icao,
          icao: destination.icao,
          lat: destination.lat,
          lon: destination.lon,
          tz: destination.tz,
        },
      },
      fleet,
      maps,
      {
        fleetStatusByTail: radar,
        fboFees: {
          origin: originFees.fee,
          dest: destFees.fee,
          notes: [...originFees.reasoning, ...destFees.reasoning],
        },
      },
    )
    return {
      origin,
      destination,
      originText,
      destText,
      piecesText,
      candidates,
    }
  } catch (e) {
    return {
      origin,
      destination,
      originText,
      destText,
      piecesText,
      candidates: [],
      error: e instanceof Error ? e.message : String(e),
    }
  }
}
