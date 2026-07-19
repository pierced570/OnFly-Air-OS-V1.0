import { useMemo, useState, useSyncExternalStore } from 'react'
import { Link } from 'react-router-dom'
import {
  addClient,
  addClientContact,
  listClients,
  removeClientContact,
  subscribeClients,
  updateClient,
  updateClientContact,
  type ClientProfile,
  type ContactRole,
} from '@/lib/clientStore'

const input =
  'mt-1 w-full rounded-md border border-border bg-ink px-3 py-2 text-sm text-cream outline-none focus:border-gold'
const label = 'block text-xs font-medium uppercase tracking-wider text-muted'

const ROLE_HELP: Record<ContactRole, string> = {
  requester:
    'Inbound email/SMS from this address creates a draft request and rings the on-shift phone.',
  ap: 'Receives invoices only (QuickBooks / AP).',
  supply_chain: 'Receives tracker links, ETA sheets, and status pushes — not invoices.',
}

function clientSetupUrl(): string {
  if (typeof window !== 'undefined') {
    return `${window.location.origin}/client`
  }
  return '/client'
}

function ClientSetupLinkCard() {
  const [copied, setCopied] = useState(false)
  const url = clientSetupUrl()
  return (
    <div className="rounded-lg border border-gold/30 bg-gold/10 p-3">
      <div className="text-xs uppercase tracking-wider text-gold">
        Send to new customers
      </div>
      <p className="mt-1 text-xs text-muted">
        Client setup page (not the portal). Copy and text/email this link.
      </p>
      <p className="avionic mt-2 break-all text-xs text-cream">{url}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded-md bg-gold px-3 py-1.5 text-xs font-medium text-ink"
          onClick={() => {
            void navigator.clipboard?.writeText(url).then(() => {
              setCopied(true)
              window.setTimeout(() => setCopied(false), 2000)
            })
          }}
        >
          {copied ? 'Copied' : 'Copy link'}
        </button>
        <Link
          to="/client"
          className="rounded-md border border-border px-3 py-1.5 text-xs text-cream hover:border-gold/40"
          target="_blank"
          rel="noreferrer"
        >
          Open
        </Link>
      </div>
    </div>
  )
}

export default function ClientsPage() {
  const clients = useSyncExternalStore(subscribeClients, listClients, () => [])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [newName, setNewName] = useState('')

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return clients
    return clients.filter(
      (c) =>
        c.name.toLowerCase().includes(needle) ||
        c.contacts.some((x) => x.email.toLowerCase().includes(needle)),
    )
  }, [clients, q])

  const selected =
    clients.find((c) => c.id === selectedId) ?? filtered[0] ?? null

  return (
    <div className="flex min-h-full flex-col gap-6 p-4 sm:p-8 lg:flex-row">
      <aside className="w-full shrink-0 space-y-3 lg:w-80">
        <header>
          <div className="text-xs uppercase tracking-[0.2em] text-gold">Directory</div>
          <h1 className="mt-1 text-xl font-semibold text-cream">Clients</h1>
          <p className="mt-1 text-xs text-muted">
            Flag who rings the phone on requests vs who gets invoices.
          </p>
        </header>

        <ClientSetupLinkCard />

        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search client or email…"
          className={input}
        />

        <div className="flex gap-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="New client name"
            className={input}
          />
          <button
            type="button"
            className="rounded-md bg-gold px-3 text-sm font-medium text-ink"
            onClick={() => {
              if (!newName.trim()) return
              const c = addClient({ name: newName })
              setNewName('')
              setSelectedId(c.id)
            }}
          >
            Add
          </button>
        </div>

        <ul className="max-h-[60vh] space-y-1 overflow-auto">
          {filtered.map((c) => {
            const ring = c.contacts.filter((x) => x.notify_prefs.request_alert).length
            const inv = c.contacts.filter((x) => x.notify_prefs.invoice).length
            return (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(c.id)}
                  className={[
                    'w-full rounded-md border px-3 py-2 text-left text-sm',
                    selected?.id === c.id
                      ? 'border-gold bg-gold/10 text-cream'
                      : 'border-border bg-surface text-muted hover:text-cream',
                  ].join(' ')}
                >
                  <div className="font-medium text-cream">{c.name}</div>
                  <div className="mt-0.5 text-[11px] text-muted">
                    {c.contacts.length} contacts · {ring} ring · {inv} invoice
                  </div>
                </button>
              </li>
            )
          })}
        </ul>
      </aside>

      <main className="min-w-0 flex-1">
        {!selected ? (
          <p className="text-sm text-muted">Select or add a client.</p>
        ) : (
          <ClientDetail client={selected} />
        )}
      </main>
    </div>
  )
}

