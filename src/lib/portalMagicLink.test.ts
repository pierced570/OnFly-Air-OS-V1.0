import { afterEach, describe, expect, it, vi } from 'vitest'
import { getMockSentEmails } from '@/adapters/email'
import {
  __resetPortalLoginTokensForTests,
  consumePortalLoginToken,
} from '@/lib/portalLoginStore'
import { sendPortalMagicLink } from '@/lib/portalMagicLink'

vi.mock('@/lib/supabase', () => ({
  isSupabaseConfigured: false,
  supabase: null,
}))

describe('sendPortalMagicLink', () => {
  afterEach(() => {
    __resetPortalLoginTokensForTests()
  })

  it('sends via EmailAdapter and mints a consumable auth URL', async () => {
    const before = getMockSentEmails().length
    const res = await sendPortalMagicLink({
      email: 'ops@acme.com',
      next: '/portal/trips/trip-1',
    })
    expect(res.to).toBe('ops@acme.com')
    expect(res.loginUrl).toMatch(/\/portal\/auth\?token=/)
    expect(res.loginUrl).toMatch(/next=/)
    expect(res.otpAttempted).toBe(false)
    expect(getMockSentEmails().length).toBe(before + 1)
    const last = getMockSentEmails().at(-1)!
    expect(last.subject).toMatch(/sign-in link/i)
    expect(String(last.to)).toBe('ops@acme.com')
    expect(last.text).toContain(res.loginUrl)

    const token = new URL(res.loginUrl).searchParams.get('token')!
    const consumed = consumePortalLoginToken(token)
    expect(consumed?.email).toBe('ops@acme.com')
    expect(consumed?.next).toBe('/portal/trips/trip-1')
  })

  it('rejects invalid email', async () => {
    await expect(sendPortalMagicLink({ email: 'nope' })).rejects.toThrow(
      /valid email/i,
    )
  })
})
