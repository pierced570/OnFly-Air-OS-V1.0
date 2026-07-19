/**
 * Staff section ACL — which dispatcher UI areas a person may open.
 * Pure TypeScript (no React / Supabase).
 */

export const STAFF_SECTIONS = [
  { id: 'board', label: 'Board', pathPrefix: '/' },
  { id: 'quick_dispatch', label: 'Quick Dispatch', pathPrefix: '/quick-dispatch' },
  { id: 'intake', label: 'Intake', pathPrefix: '/intake' },
  { id: 'financials', label: 'Financials', pathPrefix: '/financials' },
  { id: 'clients', label: 'Clients', pathPrefix: '/clients' },
  { id: 'fbos', label: 'FBOs', pathPrefix: '/fbos' },
  { id: 'trips', label: 'Trips', pathPrefix: '/trips' },
  { id: 'quotes', label: 'Quotes', pathPrefix: '/quotes' },
  { id: 'network', label: 'Network', pathPrefix: '/network' },
  { id: 'radar', label: 'Radar', pathPrefix: '/radar' },
  { id: 'briefing', label: 'Briefing', pathPrefix: '/briefing' },
  { id: 'admin', label: 'Admin wizards', pathPrefix: '/admin' },
  { id: 'tasks', label: 'Tasks', pathPrefix: '/admin/tasks' },
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

export function normalizeNamePart(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ')
}

export function joinFullName(firstName: string, lastName: string): string {
  return `${firstName.trim()} ${lastName.trim()}`.replace(/\s+/g, ' ').trim()
}

/** Split stored "First … Last" into first token + remainder (last name). */
export function splitFullName(full: string): { firstName: string; lastName: string } {
  const parts = full.trim().replace(/\s+/g, ' ').split(' ').filter(Boolean)
  if (!parts.length) return { firstName: '', lastName: '' }
  if (parts.length === 1) return { firstName: parts[0], lastName: '' }
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') }
}

/**
 * Login requires first + last. Matches stored full name:
 * - first token === firstName
 * - last token OR full remainder === lastName
 */
export function loginNamesMatch(
  firstName: string,
  lastName: string,
  storedFull: string,
): boolean {
  const f = normalizeNamePart(firstName)
  const l = normalizeNamePart(lastName)
  if (!f || !l) return false
  const parts = normalizeNamePart(storedFull).split(' ').filter(Boolean)
  if (parts.length < 2) return false
  const storedFirst = parts[0]
  const storedLast = parts[parts.length - 1]
  const storedRemainder = parts.slice(1).join(' ')
  return f === storedFirst && (l === storedLast || l === storedRemainder)
}

/** @deprecated Prefer loginNamesMatch with first + last. */
export function namesMatch(entered: string, stored: string): boolean {
  const { firstName, lastName } = splitFullName(entered)
  if (!lastName) return false
  return loginNamesMatch(firstName, lastName, stored)
}

export function findStaffByLogin(
  staff: StaffMember[],
  firstName: string,
  lastName: string,
  phone: string,
): StaffMember | null {
  const phoneHits = staff.filter(
    (s) => s.active && s.phone.trim() && phonesMatch(phone, s.phone),
  )
  if (!phoneHits.length) return null
  const hits = phoneHits.filter((s) =>
    loginNamesMatch(firstName, lastName, s.name),
  )
  return hits.length === 1 ? hits[0] : null
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
  if (pathname.startsWith('/admin/tasks')) return 'tasks'
  if (pathname.startsWith('/admin')) return 'admin'
  if (pathname.startsWith('/quick-dispatch')) return 'quick_dispatch'
  if (pathname.startsWith('/intake')) return 'intake'
  if (pathname.startsWith('/financials')) return 'financials'
  if (pathname.startsWith('/clients')) return 'clients'
  if (pathname.startsWith('/fbos')) return 'fbos'
  if (pathname.startsWith('/trips')) return 'trips'
  if (pathname.startsWith('/quotes')) return 'quotes'
  if (pathname.startsWith('/network')) return 'network'
  if (pathname.startsWith('/radar')) return 'radar'
  if (pathname.startsWith('/briefing')) return 'briefing'
  if (pathname === '/') return 'board'
  return null
}

export const DISPATCH_DEFAULT_SECTIONS: StaffSectionId[] = [
  'board',
  'quick_dispatch',
  'intake',
  'clients',
  'fbos',
  'trips',
  'quotes',
  'network',
  'radar',
  'briefing',
  'tasks',
]
