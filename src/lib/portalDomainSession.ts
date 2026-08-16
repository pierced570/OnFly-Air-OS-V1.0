/**
 * Domain-based portal sign-in (no magic link).
 * Work email → resolve client via allowlist / contacts → local session.
 */

import {
  resolveClientIdByPortalEmail,
  type PortalDomainClient,
} from '@/domain/portalDomains'
import type { PortalSession } from '@/domain/portalAuth'
import { setPortalClientId, clearPortalClient } from '@/lib/clientOnboardStore'
import { listClients } from '@/lib/clientStore'
import { isSupabaseConfigured, supabase } from '@/lib/supabase'

const DOMAIN_SESSION_KEY = 'onfly.portal.domain_session'

export type PortalDomainSessionStored = {
  email: string
  clientId: string
}

function readStored(): PortalDomainSessionStored | null {
  if (typeof localStorage === 'undefined') return null
  try {
    const raw = localStorage.getItem(DOMAIN_SESSION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as PortalDomainSessionStored
    if (
      typeof parsed?.email !== 'string' ||
      !parsed.email.includes('@') ||
      typeof parsed?.clientId !== 'string' ||
      !parsed.clientId
    ) {
      return null
    }
    return {
      email: parsed.email.trim().toLowerCase(),
      clientId: parsed.clientId,
    }
  } catch {
    return null
  }
}

function writeStored(session: PortalDomainSessionStored): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(DOMAIN_SESSION_KEY, JSON.stringify(session))
  } catch {
    /* ignore */
  }
}

export function clearPortalDomainSession(): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.removeItem(DOMAIN_SESSION_KEY)
  } catch {
    /* ignore */
  }
}

export function readPortalDomainSession(): PortalSession | null {
  const stored = readStored()
  if (!stored) return null
  return {
    userId: `domain:${stored.email}`,
    email: stored.email,
    clientId: stored.clientId,
  }
}

async function clientsForPortalResolve(): Promise<PortalDomainClient[]> {
  const local: PortalDomainClient[] = listClients().map((c) => ({
    id: c.id,
    name: c.name,
    email: c.email,
    invoice_email: c.invoice_email,
    contacts: c.contacts.map((x) => ({ email: x.email })),
    profile: {
      allowed_email_domains: c.profile.allowed_email_domains ?? null,
      website: c.profile.website ?? null,
      bases: c.profile.bases?.map((b) => ({
        emails: b.emails,
        supervisor_emails: b.supervisor_emails,
        stores_emails: b.stores_emails,
      })),
    },
  }))

  if (!isSupabaseConfigured || !supabase) return local

  try {
    const { data: rows, error } = await supabase
      .from('clients')
      .select('id, name, email, invoice_email, profile')
      .limit(500)
    if (error || !rows?.length) return local

    const { data: contacts } = await supabase
      .from('client_contacts')
      .select('client_id, email')
      .limit(5000)

    const byClient = new Map<string, Array<{ email?: string | null }>>()
    for (const row of contacts ?? []) {
      const cid = String((row as { client_id?: string }).client_id ?? '')
      if (!cid) continue
      const list = byClient.get(cid) ?? []
      list.push({ email: (row as { email?: string | null }).email })
      byClient.set(cid, list)
    }

    const remote: PortalDomainClient[] = rows.map((r) => {
      const profile =
        r.profile && typeof r.profile === 'object'
          ? (r.profile as PortalDomainClient['profile'])
          : undefined
      return {
        id: String(r.id),
        name: String(r.name ?? ''),
        email: (r.email as string | null) ?? null,
        invoice_email: (r.invoice_email as string | null) ?? null,
        contacts: byClient.get(String(r.id)) ?? [],
        profile,
      }
    })

    // Prefer local ids when both present (same legacy keys); remote fills gaps.
    const seen = new Set(local.map((c) => c.id).filter(Boolean) as string[])
    const merged = [...local]
    for (const c of remote) {
      if (!c.id || seen.has(c.id)) continue
      seen.add(c.id)
      merged.push(c)
    }
    return merged
  } catch {
    return local
  }
}

/**
 * Sign in with a work email — no magic link.
 * Routes to the matching client when the address (or its domain) is verified.
 */
export async function signInPortalByWorkEmail(
  email: string,
): Promise<PortalSession> {
  const addr = email.trim().toLowerCase()
  if (!addr.includes('@')) {
    throw new Error('Enter a work email')
  }

  const clients = await clientsForPortalResolve()
  const clientId = resolveClientIdByPortalEmail(addr, clients)
  if (!clientId) {
    throw new Error(
      'This email is not verified for portal access. Contact OnFly if you need access.',
    )
  }

  const stored: PortalDomainSessionStored = { email: addr, clientId }
  writeStored(stored)
  setPortalClientId(clientId)

  return {
    userId: `domain:${addr}`,
    email: addr,
    clientId,
  }
}

/** Drop domain session + portal client id (called from endPortalSession). */
export function endPortalDomainSession(): void {
  clearPortalDomainSession()
  clearPortalClient()
}
