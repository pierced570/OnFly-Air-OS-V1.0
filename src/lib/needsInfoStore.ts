/**
 * Session NEEDS-INFO tasks — seeded from network import gaps + wizard skips.
 */

import network from '@/fixtures/network.json'

export type NeedsInfoTask = {
  id: string
  entity_type: 'operator' | 'aircraft' | 'client' | 'fbo' | 'trip'
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

function rebuild() {
  snapshot = [...tasks.values()].sort((a, b) => {
    if (a.status !== b.status) return a.status === 'open' ? -1 : 1
    return b.created_at.localeCompare(a.created_at)
  })
}

function bump() {
  rebuild()
  for (const l of listeners) l()
}

function seed() {
  if (tasks.size) return
  const now = new Date().toISOString()
  for (const op of network.operators.slice(0, 40)) {
    for (const gap of op.needs_info ?? []) {
      const id = crypto.randomUUID()
      tasks.set(id, {
        id,
        entity_type: 'operator',
        entity_id: op.id,
        entity_label: op.name,
        field: gap.field,
        note: gap.note,
        status: 'open',
        wizard: 'operator',
        created_at: now,
        resolved_at: null,
      })
    }
  }
  rebuild()
}

seed()

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
  return snapshot.filter((t) => t.status === 'open')
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
