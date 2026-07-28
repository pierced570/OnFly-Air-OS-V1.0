/**
 * Portal access grants store — desk assigns email → client company.
 * localStorage cache + Supabase portal_access_grants when available.
 * Also mirrors onto client_contacts so link_portal_user works before/alongside the grant table.
 */

import {
  isValidPortalGrantEmail,
  normalizePortalGrantEmail,
  type PortalAccessGrant,
} from '@/domain/portalAccess'
import {
  addClientContact,
  getClient,
  listClients,
  removeClientContact,
  subscribeClients,
} from '@/lib/clientStore'
import { isSupabaseConfigured, supabase } from '@/lib/supabase'

const KEY = 'onfly.portalAccessGrants.v1'

type Listener = () => void
const listeners = new Set<Listener>()

let grants: PortalAccessGrant[] = loadLocal()

function storageAvailable(): boolean {
  return typeof localStorage !== 'undefined'
}

function loadLocal(): PortalAccessGrant[] {
  if (!storageAvailable()) return []
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as PortalAccessGrant[]
    if (!Array.isArray(parsed)) return []
    return parsed.map((g) => ({
      id: String(g.id),
      email: normalizePortalGrantEmail(g.email),
      client_id: String(g.client_id),
      label: g.label?.trim() || null,
      created_at: String(g.created_at || new Date().toISOString()),
    }))
  } catch {
    return []
  }
}

function persistLocal() {
  if (!storageAvailable()) return
  localStorage.setItem(KEY, JSON.stringify(grants))
}

function emit() {
  for (const l of listeners) l()
}

export function subscribePortalAccess(listener: Listener): () => void {
  listeners.add(listener)
  const unsubClients = subscribeClients(() => emit())
  return () => {
    listeners.delete(listener)
    unsubClients()
  }
}

export function listPortalAccessGrants(): PortalAccessGrant[] {
  return [...grants].sort((a, b) => a.email.localeCompare(b.email))
}

export function listPortalAccessGrantsStable(): PortalAccessGrant[] {
  return grants
}

function mirrorContact(clientId: string, email: string, label: string | null) {
  const client = getClient(clientId)
  if (!client) return
  const existing = client.contacts.find(
    (c) => normalizePortalGrantEmail(c.email) === email,
  )
  if (existing) return
  addClientContact(
    clientId,
    label?.trim() || email.split('@')[0] || 'Portal user',
    email,
    'requester',
    '',
  )
}

function unmirrorContact(clientId: string, email: string) {
  const client = getClient(clientId)
  if (!client) return
  const hit = client.contacts.find(
    (c) => normalizePortalGrantEmail(c.email) === email,
  )
  if (!hit) return
  // Only remove if it looks like an auto-mirrored portal grant contact
  // (no cell, requester). Leave rich contacts alone.
  if (hit.cell?.trim()) return
  removeClientContact(clientId, hit.id)
}

export function addPortalAccessGrant(input: {
  email: string
  client_id: string
  label?: string | null
}): PortalAccessGrant {
  const email = normalizePortalGrantEmail(input.email)
  if (!isValidPortalGrantEmail(email)) {
    throw new Error('Enter a valid email address')
  }
  if (!listClients().some((c) => c.id === input.client_id)) {
    throw new Error('Pick a company')
  }
  const existing = grants.find((g) => g.email === email)
  if (existing && existing.client_id !== input.client_id) {
    throw new Error(
      `${email} already grants access to another company — remove it first`,
    )
  }
  if (existing) {
    return existing
  }
  const row: PortalAccessGrant = {
    id: crypto.randomUUID(),
    email,
    client_id: input.client_id,
    label: input.label?.trim() || null,
    created_at: new Date().toISOString(),
  }
  grants = [...grants, row]
  persistLocal()
  mirrorContact(row.client_id, row.email, row.label)
  emit()
  void pushGrantToDb(row)
  return row
}

export function removePortalAccessGrant(id: string): void {
  const row = grants.find((g) => g.id === id)
  if (!row) return
  grants = grants.filter((g) => g.id !== id)
  persistLocal()
  unmirrorContact(row.client_id, row.email)
  emit()
  void deleteGrantFromDb(row)
}

export function clientNameForGrant(clientId: string): string {
  return getClient(clientId)?.name?.trim() || 'Company'
}

async function pushGrantToDb(row: PortalAccessGrant): Promise<void> {
  if (!supabase || !isSupabaseConfigured) return
  const { error } = await supabase.from('portal_access_grants').upsert(
    {
      id: row.id,
      email: row.email,
      client_id: row.client_id,
      label: row.label,
      created_at: row.created_at,
    },
    { onConflict: 'id' },
  )
  if (error) console.warn('[portal access] upsert', error.message)
}

async function deleteGrantFromDb(row: PortalAccessGrant): Promise<void> {
  if (!supabase || !isSupabaseConfigured) return
  const { error } = await supabase
    .from('portal_access_grants')
    .delete()
    .or(`id.eq.${row.id},email.eq.${row.email}`)
  if (error) console.warn('[portal access] delete', error.message)
}

/** Pull grants from Supabase (desk hydrate). */
export async function hydratePortalAccessGrants(): Promise<void> {
  if (!supabase || !isSupabaseConfigured) return
  const { data, error } = await supabase
    .from('portal_access_grants')
    .select('id,email,client_id,label,created_at')
    .order('email')
  if (error) {
    // Table may not exist until migration 0029 is applied
    console.warn('[portal access] hydrate', error.message)
    return
  }
  const fromDb: PortalAccessGrant[] = (data ?? []).map((r) => ({
    id: String(r.id),
    email: normalizePortalGrantEmail(String(r.email ?? '')),
    client_id: String(r.client_id),
    label: r.label == null ? null : String(r.label),
    created_at: String(r.created_at ?? new Date().toISOString()),
  }))
  // Prefer DB; keep local-only rows that aren't on the server yet
  const dbEmails = new Set(fromDb.map((g) => g.email))
  const localOnly = grants.filter((g) => !dbEmails.has(g.email))
  grants = [...fromDb, ...localOnly]
  persistLocal()
  emit()
}

// Boot hydrate once
if (typeof window !== 'undefined') {
  void hydratePortalAccessGrants()
}
