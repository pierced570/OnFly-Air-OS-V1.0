/**
 * Staff section ACL — which dispatcher UI areas a person may open.
 * Pure TypeScript (no React / Supabase).
 */

export const STAFF_SECTIONS = [
  { id: 'board', label: 'Dispatch center', pathPrefix: '/dispatch' },
  { id: 'chat', label: 'Chat', pathPrefix: '/chat' },
  { id: 'quick_dispatch', label: 'Quick Dispatch', pathPrefix: '/quick-dispatch' },
  { id: 'financials', label: 'Financials', pathPrefix: '/financials' },
  { id: 'referrals', label: 'Referrals', pathPrefix: '/referrals' },
  { id: 'clients', label: 'Clients', pathPrefix: '/clients' },
  { id: 'leads', label: 'Leads', pathPrefix: '/leads' },
  { id: 'fbos', label: 'FBOs (Network hub)', pathPrefix: '/network' },
  { id: 'trips', label: 'Trips', pathPrefix: '/trips' },
  { id: 'quotes', label: 'Quotes', pathPrefix: '/quotes' },
  { id: 'network', label: 'Network', pathPrefix: '/network' },
  { id: 'radar', label: 'Radar (Network hub)', pathPrefix: '/network' },
  { id: 'admin', label: 'Admin wizards', pathPrefix: '/admin' },
  { id: 'vault_keys', label: 'Logins & keys', pathPrefix: '/admin/keys' },
  { id: 'staff_access', label: 'Staff access', pathPrefix: '/admin/staff' },
] as const

export type StaffSectionId = (typeof STAFF_SECTIONS)[number]['id']

export type StaffMember = {
  id: string
  name: string
  phone: string
  /**
   * Sole owner flag. Only Pierce (`OWNER_STAFF_ID`) may be admin —
   * full access + Staff access grants for everyone else.
   */
  is_admin: boolean
  sections: StaffSectionId[]
  active: boolean
  /** ISO timestamptz — used to rescue local edits over stale DB seed. */
  updated_at?: string
}

/** Hard-coded sole owner — only this account manages staff ACL. */
export const OWNER_STAFF_ID = 'staff-pierce'

export const ALL_SECTION_IDS: StaffSectionId[] = STAFF_SECTIONS.map((s) => s.id)

/** Sections the owner may grant to others (Staff access stays owner-only). */
export const GRANTABLE_SECTIONS = STAFF_SECTIONS.filter(
  (s) => s.id !== 'staff_access',
)

export const GRANTABLE_SECTION_IDS: StaffSectionId[] = GRANTABLE_SECTIONS.map(
  (s) => s.id,
)

/** Enforce sole-owner rules on a staff row. */
export function enforceOwnerRules(member: StaffMember): StaffMember {
  if (member.id === OWNER_STAFF_ID) {
    return {
      ...member,
      is_admin: true,
      active: true,
      sections: [...ALL_SECTION_IDS],
    }
  }
  return {
    ...member,
    is_admin: false,
    sections: [
      ...new Set(member.sections.filter((id) => id !== 'staff_access')),
    ],
  }
}

/** Digits-only US phone (last 10). */
export function normalizePhone(phone: string): string {
  const d = phone.replace(/\D/g, '')
  if (d.length === 11 && d.startsWith('1')) return d.slice(1)
  return d.slice(0, 10)
}

/**
 * Digits the user may type into a phone field (US, max 10).
 * Strips spaces, dashes, parens, and a leading country code 1.
 */
export function phoneDigitsInput(raw: string): string {
  return normalizePhone(raw)
}

/** Display / type-as-you-go format: (XXX) XXX-XXXX */
export function formatPhoneDisplay(phone: string): string {
  const d = phoneDigitsInput(phone)
  if (!d) return ''
  if (d.length <= 3) return `(${d}`
  if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`
}

export function phonesMatch(a: string, b: string): boolean {
  const na = normalizePhone(a)
  const nb = normalizePhone(b)
  if (!na || !nb) return false
  return na === nb || na.endsWith(nb) || nb.endsWith(na)
}

export function namesMatch(entered: string, stored: string): boolean {
  const a = entered.trim().toLowerCase().replace(/\s+/g, ' ')
  const b = stored.trim().toLowerCase().replace(/\s+/g, ' ')
  if (!a || !b) return false
  if (a === b) return true
  // Allow first name if unique match is checked by caller; here: first-token match
  const af = a.split(' ')[0]
  const bf = b.split(' ')[0]
  return af.length >= 2 && af === bf && (a === af || b.startsWith(af))
}

export function findStaffByLogin(
  staff: StaffMember[],
  name: string,
  phone: string,
): StaffMember | null {
  const phoneHits = staff.filter(
    (s) => s.active && s.phone.trim() && phonesMatch(phone, s.phone),
  )
  if (!phoneHits.length) return null
  const exact = phoneHits.find(
    (s) =>
      s.name.trim().toLowerCase() === name.trim().toLowerCase().replace(/\s+/g, ' '),
  )
  if (exact) return exact
  const loose = phoneHits.filter((s) => namesMatch(name, s.name))
  if (loose.length === 1) return loose[0]
  return null
}

export function hasSection(
  member: StaffMember | null | undefined,
  section: StaffSectionId,
): boolean {
  if (!member || !member.active) return false
  // Staff access page: owner/admin only — never via a granted section toggle.
  if (section === 'staff_access') return member.is_admin
  if (member.is_admin) return true
  return member.sections.includes(section)
}

/** Map a pathname to the ACL section that gates it. */
export function sectionForPath(pathname: string): StaffSectionId | null {
  if (pathname.startsWith('/admin/keys')) return 'vault_keys'
  if (pathname.startsWith('/admin/staff')) return 'staff_access'
  if (pathname.startsWith('/admin')) return 'admin'
  if (pathname.startsWith('/quick-dispatch')) return 'quick_dispatch'
  if (pathname.startsWith('/financials')) return 'financials'
  if (pathname.startsWith('/referrals')) return 'referrals'
  if (pathname.startsWith('/clients')) return 'clients'
  if (pathname.startsWith('/leads')) return 'leads'
  // Legacy /fbos + /radar redirect into Network hub — gate as network.
  if (pathname.startsWith('/fbos')) return 'network'
  if (pathname.startsWith('/trips')) return 'trips'
  if (pathname.startsWith('/quotes')) return 'quotes'
  if (pathname.startsWith('/network')) return 'network'
  if (pathname.startsWith('/radar')) return 'network'
  if (pathname.startsWith('/briefing')) return 'board'
  if (pathname.startsWith('/chat')) return 'chat'
  if (pathname.startsWith('/desk')) return 'board'
  if (
    pathname === '/dispatch' ||
    pathname.startsWith('/dispatch/') ||
    pathname === '/board' ||
    pathname.startsWith('/board/') ||
    pathname.startsWith('/intake')
  ) {
    return 'board'
  }
  return null
}

export const DISPATCH_DEFAULT_SECTIONS: StaffSectionId[] = [
  'board',
  'chat',
  'quick_dispatch',
  'financials',
  'referrals',
  'clients',
  'leads',
  'fbos',
  'trips',
  'quotes',
  'network',
  'radar',
]
