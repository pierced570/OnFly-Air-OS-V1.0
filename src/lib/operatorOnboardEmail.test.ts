import { describe, expect, it } from 'vitest'
import {
  defaultOnboardTemplate,
  renderOperatorOnboardEmailHtml,
  sendOperatorOnboardInvite,
} from './operatorOnboardEmail'
import { getMockSentEmails } from '@/adapters/email'

describe('operator onboard email', () => {
  it('includes onboard CTA and SkyIQ link, not insured amount', () => {
    const tpl = defaultOnboardTemplate({
      onboardUrl: 'https://example.com/onboard',
      skyiqUrl: 'https://info.skyiq.net/',
    })
    const html = renderOperatorOnboardEmailHtml(tpl)
    expect(html).toContain('Join our operator network')
    expect(html).toContain('https://example.com/onboard')
    expect(html).toContain('Complete Onboarding Form')
    expect(html).toContain('https://info.skyiq.net/')
    expect(html).toContain('SkyIQ')
    expect(html).toContain('Sonrise Aviation')
    expect(html.toLowerCase()).not.toContain('amount insured')
    expect(html.toLowerCase()).not.toContain('insured up to')
  })

  it('sends via email adapter', async () => {
    const before = getMockSentEmails().length
    const result = await sendOperatorOnboardInvite({
      to: 'ops@newop.example',
      companyName: 'New Air',
      template: { onboardUrl: 'https://app.test/onboard' },
    })
    expect(result.to).toBe('ops@newop.example')
    expect(getMockSentEmails().length).toBe(before + 1)
    const last = getMockSentEmails().at(-1)!
    expect(last.subject).toMatch(/New Air/)
    expect(last.html).toContain('https://app.test/onboard')
  })
})
