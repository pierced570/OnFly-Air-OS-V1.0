/**
 * Staff directory + session (name + phone gate).
 * Source of truth: Supabase `staff_directory` (survives deploys).
 * localStorage is a cache / offline rescue until hydrate completes.
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
import {
  localHasPhoneRescue,
  mergeStaffFromDbAndLocal,
  staffMemberFromDbRow,
} from '@/domain/staffDirectorySync'

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
      sections: [...DISPATCH_DEFAULT_SECTIONS],
      active: true,
    }),
    enforceOwnerRules({
      id: 'staff-ben',
      name: 'Ben Miller',
      phone: '',
      is_admin: false,
      sections: [...DISPATCH_DEFAULT_SECTIONS],
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
      sections: ['board', 'clients', 'network', 'trips', 'quotes'],
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
    // Grant Chat alongside Trips for existing dispatch seats
    if (row.sections.includes('trips') && !row.sections.includes('chat')) {
      row = { ...row, sections: [...row.sections, 'chat'] }
    }
    return enforceOwnerRules(row)
  })

  // Ensure owner row always exists
  if (!next.some((s) => s.id === OWNER_STAFF_ID)) {
    next.unshift(seedStaff()[0]!)
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

function persistStaffLocal() {
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

function rowPayload(s: StaffMember) {
  return {
    id: s.id,
    name: s.name,
    phone: s.phone,
    is_admin: s.is_admin,
    sections: s.sections,
    active: s.active,
    updated_at: new Date().toISOString(),
  }
}

async function flushStaffRowToDb(member: StaffMember): Promise<void> {
  try {
    const { supabase, isSupabaseConfigured } = await import('@/lib/supabase')
    if (!isSupabaseConfigured || !supabase) return
    const { error } = await supabase
      .from('staff_directory')
      .upsert(rowPayload(member), { onConflict: 'id' })
    if (error) console.warn('[staff_directory] upsert failed', error.message)
  } catch (e) {
    console.warn('[staff_directory] upsert failed', e)
  }
}

async function flushAllStaffToDb(): Promise<void> {
  try {
    const { supabase, isSupabaseConfigured } = await import('@/lib/supabase')
    if (!isSupabaseConfigured || !supabase) return
    const rows = staff.map(rowPayload)
    const { error } = await supabase
      .from('staff_directory')
      .upsert(rows, { onConflict: 'id' })
    if (error) console.warn('[staff_directory] bulk upsert failed', error.message)
  } catch (e) {
    console.warn('[staff_directory] bulk upsert failed', e)
  }
}

async function deleteStaffFromDb(id: string): Promise<void> {
  try {
    const { supabase, isSupabaseConfigured } = await import('@/lib/supabase')
    if (!isSupabaseConfigured || !supabase) return
    const { error } = await supabase.from('staff_directory').delete().eq('id', id)
    if (error) console.warn('[staff_directory] delete failed', error.message)
  } catch (e) {
    console.warn('[staff_directory] delete failed', e)
  }
}

let hydratePromise: Promise<number> | null = null

/**
 * Pull roster from Supabase. Rescues phones still sitting in this browser's
 * localStorage when DB rows are empty (one-time after this feature ships).
 */
export async function hydrateStaffFromDb(): Promise<number> {
  try {
    const { supabase, isSupabaseConfigured } = await import('@/lib/supabase')
    if (!isSupabaseConfigured || !supabase) return 0
    const { data, error } = await supabase
      .from('staff_directory')
      .select('id,name,phone,is_admin,sections,active')
      .order('name')
    if (error) {
      console.warn('[staff_directory] hydrate failed', error.message)
      return 0
    }
    const fromDb = (data ?? []).map((r) =>
      staffMemberFromDbRow(r as Parameters<typeof staffMemberFromDbRow>[0]),
    )
    const local = staff
    const merged = migrateStaff(mergeStaffFromDbAndLocal(fromDb, local))
    staff = merged
    if (session) {
      session =
        staff.find((s) => s.id === session!.id && s.active) ?? null
      persistSession()
    }
    persistStaffLocal()
    bump()

    if (!fromDb.length || localHasPhoneRescue(fromDb, local)) {
      await flushAllStaffToDb()
    }
    return staff.length
  } catch (e) {
    console.warn('[staff_directory] hydrate failed', e)
    return 0
  }
}

/** Single-flight hydrate — call at boot and before login. */
export function ensureStaffHydrated(): Promise<number> {
  if (!hydratePromise) {
    hydratePromise = hydrateStaffFromDb().catch((err) => {
      console.warn('[staff_directory] ensure hydrate failed', err)
      hydratePromise = null
      return 0
    })
  }
  return hydratePromise
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

/** Stable reference between bumps — required by useSyncExternalStore. */
export function getSession(): StaffMember | null {
  return cachedSession
}

export function sessionSnapshotIsStable(): boolean {
  return getSession() === getSession()
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
  void import('@/lib/presenceStore').then((m) => {
    m.touchPresence({
      staff_id: member.id,
      name: member.name,
      phone: member.phone,
    })
  })
  void import('@/lib/shiftStore').then((m) => {
    const onRoster = m
      .listOnShift()
      .some(
        (s) => s.person_name.toLowerCase() === member.name.toLowerCase(),
      )
    if (!onRoster) {
      m.startShift(member.name, member.phone)
    }
  })
  return { ok: true, member: session }
}

export function logoutStaff(): void {
  const leaving = session
  session = null
  persistSession()
  bump()
  if (leaving) {
    void import('@/lib/presenceStore').then((m) => {
      m.clearPresence(leaving.id)
    })
    void import('@/lib/shiftStore').then((m) => {
      m.endShiftForPerson(leaving.name)
    })
  }
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
  persistStaffLocal()
  void flushStaffRowToDb(next)
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
      ...new Set(sections.filter((sid) => sid !== 'staff_access')),
    ]
  }
  persistStaffLocal()
  void flushStaffRowToDb({ ...s, sections: [...s.sections] })
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
  persistStaffLocal()
  void deleteStaffFromDb(id)
  if (session?.id === id) {
    session = null
    persistSession()
  }
  bump()
}
