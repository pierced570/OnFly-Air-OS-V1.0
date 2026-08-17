import { describe, expect, it } from 'vitest'
import {
  clientTrackingUpdateSubject,
  renderClientTrackingUpdateHtml,
  renderClientTrackingUpdateText,
} from './clientTrackingUpdateEmail'

describe('clientTrackingUpdateEmail', () => {
  it('reuses prior ETA sheet subject with Re: for threading', () => {
    expect(
      clientTrackingUpdateSubject({
        poNumber: '123',
        laneShort: 'CAK → MDW',
        priorSubject: 'OnFly ETA sheet · PO #123 · CAK → MDW · N123AB',
      }),
    ).toBe('Re: OnFly ETA sheet · PO #123 · CAK → MDW · N123AB')
    expect(
      clientTrackingUpdateSubject({
        poNumber: '123',
        laneShort: 'CAK → MDW',
        priorSubject: 'Re: OnFly ETA sheet · PO #123',
      }),
    ).toBe('Re: OnFly ETA sheet · PO #123')
  })

  it('renders update body and portal CTA without money language', () => {
    const html = renderClientTrackingUpdateHtml({
      poNumber: 'PO 55',
      laneShort: 'CAK → MDW',
      tail: 'N123AB',
      headline: 'ETA update',
      etaLine: 'Landing ~18:40 local',
      body: 'Wheels-up slipped 20 min for a late cargo handoff.\n\nNew wheels-down is ~18:40.',
      portalUrl: 'https://ofaops.onflyair.com/portal/track/tok',
    })
    expect(html).toContain('ETA update')
    expect(html).toContain('Landing ~18:40 local')
    expect(html).toContain('late cargo handoff')
    expect(html).toContain('https://ofaops.onflyair.com/portal/track/tok')
    expect(html.toLowerCase()).not.toMatch(/\$|vendor cost|margin %/i)
    const text = renderClientTrackingUpdateText({
      poNumber: '55',
      laneShort: 'CAK → MDW',
      tail: 'N123AB',
      body: 'On the ground at pickup.',
      portalUrl: 'https://example.test/t',
    })
    expect(text).toMatch(/On the ground/)
  })
})
