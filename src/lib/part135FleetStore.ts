/**
 * Part 135 fleet pack loader — bundled `part135_fleet_by_state.json`
 * (FAA Part 135 holders + OnFly approved-operators export).
 */

import type { Part135FleetPack } from '@/domain/part135Fleet'
import fixture from '@/fixtures/part135_fleet_by_state.json'

let cached: Part135FleetPack | null = null

export function getPart135FleetPack(): Part135FleetPack {
  if (cached) return cached
  cached = fixture as Part135FleetPack
  return cached
}

/** Test helper — inject a pack without touching the fixture import. */
export function __setPart135FleetPackForTests(
  pack: Part135FleetPack | null,
): void {
  cached = pack
}
