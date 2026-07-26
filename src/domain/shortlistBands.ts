/**
 * Closest-fitting candidate per aircraft band (piston / turboprop / jet).
 * Pure domain — flag don't exclude; missing dims already flagged upstream.
 */

import {
  classifyAircraftVertical,
  type VerticalId,
} from '@/domain/operatorVerticals'
import type { Candidate } from '@/domain/routing'
import {
  PORTAL_BAND_LABELS,
  PORTAL_BANDS,
  verticalToPortalBand,
  type PortalBand,
} from '@/domain/portalEstimate'

export type BandShortlistPick = {
  band: PortalBand
  label: string
  candidate: Candidate
  /** NM / minutes proxy — lower is closer (uses chain position duration). */
  closeness: number
}

/** Three-column Board shortlist (jet = closest of light_jet + larger). */
export type BandShortlist = {
  piston: Candidate | null
  turboprop: Candidate | null
  jet: Candidate | null
}

export type AircraftBandMeta = {
  aircraft_id: string
  category: string | null
  engines: string | null
  type_name: string | null
}

function closenessScore(c: Candidate): number {
  const pos = c.chain
    .filter((l) => l.type === 'position')
    .reduce((n, l) => n + (l.duration_min ?? 0), 0)
  if (pos > 0) return pos
  return c.circuit_nm || 9999
}

function bandOf(meta: AircraftBandMeta | undefined, c: Candidate): PortalBand | null {
  const v: VerticalId = classifyAircraftVertical({
    category: meta?.category ?? null,
    engines: meta?.engines ?? null,
    type_name: meta?.type_name ?? c.type_name,
  })
  return verticalToPortalBand(v)
}

/**
 * One closest clear candidate per portal band (piston / turboprop / light jet / larger).
 * Skips bands with no fit — does not invent placeholders.
 */
export function pickClosestByBand(
  candidates: Candidate[],
  metaByAircraftId: Map<string, AircraftBandMeta>,
): BandShortlistPick[] {
  type Row = { c: Candidate; band: PortalBand; closeness: number }
  const rows: Row[] = []
  for (const c of candidates) {
    const meta = metaByAircraftId.get(c.aircraft_id)
    const band = bandOf(meta, c)
    if (!band) continue
    rows.push({ c, band, closeness: closenessScore(c) })
  }
  // Closest first — claim an operator for at most one band.
  rows.sort((a, b) => a.closeness - b.closeness)
  const best = new Map<PortalBand, BandShortlistPick>()
  const usedOperators = new Set<string>()
  for (const row of rows) {
    if (best.has(row.band)) continue
    if (usedOperators.has(row.c.operator_id)) continue
    best.set(row.band, {
      band: row.band,
      label: PORTAL_BAND_LABELS[row.band],
      candidate: row.c,
      closeness: row.closeness,
    })
    usedOperators.add(row.c.operator_id)
  }
  return PORTAL_BANDS.map((b) => best.get(b)).filter(
    (x): x is BandShortlistPick => Boolean(x),
  )
}

/** Collapse portal bands → piston / turboprop / jet for Board columns. */
export function toBandShortlist(picks: BandShortlistPick[]): BandShortlist {
  const byBand = new Map(picks.map((p) => [p.band, p]))
  const jetPick = [byBand.get('light_jet'), byBand.get('larger')]
    .filter((x): x is BandShortlistPick => Boolean(x))
    .sort((a, b) => a.closeness - b.closeness)[0]

  return {
    piston: byBand.get('piston')?.candidate ?? null,
    turboprop: byBand.get('turboprop')?.candidate ?? null,
    jet: jetPick?.candidate ?? null,
  }
}

export function shortlistAircraftIds(shortlist: BandShortlist): string[] {
  return [shortlist.piston, shortlist.turboprop, shortlist.jet]
    .filter((c): c is Candidate => Boolean(c))
    .map((c) => c.aircraft_id)
}

export function shortlistLabel(shortlist: BandShortlist | null | undefined): string {
  if (!shortlist) return ''
  const bits: string[] = []
  if (shortlist.piston) bits.push(`Piston ${shortlist.piston.type_name ?? shortlist.piston.tail}`)
  if (shortlist.turboprop)
    bits.push(`TP ${shortlist.turboprop.type_name ?? shortlist.turboprop.tail}`)
  if (shortlist.jet) bits.push(`Jet ${shortlist.jet.type_name ?? shortlist.jet.tail}`)
  return bits.join(' · ')
}
