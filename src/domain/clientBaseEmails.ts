/**
 * Client base → ETA/tracking email helpers (pure).
 * Bases are company locations (e.g. CAK). When no explicit emails are stored,
 * we synthesize `{base}@companyDomain` from the client's corporate domain.
 */

const PUBLIC_EMAIL_DOMAINS = new Set([
  'gmail.com',
  'googlemail.com',
  'yahoo.com',
  'yahoo.co.uk',
  'hotmail.com',
  'outlook.com',
  'live.com',
  'icloud.com',
  'me.com',
  'aol.com',
  'msn.com',
  'proton.me',
  'protonmail.com',
])

export type ClientBaseRef = {
  icao: string
  label?: string
  /** Explicit emails for this base; empty → auto-generate from company domain. */
  emails?: string[]
}

export type ClientBaseEmailSource = {
  email?: string | null
  invoice_email?: string | null
  website?: string | null
  contactEmails?: string[]
  bases?: ClientBaseRef[] | null
  frequent_lanes?: Array<{ origin?: string; destination?: string }> | null
}

/** Normalize ICAO for storage / compare. */
export function normalizeBaseIcao(icao: string): string {
  return icao.trim().toUpperCase()
}

/**
 * Local-part for a base mailbox: KCAK → cak, CAK → cak, EGLL → egll.
 */
export function baseEmailLocalPart(icao: string): string {
  const u = normalizeBaseIcao(icao)
  if (!u) return ''
  if (/^K[A-Z0-9]{3}$/.test(u)) return u.slice(1).toLowerCase()
  return u.toLowerCase()
}

export function isPublicEmailDomain(domain: string): boolean {
  return PUBLIC_EMAIL_DOMAINS.has(domain.trim().toLowerCase())
}

/** Hostname from website URL, or null. */
export function domainFromWebsite(website: string | null | undefined): string | null {
  const raw = (website ?? '').trim()
  if (!raw) return null
  try {
    const href = raw.includes('://') ? raw : `https://${raw}`
    const host = new URL(href).hostname.replace(/^www\./i, '').toLowerCase()
    return host.includes('.') ? host : null
  } catch {
    return null
  }
}

export function domainFromEmail(email: string | null | undefined): string | null {
  const e = (email ?? '').trim().toLowerCase()
  const at = e.lastIndexOf('@')
  if (at < 1) return null
  const domain = e.slice(at + 1)
  if (!domain.includes('.') || isPublicEmailDomain(domain)) return null
  return domain
}

/** Prefer website, then corporate contact / invoice / ops emails. */
export function inferCompanyEmailDomain(source: ClientBaseEmailSource): string | null {
  const fromWeb = domainFromWebsite(source.website)
  if (fromWeb && !isPublicEmailDomain(fromWeb)) return fromWeb
  const candidates = [
    ...(source.contactEmails ?? []),
    source.invoice_email ?? '',
    source.email ?? '',
  ]
  for (const e of candidates) {
    const d = domainFromEmail(e)
    if (d) return d
  }
  return null
}

export function autoGenerateBaseEmail(
  icao: string,
  companyDomain: string,
): string | null {
  const local = baseEmailLocalPart(icao)
  const domain = companyDomain.trim().toLowerCase()
  if (!local || !domain || !domain.includes('.')) return null
  return `${local}@${domain}`
}

/** Explicit bases, else unique ICAOs from frequent lanes. */
export function resolveClientBases(source: ClientBaseEmailSource): ClientBaseRef[] {
  const explicit = (source.bases ?? [])
    .map((b) => ({
      ...b,
      icao: normalizeBaseIcao(b.icao),
      emails: (b.emails ?? []).map((e) => e.trim()).filter((e) => e.includes('@')),
    }))
    .filter((b) => b.icao)
  if (explicit.length) {
    const seen = new Set<string>()
    return explicit.filter((b) => {
      if (seen.has(b.icao)) return false
      seen.add(b.icao)
      return true
    })
  }
  const fromLanes = new Set<string>()
  for (const lane of source.frequent_lanes ?? []) {
    if (lane.origin) fromLanes.add(normalizeBaseIcao(lane.origin))
    if (lane.destination) fromLanes.add(normalizeBaseIcao(lane.destination))
  }
  return [...fromLanes].filter(Boolean).map((icao) => ({ icao }))
}

export type BaseGeneratedEmail = {
  icao: string
  email: string
  /** `stored` = on the base row; `auto` = synthesized from company domain. */
  source: 'stored' | 'auto'
}

/**
 * Emails for company bases. Prefer trip-matched bases when legIcaos provided,
 * otherwise all bases.
 */
export function listBaseGeneratedEmails(
  source: ClientBaseEmailSource,
  opts?: { legIcaos?: string[] },
): BaseGeneratedEmail[] {
  const domain = inferCompanyEmailDomain(source)
  const bases = resolveClientBases(source)
  if (!bases.length) return []

  const legSet = new Set(
    (opts?.legIcaos ?? []).map(normalizeBaseIcao).filter(Boolean),
  )
  const matched = legSet.size
    ? bases.filter((b) => legSet.has(b.icao))
    : []
  const useBases = matched.length ? matched : bases

  const out: BaseGeneratedEmail[] = []
  const seen = new Set<string>()
  for (const b of useBases) {
    const stored = (b.emails ?? []).filter((e) => e.includes('@'))
    if (stored.length) {
      for (const email of stored) {
        const key = email.toLowerCase()
        if (seen.has(key)) continue
        seen.add(key)
        out.push({ icao: b.icao, email, source: 'stored' })
      }
      continue
    }
    if (!domain) continue
    const auto = autoGenerateBaseEmail(b.icao, domain)
    if (!auto) continue
    const key = auto.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ icao: b.icao, email: auto, source: 'auto' })
  }
  return out
}
