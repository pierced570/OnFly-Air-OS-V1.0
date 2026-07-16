import { useMemo, useState, useSyncExternalStore } from 'react'
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

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold text-cream">{client.name}</h2>
          <p className="mt-1 text-sm text-muted">
            Pay terms {client.pay_terms}
            {client.last_po ? ` · last PO ${client.last_po}` : ''}
          </p>
        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-2">
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
