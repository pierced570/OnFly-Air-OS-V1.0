/**
 * Map trip_eta_nodes / portal_eta_nodes DB rows → ChainLeg.
 */

import type { ChainLeg, EtaSource } from '@/domain/etaChain'

export function mapEtaNodeRow(r: Record<string, unknown>): ChainLeg {
  return {
    seq: Number(r.seq),
    type: String(r.type) as ChainLeg['type'],
    branch: String(r.branch) as ChainLeg['branch'],
    label: String(r.label || ''),
    event: String(r.event || r.label || ''),
    from: {
      lat: Number(r.from_lat ?? 0),
      lon: Number(r.from_lon ?? 0),
      icao: r.from_icao ? String(r.from_icao) : undefined,
      tz: r.from_tz ? String(r.from_tz) : undefined,
    },
    to: {
      lat: Number(r.to_lat ?? 0),
      lon: Number(r.to_lon ?? 0),
      icao: r.to_icao ? String(r.to_icao) : undefined,
      tz: r.to_tz ? String(r.to_tz) : undefined,
    },
    est_start: String(r.est_start),
    est_end: String(r.est_end),
    actual_start: r.actual_start ? String(r.actual_start) : null,
    actual_end: r.actual_end ? String(r.actual_end) : null,
    duration_min: Number(r.duration_min ?? 0),
    duration_key: r.duration_key
      ? (String(r.duration_key) as ChainLeg['duration_key'])
      : undefined,
    source: (String(r.source || 'assumed') as EtaSource),
    duration_source: String(r.source || 'assumed'),
    distance_mi: r.distance_mi == null ? null : Number(r.distance_mi),
    distance_nm: r.distance_nm == null ? null : Number(r.distance_nm),
    slack_min: r.slack_min == null ? null : Number(r.slack_min),
  }
}

export function mapEtaNodeRows(
  rows: Record<string, unknown>[] | null | undefined,
): ChainLeg[] {
  if (!Array.isArray(rows) || !rows.length) return []
  return [...rows]
    .map(mapEtaNodeRow)
    .sort((a, b) => a.seq - b.seq)
}
