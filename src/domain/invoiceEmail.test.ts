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
  it('puts real PO in subject and never sends placeholders', () => {
    expect(invoiceEmailSubject('00346')).toBe(
      'New payment request from OnFly Air LLC - PO #00346',
    )
    expect(INVOICE_EMAIL_SUBJECT('PO #PSA99')).toBe(
      'New payment request from OnFly Air LLC - PO #PSA99',
    )
    expect(invoiceEmailSubject('(INSERT INVOICE)')).toBe(
      'New payment request from OnFly Air LLC',
    )
    expect(isInvoicePoPlaceholder('INSERT INVOICE')).toBe(true)
    expect(isInvoicePoPlaceholder('00346')).toBe(false)
    expect(invoicePoDisplay('PO #00346')).toBe('00346')
  })

  it('matches payment-request subject + OFA branded layout', () => {
    const html = renderInvoiceEmailHtml({
      poNumber: '00346',
      clientName: 'PSA Airlines',
      lane: 'KNQA → KDFW',
      amountUsd: 10600,
      tail: 'N175CA',
      aircraftType: 'MU2',
      flightDate: '2026-07-28',
      logoUrl: 'https://ofaops.onflyair.com/brand/onfly-logo.png',
      payUrl: 'https://pay.example/view',
      contractUrl: 'https://jotform.com/sign/contract',
      itineraryLines: [
        'KNQA → KDFW',
        'Pickup in NQA ETA 2hr 15 min',
        'NQA-DFW 1hr 45 min',
        'Drop Off at DFW',
      ],
    })
    expect(html).toContain('New payment request from OnFly Air LLC')
    expect(html).toContain('PSA Airlines · KNQA → KDFW')
    expect(html).toContain('PO #00346')
    expect(html).toContain('$10,600.00')
    expect(html).toContain('Online payment options:')
    expect(html).toContain('>ACH<')
    expect(html).toContain('https://pay.example/view')
    expect(html).toContain('N175CA')
    expect(html).toContain('Trip Itinerary')
    expect(html).toContain('Pickup in NQA ETA 2hr 15 min')
    expect(html).toContain('Please sign charter contract linked below:')
    expect(html).toContain('https://jotform.com/sign/contract')
    expect(html).toContain('OnFly Air LLC — Charter Brokerage')
    expect(html).toContain('background:#0c0c0e')
    expect(html).toContain('https://ofaops.onflyair.com/brand/onfly-logo.png')
    expect(html).toContain('Open the attached PDF invoice to access your payment options.')
  })

  it('falls back to gold ONFLY AIR wordmark without logo URL', () => {
    const html = renderInvoiceEmailHtml({ poNumber: '42', amountUsd: 100 })
    expect(html).toContain('ONFLY AIR')
    expect(html).toContain('color:#c9a227')
    expect(formatInvoiceUsd(10600)).toBe('$10,600.00')
    expect(
      renderInvoiceEmailText({
        poNumber: '42',
        clientName: 'Acme',
        lane: 'KCAK→KHPN',
      }),
    ).toContain('Acme · KCAK→KHPN')
  })
})
