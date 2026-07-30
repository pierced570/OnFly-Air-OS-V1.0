import { describe, expect, it } from 'vitest'
import {
  etaSheetEmailSubject,
  patternLabelForService,
  renderEtaSheetEmailHtml,
  renderEtaSheetEmailText,
  shortLaneLabel,
} from './etaSheetEmail'

describe('etaSheetEmail', () => {
  it('formats short lane and pattern badges', () => {
    expect(shortLaneLabel('KCAK → KHPN')).toBe('CAK → HPN')
    expect(shortLaneLabel('KCAK→KDFW')).toBe('CAK → DFW')
    expect(patternLabelForService('D2D')).toBe('DOOR → DOOR')
    expect(patternLabelForService('A2A')).toBe('AIRPORT → AIRPORT')
  })

  it('renders branded payment-request style ETA sheet with portal CTA', () => {
    expect(
      etaSheetEmailSubject({
        poNumber: '12345',
        laneShort: 'CAK → HPN',
        tail: 'N123TT',
      }),
    ).toContain('PO #12345')

    const html = renderEtaSheetEmailHtml({
      logoUrl: 'https://ofaops.onflyair.com/brand/onfly-logo.png',
      poNumber: '12345',
      laneShort: 'CAK → HPN',
      preparedLabel: 'Prepared Tue Jul 29 · 15:40 EST',
      patternLabel: 'DOOR → DOOR',
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
      ],
      portalUrl: 'https://ofaops.onflyair.com/portal/track/tok123',
    })

    expect(html).toContain('ETA SHEET')
    expect(html).toContain('PO #12345 · CAK → HPN')
    expect(html).toContain('DOOR → DOOR')
    expect(html).toContain('N123TT')
    expect(html).toContain('Cessna 310')
    expect(html).toContain('PICKUP')
    expect(html).toContain('DROP-OFF')
    expect(html).toContain('PROJECTED TIMELINE')
    expect(html).toContain('— live on portal')
    expect(html).toContain('Open live tracking portal')
    expect(html).toContain('https://ofaops.onflyair.com/portal/track/tok123')
    expect(html).toContain('24-hr ops')
    expect(html).toContain('background:#0c0c0e')
    expect(html).toContain('#c9a227')

    const text = renderEtaSheetEmailText({
      poNumber: '12345',
      laneShort: 'CAK → HPN',
      preparedLabel: 'Prepared Tue Jul 29',
      patternLabel: 'DOOR → DOOR',
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
    expect(text).toContain('Open live tracking portal:')
    expect(text).toContain('live on portal')
  })
})
