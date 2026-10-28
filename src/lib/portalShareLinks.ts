/**
 * Absolute portal share URLs for desk outreach (email / SMS / copy).
 */

import { absoluteAppUrl } from '@/lib/appUrl'
import {
  buildPortalShareLinkRows,
  findClientByPortalSlug,
  portalCompanyPath,
  portalLoginPath,
  portalSharePath,
  portalSlugFromClient,
  safePortalNextPath,
  type PortalShareClientLike,
  type PortalShareKind,
  type PortalShareLinkRow,
} from '@/domain/portalShareLinks'
import { getClient, listClients, type ClientProfile } from '@/lib/clientStore'
import { createPortalTrackToken } from '@/lib/portalTrackStore'

export {
  buildPortalShareLinkRows,
  findClientByPortalSlug,
  portalCompanyPath,
  portalLoginPath,
  portalSharePath,
  portalSlugFromClient,
  safePortalNextPath,
}
export type { PortalShareKind, PortalShareLinkRow }

export function absolutePortalShareUrl(
  kind: PortalShareKind,
  opts?: Parameters<typeof portalSharePath>[1],
): string {
  return absoluteAppUrl(portalSharePath(kind, opts))
}

export function absolutePortalCompanyUrl(client: PortalShareClientLike): string {
  return absoluteAppUrl(portalCompanyPath(portalSlugFromClient(client)))
}

export function deskPortalShareRows(opts: {
  clientId: string
  tripId?: string | null
  /** When true, mint a fresh track token for this trip. */
  includeTrackToken?: boolean
  viaLogin?: boolean
}): PortalShareLinkRow[] {
  const client = getClient(opts.clientId)
  if (!client) return []
  let trackToken: string | null = null
  if (opts.includeTrackToken && opts.tripId) {
    trackToken = createPortalTrackToken({
      tripId: opts.tripId,
      email: client.email || 'client@portal.local',
    })
  }
  return buildPortalShareLinkRows({
    client: toShareClient(client),
    tripId: opts.tripId,
    trackToken,
    viaLogin: opts.viaLogin,
  }).map((r) => ({
    ...r,
    path: absoluteAppUrl(r.path),
  }))
}

function toShareClient(c: ClientProfile): PortalShareClientLike {
  return {
    id: c.id,
    name: c.name,
    profile: {
      portal_slug: c.profile.portal_slug ?? null,
      allowed_email_domains: c.profile.allowed_email_domains ?? null,
      dba: c.profile.dba ?? null,
    },
  }
}

/** Resolve company by portal slug (explicit or derived). */
export function getClientByPortalSlug(slug: string): ClientProfile | null {
  const hit = findClientByPortalSlug(
    slug,
    listClients().map(toShareClient),
  )
  return hit ? getClient(hit.id) ?? null : null
}
