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
  /** Can edit other staff section toggles */
  is_admin: boolean
  sections: StaffSectionId[]
  active: boolean
}

/** Digits-only US phone (last 10). */
export function normalizePhone(phone: string): string {
  const d = phone.replace(/\D/g, '')
  if (d.length === 11 && d.startsWith('1')) return d.slice(1)
  return d
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

export const ALL_SECTION_IDS: StaffSectionId[] = STAFF_SECTIONS.map((s) => s.id)
