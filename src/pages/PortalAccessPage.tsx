/**
 * Admin — Portal access: which emails may open which client company.
 */

import { useMemo, useState, useSyncExternalStore, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import {
  formatPortalGrantLine,
  isValidPortalGrantEmail,
} from '@/domain/portalAccess'
import {
  listClients,
  subscribeClients,
} from '@/lib/clientStore'
import {
  addPortalAccessGrant,
  clientNameForGrant,
  hydratePortalAccessGrants,
  listPortalAccessGrants,
  listPortalAccessGrantsStable,
  removePortalAccessGrant,
  subscribePortalAccess,
} from '@/lib/portalAccessStore'
import {
  getSession,
  sessionCan,
  subscribeStaff,
} from '@/lib/staffStore'

const field =
  'mt-1 w-full rounded-md border border-border bg-ink px-3 py-2 text-sm text-cream outline-none focus:border-gold'

export default function PortalAccessPage() {
  useSyncExternalStore(subscribeStaff, getSession, getSession)
  const grants = useSyncExternalStore(
    subscribePortalAccess,
    listPortalAccessGrantsStable,
    listPortalAccessGrantsStable,
  )
  const clients = useSyncExternalStore(subscribeClients, listClients, listClients)
  const [email, setEmail] = useState('')
  const [label, setLabel] = useState('')
  const [clientId, setClientId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [q, setQ] = useState('')

  const canManage = sessionCan('clients') || sessionCan('admin')

  const sortedClients = useMemo(
    () =>
      [...clients].sort((a, b) =>
        (a.name || '').localeCompare(b.name || '', undefined, {
          sensitivity: 'base',
        }),
      ),
    [clients],
  )

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const rows = listPortalAccessGrants()
    if (!needle) return rows
    return rows.filter((g) => {
      const company = clientNameForGrant(g.client_id).toLowerCase()
      return (
        g.email.includes(needle) ||
        company.includes(needle) ||
        (g.label ?? '').toLowerCase().includes(needle)
      )
    })
  }, [grants, q])

  if (!canManage) {
    return (
      <div className="p-6 text-sm text-late">
        Portal access is limited to staff with Clients or Admin enabled.
      </div>
    )
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setOk(null)
    try {
      if (!isValidPortalGrantEmail(email)) {
        throw new Error('Enter a valid email')
      }
      if (!clientId) throw new Error('Pick a company')
      const row = addPortalAccessGrant({
        email,
        client_id: clientId,
        label,
      })
      setOk(
        `Granted — ${formatPortalGrantLine({
          email: row.email,
          clientName: clientNameForGrant(row.client_id),
          label: row.label,
        })}`,
      )
      setEmail('')
      setLabel('')
      void hydratePortalAccessGrants()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <div className="flex flex-col gap-4 p-4 sm:gap-6 sm:p-6 lg:p-8">
      <header>
        <h1 className="text-2xl font-semibold text-cream">Portal access</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Control which emails can sign into the{' '}
          <Link className="text-gold hover:text-gold-lt" to="/portal" target="_blank">
            client portal
          </Link>
          . Prefer company-wide access? Set{' '}
          <span className="text-cream">Portal email domains</span> on the{' '}
          <Link className="text-gold hover:text-gold-lt" to="/clients">
            Clients
          </Link>{' '}
          profile. Verified emails will be routed to the correct client portal.
          Domains are inferred from emails on file and can be edited manually.
          Use this page for one-off addresses.
        </p>
      </header>

      <form
        onSubmit={submit}
        className="grid max-w-3xl gap-3 rounded-lg border border-border bg-surface p-4 sm:grid-cols-2"
      >
        <div className="sm:col-span-2 text-[11px] uppercase tracking-wider text-gold">
          Grant access
        </div>
        <label className="block text-xs text-muted">
          Email
          <input
            className={field}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="ops@client.com"
            required
            autoComplete="off"
          />
        </label>
        <label className="block text-xs text-muted">
          Name (optional)
          <input
            className={field}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Sam Rivera"
            autoComplete="off"
          />
        </label>
        <label className="block text-xs text-muted sm:col-span-2">
          Company
          <select
            className={field}
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            required
          >
            <option value="">Select company…</option>
            {sortedClients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        {sortedClients.length === 0 ? (
          <p className="sm:col-span-2 text-xs text-muted">
            No companies yet — add one under{' '}
            <Link className="text-gold hover:text-gold-lt" to="/clients">
              Clients
            </Link>{' '}
            first.
          </p>
        ) : null}
        {error ? (
          <p className="sm:col-span-2 text-sm text-late">{error}</p>
        ) : null}
        {ok ? (
          <p className="sm:col-span-2 text-sm text-onplan">{ok}</p>
        ) : null}
        <div className="sm:col-span-2">
          <button
            type="submit"
            className="rounded-md bg-gold px-3 py-2 text-sm font-semibold text-ink hover:bg-gold-lt"
          >
            Add portal access
          </button>
        </div>
      </form>

      <div className="max-w-3xl space-y-2">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div className="text-[11px] uppercase tracking-wider text-muted">
            Current grants ({filtered.length})
          </div>
          <label className="block text-xs text-muted">
            Search
            <input
              className={field + ' min-w-[12rem]'}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Email or company…"
            />
          </label>
        </div>
        {filtered.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted">
            No portal emails yet. Add one above.
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
            {filtered.map((g) => (
              <li
                key={g.id}
                className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="font-medium text-cream">{g.email}</div>
                  <div className="text-sm text-muted">
                    {clientNameForGrant(g.client_id)}
                    {g.label ? ` · ${g.label}` : ''}
                  </div>
                </div>
                <button
                  type="button"
                  className="shrink-0 rounded-md border border-border px-3 py-1.5 text-xs text-late hover:border-late"
                  onClick={() => {
                    if (
                      !window.confirm(
                        `Remove portal access for ${g.email}?`,
                      )
                    ) {
                      return
                    }
                    removePortalAccessGrant(g.id)
                    setOk(null)
                  }}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
