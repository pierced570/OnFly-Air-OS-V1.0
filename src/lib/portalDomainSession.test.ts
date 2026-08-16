import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearPortalDomainSession,
  endPortalDomainSession,
  readPortalDomainSession,
  signInPortalByWorkEmail,
} from '@/lib/portalDomainSession'
import { getPortalClientId } from '@/lib/clientOnboardStore'

const mem = new Map<string, string>()

vi.stubGlobal('localStorage', {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => {
    mem.set(k, v)
  },
  removeItem: (k: string) => {
    mem.delete(k)
  },
  clear: () => {
    mem.clear()
  },
})

vi.mock('@/lib/clientStore', () => ({
  listClients: () => [
    {
      id: 'c-acme',
      name: 'Acme Air',
      email: 'ops@acme.com',
      invoice_email: null,
      contacts: [{ email: 'desk@acme.com' }],
      profile: { allowed_email_domains: ['acme.com'] },
    },
  ],
}))

vi.mock('@/lib/supabase', () => ({
  isSupabaseConfigured: false,
  supabase: null,
}))

describe('portalDomainSession', () => {
  beforeEach(() => {
    mem.clear()
    clearPortalDomainSession()
    endPortalDomainSession()
  })

  afterEach(() => {
    mem.clear()
    clearPortalDomainSession()
    endPortalDomainSession()
  })

  it('signs in by allowed domain without a magic link', async () => {
    const session = await signInPortalByWorkEmail('new.hire@acme.com')
    expect(session.clientId).toBe('c-acme')
    expect(session.email).toBe('new.hire@acme.com')
    expect(session.userId).toBe('domain:new.hire@acme.com')
    expect(getPortalClientId()).toBe('c-acme')
    expect(readPortalDomainSession()?.clientId).toBe('c-acme')
  })

  it('signs in by exact contact email', async () => {
    const session = await signInPortalByWorkEmail('desk@acme.com')
    expect(session.clientId).toBe('c-acme')
  })

  it('rejects unverified domains', async () => {
    await expect(signInPortalByWorkEmail('ops@other.com')).rejects.toThrow(
      /not verified/i,
    )
    expect(readPortalDomainSession()).toBeNull()
  })

  it('rejects public mailboxes', async () => {
    await expect(signInPortalByWorkEmail('me@gmail.com')).rejects.toThrow(
      /not verified/i,
    )
  })
})
