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
  updated_at?: string | null
}): StaffMember {
  return enforceOwnerRules({
    id: String(row.id),
    name: String(row.name ?? '').trim() || 'Staff',
    phone: String(row.phone ?? ''),
    is_admin: Boolean(row.is_admin),
    sections: parseStaffSections(row.sections),
    active: row.active == null ? true : Boolean(row.active),
    updated_at: row.updated_at ? String(row.updated_at) : undefined,
  })
}

function ts(iso: string | undefined): number {
  if (!iso) return 0
  const n = Date.parse(iso)
  return Number.isFinite(n) ? n : 0
}

function sectionsEqual(a: StaffSectionId[], b: StaffSectionId[]): boolean {
  if (a.length !== b.length) return false
  const sa = [...a].sort().join(',')
  const sb = [...b].sort().join(',')
  return sa === sb
}

/**
 * Prefer DB roster when present. Rescue local phones/grants when:
 * - local.updated_at is newer than DB (failed cloud write / offline edit), or
 * - DB phone is empty and this browser already has a phone (first sync).
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
      // Local-only person with a phone or a recent edit — keep until flushed.
      if (loc.phone.trim() || ts(loc.updated_at) > 0) {
        byId.set(loc.id, enforceOwnerRules(loc))
      }
      continue
    }

    const localNewer = ts(loc.updated_at) > ts(existing.updated_at)
    const phoneRescue = !existing.phone.trim() && Boolean(loc.phone.trim())

    if (localNewer) {
      byId.set(
        loc.id,
        enforceOwnerRules({
          ...loc,
          phone: loc.phone.trim() || existing.phone,
        }),
      )
      continue
    }

    if (phoneRescue) {
      byId.set(
        loc.id,
        enforceOwnerRules({
          ...existing,
          phone: loc.phone,
          // Prefer local grants on phone rescue — DB seed ACL isn't owner-confirmed.
          sections: loc.sections.length ? loc.sections : existing.sections,
          updated_at: loc.updated_at ?? existing.updated_at,
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

/**
 * Rows in `merged` that differ from DB and should be upserted
 * (phone rescue / local-newer grants). Avoids overwriting richer DB
 * with a plain seed dump.
 */
export function staffRowsNeedingFlush(
  fromDb: StaffMember[],
  merged: StaffMember[],
): StaffMember[] {
  if (!fromDb.length) {
    return merged.filter(
      (s) => s.phone.trim().length > 0 || ts(s.updated_at) > 0,
    )
  }
  const dbById = new Map(fromDb.map((r) => [r.id, r]))
  const out: StaffMember[] = []
  for (const row of merged) {
    const db = dbById.get(row.id)
    if (!db) {
      out.push(row)
      continue
    }
    if ((row.phone || '').trim() !== (db.phone || '').trim()) {
      out.push(row)
      continue
    }
    if (!sectionsEqual(row.sections, db.sections)) {
      out.push(row)
      continue
    }
    if (row.active !== db.active || row.name !== db.name) {
      out.push(row)
      continue
    }
    if (ts(row.updated_at) > ts(db.updated_at)) {
      out.push(row)
    }
  }
  return out
}
