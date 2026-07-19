/**
 * Staff directory + session (name + phone gate).
 * Persists to localStorage until a staff table lands in Supabase.
 *
 * Sole owner: Pierce (`OWNER_STAFF_ID`) — full access + grants sections to others.
 */

import {
  ALL_SECTION_IDS,
  DISPATCH_DEFAULT_SECTIONS,
  enforceOwnerRules,
  findStaffByLogin,
  hasSection,
  normalizePhone,
  OWNER_STAFF_ID,
  type StaffMember,
  type StaffSectionId,
} from '@/domain/staffAccess'

/** Pierce's cell — login seed (not the 858 dispatch line). */
const PIERCE_PHONE = '6105092031'

const STAFF_KEY = 'onfly.staff.directory.v1'
const SESSION_KEY = 'onfly.staff.session.v1'

function storageAvailable(): boolean {
  return typeof localStorage !== 'undefined'
}

function seedStaff(): StaffMember[] {
  return [
    enforceOwnerRules({
      id: OWNER_STAFF_ID,
      name: 'Pierce Demetriades',
      phone: PIERCE_PHONE,
      is_admin: true,
      sections: [...ALL_SECTION_IDS],
      active: true,
    }),
    enforceOwnerRules({
      id: 'staff-paige',
      name: 'Paige Miller',
      phone: '',
      is_admin: false,
      sections: [...DISPATCH_DEFAULT_SECTIONS, 'financials'],
      active: true,
    }),
    enforceOwnerRules({
      id: 'staff-ben',
      name: 'Ben Miller',
      phone: '',
      is_admin: false,
      sections: [...DISPATCH_DEFAULT_SECTIONS, 'financials'],
      active: true,
    }),
    enforceOwnerRules({
      id: 'staff-chris',
      name: 'Chris Hewitt',
      phone: '',
      is_admin: false,
      sections: [...DISPATCH_DEFAULT_SECTIONS],
      active: true,
    }),
    enforceOwnerRules({
      id: 'staff-austin',
      name: 'Austin Ouellette',
      phone: '',
      is_admin: false,
      sections: ['board', 'clients', 'network', 'briefing', 'trips', 'quotes'],
      active: true,
    }),
  ]
}

/**
 * Migrate cached directory: Pierce phone + sole-owner admin rules.
 * Demotes anyone else who was seeded as admin (e.g. Paige).
 */
function migrateStaff(list: StaffMember[]): StaffMember[] {
  const next = list.map((s) => {
    let row = s
    if (s.id === OWNER_STAFF_ID) {
      row = { ...s, phone: PIERCE_PHONE }
    }
    return enforceOwnerRules(row)
  })

  // Ensure owner row always exists
  if (!next.some((s) => s.id === OWNER_STAFF_ID)) {
    next.unshift(seedStaff()[0])
  }

  const changed = JSON.stringify(list) !== JSON.stringify(next)
  if (changed && storageAvailable()) {
    try {
      localStorage.setItem(STAFF_KEY, JSON.stringify(next))
    } catch {
      /* ignore */
    }
  }
  return next
}

function loadStaff(): StaffMember[] {
  if (!storageAvailable()) return seedStaff()
  try {
    const raw = localStorage.getItem(STAFF_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as StaffMember[]
      if (Array.isArray(parsed) && parsed.length) return migrateStaff(parsed)
    }
  } catch {
    /* seed */
  }
  const seeded = seedStaff()
  try {
    localStorage.setItem(STAFF_KEY, JSON.stringify(seeded))
  } catch {
    /* ignore */
  }
  return seeded
}

let staff: StaffMember[] = loadStaff()
let session: StaffMember | null = null
const listeners = new Set<() => void>()

/** Cached snapshots — useSyncExternalStore requires referential stability. */
let cachedStaff: StaffMember[] = []
let cachedSession: StaffMember | null = null

function rebuildCache() {
  cachedStaff = staff.map((s) => ({ ...s, sections: [...s.sections] }))
  cachedSession = session
    ? { ...session, sections: [...session.sections] }
    : null
}

