/**
 * Always vs sometimes invoice recipients for a client profile (pure).
 * Always → prefill To. Sometimes → optional CC bubbles on send.
 */

export type InvoiceNotifyPrefs = {
  invoice: boolean
  /** When invoice is true: undefined/true = always (To); false = sometimes (CC). */
  invoice_always?: boolean
}

export type InvoiceContactLike = {
  email: string
  name?: string
  notify_prefs: InvoiceNotifyPrefs
}

export function isAlwaysInvoiceContact(c: InvoiceContactLike): boolean {
  return Boolean(
    c.notify_prefs.invoice && c.notify_prefs.invoice_always !== false,
  )
}

export function isOptionalInvoiceContact(c: InvoiceContactLike): boolean {
  return Boolean(
    c.notify_prefs.invoice && c.notify_prefs.invoice_always === false,
  )
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

function uniqEmails(emails: string[]): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const raw of emails) {
    const e = normalizeEmail(raw)
    if (!e.includes('@') || seen.has(e)) continue
    seen.add(e)
    out.push(e)
  }
  return out
}

/** Prefill To — invoice_email first, then always-flagged contacts. */
export function alwaysInvoiceEmails(client: {
  invoice_email?: string | null
  contacts: InvoiceContactLike[]
}): string[] {
  const fromContacts = client.contacts
    .filter(isAlwaysInvoiceContact)
    .map((c) => c.email)
  const primary = client.invoice_email?.trim() ?? ''
  if (primary.includes('@')) {
    return uniqEmails([primary, ...fromContacts])
  }
  if (fromContacts.length) return uniqEmails(fromContacts)
  return []
}

/** Optional CC candidates — invoice flagged as sometimes (not always). */
export function optionalInvoiceEmails(client: {
  contacts: InvoiceContactLike[]
}): string[] {
  return uniqEmails(
    client.contacts.filter(isOptionalInvoiceContact).map((c) => c.email),
  )
}

/**
 * Contacts that are not always-To — shown as clickable bubbles that can drop
 * into Sometimes / CC.
 */
export function invoiceSometimesBubbleContacts<T extends InvoiceContactLike>(
  contacts: T[],
  alwaysEmails: string[],
): T[] {
  const always = new Set(alwaysEmails.map(normalizeEmail))
  return contacts.filter((c) => {
    const e = normalizeEmail(c.email)
    if (!e.includes('@')) return false
    if (always.has(e)) return false
    return true
  })
}
