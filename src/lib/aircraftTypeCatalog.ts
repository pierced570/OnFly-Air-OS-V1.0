/**
 * Aircraft type catalog from network type_specs + fleet — for normalizeAircraftType.
 */

import { normalizeAircraftType } from '@/domain/typeAlias'
import { getCachedNetwork } from '@/lib/networkData'

/** Distinct type labels from specs + aircraft rows (when network is loaded). */
export function aircraftTypeCatalog(): string[] {
  const net = getCachedNetwork()
  if (!net) return []
  const out = new Set<string>()
  for (const s of net.type_specs ?? []) {
    const t = String((s as { type_name?: string }).type_name ?? '').trim()
    if (t) out.add(t)
  }
  for (const a of net.aircraft ?? []) {
    const t = String(a.type_name ?? '').trim()
    if (t) out.add(t)
  }
  return [...out]
}

/** Normalize using live network catalog when available. */
export function unifyAircraftType(raw: string | null | undefined): string {
  if (raw == null) return ''
  const trimmed = String(raw).trim()
  if (!trimmed) return ''
  return normalizeAircraftType(trimmed, aircraftTypeCatalog())
}
