import { describe, expect, it } from 'vitest'
import {
  defaultClientOnboardTemplate,
  renderClientOnboardEmailHtml,
  renderClientOnboardEmailText,
  sendClientOnboardInvite,
} from '@/lib/clientOnboardEmail'

describe('clientOnboardEmail', () => {
  it('renders /client link in html and text', () => {
    const tpl = defaultClientOnboardTemplate({
      onboardUrl: 'https://example.com/client',
    })
    const html = renderClientOnboardEmailHtml(tpl, 'PSA Airlines')
    const text = renderClientOnboardEmailText(tpl, 'PSA Airlines')
    expect(html).toContain('https://example.com/client')
    expect(html).toContain('PSA Airlines')
    expect(text).toContain('https://example.com/client')
  })

  it('mock-sends email invite', async () => {
    const result = await sendClientOnboardInvite({
      to: 'ops@client.com',
      companyName: 'Tester',
      channel: 'email',
    })
    expect(result.to).toBe('ops@client.com')
    expect(result.id).toBeTruthy()
  })
})
