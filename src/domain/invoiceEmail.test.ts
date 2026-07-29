import { describe, expect, it } from 'vitest'
import {
  INVOICE_EMAIL_SUBJECT,
  renderInvoiceEmailHtml,
  renderInvoiceEmailText,
} from './invoiceEmail'

describe('invoiceEmail', () => {
  it('matches desk subject + branded header with logo', () => {
    expect(INVOICE_EMAIL_SUBJECT('00001')).toBe('Invoice #00001 - OnFly Air')
    const html = renderInvoiceEmailHtml({
      poNumber: '00001',
      clientName: 'TESTER',
      logoUrl: 'https://app.onflyair.com/brand/onfly-logo.png',
    })
    expect(html).toContain('Invoice #00001')
    expect(html).toContain('Hi TESTER,')
    expect(html).toContain('please find your OnFly Air invoice attached as a PDF.')
    expect(html).toContain('https://app.onflyair.com/brand/onfly-logo.png')
    expect(html).toContain('background:#0c0c0e')
    expect(html).toContain('info@onflyair.com')
  })

  it('falls back to gold ONFLY AIR wordmark without logo URL', () => {
    const html = renderInvoiceEmailHtml({ poNumber: '42' })
    expect(html).toContain('ONFLY AIR')
    expect(html).toContain('color:#c9a227')
    expect(renderInvoiceEmailText({ poNumber: '42', clientName: 'Acme' })).toContain(
      'Hi Acme,',
    )
  })
})
