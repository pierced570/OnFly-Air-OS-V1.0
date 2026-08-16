/**
 * Resolve aircraft MTOW for FET (§4281) — never invent tax without a known MTOW.
 * Prefers per-tail / candidate MTOW, then type_specs typical for the type name.
 */

import { normalizeAircraftType } from '@/domain/typeAlias'
import { getCachedNetwork } from '@/lib/networkData'

export function mtowFromTypeSpecs(
  typeName: string | null | undefined,
): number | null {
  const want = normalizeAircraftType(String(typeName ?? '').trim())
  if (!want) return null
  const net = getCachedNetwork()
  if (!net?.type_specs?.length) return null
  for (const raw of net.type_specs) {
    const s = raw as { type_name?: string; mtow_lbs?: number | null }
    const name = normalizeAircraftType(String(s.type_name ?? '').trim())
    if (!name) continue
    if (name !== want && !name.includes(want) && !want.includes(name)) continue
    const mtow = s.mtow_lbs
    if (mtow != null && Number.isFinite(Number(mtow))) return Number(mtow)
  }
  return null
}

/** Best-effort MTOW for tax / invoice — null means do not charge FET. */
export function resolveAircraftMtowLbs(opts: {
  mtowLbs?: number | null
  typeName?: string | null
  tail?: string | null
  candidates?: Array<{
    mtow_lbs?: number | null
    type_name?: string | null
    tail?: string | null
    aircraft_id?: string | null
  }>
  selectedAircraftId?: string | null
}): number | null {
  if (opts.mtowLbs != null && Number.isFinite(Number(opts.mtowLbs))) {
    return Number(opts.mtowLbs)
  }
  const cands = opts.candidates ?? []
  const byId = opts.selectedAircraftId
    ? cands.find((c) => c.aircraft_id === opts.selectedAircraftId)
    : undefined
  if (byId?.mtow_lbs != null && Number.isFinite(Number(byId.mtow_lbs))) {
    return Number(byId.mtow_lbs)
  }
  const tail = opts.tail?.trim().toUpperCase()
  if (tail) {
    const byTail = cands.find(
      (c) => (c.tail ?? '').trim().toUpperCase() === tail,
    )
    if (byTail?.mtow_lbs != null && Number.isFinite(Number(byTail.mtow_lbs))) {
      return Number(byTail.mtow_lbs)
    }
  }
  const typeName =
    opts.typeName?.trim() ||
    byId?.type_name?.trim() ||
    cands.find((c) => (c.tail ?? '').trim().toUpperCase() === tail)?.type_name ||
    null
  return mtowFromTypeSpecs(typeName)
}
