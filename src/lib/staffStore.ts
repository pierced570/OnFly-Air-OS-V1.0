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
  mergeStaffFromDbAndLocal,
  staffMemberFromDbRow,
  staffRowsNeedingFlush,
} from '@/domain/staffDirectorySync'

/** Pierce's cell — login seed (not the 858 dispatch line). */
const PIERCE_PHONE = '6105092031'

const STAFF_KEY = 'onfly.staff.directory.v1'
const SESSION_KEY = 'onfly.staff.session.v1'

export type StaffPersistResult = {
  member: StaffMember
  /** True when the row is durable in Supabase (or Supabase is not configured). */
  synced: boolean
  error?: string
}

function storageAvailable(): boolean {
  return typeof localStorage !== 'undefined'
}

function nowIso(): string {
  return new Date().toISOString()
}

function seedStaff(): StaffMember[] {
  const stamped = nowIso()
  return [
    enforceOwnerRules({
      id: OWNER_STAFF_ID,
      name: 'Pierce Demetriades',
      phone: PIERCE_PHONE,
      is_admin: true,
      sections: [...ALL_SECTION_IDS],
      active: true,
      updated_at: stamped,
    }),
    enforceOwnerRules({
      id: 'staff-paige',
      name: 'Paige Miller',
      phone: '',
      is_admin: false,
      sections: [...DISPATCH_DEFAULT_SECTIONS],
      active: true,
      updated_at: stamped,
    }),
    enforceOwnerRules({
      id: 'staff-ben',
      name: 'Ben Miller',
      phone: '',
      is_admin: false,
      sections: [...DISPATCH_DEFAULT_SECTIONS],
      active: true,
      updated_at: stamped,
    }),
    enforceOwnerRules({
      id: 'staff-chris',
      name: 'Chris Hewitt',
      phone: '',
      is_admin: false,
      sections: [...DISPATCH_DEFAULT_SECTIONS],
      active: true,
      updated_at: stamped,
    }),
    enforceOwnerRules({
      id: 'staff-austin',
      name: 'Austin Ouellette',
      phone: '',
      is_admin: false,
      sections: ['board', 'clients', 'network', 'trips', 'quotes'],
      active: true,
      updated_at: stamped,
    }),
  ]
}

/**
 * Migrate cached directory: Pierce phone + sole-owner admin rules.
 * Demotes anyone else who was seeded as admin (e.g. Paige).
 */