function loadSession(): StaffMember | null {
  if (!storageAvailable()) return null
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const id = JSON.parse(raw) as { id?: string }
    if (!id?.id) return null
    // Directory already ran enforceOwnerRules in migrate/seed.
    return staff.find((s) => s.id === id.id && s.active) ?? null
  } catch {
    return null
  }
}

session = loadSession()
rebuildCache()

function bump() {
  rebuildCache()
  for (const l of listeners) l()
}

function persistStaff() {
  if (!storageAvailable()) return
  try {
    localStorage.setItem(STAFF_KEY, JSON.stringify(staff))
  } catch {
    /* ignore */
  }
}

function persistSession() {
  if (!storageAvailable()) return
  try {
    if (session) localStorage.setItem(SESSION_KEY, JSON.stringify({ id: session.id }))
    else localStorage.removeItem(SESSION_KEY)
  } catch {
    /* ignore */
  }
}

export function subscribeStaff(fn: () => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

export function listStaff(): StaffMember[] {
  return cachedStaff
}

export function getSession(): StaffMember | null {
  return cachedSession
}

export function sessionCan(section: StaffSectionId): boolean {
  return hasSection(session, section)
}

export function loginStaff(
  name: string,
  phone: string,
): { ok: true; member: StaffMember } | { ok: false; error: string } {
  const member = findStaffByLogin(staff, name, phone)
  if (!member) {
    return {
      ok: false,
      error:
        'No match. Use your registered name and phone. Ask Pierce to add you under Admin → Staff access.',
    }
  }
  session = enforceOwnerRules(member)
  persistSession()
  bump()
  void import('@/lib/shiftStore').then((m) => {
    const on = m.getOnShift()
    if (!on || on.person_name !== member.name) {
      m.startShift(member.name, member.phone)
    }
  })
  return { ok: true, member: session }
}

export function logoutStaff(): void {
  session = null
  persistSession()
  bump()
}

export function upsertStaff(input: {
  id?: string
  name: string
  phone: string
  is_admin?: boolean
  sections: StaffSectionId[]
  active?: boolean
}): StaffMember {
  if (!session?.is_admin) {
    throw new Error('Only the owner can edit staff access')
  }
  const name = input.name.trim()
  if (!name) throw new Error('Name required')
  const id = input.id ?? crypto.randomUUID()

  // Nobody else can become admin; owner always stays owner.
  const next = enforceOwnerRules({
    id,
    name,
    phone: normalizePhone(input.phone),
    is_admin: id === OWNER_STAFF_ID,
    sections:
      id === OWNER_STAFF_ID
        ? [...ALL_SECTION_IDS]
        : [...new Set(input.sections.filter((s) => s !== 'staff_access'))],
    active: id === OWNER_STAFF_ID ? true : (input.active ?? true),
  })

  const idx = staff.findIndex((s) => s.id === id)
  if (idx >= 0) staff[idx] = next
  else staff.push(next)
  persistStaff()
  if (session?.id === id) {
    session = next
    persistSession()
  }
  bump()
  return { ...next, sections: [...next.sections] }
}

export function setStaffSections(id: string, sections: StaffSectionId[]): void {
  if (!session?.is_admin) {
    throw new Error('Only the owner can edit staff access')
  }
  const s = staff.find((x) => x.id === id)
  if (!s) throw new Error('Staff not found')
  if (s.id === OWNER_STAFF_ID) {
    s.sections = [...ALL_SECTION_IDS]
    s.is_admin = true
  } else {
    s.is_admin = false
    s.sections = [
      ...new Set(sections.filter((id) => id !== 'staff_access')),
    ]
  }
  persistStaff()
  if (session?.id === id) {
    session = { ...s, sections: [...s.sections] }
    persistSession()
  }
  bump()
}

export function removeStaff(id: string): void {
  if (!session?.is_admin) {
    throw new Error('Only the owner can edit staff access')
  }
  if (id === OWNER_STAFF_ID) {
    throw new Error('Cannot remove the owner account')
  }
  if (staff.length <= 1) throw new Error('Keep at least one staff member')
  staff = staff.filter((s) => s.id !== id)
  persistStaff()
  if (session?.id === id) {
    session = null
    persistSession()
  }
  bump()
}
