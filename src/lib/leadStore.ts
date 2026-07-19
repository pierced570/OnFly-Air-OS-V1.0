/**
 * Leads directory — session + localStorage, best-effort Supabase sync.
 */

import {
  applyLogTouch,
  buildLead,
  filterLeads,
  sortLeads,
  type Lead,
  type LeadDraft,
  type LeadFollowUpState,
  type LeadKind,
  type LeadSortMode,
  type LeadStatus,
  type LogTouchInput,
} from '@/domain/leads'

const STORAGE_KEY = 'onfly.leads.v1'

const byId = new Map<string, Lead>()
const listeners = new Set<() => void>()
let snapshot: Lead[] = []

function rebuild() {
  snapshot = sortLeads([...byId.values()], 'follow_up')
}

function bump(persistId?: string) {
  rebuild()
  persistLocal()
  for (const l of listeners) l()
  if (persistId) {
    const row = byId.get(persistId)
    if (row) void import('@/lib/db/persist').then((m) => m.persistLead(row))
  }
}

function persistLocal() {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...byId.values()]))
  } catch {
    /* ignore */
  }
}

function loadLocal(): void {
  if (typeof localStorage === 'undefined') return
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return
    const parsed = JSON.parse(raw) as Lead[]
    if (!Array.isArray(parsed)) return
    for (const row of parsed) {
      if (row?.id && row.company && row.contact_name) byId.set(row.id, row)
    }
  } catch {
    /* ignore */
  }
}

loadLocal()
rebuild()

export function subscribeLeads(fn: () => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

export function listLeads(): Lead[] {
  return snapshot
}

export function getLead(id: string): Lead | undefined {
  return byId.get(id)
}

export function replaceLeadsFromDb(rows: Lead[]): void {
  if (!rows.length) return
  byId.clear()
  for (const r of rows) byId.set(r.id, r)
  rebuild()
  persistLocal()
  for (const l of listeners) l()
}

export function addLead(draft: LeadDraft): Lead {
  const row = buildLead(draft)
  byId.set(row.id, row)
  bump(row.id)
  return row
}

export function updateLead(
  id: string,
  patch: Partial<Omit<Lead, 'id' | 'created_at'>>,
): Lead | undefined {
  const prev = byId.get(id)
  if (!prev) return undefined
  const next: Lead = {
    ...prev,
    ...patch,
    company: (patch.company ?? prev.company).trim(),
    contact_name: (patch.contact_name ?? prev.contact_name).trim(),
    updated_at: new Date().toISOString(),
  }
  byId.set(id, next)
  bump(id)
  return next
}

export function logLeadTouch(
  id: string,
  input: LogTouchInput,
): Lead | undefined {
  const prev = byId.get(id)
  if (!prev) return undefined
  const next = applyLogTouch(prev, input)
  byId.set(id, next)
  bump(id)
  return next
}

export function deleteLead(id: string): boolean {
  const ok = byId.delete(id)
  if (ok) {
    rebuild()
    persistLocal()
    for (const l of listeners) l()
    void import('@/lib/db/persist').then((m) => m.deleteLead(id))
  }
  return ok
}

export function queryLeads(opts: {
  q?: string
  kind?: LeadKind | 'all'
  status?: LeadStatus | 'all' | 'active'
  followUp?: LeadFollowUpState | 'all' | 'needs_touch'
  sort?: LeadSortMode
}): Lead[] {
  const filtered = filterLeads(snapshot, opts)
  return sortLeads(filtered, opts.sort ?? 'follow_up')
}

export function countNeedsTouch(nowMs = Date.now()): number {
  return filterLeads(snapshot, { followUp: 'needs_touch', status: 'active', nowMs })
    .length
}
