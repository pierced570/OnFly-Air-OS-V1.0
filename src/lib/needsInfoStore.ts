/**
 * Session NEEDS-INFO tasks — filled from DB hydrate / wizard skips.
 * Does not import the large network.json fixture (keeps Board boot light).
 */

export type NeedsInfoTask = {
  id: string
  entity_type: 'operator' | 'aircraft' | 'client' | 'fbo' | 'trip' | 'vendor'
  entity_id: string
  entity_label: string
  field: string
  note: string
  status: 'open' | 'resolved'
  wizard: 'operator' | 'client' | 'fbo' | null
  created_at: string
  resolved_at: string | null
}

const tasks = new Map<string, NeedsInfoTask>()
const listeners = new Set<() => void>()
let snapshot: NeedsInfoTask[] = []
/** Stable filtered view for useSyncExternalStore */
let openSnapshot: NeedsInfoTask[] = []

function rebuild() {
  snapshot = [...tasks.values()].sort((a, b) => {
    if (a.status !== b.status) return a.status === 'open' ? -1 : 1
    return b.created_at.localeCompare(a.created_at)
  })
  openSnapshot = snapshot.filter((t) => t.status === 'open')
}

function bump() {
  rebuild()
  for (const l of listeners) l()
}

rebuild()

export function subscribeNeedsInfo(fn: () => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

export function listNeedsInfoTasks(): NeedsInfoTask[] {
  return snapshot
}

export function listOpenNeedsInfo(): NeedsInfoTask[] {
  return openSnapshot
}

export function addNeedsInfoTask(
  partial: Omit<NeedsInfoTask, 'id' | 'status' | 'created_at' | 'resolved_at'>,
): NeedsInfoTask {
  const row: NeedsInfoTask = {
    ...partial,
    id: crypto.randomUUID(),
    status: 'open',
    created_at: new Date().toISOString(),
    resolved_at: null,
  }
  tasks.set(row.id, row)
  bump()
  return row
}

export function resolveNeedsInfoTask(id: string): void {
  const row = tasks.get(id)
  if (!row) return
  row.status = 'resolved'
  row.resolved_at = new Date().toISOString()
  bump()
}

export function openCountByEntity(): Record<string, number> {
  const out: Record<string, number> = {}
  for (const t of snapshot) {
    if (t.status !== 'open') continue
    out[t.entity_type] = (out[t.entity_type] ?? 0) + 1
  }
  return out
}

/** Replace tasks from Supabase (empty keeps current — usually empty until hydrate). */
export function replaceNeedsInfoFromDb(rows: NeedsInfoTask[]): void {
  if (!rows.length) return
  tasks.clear()
  for (const r of rows) tasks.set(r.id, r)
  bump()
}
