/**
 * Merge staff directory rows — DB phones/grants win over empty seed.
 * Pure TS for tests.
 */

import {
  ALL_SECTION_IDS,
  enforceOwnerRules,
  OWNER_STAFF_ID,
  type StaffMember,
  type StaffSectionId,
} from '@/domain/staffAccess'

const SECTION_SET = new Set<string>(ALL_SECTION_IDS)

export function parseStaffSections(raw: unknown): StaffSectionId[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map(String)
    .filter((id): id is StaffSectionId => SECTION_SET.has(id))
}

export function staffMemberFromDbRow(row: {
  id: string
  name: string
  phone?: string | null
  is_admin?: boolean | null
  sections?: unknown
  active?: boolean | null
}): StaffMember {
  return enforceOwnerRules({
    id: String(row.id),
    name: String(row.name ?? '').trim() || 'Staff',
    phone: String(row.phone ?? ''),
    is_admin: Boolean(row.is_admin),
    sections: parseStaffSections(row.sections),
    active: row.active == null ? true : Boolean(row.active),
  })
}

/**
 * Prefer DB roster when present. Keep any local-only rows that have a phone
 * (so a browser that already set phones can push them up on first sync).
 */
export function mergeStaffFromDbAndLocal(
  fromDb: StaffMember[],
  local: StaffMember[],
): StaffMember[] {
  if (!fromDb.length) return local.map((s) => enforceOwnerRules(s))

  const byId = new Map<string, StaffMember>()
  for (const row of fromDb) {
    byId.set(row.id, enforceOwnerRules(row))
  }

  for (const loc of local) {
    const existing = byId.get(loc.id)
    if (!existing) {
      // Local-only person with a phone — keep until flushed to DB
      if (loc.phone.trim()) {
        byId.set(loc.id, enforceOwnerRules(loc))
      }
      continue
    }
    // If DB phone is empty but local has one, keep local phone (one-time rescue).
    if (!existing.phone.trim() && loc.phone.trim()) {
      byId.set(
        loc.id,
        enforceOwnerRules({
          ...existing,
          phone: loc.phone,
          sections:
            existing.sections.length > 0 ? existing.sections : loc.sections,
        }),
      )
    }
  }

  // Owner always present
  if (![...byId.keys()].includes(OWNER_STAFF_ID)) {
    const owner = local.find((s) => s.id === OWNER_STAFF_ID)
    if (owner) byId.set(OWNER_STAFF_ID, enforceOwnerRules(owner))
  }

  return [...byId.values()].sort((a, b) => {
    if (a.id === OWNER_STAFF_ID) return -1
    if (b.id === OWNER_STAFF_ID) return 1
    return a.name.localeCompare(b.name)
  })
}

/** True when any local phone would improve empty DB phones. */
export function localHasPhoneRescue(
  fromDb: StaffMember[],
  local: StaffMember[],
): boolean {
  if (!fromDb.length) {
    return local.some((s) => s.phone.trim().length > 0)
  }
  for (const loc of local) {
    if (!loc.phone.trim()) continue
    const db = fromDb.find((s) => s.id === loc.id)
    if (!db || !db.phone.trim()) return true
  }
  return false
}
