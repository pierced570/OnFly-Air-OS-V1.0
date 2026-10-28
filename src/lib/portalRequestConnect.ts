/**
 * Connect portal guest book/quote submits to the existing trip spine:
 * client identity → routed trip → track token → home / history / one-click login.
 */

import {
  domainFromEmail,
  isPublicEmailDomain,
} from '@/domain/clientBaseEmails'
import type { SoftPricingPackageResult } from '@/lib/softPricingPackage'
import type { TripRequestRecord } from '@/domain/tripRequest'
import {
  addClient,
  getClient,
  listClients,
  type ClientProfile,
} from '@/lib/clientStore'
import { resolveClientIdByPortalEmail } from '@/domain/portalDomains'
import { rememberPortalGuestTrack } from '@/lib/portalGuestTrack'
import { createPortalTrackToken } from '@/lib/portalTrackStore'
import {
  addTripParticipant,
  getTrip,
  listTripsStable,
  mutateTrip,
  type TripStoreRow,
} from '@/lib/tripStore'
import { createRoutedTripFromRequest } from '@/lib/ladderFlow'
import { attachRequestClient, attachRequestTripLink } from '@/lib/requestStore'

/** Soft pricing packages keyed by request id (session + optional restore). */
const softByRequest = new Map<string, SoftPricingPackageResult>()

const SOFT_STORAGE_KEY = 'onfly.portal.soft_packages'

function readSoftStorage(): Record<string, SoftPricingPackageResult> {
  if (typeof sessionStorage === 'undefined') return {}
  try {
    const raw = sessionStorage.getItem(SOFT_STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, SoftPricingPackageResult>
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function writeSoftStorage(map: Record<string, SoftPricingPackageResult>) {
  if (typeof sessionStorage === 'undefined') return
  try {
    sessionStorage.setItem(SOFT_STORAGE_KEY, JSON.stringify(map))
  } catch {
    /* ignore quota */
  }
}

export function saveRequestSoftPackage(
  requestId: string,
  pkg: SoftPricingPackageResult,
): void {
  softByRequest.set(requestId, pkg)
  const all = readSoftStorage()
  all[requestId] = pkg
  writeSoftStorage(all)
}

export function getRequestSoftPackage(
  requestId: string,
): SoftPricingPackageResult | null {
  const mem = softByRequest.get(requestId)
  if (mem) return mem
  const stored = readSoftStorage()[requestId]
  if (stored) {
    softByRequest.set(requestId, stored)
    return stored
  }
  return null
}

/**
 * Resolve or create a local client so one-click login + portal_trips matching work.
 * Exact email contact — never auto-allowlists public domains.
 */
export function ensurePortalClientForRequester(opts: {
  email: string
  clientName?: string | null
  phone?: string | null
}): ClientProfile | null {
  const email = opts.email.trim().toLowerCase()
  if (!email.includes('@')) return null

  const portalClients = listClients().map((c) => ({
    id: c.id,
    name: c.name,
    email: c.email,
    invoice_email: c.invoice_email,
    contacts: c.contacts.map((x) => ({ email: x.email })),
    profile: {
      allowed_email_domains: c.profile.allowed_email_domains ?? null,
      website: c.profile.website ?? null,
      bases: c.profile.bases,
    },
  }))
  const existingId = resolveClientIdByPortalEmail(email, portalClients)
  if (existingId) {
    const hit = getClient(existingId)
    if (hit) return hit
  }

  const domain = domainFromEmail(email)
  const company =
    (opts.clientName ?? '').trim() ||
    (!domain || isPublicEmailDomain(domain)
      ? email.split('@')[0] || 'Portal guest'
      : domain.split('.')[0]!.toUpperCase())

  const profileDomains =
    domain && !isPublicEmailDomain(domain) && domain !== 'onflyair.com'
      ? [domain]
      : undefined

  return addClient({
    name: company,
    email,
    invoice_email: email,
    notes: 'Created from portal guest request',
    profile: profileDomains
      ? { allowed_email_domains: profileDomains }
      : undefined,
    contacts: [
      {
        name: company,
        email,
        role: 'requester',
        cell: (opts.phone ?? '').trim() || undefined,
      },
    ],
  })
}

export type PortalRequestLink = {
  trip: TripStoreRow
  trackToken: string
  trackHref: string
  tripHref: string
  clientId: string | null
}

/**
 * After a portal soft/hard quote submit: ensure client, create/link trip spine,
 * issue track token, remember guest track for unsigned home.
 */
export async function connectPortalRequestToSpine(
  row: TripRequestRecord,
): Promise<PortalRequestLink | null> {
  const email = (row.email ?? '').trim().toLowerCase()
  let clientId = (row.client_id ?? '').trim() || null
  let clientName = (row.client_name ?? '').trim() || null

  if (email) {
    const client = ensurePortalClientForRequester({
      email,
      clientName,
      phone: row.urgent_phone,
    })
    if (client) {
      clientId = client.id
      clientName = client.name
      attachRequestClient(row.id, {
        clientId: client.id,
        clientName: client.name,
      })
    }
  }

  // Reuse trip already linked to this request.
  const existing = listTripsStable().find((t) => t.request_id === row.id)
  let trip = existing ?? null

  if (!trip) {
    try {
      const linked = await createRoutedTripFromRequest({
        ...row,
        client_id: clientId || row.client_id,
        client_name: clientName || row.client_name,
      })
      trip = linked.trip
    } catch (err) {
      console.warn('[portal] spine trip deferred', err)
      return null
    }
  }

  if (clientId && !trip.client_id) {
    mutateTrip(trip.id, (t) => {
      t.client_id = clientId!
      t.client_name = clientName
    })
  }

  const withClient = getTrip(trip.id) ?? trip
  if (
    email &&
    !withClient.participants.some(
      (p) =>
        p.email?.trim().toLowerCase() === email &&
        ['client', 'client_ap', 'client_supply'].includes(p.role),
    )
  ) {
    addTripParticipant(withClient.id, {
      name: clientName || email.split('@')[0] || 'Client',
      role: 'client',
      company: clientName || undefined,
      email,
      cell: (row.urgent_phone ?? '').trim() || undefined,
      in_thread: false,
    })
  }

  const fresh = getTrip(trip.id) ?? withClient
  const trackToken = createPortalTrackToken({
    tripId: fresh.id,
    email: email || 'guest@portal.local',
  })
  rememberPortalGuestTrack({ token: trackToken, tripId: fresh.id })
  attachRequestTripLink(row.id, {
    tripId: fresh.id,
    trackToken,
  })

  return {
    trip: fresh,
    trackToken,
    trackHref: `/portal/track/${trackToken}`,
    tripHref: `/portal/trips/${fresh.id}`,
    clientId,
  }
}

/** Prefer trip detail (works signed-in); fall back to magic-link track. */
export function portalNextHrefAfterQuote(opts: {
  signedIn?: boolean
  tripHref: string | null
  trackHref: string | null
}): string {
  if (opts.tripHref) return opts.tripHref
  if (opts.trackHref) return opts.trackHref
  return '/portal'
}
