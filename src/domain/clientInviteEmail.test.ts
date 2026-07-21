import { describe, expect, it } from 'vitest'
import {
  clientInviteEmailSubject,
  defaultClientInviteTemplate,
  renderClientInviteEmailHtml,
  renderClientInviteEmailText,
} from '@/domain/clientInviteEmail'
import { sendClientOnboardInvite } from '@/lib/clientInviteEmail'
import { getMockSentEmails } from '@/adapters/email'

describe('client invite email', () => {
  it('renders welcome + form CTA without operator/cost language', () => {
    const tpl = defaultClientInviteTemplate({
      onboardUrl: 'https://app.onflyair.com/client',
      companyName: 'Acme MRO',
      recipientName: 'Jordan',
    })
    const html = renderClientInviteEmailHtml(tpl)
    const text = renderClientInviteEmailText(tpl)
    expect(html).toContain('Welcome to OnFly Air')
    expect(html).toContain('https://app.onflyair.com/client')
    expect(html).toContain('Complete your client setup')
    expect(html).toContain('Acme MRO')
    expect(html).toContain('Hello Jordan')
    expect(html).toContain('vetted Part 135')
    expect(html.toLowerCase()).not.toContain(' bidding')
    expect(html.toLowerCase()).not.toContain('vendor cost')
    expect(html.toLowerCase()).not.toContain('operator name')
    expect(html.toLowerCase()).not.toMatch(/\bbid\b/)
    expect(text).toContain('Welcome to OnFly Air')
    expect(text).toContain('https://app.onflyair.com/client')
    expect(clientInviteEmailSubject({ companyName: 'Acme MRO' })).toMatch(/Acme MRO/)
  })

  it('sends via email adapter', async () => {
    const before = getMockSentEmails().length
    const result = await sendClientOnboardInvite({
      to: 'ops@acme.example',
      companyName: 'Acme MRO',
      template: { onboardUrl: 'https://app.test/client' },
    })
    expect(result.to).toBe('ops@acme.example')
    expect(result.onboardUrl).toBe('https://app.test/client')
    expect(getMockSentEmails().length).toBe(before + 1)
    const last = getMockSentEmails().at(-1)!
    expect(last.subject).toMatch(/Welcome to OnFly Air/)
    expect(last.subject).toMatch(/Acme MRO/)
    expect(last.html).toContain('https://app.test/client')
    expect(last.text).toContain('Welcome to OnFly Air')
  })

  it('rejects invalid email', async () => {
    await expect(
      sendClientOnboardInvite({ to: 'not-an-email' }),
    ).rejects.toThrow(/Valid email/)
  })
})
