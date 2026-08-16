/**
 * Client portal access by corporate email domain (pure).
 * Desk sets allowed_email_domains on the client profile; anyone @thatdomain
 * signs into that company's portal (no magic link). Exact emails on file still
 * work one-by-one (contacts / grants) even when their domain is not allowlisted.
 */

import {
  domainFromEmail,
  domainFromWebsite,
  isPublicEmailDomain,
} from './clientBaseEmails'

/** Never auto-grant this domain to a client portal (staff use exact grants). */
const OPERATOR_PORTAL_DOMAIN = 'onflyair.com'

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
  if (s === OPERATOR_PORTAL_DOMAIN) return null
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

export type PortalDomainClient = {
  id?: string
  name?: string
  email?: string | null
  invoice_email?: string | null
  contacts?: Array<{ email?: string | null }>
  profile?: {
    allowed_email_domains?: string[] | null
    website?: string | null
    bases?: Array<{
      emails?: string[]
      supervisor_emails?: string[]
      stores_emails?: string[]
    }> | null
  }
}

/** All corporate emails stored on the client (ops, AP, contacts, base lists). */
export function emailsOnFileForPortal(client: PortalDomainClient): string[] {
  const out: string[] = []
  const push = (e: string | null | undefined) => {
    const t = (e ?? '').trim()
    if (t.includes('@')) out.push(t)
  }
  push(client.email)
  push(client.invoice_email)
  for (const c of client.contacts ?? []) push(c.email)
  for (const b of client.profile?.bases ?? []) {
    for (const e of b.emails ?? []) push(e)
    for (const e of b.supervisor_emails ?? []) push(e)
    for (const e of b.stores_emails ?? []) push(e)
  }
  return out
}

/**
 * Domains inferred from emails / website on file.
 * Prefers the website domain and domains that appear more than once
 * (so a single aa.com AP contact does not open the whole company portal).
 */
export function inferPortalDomainsFromOnFile(client: PortalDomainClient): string[] {
  const counts = new Map<string, number>()
  for (const e of emailsOnFileForPortal(client)) {
    const d = normalizePortalDomain(domainFromEmail(e) ?? '')
    if (!d) continue
    counts.set(d, (counts.get(d) ?? 0) + 1)
  }
  const website = suggestPortalDomainFromWebsite(client.profile?.website)
  const out: string[] = []
  const seen = new Set<string>()
  const add = (d: string | null) => {
    if (!d || seen.has(d)) return
    seen.add(d)
    out.push(d)
  }
  add(website)
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1])
  for (const [d, n] of ranked) {
    if (n >= 2) add(d)
  }
  if (!out.length && ranked[0]) add(ranked[0][0])
  return out
}

/**
 * Domains that may sign in by *@domain (not exact contact).
 * Manual allowlist is authoritative when set; otherwise infer from on-file.
 * Desk can always add more via allowed_email_domains.
 */
export function effectivePortalDomains(client: PortalDomainClient): string[] {
  const manual = (client.profile?.allowed_email_domains ?? [])
    .map((d) => normalizePortalDomain(d))
    .filter((d): d is string => Boolean(d))
  if (manual.length) return [...new Set(manual)]
  return inferPortalDomainsFromOnFile(client)
}

/**
 * Merge manual + inferred for desk UI “domains we recognize”.
 * Matching still uses effectivePortalDomains (manual wins when set).
 */
export function allRecognizedPortalDomains(client: PortalDomainClient): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const d of [
    ...(client.profile?.allowed_email_domains ?? []),
    ...inferPortalDomainsFromOnFile(client),
  ]) {
    const n = normalizePortalDomain(typeof d === 'string' ? d : '')
    if (!n || seen.has(n)) continue
    seen.add(n)
    out.push(n)
  }
  return out
}

/**
 * Seed / refresh allowlist: keep desk entries, add inferred from on-file.
 * Use when hydrating clients so every profile has portal domains.
 */
export function mergePortalDomainAllowlist(client: PortalDomainClient): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const d of [
    ...(client.profile?.allowed_email_domains ?? []),
    ...inferPortalDomainsFromOnFile(client),
  ]) {
    const n = normalizePortalDomain(typeof d === 'string' ? d : '')
    if (!n || seen.has(n)) continue
    seen.add(n)
    out.push(n)
  }
  return out
}

/**
 * Resolve which client a portal login email belongs to (exact contact first,
 * then domain allowlist). Pure — mirrors SQL link_portal_user order
 * without portal_access_grants (those stay DB-only).
 */
export function resolveClientIdByPortalEmail(
  email: string,
  clients: PortalDomainClient[],
): string | null {
  const needle = email.trim().toLowerCase()
  if (!needle.includes('@')) return null

  for (const c of clients) {
    if ((c.email ?? '').trim().toLowerCase() === needle) return c.id ?? null
    if ((c.invoice_email ?? '').trim().toLowerCase() === needle) return c.id ?? null
    for (const contact of c.contacts ?? []) {
      if ((contact.email ?? '').trim().toLowerCase() === needle) return c.id ?? null
    }
  }

  for (const c of clients) {
    if (emailMatchesPortalDomains(needle, effectivePortalDomains(c))) {
      return c.id ?? null
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
  if (d === OPERATOR_PORTAL_DOMAIN) return null
  return d
}

/**
 * Known client → required portal domain(s). Ensures PSA-style company
 * logins stay on the corporate domain even when AP contacts use a parent domain.
 */
export function requiredPortalDomainsForClientName(name: string): string[] {
  const n = name.trim().toLowerCase()
  if (n === 'psa' || n.startsWith('psa ')) return ['psaairlines.com']
  if (n.includes('psa airlines')) return ['psaairlines.com']
  return []
}

/** Apply required + merged allowlist onto a client profile draft. */
export function withEnsuredPortalDomains<T extends PortalDomainClient>(client: T): T {
  const required = requiredPortalDomainsForClientName(client.name ?? '')
  const merged = mergePortalDomainAllowlist(client)
  const seen = new Set<string>()
  const domains: string[] = []
  for (const d of [...required, ...merged]) {
    const n = normalizePortalDomain(d)
    if (!n || seen.has(n)) continue
    seen.add(n)
    domains.push(n)
  }
  // PSA: keep only required corporate domain(s) on the allowlist so @aa.com
  // contacts still work via exact match, but domain login is @psaairlines.com.
  const finalDomains =
    required.length > 0
      ? required
          .map((d) => normalizePortalDomain(d))
          .filter((d): d is string => Boolean(d))
      : domains
  return {
    ...client,
    profile: {
      ...client.profile,
      allowed_email_domains: finalDomains.length ? finalDomains : undefined,
      website:
        client.profile?.website ||
        (required[0] ? `https://www.${required[0]}` : client.profile?.website),
    },
  }
}