function migrateStaff(list: StaffMember[]): StaffMember[] {
  const known = new Set<string>(ALL_SECTION_IDS)
  const next = list.map((s) => {
    let row = s
    if (s.id === OWNER_STAFF_ID) {
      row = { ...s, phone: PIERCE_PHONE }
    }
    // Drop retired section ids (e.g. tasks, briefing) from cached/DB grants
    const cleaned = row.sections.filter((id) => known.has(id))
    if (cleaned.length !== row.sections.length) {
      row = { ...row, sections: cleaned }
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

/** Last cloud sync outcome for Staff access UI. */
let lastSyncMessage: string | null = null
let lastSyncOk: boolean | null = null
let cachedSyncStatus: { ok: boolean | null; message: string | null } = {
  ok: null,
  message: null,
}

function rebuildCache() {
  cachedStaff = staff.map((s) => ({ ...s, sections: [...s.sections] }))
  cachedSession = session
    ? { ...session, sections: [...session.sections] }
    : null
  cachedSyncStatus = { ok: lastSyncOk, message: lastSyncMessage }
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
    updated_at: s.updated_at ?? nowIso(),
  }
}

async function flushStaffRowToDb(
  member: StaffMember,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const { supabase, isSupabaseConfigured } = await import('@/lib/supabase')
    if (!isSupabaseConfigured || !supabase) {
      return {
        ok: false,
        error: 'Supabase is not configured in this environment',
      }
    }
    const { error } = await supabase
      .from('staff_directory')
      .upsert(rowPayload(member), { onConflict: 'id' })
    if (error) {
      console.warn('[staff_directory] upsert failed', error.message)
      return { ok: false, error: error.message }
    }
    return { ok: true }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.warn('[staff_directory] upsert failed', e)
    return { ok: false, error: msg }
  }
}

async function flushStaffRowsToDb(
  rows: StaffMember[],
): Promise<{ ok: boolean; error?: string }> {
  if (!rows.length) return { ok: true }
  try {
    const { supabase, isSupabaseConfigured } = await import('@/lib/supabase')
    if (!isSupabaseConfigured || !supabase) {
      return {
        ok: false,
        error: 'Supabase is not configured in this environment',
      }
    }
    const { error } = await supabase
      .from('staff_directory')
      .upsert(rows.map(rowPayload), { onConflict: 'id' })
    if (error) {
      console.warn('[staff_directory] bulk upsert failed', error.message)
      return { ok: false, error: error.message }
    }
    return { ok: true }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.warn('[staff_directory] bulk upsert failed', e)
    return { ok: false, error: msg }
  }
}

async function deleteStaffFromDb(
  id: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const { supabase, isSupabaseConfigured } = await import('@/lib/supabase')
    if (!isSupabaseConfigured || !supabase) {
      return { ok: true }
    }
    const { error } = await supabase.from('staff_directory').delete().eq('id', id)
    if (error) {
      console.warn('[staff_directory] delete failed', error.message)
      return { ok: false, error: error.message }
    }
    return { ok: true }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.warn('[staff_directory] delete failed', e)
    return { ok: false, error: msg }
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
    if (!isSupabaseConfigured || !supabase) {
      lastSyncOk = false
      lastSyncMessage =
        'Cloud roster unavailable — phones/grants only on this device until Supabase is configured.'
      bump()
      return 0
    }
    const { data, error } = await supabase
      .from('staff_directory')
      .select('id,name,phone,is_admin,sections,active,updated_at')
      .order('name')
    if (error) {
      console.warn('[staff_directory] hydrate failed', error.message)
      lastSyncOk = false
      lastSyncMessage = `Cloud roster sync failed: ${error.message}`
      bump()
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

    const toFlush = staffRowsNeedingFlush(fromDb, merged)
    if (toFlush.length) {
      const flush = await flushStaffRowsToDb(toFlush)
      if (!flush.ok) {
        lastSyncOk = false
        lastSyncMessage = `Roster loaded, but pushing local phones/grants failed: ${flush.error}`
      } else {
        lastSyncOk = true
        lastSyncMessage = `Cloud roster synced (${staff.length} people).`
      }
    } else {
      lastSyncOk = true
      lastSyncMessage = fromDb.length
        ? `Cloud roster synced (${staff.length} people).`
        : 'Cloud roster empty — seed will push on first save.'
    }
    bump()
    return staff.length
  } catch (e) {
    console.warn('[staff_directory] hydrate failed', e)
    lastSyncOk = false
    lastSyncMessage =
      e instanceof Error ? e.message : 'Cloud roster sync failed'
    bump()
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

/** Force a fresh pull (Staff access page / after save). */
export function refreshStaffFromDb(): Promise<number> {
  hydratePromise = null
  return ensureStaffHydrated()
}

export function getStaffSyncStatus(): {
  ok: boolean | null
  message: string | null
} {
  return cachedSyncStatus
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

export async function upsertStaff(input: {
  id?: string
  name: string
  phone: string
  is_admin?: boolean
  sections: StaffSectionId[]
  active?: boolean
}): Promise<StaffPersistResult> {
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
    updated_at: nowIso(),
  })

  const idx = staff.findIndex((s) => s.id === id)
  if (idx >= 0) staff[idx] = next
  else staff.push(next)
  persistStaffLocal()
  if (session?.id === id) {
    session = next
    persistSession()
  }
  bump()

  const { isSupabaseConfigured } = await import('@/lib/supabase')
  const sync = await flushStaffRowToDb(next)
  if (!isSupabaseConfigured) {
    lastSyncOk = false
    lastSyncMessage =
      'Saved on this device only — Supabase is not configured, so grants reset on new deploys.'
    bump()
    return {
      member: { ...next, sections: [...next.sections] },
      synced: false,
      error: lastSyncMessage,
    }
  }
  if (!sync.ok) {
    lastSyncOk = false
    lastSyncMessage = `Saved on this device only — cloud sync failed: ${sync.error}`
    bump()
    return {
      member: { ...next, sections: [...next.sections] },
      synced: false,
      error: sync.error,
    }
  }
  lastSyncOk = true
  lastSyncMessage = `Saved ${next.name} to cloud.`
  bump()
  return {
    member: { ...next, sections: [...next.sections] },
    synced: true,
  }
}

export async function setStaffSections(
  id: string,
  sections: StaffSectionId[],
): Promise<StaffPersistResult> {
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
  s.updated_at = nowIso()
  persistStaffLocal()
  if (session?.id === id) {
    session = { ...s, sections: [...s.sections] }
    persistSession()
  }
  bump()
  const sync = await flushStaffRowToDb({ ...s, sections: [...s.sections] })
  return {
    member: { ...s, sections: [...s.sections] },
    synced: sync.ok,
    error: sync.error,
  }
}

export async function removeStaff(id: string): Promise<StaffPersistResult> {
  if (!session?.is_admin) {
    throw new Error('Only the owner can edit staff access')
  }
  if (id === OWNER_STAFF_ID) {
    throw new Error('Cannot remove the owner account')
  }
  if (staff.length <= 1) throw new Error('Keep at least one staff member')
  const removed = staff.find((s) => s.id === id)
  staff = staff.filter((s) => s.id !== id)
  persistStaffLocal()
  if (session?.id === id) {
    session = null
    persistSession()
  }
  bump()
  const sync = await deleteStaffFromDb(id)
  if (!sync.ok) {
    lastSyncOk = false
    lastSyncMessage = `Removed locally — cloud delete failed: ${sync.error}`
    bump()
  }
  return {
    member: removed ?? {
      id,
      name: '',
      phone: '',
      is_admin: false,
      sections: [],
      active: false,
    },
    synced: sync.ok,
    error: sync.error,
  }
}
