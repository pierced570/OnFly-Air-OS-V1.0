import { describe, expect, it } from 'vitest'
import {
  isPortalLoginTokenFresh,
  portalMagicLinkSubject,
  renderPortalMagicLinkHtml,
  renderPortalMagicLinkText,
  defaultPortalMagicLinkEmail,
} from '@/domain/portalMagicLink'

describe('portalMagicLink email', () => {
  it('renders text + html with the login URL', () => {
    const tpl = defaultPortalMagicLinkEmail({
      loginUrl: 'https://ofaops.onflyair.com/portal/auth?token=abc',
    })
    expect(portalMagicLinkSubject()).toMatch(/sign-in link/i)
    const text = renderPortalMagicLinkText(tpl)
    expect(text).toContain(tpl.loginUrl)
    expect(text).toMatch(/live tracking/i)
    const html = renderPortalMagicLinkHtml(tpl)
    expect(html).toContain(tpl.loginUrl)
    expect(html).toContain('Open my trips')
    expect(html).toContain('#C9A227')
    // Portal-safe: no commercial language (ignore CSS `margin:` properties).
    expect(html.toLowerCase()).not.toMatch(/operator cost|\bbidding\b|\bbid\b/)
    expect(text.toLowerCase()).not.toMatch(/operator cost|\bbidding\b|\bbid\b/)
  })

  it('treats fresh tokens as valid and stale as expired', () => {
    const now = Date.parse('2026-10-28T12:00:00.000Z')
    expect(
      isPortalLoginTokenFresh('2026-10-28T11:00:00.000Z', now),
    ).toBe(true)
    expect(
      isPortalLoginTokenFresh('2026-10-26T11:00:00.000Z', now),
    ).toBe(false)
  })
})
