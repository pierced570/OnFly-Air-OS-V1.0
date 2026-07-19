/**
 * Contact bank — retain trip people after thread disband.
 * Also can promote into client_contacts when a client_id is known.
 */

import type { ContactRole } from '@/lib/clientStore'
import { defaultBankTarget, type BankTarget } from '@/domain/tripThread'

export type BankedContact = {
  id: string
  kind: 'client' | 'operator'
  client_id: string | null
  name: string
  cell: string
  email: string
  role: string
  source_trip_id: string | null
  source_trip_ref: number | null
  notes: string
  created_at: string
}

const STORAGE_KEY = 'onfly.contact_bank.v1'

let rows: BankedContact[] = []
const listeners = new Set<() => void>()

function bump() {
  for (const l of listeners) l()
}

function load(): void {
  if (typeof localStorage === 'undefined') return
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return
    const parsed = JSON.parse(raw) as BankedContact[]
    if (Array.isArray(parsed)) rows = parsed
  } catch {
    /* ignore */
  }
}

function persist(): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rows))
  } catch {
    /* ignore */
  }
}

load()

export function subscribeContactBank(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function listBankedContacts(): BankedContact[] {
  return [...rows].sort((a, b) => b.created_at.localeCompare(a.created_at))
}

export function bankContact(input: {
  kind: 'client' | 'operator'
  client_id?: string | null
  name: string
  cell: string
  email: string
  role: string
  source_trip_id?: string | null
  source_trip_ref?: number | null
  notes?: string
}): BankedContact {
  // Dedupe by cell+email within kind
  const cellKey = input.cell.replace(/\D/g, '')
  const existing = rows.find(
    (r) =>
      r.kind === input.kind &&
      ((cellKey && r.cell.replace(/\D/g, '') === cellKey) ||
        (input.email &&
          r.email.toLowerCase() === input.email.trim().toLowerCase())),
  )
  if (existing) {
    existing.name = input.name || existing.name
    existing.cell = input.cell || existing.cell
    existing.email = input.email || existing.email
    existing.role = input.role || existing.role
    existing.source_trip_id = input.source_trip_id ?? existing.source_trip_id
    existing.source_trip_ref = input.source_trip_ref ?? existing.source_trip_ref
    persist()
    bump()
    return existing
  }

  const row: BankedContact = {
    id: crypto.randomUUID(),
    kind: input.kind,
    client_id: input.client_id ?? null,
    name: input.name,
    cell: input.cell,
    email: input.email,
    role: input.role,
    source_trip_id: input.source_trip_id ?? null,
    source_trip_ref: input.source_trip_ref ?? null,
    notes: input.notes ?? '',
    created_at: new Date().toISOString(),
  }
  rows.push(row)
  persist()
  bump()
  void flushBankRow(row)
  return row
}

export function bankParticipants(opts: {
  participants: Array<{
    name: string
    cell: string
    email: string
    role: string
    bank?: BankTarget
  }>
  client_id?: string | null
  trip_id: string
  trip_ref: number
}): BankedContact[] {
  const out: BankedContact[] = []
  for (const p of opts.participants) {
    if (!p.name.trim() && !p.cell.trim() && !p.email.trim()) continue
    const target = p.bank ?? defaultBankTarget(p.role)
    if (target === 'skip') continue
    out.push(
      bankContact({
        kind: target,
        client_id: target === 'client' ? opts.client_id ?? null : null,
        name: p.name,
        cell: p.cell,
        email: p.email,
        role: p.role,
        source_trip_id: opts.trip_id,
        source_trip_ref: opts.trip_ref,
      }),
    )
  }
  return out
}

/** Promote banked client-side people into client_contacts when possible. */
export async function promoteBankedToClientContacts(
  clientId: string,
  banked: BankedContact[],
): Promise<number> {
  const { addClientContact, getClient } = await import('@/lib/clientStore')
  if (!getClient(clientId)) return 0
  let n = 0
  for (const b of banked) {
    if (b.kind !== 'client') continue
    if (!b.email && !b.cell) continue
    const role: ContactRole =
      b.role === 'client_ap' || b.role === 'ap'
        ? 'ap'
        : b.role === 'client_supply' || b.role === 'supply_chain'
          ? 'supply_chain'
          : 'requester'
    try {
      addClientContact(
        clientId,
        b.name || 'Trip contact',
        b.email,
        role,
        b.cell,
      )
      n++
    } catch {
      /* duplicate / missing */
    }
  }
  return n
}

async function flushBankRow(row: BankedContact): Promise<void> {
  try {
    const { supabase, isSupabaseConfigured } = await import('@/lib/supabase')
    if (!isSupabaseConfigured || !supabase) return
    await supabase.from('contact_bank').upsert({
      id: row.id,
      kind: row.kind,
      client_id: row.client_id,
      name: row.name,
      cell: row.cell || null,
      email: row.email || null,
      role: row.role,
      source_trip_id: row.source_trip_id,
      source_trip_ref: row.source_trip_ref,
      notes: row.notes,
    })
  } catch (e) {
    console.warn('[contact_bank] persist failed', e)
  }
}
