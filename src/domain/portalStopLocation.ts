/**
 * Pickup / drop-off location on the client tracker — pure.
 * Kind: client hangar · field FBO · TBD (blank) · custom (desk free-text).
 */

export type PortalStopKind = 'hangar' | 'fbo' | 'tbd' | 'custom'

export type PortalStopLocation = {
  kind: PortalStopKind
  /** Display name — FBO name, hangar label, etc. */
  name: string | null
  /** Street / full address when known. */
  address: string | null
  /** Directory FBO id when kind === 'fbo'. */
  fbo_id: string | null
  /** Airport this stop is tied to (usually origin/dest ICAO). */
  icao: string | null
}

export function emptyPortalStop(
  icao?: string | null,
): PortalStopLocation {
  return {
    kind: 'tbd',
    name: null,
    address: null,
    fbo_id: null,
    icao: icao?.trim().toUpperCase() || null,
  }
}

export function normalizePortalStop(
  raw: Partial<PortalStopLocation> | null | undefined,
  fallbackIcao?: string | null,
): PortalStopLocation {
  const kind = (raw?.kind ?? 'tbd') as PortalStopKind
  const allowed: PortalStopKind[] = ['hangar', 'fbo', 'tbd', 'custom']
  return {
    kind: allowed.includes(kind) ? kind : 'tbd',
    name: raw?.name?.trim() || null,
    address: raw?.address?.trim() || null,
    fbo_id: raw?.fbo_id?.trim() || null,
    icao:
      raw?.icao?.trim().toUpperCase() ||
      fallbackIcao?.trim().toUpperCase() ||
      null,
  }
}

/** Card title — never invents an address. */
export function formatPortalStopTitle(stop: PortalStopLocation): string {
  if (stop.kind === 'tbd') return 'TBD'
  if (stop.kind === 'hangar') {
    return stop.name?.trim() || 'Client hangar'
  }
  if (stop.kind === 'fbo') {
    return stop.name?.trim() || 'Field FBO'
  }
  return stop.name?.trim() || 'Location'
}

export function formatPortalStopAddress(
  stop: PortalStopLocation,
): string | null {
  if (stop.kind === 'tbd') return null
  return stop.address?.trim() || null
}

/**
 * Single line for legacy `portal_pickup_address` / email templates.
 * TBD → null (blank on portal).
 */
export function portalStopToAddressLine(
  stop: PortalStopLocation,
): string | null {
  if (stop.kind === 'tbd') return null
  const title = formatPortalStopTitle(stop)
  const addr = formatPortalStopAddress(stop)
  if (title && addr && title !== addr) return `${title} · ${addr}`
  return addr || title || null
}

/** Build a hangar stop (optional name/address). */
export function hangarStop(opts: {
  icao?: string | null
  name?: string | null
  address?: string | null
}): PortalStopLocation {
  return {
    kind: 'hangar',
    name: opts.name?.trim() || 'Client hangar',
    address: opts.address?.trim() || null,
    fbo_id: null,
    icao: opts.icao?.trim().toUpperCase() || null,
  }
}

/** Build an FBO stop from directory fields. */
export function fboStop(opts: {
  icao: string
  fbo_id: string
  name: string
  address?: string | null
}): PortalStopLocation {
  return {
    kind: 'fbo',
    name: opts.name.trim(),
    address: opts.address?.trim() || null,
    fbo_id: opts.fbo_id,
    icao: opts.icao.trim().toUpperCase(),
  }
}

export function tbdStop(icao?: string | null): PortalStopLocation {
  return emptyPortalStop(icao)
}

/** Recover structured stop from a legacy free-text address line. */
export function portalStopFromLegacyAddress(
  address: string | null | undefined,
  icao?: string | null,
): PortalStopLocation | null {
  const a = (address ?? '').trim()
  if (!a) return null
  if (/^tbd$/i.test(a)) return tbdStop(icao)
  return {
    kind: 'custom',
    name: null,
    address: a,
    fbo_id: null,
    icao: icao?.trim().toUpperCase() || null,
  }
}
