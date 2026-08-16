/**
 * Client+base priority lists — fixture seed + localStorage overrides.
 * UI calls these "groups" (clients or useful buckets like Heavy Cargo).
 */

import fixture from '@/fixtures/basePriority.json'
import type { BasePriorityEntry, BasePriorityList } from '@/domain/basePriority'
import { listIdFor } from '@/domain/basePriority'

const KEY = 'onfly.basePriority.v1'
const listeners = new Set<() => void>()
let lists: BasePriorityList[] = load()
let snapshot: BasePriorityList[] = sortLists(lists)

function sortLists(rows: BasePriorityList[]): BasePriorityList[] {
  return [...rows].sort((a, b) => {
    if (a.client_name !== b.client_name) {
      return a.client_name.localeCompare(b.client_name)
    }
    return (a.base_icao ?? 'ZZZZ').localeCompare(b.base_icao ?? 'ZZZZ')
  })
}

function load(): BasePriorityList[] {
  const seeded = (fixture as { lists: BasePriorityList[] }).lists ?? []
  try {
    if (typeof localStorage === 'undefined') return structuredClone(seeded)
    const raw = localStorage.getItem(KEY)
    if (!raw) return structuredClone(seeded)
    const parsed = JSON.parse(raw) as BasePriorityList[]
    if (!Array.isArray(parsed) || !parsed.length) return structuredClone(seeded)
    return parsed
  } catch {
    return structuredClone(seeded)
  }
}

function persist() {
  snapshot = sortLists(lists)
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(KEY, JSON.stringify(lists))
    }
  } catch {
    /* ignore */
  }
  for (const l of listeners) l()
}

function findList(listId: string): BasePriorityList | undefined {
  return lists.find((l) => l.id === listId)
}

export function subscribeBasePriority(fn: () => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

export function listBasePriorityLists(): BasePriorityList[] {
  return snapshot
}

export function getBasePriorityList(listId: string): BasePriorityList | null {
  return findList(listId) ?? null
}

export function listBasePriorityClients(): string[] {
  return [...new Set(snapshot.map((l) => l.client_name))].sort()
}

/** Alias — Recommend UI labels these as groups, not always clients. */
export function listBasePriorityGroups(): string[] {
  return listBasePriorityClients()
}

export function confirmPriorityMatch(
  listId: string,
  entryId: string,
  operatorId: string,
  operatorName: string,
): void {
  const list = findList(listId)
  if (!list) return
  const e = list.entries.find((x) => x.id === entryId)
  if (!e) return
  e.operator_id = operatorId
  e.match_status = 'confirmed'
  e.match_candidate_name = operatorName
  e.suggested_operator_id = operatorId
  persist()
}

export function dismissPriorityMatch(listId: string, entryId: string): void {
  const list = findList(listId)
  if (!list) return
  const e = list.entries.find((x) => x.id === entryId)
  if (!e) return
  e.match_status = 'unmatched'
  e.operator_id = null
  e.suggested_operator_id = null
  e.match_candidate_name = undefined
  e.match_score = undefined
  persist()
}

export function movePriorityEntry(
  listId: string,
  entryId: string,
  direction: -1 | 1,
): void {
  const list = findList(listId)
  if (!list) return
  const i = list.entries.findIndex((x) => x.id === entryId)
  const j = i + direction
  if (i < 0 || j < 0 || j >= list.entries.length) return
  const tmp = list.entries[i]!
  list.entries[i] = list.entries[j]!
  list.entries[j] = tmp
  list.entries.forEach((e, idx) => {
    e.rank = idx + 1
  })
  persist()
}

export function removePriorityEntry(listId: string, entryId: string): void {
  const list = findList(listId)
  if (!list) return
  list.entries = list.entries.filter((e) => e.id !== entryId)
  list.entries.forEach((e, idx) => {
    e.rank = idx + 1
  })
  persist()
}

export function addPriorityEntry(
  listId: string,
  input: {
    company_name: string
    operator_id: string
    general_email?: string
    contact_phone?: string
  },
): BasePriorityEntry | null {
  const list = findList(listId)
  if (!list) return null
  const entry: BasePriorityEntry = {
    id: crypto.randomUUID(),
    rank: list.entries.length + 1,
    company_name: input.company_name.trim(),
    operator_id: input.operator_id,
    match_status: 'confirmed',
    match_candidate_name: input.company_name.trim(),
    suggested_operator_id: input.operator_id,
    general_email: input.general_email?.trim() ?? '',
    contact_phone: input.contact_phone?.trim() ?? '',
    company_phone: '',
    phone_24hr: '',
    call_lines: [],
    notes: '',
    caps: { pax: true, cargo: true, hazmat: false, medevac: false, hrs24: false },
    call_out_time: '',
    usefulness: null,
    approval_tier: '',
    operator_base_icao: '',
    fleet_types_csv: '',
    aircraft_locations_csv: '',
  }
  list.entries.push(entry)
  persist()
  return entry
}

export function ensureBasePriorityList(input: {
  client_name: string
  base_icao: string | null
  base_label?: string
}): BasePriorityList {
  const id = listIdFor(input.client_name, input.base_icao)
  const existing = findList(id)
  if (existing) return existing
  const row: BasePriorityList = {
    id,
    client_name: input.client_name.trim(),
    base_icao: input.base_icao,
    base_label:
      input.base_label?.trim() ||
      input.base_icao ||
      input.client_name.trim(),
    entries: [],
  }
  lists = [...lists, row]
  persist()
  return row
}

export function replaceBasePriorityFromFixture(next: BasePriorityList[]): void {
  lists = structuredClone(next)
  persist()
}

export function __resetBasePriorityForTests(seed?: BasePriorityList[]): void {
  lists = seed ? structuredClone(seed) : structuredClone(
    (fixture as { lists: BasePriorityList[] }).lists ?? [],
  )
  try {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
  persist()
}
