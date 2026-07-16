export type InvoiceLine = { description: string; amount: number; taxCode?: string }

export interface AccountingAdapter {
  ensureCustomer(clientName: string): Promise<string>
  createInvoice(
    tripRef: number,
    lines: InvoiceLine[],
  ): Promise<{ qbInvoiceId: string; url: string }>
  invoiceStatus(qbInvoiceId: string): Promise<'sent' | 'viewed' | 'paid'>
}

export class MockAccountingAdapter implements AccountingAdapter {
  async ensureCustomer(clientName: string) {
    return `mock-cust-${clientName.slice(0, 8)}`
  }
  async createInvoice(tripRef: number, lines: InvoiceLine[]) {
    const id = `mock-inv-${tripRef}`
    console.info('[MockQB] invoice', id, lines)
    return { qbInvoiceId: id, url: `/mock-qb/${id}` }
  }
  async invoiceStatus() {
    return 'sent' as const
  }
}

export function createAccountingAdapter(): AccountingAdapter {
  return new MockAccountingAdapter()
}
