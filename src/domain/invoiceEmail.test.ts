import { describe, expect, it } from 'vitest'
import {
  INVOICE_EMAIL_SUBJECT,
  formatInvoiceUsd,
  invoiceEmailSubject,
  invoicePoDisplay,
  isInvoicePoPlaceholder,
  renderInvoiceEmailHtml,
  renderInvoiceEmailText,
} from './invoiceEmail'

describe('invoiceEmail', () => {
  it('puts real PO / lane / tail in subject like ETA sheet', () => {
    expect(
      invoiceEmailSubject({
        poNumber: 'T-76',
        laneShort: 'CAK → HPN',
        tail: 'N6209X',
      }),
    ).toBe('OnFly invoice · PO #T-76 · CAK → HPN · N6209X')
    expect(INVOICE_EMAIL_SUBJECT('PO #PSA99')).toContain('PO #PSA99')
    expect(
      invoiceEmailSubject({ poNumber: '(INSERT INVOICE)' }),
    ).toBe('OnFly invoice')
    expect(isInvoicePoPlaceholder('INSERT INVOICE')).toBe(true)
    expect(isInvoicePoPlaceholder('00346')).toBe(false)
    expect(invoicePoDisplay('PO #00346')).toBe('00346')
  })

  it('matches ETA-sheet chrome with balance due, timeline, and portal CTA', () => {
    const html = renderInvoiceEmailHtml({
      poNumber: 'T-76',
      laneShort: 'CAK → HPN',
      preparedLabel: 'Prepared Sat Aug 15 · 19:49 EDT',
      patternLabel: 'AIRPORT → AIRPORT',
      aircraftType: 'Cessna 310',
      aircraftBlurb: 'Twin piston · cargo configuration',
      tail: 'N6209X',
      clientName: 'PSA Airlines',
      amountUsd: 12658,
      logoUrl: 'https://ofaops.onflyair.com/brand/onfly-logo.png',
      payUrl: 'https://pay.example/view',
      contractUrl: 'https://jotform.com/sign/contract',
      portalUrl: 'https://ofaops.onflyair.com/portal/track/tok123',
      pickup: {
        kind: 'pickup',
        placeBadge: 'AIRPORT',
        title: 'CAK departure',
        addressLines: [
          'Depart via CAK',
          'Hangar-side / FBO load as coordinated',
        ],
        footer: 'Departs via CAK',
      },
      dropoff: {
        kind: 'dropoff',
        placeBadge: 'FBO',
        title: 'HPN arrival',
        addressLines: [
          'Arrive at HPN',
          'Your team meets aircraft at FBO ramp',
        ],
        footer: 'Arrives at HPN',
      },
      milestones: [
        {
          label: 'Wheels up · CAK',
          detail: 'Departs CAK',
          projected: '14:47 EDT (18:47 Z)',
          actual: null,
        },
        {
          label: 'Landing · HPN',
          detail: 'Taxi / FBO ramp at HPN',
          projected: '16:58 EDT (20:58 Z)',
          actual: null,
        },
      ],
    })
    expect(html).toContain('INVOICE')
    expect(html).toContain('PO #T-76 · CAK → HPN')
    expect(html).toContain('AIRPORT → AIRPORT')
    expect(html).toContain('BALANCE DUE')
    expect(html).toContain('$12,658.00')
    expect(html).toContain('View and pay')
    expect(html).toContain('https://pay.example/view')
    expect(html).toContain('N6209X')
    expect(html).toContain('Cessna 310')
    expect(html).toContain('PICKUP')
    expect(html).toContain('DROP-OFF')
    expect(html).toContain('PROJECTED TIMELINE')
    expect(html).toContain('— live on portal')
    expect(html).toContain('Open live tracking portal')
    expect(html).toContain('https://ofaops.onflyair.com/portal/track/tok123')
    expect(html).toContain('Track this tail live on your portal')
    expect(html).toContain('Please sign the charter contract')
    expect(html).toContain('24-hr ops')
    expect(html).toContain('background:#0c0c0e')
    expect(html).toContain('#c9a227')
    expect(html).toContain('background:#f4f1ea')
  })

  it('renders text + currency helpers', () => {
    expect(formatInvoiceUsd(10600)).toBe('$10,600.00')
    const text = renderInvoiceEmailText({
      poNumber: '42',
      laneShort: 'CAK → HPN',
      preparedLabel: 'Prepared now',
      patternLabel: 'AIRPORT → AIRPORT',
      aircraftType: 'MU2',
      tail: 'N175CA',
      amountUsd: 100,
      portalUrl: 'https://ofaops.onflyair.com/portal/track/x',
      pickup: { kind: 'pickup', title: 'CAK', addressLines: ['Depart'] },
      dropoff: { kind: 'dropoff', title: 'HPN', addressLines: ['Arrive'] },
      milestones: [
        { label: 'Wheels up · CAK', projected: '12:00 EDT', actual: null },
      ],
    })
    expect(text).toContain('Open live tracking portal:')
    expect(text).toContain('Balance due: $100.00')
    expect(text).toContain('live on portal')
  })
})
