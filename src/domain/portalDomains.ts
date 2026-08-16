/**
 * Client portal access by corporate email domain (pure).
 * Desk sets allowed_email_domains on the client profile; anyone @thatdomain
 * can magic-link into that company's portal.
 */

import {
  domainFromEmail,
  domainFromWebsite,
  isPublicEmailDomain,
} from '@/domain/clientBaseEmails'

/** Normalize a domain entry: strip @ / www / protocol, lowercase. */
export function normalizePortalDomain(raw: string): string | null {
  let s = raw.trim().toLowerCase()
  if (!s) return null
  if (s.startsWith('@')) s = s.slice(1)
  if (s.includes('://') || s.includes('/')) {
    const fromUrl = domainFromWebsite(s)
    if (!fromUrl) return null
    s = fromUrl
  }
  s = s.replace(/^www\./, '')
  if (!s.includes('.') || s.includes(' ') || s.includes('@')) return null
  if (isPublicEmailDomain(s)) return null
  return s
}

/** Parse desk-typed list (comma / space / newline separated). */
export function parsePortalDomainList(raw: string): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const part of raw.split(/[,;\s]+/)) {
    const d = normalizePortalDomain(part)
    if (!d || seen.has(d)) continue
    seen.add(d)
    out.push(d)
  }
  return out
}

export function formatPortalDomainList(domains: string[] | null | undefined): string {
  return (domains ?? [])
    .map((d) => normalizePortalDomain(d))
    .filter((d): d is string => Boolean(d))
    .join(', ')
}

/** Email domain for matching (allows corporate only — null for public mailboxes). */
export function portalEmailDomain(email: string | null | undefined): string | null {
  return domainFromEmail(email)
}

export function emailMatchesPortalDomains(
  email: string | null | undefined,
  domains: string[] | null | undefined,
): boolean {
  const emailDomain = portalEmailDomain(email)
  if (!emailDomain) return false
  const allowed = (domains ?? [])
    .map((d) => normalizePortalDomain(d))
    .filter((d): d is string => Boolean(d))
  return allowed.includes(emailDomain)
}

/**
 * Resolve which client a portal login email belongs to (exact contact first,
 * then allowed_email_domains). Pure — mirrors SQL link_portal_user order
 * without portal_access_grants (those stay DB-only).
 */
export function resolveClientIdByPortalEmail(
  email: string,
  clients: Array<{
    id: string
    email?: string | null
    invoice_email?: string | null
    contacts?: Array<{ email?: string | null }>
    profile?: { allowed_email_domains?: string[] | null; website?: string | null }
  }>,
): string | null {
  const needle = email.trim().toLowerCase()
  if (!needle.includes('@')) return null

  for (const c of clients) {
    if ((c.email ?? '').trim().toLowerCase() === needle) return c.id
    if ((c.invoice_email ?? '').trim().toLowerCase() === needle) return c.id
    for (const contact of c.contacts ?? []) {
      if ((contact.email ?? '').trim().toLowerCase() === needle) return c.id
    }
  }

  for (const c of clients) {
    if (emailMatchesPortalDomains(needle, c.profile?.allowed_email_domains)) {
      return c.id
    }
  }

  return null
}

/** Suggest a domain from website when the allowlist is empty. */
export function suggestPortalDomainFromWebsite(
  website: string | null | undefined,
): string | null {
  const d = domainFromWebsite(website)
  if (!d || isPublicEmailDomain(d)) return null
  return d
}
