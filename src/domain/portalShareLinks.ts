/**
 * Company-designated portal entry + safe deep links for staff outreach.
 * Pure — no React / Supabase. Paths only; absolute URLs live in lib/appUrl.
 */

export type PortalShareKind =
  | 'company'
  | 'login'
  | 'home'
  | 'book'
  | 'quote'
  | 'history'
  | 'account'
  | 'trip'
  | 'track'

export type PortalShareClientLike = {
  id: string
  name: string
  profile?: {
    portal_slug?: string | null
    allowed_email_domains?: string[] | null
    dba?: string | null
  } | null
}

/** Paths clients may land on after one-click login (`?next=`). */
const SAFE_NEXT =
  /^\/portal(?:\/(?:history|account|request|trips\/[A-Za-z0-9_-]+|track\/[A-Za-z0-9_-]+|c\/[a-z0-9-]+|login))?(?:\?[^\s#]*)?$/i

export function isSafePortalNextPath(raw: string | null | undefined): boolean {
  if (!raw) return false
  const path = raw.trim()
  if (!path.startsWith('/portal')) return false
  if (path.includes('://') || path.includes('//') || path.includes('\\'))
    return false
  return SAFE_NEXT.test(path)
}

/** Normalize / validate `next` query — returns null if unsafe. */
export function safePortalNextPath(
  raw: string | null | undefined,
): string | null {
  if (!raw) return null
  let decoded = raw.trim()
  try {
    decoded = decodeURIComponent(decoded)
  } catch {
    /* keep raw */
  }
  if (!isSafePortalNextPath(decoded)) return null
  return decoded
}

/**
 * Stable company portal slug — explicit profile.portal_slug, else first
 * allowlisted domain label, else sanitized company name.
 */
export function portalSlugFromClient(client: PortalShareClientLike): string {
  const explicit = (client.profile?.portal_slug ?? '').trim().toLowerCase()
  if (explicit) return sanitizePortalSlug(explicit)

  const domains = client.profile?.allowed_email_domains ?? []
  for (const d of domains) {
    const label = String(d)
      .trim()
      .toLowerCase()
      .split('.')[0]
    const s = sanitizePortalSlug(label || '')
    if (s) return s
  }

  const fromName = sanitizePortalSlug(
    (client.profile?.dba || client.name || '').trim(),
  )
  return fromName || sanitizePortalSlug(client.id) || 'client'
}

export function sanitizePortalSlug(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
}

/** Relative path for company-branded portal gate. */
export function portalCompanyPath(slug: string): string {
  const s = sanitizePortalSlug(slug)
  return s ? `/portal/c/${s}` : '/portal'
}

export function portalLoginPath(opts?: {
  company?: string | null
  next?: string | null
}): string {
  const params = new URLSearchParams()
  const company = sanitizePortalSlug(opts?.company ?? '')
  if (company) params.set('company', company)
  const next = safePortalNextPath(opts?.next ?? null)
  if (next) params.set('next', next)
  const q = params.toString()
  return q ? `/portal/login?${q}` : '/portal/login'
}

/**
 * Relative portal path for staff-copy / email outreach.
 * Trip/track kinds need ids; company needs slug or client.
 */
export function portalSharePath(
  kind: PortalShareKind,
  opts?: {
    slug?: string | null
    tripId?: string | null
    trackToken?: string | null
    /** After login, land here (wrapped into login?next= when kind is login-gated). */
    next?: string | null
    /** When true, wrap signed-in destinations as login?next= for cold outreach. */
    viaLogin?: boolean
    company?: string | null
  },
): string {
  const slug = sanitizePortalSlug(opts?.slug ?? opts?.company ?? '')
  const viaLogin = opts?.viaLogin === true

  const wrap = (dest: string) =>
    viaLogin
      ? portalLoginPath({ company: slug || null, next: dest })
      : dest

  switch (kind) {
    case 'company':
      return slug ? portalCompanyPath(slug) : '/portal'
    case 'login':
      return portalLoginPath({
        company: slug || null,
        next: opts?.next ?? null,
      })
    case 'home':
      return wrap('/portal')
    case 'book':
      return wrap('/portal/request?mode=book')
    case 'quote':
      return wrap('/portal/request?mode=quote')
    case 'history':
      return wrap('/portal/history')
    case 'account':
      return wrap('/portal/account')
    case 'trip': {
      const id = (opts?.tripId ?? '').trim()
      if (!id) return wrap('/portal')
      return wrap(`/portal/trips/${id}`)
    }
    case 'track': {
      const tok = (opts?.trackToken ?? '').trim()
      // Track tokens are guest-capable — never force login wrapper.
      if (!tok) return wrap('/portal')
      return `/portal/track/${tok}`
    }
    default:
      return '/portal'
  }
}

/** Find client whose portal slug matches (explicit or derived). */
export function findClientByPortalSlug<T extends PortalShareClientLike>(
  slug: string,
  clients: T[],
): T | null {
  const needle = sanitizePortalSlug(slug)
  if (!needle) return null
  for (const c of clients) {
    if (portalSlugFromClient(c) === needle) return c
  }
  return null
}

export type PortalShareLinkRow = {
  kind: PortalShareKind
  label: string
  hint: string
  path: string
}

/** Desk checklist of copyable client-facing links for one company (+ optional trip). */
export function buildPortalShareLinkRows(opts: {
  client: PortalShareClientLike
  tripId?: string | null
  trackToken?: string | null
  /** Prefer login?next= for signed-in destinations (cold email / SMS). */
  viaLogin?: boolean
}): PortalShareLinkRow[] {
  const slug = portalSlugFromClient(opts.client)
  const via = opts.viaLogin !== false
  const base = {
    slug,
    company: slug,
    tripId: opts.tripId,
    trackToken: opts.trackToken,
    viaLogin: via,
  }
  const rows: PortalShareLinkRow[] = [
    {
      kind: 'company',
      label: 'Company portal',
      hint: `${opts.client.name} — book / quote / login`,
      path: portalSharePath('company', base),
    },
    {
      kind: 'login',
      label: 'One-click login',
      hint: 'Work email only — opens their trips',
      path: portalSharePath('login', base),
    },
    {
      kind: 'book',
      label: 'Request a flight',
      hint: 'Guest book form (no login first)',
      path: portalSharePath('book', { ...base, viaLogin: false }),
    },
    {
      kind: 'quote',
      label: 'Rough quote',
      hint: 'Soft pricing first',
      path: portalSharePath('quote', { ...base, viaLogin: false }),
    },
    {
      kind: 'history',
      label: 'Prior trips / POs',
      hint: 'Login then history',
      path: portalSharePath('history', base),
    },
  ]
  if (opts.tripId) {
    rows.push({
      kind: 'trip',
      label: 'This trip (signed-in)',
      hint: 'Login → live trip tracking',
      path: portalSharePath('trip', base),
    })
  }
  if (opts.trackToken) {
    rows.push({
      kind: 'track',
      label: 'Guest track link',
      hint: 'Magic link — no login',
      path: portalSharePath('track', base),
    })
  }
  return rows
}