function ClientDetail({ client }: { client: ClientProfile }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [cell, setCell] = useState('')
  const [role, setRole] = useState<ContactRole>('requester')

  const ringers = client.contacts.filter((c) => c.notify_prefs.request_alert)
  const invoiceTo = client.contacts.filter((c) => c.notify_prefs.invoice)
  const profile = client.profile ?? {}
  const addr = profile.address

  function patchProfile(
    patch: Partial<NonNullable<ClientProfile['profile']>>,
  ) {
    updateClient(client.id, { profile: { ...profile, ...patch } })
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold text-cream">{client.name}</h2>
          <p className="mt-1 text-sm text-muted">
            Pay terms {client.pay_terms}
            {client.last_po ? ` · last PO ${client.last_po}` : ''}
            {profile.source === 'portal_onboard' ? ' · from /client setup' : ''}
          </p>
        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-3">
        <label className={label}>
          Default invoice email
          <input
            className={input}
            value={client.invoice_email}
            onChange={(e) =>
              updateClient(client.id, { invoice_email: e.target.value })
            }
            placeholder="ap@client.com"
          />
        </label>
        <label className={label}>
          Pay terms
          <input
            className={input}
            value={client.pay_terms}
            onChange={(e) => updateClient(client.id, { pay_terms: e.target.value })}
          />
        </label>
        <label className={label}>
          PO prefix
          <input
            className={`${input} avionic uppercase`}
            value={client.po_prefix ?? ''}
            onChange={(e) =>
              updateClient(client.id, {
                po_prefix: e.target.value.trim().toUpperCase() || null,
              })
            }
            placeholder="PSA"
          />
        </label>
      </section>

      <section className="rounded-lg border border-border bg-surface p-3 space-y-3">
        <div className="text-xs uppercase tracking-wider text-muted">
          Company profile
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={label}>
            DBA
            <input
              className={input}
              value={profile.dba ?? ''}
              onChange={(e) => patchProfile({ dba: e.target.value || undefined })}
            />
          </label>
          <label className={label}>
            Website
            <input
              className={input}
              value={profile.website ?? ''}
              onChange={(e) =>
                patchProfile({ website: e.target.value || undefined })
              }
            />
          </label>
          <label className={label}>
            Front desk phone
            <input
              className={`${input} avionic`}
              value={profile.front_desk_phone ?? ''}
              onChange={(e) =>
                patchProfile({ front_desk_phone: e.target.value || undefined })
              }
            />
          </label>
          <label className={label}>
            Vendor packet →
            <input
              className={input}
              value={profile.vendor_packet_to ?? ''}
              onChange={(e) =>
                patchProfile({ vendor_packet_to: e.target.value || undefined })
              }
              placeholder="W-9 / banking destination"
            />
          </label>
        </div>
        {addr && (
          <p className="text-xs text-muted">
            Address:{' '}
            <span className="text-cream">
              {[addr.street, addr.city, addr.state, addr.zip]
                .filter(Boolean)
                .join(', ')}
            </span>
            {profile.billing_same_as_address === false &&
              profile.billing_address && (
                <span>
                  {' '}
                  · Billing:{' '}
                  {[
                    profile.billing_address.street,
                    profile.billing_address.city,
                    profile.billing_address.state,
                    profile.billing_address.zip,
                  ]
                    .filter(Boolean)
                    .join(', ')}
                </span>
              )}
          </p>
        )}
        {profile.emergency && (
          <p className="text-xs text-muted">
            Emergency:{' '}
            <span className="text-cream">
              {profile.emergency.name} {profile.emergency.phone}
              {profile.emergency.email ? ` · ${profile.emergency.email}` : ''}
            </span>
          </p>
        )}
        <div className="flex flex-wrap gap-4 text-sm text-cream">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={Boolean(profile.requires_po)}
              onChange={(e) => patchProfile({ requires_po: e.target.checked })}
            />
            PO required
          </label>
          <label className={label}>
            Updates
            <select
              className={input}
              value={profile.update_channel ?? 'email'}
              onChange={(e) =>
                patchProfile({
                  update_channel: e.target.value as 'email' | 'sms' | 'both',
                })
              }
            >
              <option value="email">Email</option>
              <option value="sms">SMS</option>
              <option value="both">Email + SMS</option>
            </select>
          </label>
        </div>
        {profile.frequent_lanes && profile.frequent_lanes.length > 0 && (
          <p className="avionic text-xs text-gold">
            Lanes:{' '}
            {profile.frequent_lanes
              .map((l) => `${l.origin}→${l.destination}`)
              .join(' · ')}
          </p>
        )}
      </section>

      <section className="rounded-lg border border-border bg-surface p-3">
        <div className="text-xs uppercase tracking-wider text-muted">
          Routing rules
        </div>
        <div className="mt-3 flex flex-wrap gap-4 text-sm text-cream">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={client.rules.dual_pilot_required}
              onChange={(e) =>
                updateClient(client.id, {
                  rules: { dual_pilot_required: e.target.checked },
                })
              }
            />
            Dual pilot
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={client.rules.freight_only}
              onChange={(e) =>
                updateClient(client.id, {
                  rules: { freight_only: e.target.checked },
                })
              }
            />
            Freight only
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={client.rules.multi_engine_only}
              onChange={(e) =>
                updateClient(client.id, {
                  rules: { multi_engine_only: e.target.checked },
                })
              }
            />
            Multi-engine only
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={client.rules.no_single_engine_night}
              onChange={(e) =>
                updateClient(client.id, {
                  rules: { no_single_engine_night: e.target.checked },
                })
              }
            />
            No SE night
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={client.rules.hazmat_allowed}
              onChange={(e) =>
                updateClient(client.id, {
                  rules: { hazmat_allowed: e.target.checked },
                })
              }
            />
            Hazmat OK
          </label>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className={label}>
            Hazmat notes
            <input
              className={input}
              value={client.rules.hazmat_notes}
              onChange={(e) =>
                updateClient(client.id, {
                  rules: { hazmat_notes: e.target.value },
                })
              }
            />
          </label>
          <label className={label}>
            Declared value norms
            <input
              className={input}
              value={client.rules.declared_value_norm}
              onChange={(e) =>
                updateClient(client.id, {
                  rules: { declared_value_norm: e.target.value },
                })
              }
            />
          </label>
        </div>
        <label className={`${label} mt-3`}>
          Notes
          <textarea
            className={input}
            rows={2}
            value={client.notes}
            onChange={(e) => updateClient(client.id, { notes: e.target.value })}
          />
        </label>
        <p className="mt-2 text-xs text-muted">
          Full public setup:{' '}
          <Link to="/client" className="text-gold">
            /client
          </Link>
          {' · '}
          Admin interview:{' '}
          <Link to="/admin" className="text-gold">
            Admin → Add client
          </Link>
        </p>
      </section>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-gold/40 bg-gold/10 p-3 text-sm">
          <div className="text-xs uppercase tracking-wider text-gold">
            Rings the phone (request alerts)
          </div>
          {ringers.length === 0 ? (
            <p className="mt-2 text-muted">None flagged yet.</p>
          ) : (
            <ul className="mt-2 space-y-1">
              {ringers.map((c) => (
                <li key={c.id} className="avionic text-cream">
                  {c.email}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="rounded-lg border border-onplan/40 bg-onplan/10 p-3 text-sm">
          <div className="text-xs uppercase tracking-wider text-onplan">
            Invoice recipients
          </div>
          {invoiceTo.length === 0 && !client.invoice_email ? (
            <p className="mt-2 text-muted">None flagged yet.</p>
          ) : (
            <ul className="mt-2 space-y-1">
              {invoiceTo.map((c) => (
                <li key={c.id} className="avionic text-cream">
                  {c.email}
                </li>
              ))}
              {client.invoice_email &&
                !invoiceTo.some(
                  (c) =>
                    c.email.toLowerCase() === client.invoice_email.toLowerCase(),
                ) && (
                  <li className="avionic text-cream">
                    {client.invoice_email}{' '}
                    <span className="text-muted">(default)</span>
                  </li>
                )}
            </ul>
          )}
        </div>
      </div>

      <section className="space-y-3">
        <h3 className="text-xs uppercase tracking-wider text-muted">People</h3>
        {client.contacts.length === 0 && (
          <p className="text-sm text-muted">
            Add contacts below. Role sets the default flags — tweak per person.
          </p>
        )}
        <ul className="space-y-3">
          {client.contacts.map((c) => (
            <li
              key={c.id}
              className="rounded-lg border border-border bg-surface p-3"
            >
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <label className={label}>
                  Name
                  <input
                    className={input}
                    value={c.name}
                    onChange={(e) =>
                      updateClientContact(client.id, c.id, { name: e.target.value })
                    }
                  />
                </label>
                <label className={label}>
                  Email
                  <input
                    className={input}
                    value={c.email}
                    onChange={(e) =>
                      updateClientContact(client.id, c.id, { email: e.target.value })
                    }
                  />
                </label>
                <label className={label}>
                  Cell
                  <input
                    className={input}
                    value={c.cell}
                    onChange={(e) =>
                      updateClientContact(client.id, c.id, { cell: e.target.value })
                    }
                    placeholder="+1…"
                  />
                </label>
                <label className={label}>
                  Role
                  <select
                    className={input}
                    value={c.role}
                    onChange={(e) =>
                      updateClientContact(client.id, c.id, {
                        role: e.target.value as ContactRole,
                      })
                    }
                  >
                    <option value="requester">Requester</option>
                    <option value="ap">AP (invoices)</option>
                    <option value="supply_chain">Supply chain (tracker)</option>
                  </select>
                </label>
              </div>
              <p className="mt-2 text-[11px] text-muted">{ROLE_HELP[c.role]}</p>
              <div className="mt-3 flex flex-wrap gap-4 text-sm text-cream">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={c.notify_prefs.request_alert}
                    onChange={(e) =>
                      updateClientContact(client.id, c.id, {
                        notify_prefs: { request_alert: e.target.checked },
                      })
                    }
                  />
                  Ring phone on request
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={c.notify_prefs.invoice}
                    onChange={(e) =>
                      updateClientContact(client.id, c.id, {
                        notify_prefs: { invoice: e.target.checked },
                      })
                    }
                  />
                  Invoice emails
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={c.notify_prefs.tracker}
                    onChange={(e) =>
                      updateClientContact(client.id, c.id, {
                        notify_prefs: { tracker: e.target.checked },
                      })
                    }
                  />
                  Tracker / ETA
                </label>
                <button
                  type="button"
                  className="ml-auto text-xs text-late"
                  onClick={() => removeClientContact(client.id, c.id)}
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>

        <div className="rounded-lg border border-dashed border-border p-3">
          <div className="text-xs uppercase tracking-wider text-muted">Add contact</div>
          <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            <input
              className={input}
              placeholder="Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <input
              className={input}
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <input
              className={input}
              placeholder="Cell"
              value={cell}
              onChange={(e) => setCell(e.target.value)}
            />
            <select
              className={input}
              value={role}
              onChange={(e) => setRole(e.target.value as ContactRole)}
            >
              <option value="requester">Requester</option>
              <option value="ap">AP</option>
              <option value="supply_chain">Supply chain</option>
            </select>
            <button
              type="button"
              className="rounded-md bg-gold px-3 py-2 text-sm font-medium text-ink"
              onClick={() => {
                if (!email.trim()) return
                addClientContact(client.id, name || email, email, role, cell)
                setName('')
                setEmail('')
                setCell('')
                setRole('requester')
              }}
            >
              Add person
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}
