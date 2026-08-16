import { describe, expect, it } from 'vitest'
import {
  DEFAULT_ETA_DISCLOSURE,
  etaSheetEmailSubject,
  fullLaneLabel,
  patternLabelForService,
  renderEtaSheetEmailHtml,
  renderEtaSheetEmailText,
  shortLaneLabel,
} from './etaSheetEmail'

describe('etaSheetEmail', () => {
  it('formats short and full lane labels', () => {
    expect(shortLaneLabel('KCAK → KHPN')).toBe('CAK → HPN')
    expect(shortLaneLabel('KCAK→KDFW')).toBe('CAK → DFW')
    expect(fullLaneLabel('KCAK → KHPN · KHPN → KCAK')).toBe(
      'CAK → HPN · HPN → CAK',
    )
    expect(fullLaneLabel('KCAK → KHPN → KCAK')).toBe('CAK → HPN → CAK')
    expect(patternLabelForService('D2D')).toBe('Door to door')
    expect(patternLabelForService('A2A')).toBe('Airport to airport')
  })

  it('renders branded ETA sheet with big tail, ETAs, no stage dots', () => {
    expect(
      etaSheetEmailSubject({
        poNumber: '12345',
        laneShort: 'CAK → HPN · HPN → CAK',
        tail: 'N123TT',
      }),
    ).toContain('PO #12345')

    const html = renderEtaSheetEmailHtml({
      logoUrl: 'https://ofaops.onflyair.com/brand/onfly-logo.png',
      poNumber: '12345',
      laneShort: 'CAK → HPN · HPN → CAK',
      preparedLabel: 'Prepared Tue Jul 29 · 15:40 EST',
      patternLabel: 'Airport to airport',
      aircraftType: 'Cessna 310',
      aircraftBlurb: 'Twin piston · cargo configuration',
      tail: 'N123TT',
      pickup: {
        kind: 'pickup',
        placeBadge: 'DOCK ADDRESS',
        title: 'Precision Tool & Die — Receiving Dock B',
        addressLines: ['Akron, OH'],
        footer: 'Departs via CAK · PSA Airlines Hangar 5',
      },
      dropoff: {
        kind: 'dropoff',
        placeBadge: 'FBO',
        title: 'Signature Aviation — HPN',
        addressLines: ['Westchester County Airport'],
        footer: 'Arrives at HPN · your team meets aircraft at FBO ramp',
      },
      milestones: [
        {
          label: 'Wheels up · CAK',
          detail: 'N123TT departs',
          projected: '14:47 EST (18:47 Z)',
          actual: null,
        },
        {
          label: 'Landing · HPN',
          detail: 'Taxi to Signature Aviation ramp',
          projected: '16:58 EST (20:58 Z)',
          actual: null,
        },
        {
          label: 'Wheels up · HPN',
          projected: '18:10 EST (22:10 Z)',
          actual: null,
        },
        {
          label: 'Landing · CAK',
          projected: '20:20 EST (00:20 Z)',
          actual: null,
        },
      ],
      portalUrl: 'https://ofaops.onflyair.com/portal/track/tok123',
    })

    expect(html).toContain('charset="utf-8"')
    expect(html).toContain('PO #12345')
    expect(html).toContain('CAK → HPN · HPN → CAK')
    expect(html).toContain('N123TT')
    expect(html).toContain('font-size:30px')
    expect(html).toMatch(/Cessna 310|CESSNA 310/i)
    expect(html).toContain('PICKUP')
    expect(html).toContain('DROP-OFF')
    expect(html).toContain('Trip stages')
    expect(html).toContain('14:47 EST')
    expect(html).toContain(DEFAULT_ETA_DISCLOSURE.slice(0, 40))
    // Stacked stops (mobile-safe) — not 50% side-by-side columns
    expect(html).not.toContain('width:50%')
    expect(html).toContain('max-width:720px')
    expect(html).toContain('@media only screen and (max-width: 620px)')
    expect(html).toContain('x-apple-disable-message-reformatting')
    // No static progress-dot stepper (portal-only UX)
    expect(html).not.toMatch(/border-radius:50%;border:2px solid #c9a227/)
    expect(html).not.toContain('Actual vs forecast')
    expect(html).toContain('Open tracking portal')
    expect(html).toContain('https://ofaops.onflyair.com/portal/track/tok123')
    expect(html).toContain('24-hr ops')
    // Dark banner so cream/gold logo stays visible
    expect(html).toContain('background:#0c0c0e')
    expect(html).toContain('border-bottom:3px solid #c9a227')
    expect(html).toContain('#c9a227')
    expect(html).toContain('#f7f2e3')
    expect(html).toMatch(/&middot;|&rarr;/)
    expect(html).not.toContain('Â')
    expect(html).not.toContain('â†')

    const text = renderEtaSheetEmailText({
      poNumber: '12345',
      laneShort: 'CAK → HPN · HPN → CAK',
      preparedLabel: 'Prepared Tue Jul 29',
      patternLabel: 'Airport to airport',
      aircraftType: 'Cessna 310',
      tail: 'N123TT',
      pickup: {
        kind: 'pickup',
        title: 'Dock',
        addressLines: ['Akron'],
      },
      dropoff: {
        kind: 'dropoff',
        title: 'FBO',
        addressLines: ['HPN'],
      },
      milestones: [
        {
          label: 'Wheels up · CAK',
          projected: '14:47 EST',
          actual: null,
        },
      ],
      portalUrl: 'https://ofaops.onflyair.com/portal/track/tok123',
    })
    expect(text).toContain('Open tracking portal:')
    expect(text).toContain('Trip stages')
    expect(text).toContain('14:47 EST')
    expect(text).toContain('TAIL: N123TT')
    expect(text).toContain(DEFAULT_ETA_DISCLOSURE.slice(0, 40))
    expect(text).not.toContain('Actual vs forecast')
  })
})
