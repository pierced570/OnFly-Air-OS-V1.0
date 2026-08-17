/**
 * Desk bubble to pick who is looped into a client quote / ETA thread.
 * Saved contacts toggle To / CC / BCC; fields are free-typeable.
 */

import { useMemo, useState, useSyncExternalStore } from 'react'
import { ONFLY_INFO_BCC } from '@/domain/onflyEmails'
import {
  getClient,
  listClients,
  listRequestAlertEmails,
  subscribeClients,
  type ClientContact,
} from '@/lib/clientStore'

export { ONFLY_INFO_BCC }

export type EmailBucket = 'to' | 'cc' | 'bcc' | 'off'

export type ClientEmailSelection = {
  to: string[]
  cc: string[]
  bcc: string[]
}

type Props = {
  clientId?: string | null
  value: ClientEmailSelection
  onChange: (next: ClientEmailSelection) => void
  /** Optional title override (ignored for compact layout). */
  title?: string
  /** Skip outer gold card when nested in another panel. */
  embedded?: boolean
  /**
   * `default` — titled card with stacked fields (invoice / ETA).
   * `compact` — submitted-quotes hard-quote row: inline help + side-by-side fields.
   */
  layout?: 'default' | 'compact'
}

function normalize(email: string): string {
  return email.trim().toLowerCase()
}

function uniq(emails: string[]): string[] {
  return [...new Set(emails.map(normalize).filter((e) => e.includes('@')))]
}

/** Parse a typed To/CC/BCC field into valid emails (comma / semicolon / space). */
export function parseEmailList(raw: string): string[] {
  return uniq(raw.split(/[,;\s]+/))
}

export function emptyClientEmailSelection(): ClientEmailSelection {
  return { to: [], cc: [], bcc: [] }
}

/** Prefill To from request-alert contacts (else primary). Always BCC info@. */
export function defaultClientEmailSelection(
  clientId?: string | null,
): ClientEmailSelection {
  if (!clientId) {
    return { to: [], cc: [], bcc: [ONFLY_INFO_BCC] }
  }
  const client = getClient(clientId)
  const alert = uniq(listRequestAlertEmails(clientId))
  const primary = normalize(client?.email ?? '')
  const to = alert.length
    ? alert
    : primary.includes('@')
      ? [primary]
      : []
  return { to, cc: [], bcc: [ONFLY_INFO_BCC] }
}

/**
 * Invoice send defaults — do NOT pre-select client contacts.
 * Desk picks To/CC from pills; always BCC info@.
 */
export function defaultInvoiceEmailSelection(
  _clientId?: string | null,
): ClientEmailSelection {
  return { to: [], cc: [], bcc: [ONFLY_INFO_BCC] }
}

/**
 * ETA / tracking sheet defaults — do NOT pre-select trackers or base emails.
 * Desk taps contacts / bases to add recipients.
 */
export function defaultTrackerEmailSelection(
  _clientId?: string | null,
  _opts?: { legIcaos?: string[] },
): ClientEmailSelection {
  return emptyClientEmailSelection()
}

function bucketOf(email: string, sel: ClientEmailSelection): EmailBucket {
  const e = normalize(email)
  if (sel.to.includes(e)) return 'to'
  if (sel.cc.includes(e)) return 'cc'
  if (sel.bcc.includes(e)) return 'bcc'
  return 'off'
}

function setBucket(
  sel: ClientEmailSelection,
  email: string,
  bucket: EmailBucket,
): ClientEmailSelection {
  const e = normalize(email)
  const strip = (list: string[]) => list.filter((x) => x !== e)
  const next: ClientEmailSelection = {
    to: strip(sel.to),
    cc: strip(sel.cc),
    bcc: strip(sel.bcc),
  }
  if (bucket === 'to') next.to = uniq([...next.to, e])
  if (bucket === 'cc') next.cc = uniq([...next.cc, e])
  if (bucket === 'bcc') next.bcc = uniq([...next.bcc, e])
  return next
}

function cycleBucket(cur: EmailBucket): EmailBucket {
  if (cur === 'off') return 'to'
  if (cur === 'to') return 'cc'
  if (cur === 'cc') return 'bcc'
  return 'off'
}

function contactLabel(c: ClientContact): string {
  const name = c.name?.trim()
  return name ? `${name} · ${c.email}` : c.email
}

function useClientEmailContacts(
  clientId: string | null | undefined,
  value: ClientEmailSelection,
) {
  useSyncExternalStore(subscribeClients, listClients, listClients)
  const client = clientId ? getClient(clientId) : undefined

  return useMemo(() => {
    const fromProfile = client?.contacts ?? []
    const extras: Array<{ id: string; name: string; email: string }> = []
    const seen = new Set(fromProfile.map((c) => normalize(c.email)))
    for (const email of [
      client?.email,
      client?.invoice_email,
      ...value.to,
      ...value.cc,
      ...value.bcc,
    ]) {
      const e = normalize(email ?? '')
      if (!e.includes('@') || seen.has(e)) continue
      seen.add(e)
      extras.push({ id: `extra-${e}`, name: e.split('@')[0] || e, email: e })
    }
    return [
      ...fromProfile.map((c) => ({
        id: c.id,
        name: c.name,
        email: c.email,
        role: c.role,
      })),
      ...extras,
    ]
  }, [client, value])
}

