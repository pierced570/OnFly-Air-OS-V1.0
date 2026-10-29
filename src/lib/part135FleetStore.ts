/**
 * Part 135 fleet pack loader — bundled `part135_fleet_by_state.json`
 * (FAA Part 135 holders + OnFly approved-operators export).
 */

import type {
  Part135ApprovedCsvRow,
  Part135FleetPack,
} from '@/domain/part135Fleet'
import approvedNetwork from '@/fixtures/part135_approved_network.json'
import fixture from '@/fixtures/part135_fleet_by_state.json'

let cached: Part135FleetPack | null = null
let cachedCsv: Part135ApprovedCsvRow[] | null = null

export function getPart135FleetPack(): Part135FleetPack {
  if (cached) return cached
  cached = fixture as Part135FleetPack
  return cached
}

/** OnFly approved-operators CSV export (52 rows incl. non-FAA). */
export function getPart135ApprovedNetworkCsv(): Part135ApprovedCsvRow[] {
  if (cachedCsv) return cachedCsv
  cachedCsv = approvedNetwork as Part135ApprovedCsvRow[]
  return cachedCsv
}

/** Test helper — inject a pack without touching the fixture import. */
export function __setPart135FleetPackForTests(
  pack: Part135FleetPack | null,
): void {
  cached = pack
}

/** Test helper — inject CSV rows. */
export function __setPart135ApprovedCsvForTests(
  rows: Part135ApprovedCsvRow[] | null,
): void {
  cachedCsv = rows
}
