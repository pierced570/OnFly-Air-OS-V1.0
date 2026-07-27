/**
 * Aircraft type catalog + options for dispatcher confirm dropdowns.
 */

import {
  CANONICAL_AIRCRAFT_TYPES,
  normalizeAircraftType,
} from '@/domain/typeAlias'
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

/**
 * Sorted options for confirm dropdowns: canonical list ∪ network catalog ∪ extras.
 * Extras let a free-text entry appear until the dispatcher picks a canonical row.
 */
export function aircraftTypeOptions(
  extras?: Array<string | null | undefined>,
): string[] {
  const out = new Set<string>(CANONICAL_AIRCRAFT_TYPES)
  for (const t of aircraftTypeCatalog()) out.add(t)
  for (const e of extras ?? []) {
    const t = String(e ?? '').trim()
    if (t) out.add(t)
  }
  return [...out].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
}

/** Normalize using live network catalog when available. */
export function unifyAircraftType(raw: string | null | undefined): string {
  if (raw == null) return ''
  const trimmed = String(raw).trim()
  if (!trimmed) return ''
  return normalizeAircraftType(trimmed, aircraftTypeCatalog())
}

/**
 * Best dropdown preselect for free-text: unified canonical if it is in options,
 * else exact option match, else empty (dispatcher must pick).
 */
export function suggestAircraftTypeOption(
  raw: string | null | undefined,
  extras?: Array<string | null | undefined>,
): string {
  const options = aircraftTypeOptions(extras)
  const unified = unifyAircraftType(raw)
  if (unified && options.some((o) => o.toLowerCase() === unified.toLowerCase())) {
    return options.find((o) => o.toLowerCase() === unified.toLowerCase())!
  }
  const trimmed = String(raw ?? '').trim()
  if (!trimmed) return ''
  const exact = options.find((o) => o.toLowerCase() === trimmed.toLowerCase())
  return exact ?? ''
}