type FieldKey = 'to' | 'cc' | 'bcc'

function applyFieldEmails(
  value: ClientEmailSelection,
  key: FieldKey,
  emails: string[],
): ClientEmailSelection {
  // Keep this field's list; drop those addresses from the other buckets.
  return {
    to:
      key === 'to'
        ? emails
        : value.to.filter((x) => !emails.includes(x)),
    cc:
      key === 'cc'
        ? emails
        : value.cc.filter((x) => !emails.includes(x)),
    bcc:
      key === 'bcc'
        ? emails
        : value.bcc.filter((x) => !emails.includes(x)),
  }
}

function EmailFields({
  value,
  onChange,
  columns,
}: {
  value: ClientEmailSelection
  onChange: (next: ClientEmailSelection) => void
  columns?: boolean
}) {
  // Local draft while typing — parent only stores valid @ emails, so committing
  // on every keystroke used to wipe incomplete input (couldn't type "name@…").
  const [editing, setEditing] = useState<{
    key: FieldKey
    text: string
  } | null>(null)

  function displayValue(key: FieldKey): string {
    if (editing?.key === key) return editing.text
    return value[key].join(', ')
  }

  function commit(key: FieldKey, text: string) {
    onChange(applyFieldEmails(value, key, parseEmailList(text)))
    setEditing(null)
  }

  return (
    <div
      className={
        columns
          ? 'grid gap-2 sm:grid-cols-3'
          : 'grid gap-2'
      }
    >
      {(
        [
          ['to', 'To'],
          ['cc', 'CC'],
          ['bcc', 'BCC'],
        ] as const
      ).map(([key, label]) => (
        <label key={key} className="block text-[11px] text-muted">
          {label}
          <input
            className="mt-1 w-full rounded-md border border-border bg-ink px-2 py-1.5 font-mono text-xs text-cream outline-none placeholder:text-muted focus:border-gold"
            name={`onfly-client-email-${key}`}
            autoComplete="off"
            data-1p-ignore
            data-lpignore="true"
            value={displayValue(key)}
            placeholder="name@client.com"
            onFocus={() =>
              setEditing({ key, text: value[key].join(', ') })
            }
            onChange={(e) => setEditing({ key, text: e.target.value })}
            onBlur={() => {
              if (editing?.key === key) commit(key, editing.text)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                ;(e.target as HTMLInputElement).blur()
              }
            }}
          />
        </label>
      ))}
    </div>
  )
}

function ContactPills({
  contacts,
  value,
  onChange,
}: {
  contacts: Array<{ id: string; name: string; email: string }>
  value: ClientEmailSelection
  onChange: (next: ClientEmailSelection) => void
}) {
  if (!contacts.length) return null
  return (
    <div className="flex flex-wrap gap-1.5">
      {contacts.map((c) => {
        const email = normalize(c.email)
        const bucket = bucketOf(email, value)
        const on = bucket !== 'off'
        return (
          <button
            key={c.id}
            type="button"
            title="Click to cycle To / CC / BCC"
            onClick={() =>
              onChange(setBucket(value, email, cycleBucket(bucket)))
            }
            className={[
              'rounded-full border px-2.5 py-1 text-left text-[11px] transition-colors',
              on
                ? 'border-gold bg-gold/25 text-cream'
                : 'border-border bg-ink/40 text-muted hover:text-cream',
            ].join(' ')}
          >
            <span className="font-medium">
              {bucket === 'off' ? '·' : bucket.toUpperCase()}
            </span>{' '}
            {contactLabel(c as ClientContact)}
          </button>
        )
      })}
    </div>
  )
}

export function ClientEmailRecipientsBubble({
  clientId,
  value,
  onChange,
  title = 'Client emails — quote & ETA loop',
  embedded = false,
  layout = 'default',
}: Props) {
  const contacts = useClientEmailContacts(clientId, value)

  if (layout === 'compact') {
    const help = contacts.length
      ? 'Type emails below, or tap contacts to cycle To → CC → BCC → off'
      : 'Type emails in To / CC / BCC below · none saved on this client yet'
    return (
      <div className="space-y-2">
        <p className="text-[11px] text-muted">{help}</p>
        <ContactPills contacts={contacts} value={value} onChange={onChange} />
        <EmailFields value={value} onChange={onChange} columns />
      </div>
    )
  }

  return (
    <div
      className={
        embedded
          ? 'space-y-2'
          : 'rounded-xl border border-gold/35 bg-gold/5 p-3'
      }
    >
      <div className="text-[11px] font-medium uppercase tracking-wider text-gold">
        {title}
      </div>
      <p className="mt-1 text-[11px] text-muted">
        Type addresses below, or tap contacts to cycle{' '}
        <span className="text-cream">To → CC → BCC → off</span>
      </p>

      {contacts.length ? (
        <div className="mt-2">
          <ContactPills contacts={contacts} value={value} onChange={onChange} />
        </div>
      ) : (
        <p className="mt-2 text-xs text-muted">
          No saved contacts on this client yet — type emails below.
        </p>
      )}

      <div className="mt-3">
        <EmailFields value={value} onChange={onChange} />
      </div>
    </div>
  )
}
