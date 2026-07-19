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
  // BLOCKED: QuickBooks OAuth app IDs not sourced (vault has login only).
  const mode = (import.meta.env.VITE_QB_ADAPTER as string | undefined)
    ?.toLowerCase()
  if (mode === 'real') {
    console.warn(
      '[qb] VITE_QB_ADAPTER=real but QuickBooks adapter not wired — mock invoices',
    )
  }
  return new MockAccountingAdapter()
}
