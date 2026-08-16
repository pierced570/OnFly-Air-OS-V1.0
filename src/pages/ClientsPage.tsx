import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { Link } from 'react-router-dom'
import {
  isLiveEmailConfigured,
  isRealEmailEnabled,
} from '@/adapters/email'
import {
  addClient,
  ensureClientsDirectorySeeded,
  listClients,
  subscribeClients,
} from '@/lib/clientStore'
import {
  defaultClientOnboardTemplate,
  renderClientOnboardEmailHtml,
  sendClientOnboardInvite,
} from '@/lib/clientOnboardEmail'
import { ClientDetailPanel } from '@/pages/clients/ClientDetailPanel'

const input =
  'mt-1 w-full rounded-md border border-border bg-ink px-3 py-2 text-sm text-cream outline-none focus:border-gold'
const label = 'block text-xs font-medium uppercase tracking-wider text-muted'

function clientSetupUrl(): string {
  return defaultClientOnboardTemplate().onboardUrl
}

function ClientInviteCard() {
  const live = isLiveEmailConfigured()
  const realFlag = isRealEmailEnabled()
  const [copied, setCopied] = useState(false)
  const [to, setTo] = useState('')
  const [company, setCompany] = useState('')
  const [cell, setCell] = useState('')
  const [channel, setChannel] = useState<'email' | 'sms' | 'both'>('email')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const url = clientSetupUrl()
  const tpl = useMemo(() => defaultClientOnboardTemplate(), [])
  const previewHtml = useMemo(
    () => renderClientOnboardEmailHtml(tpl, company || undefined),
    [tpl, company],
  )

  async function send() {
    setBusy(true)
    setStatus(null)
    try {
      const result = await sendClientOnboardInvite({
        to,
        companyName: company || undefined,
        cell: cell || undefined,
        channel,
        template: tpl,
      })
      const via =
        channel === 'sms'
          ? 'SMS'
          : channel === 'both'
            ? 'email + SMS'
            : 'email'
      setStatus(`Sent (${via}) to ${result.to}${cell && channel !== 'email' ? ` / ${cell}` : ''}.`)
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const canSend =
    channel === 'sms'
      ? Boolean(cell.trim())
      : channel === 'both'
        ? to.includes('@') && Boolean(cell.trim())
        : to.includes('@')

  return (
    <div className="space-y-3 rounded-lg border border-gold/30 bg-gold/10 p-3">
      <div>
        <div className="text-xs uppercase tracking-wider text-gold">
          Send client onboarding
        </div>
        <p className="mt-1 text-xs text-muted">
          Same form customers fill at{' '}
          <span className="avionic text-cream">/client</span>
          {' '}— company, people, pay terms, routing rules, lanes.
          {!live && realFlag
            ? ' Email delivery needs Supabase keys configured.'
            : ''}
        </p>
      </div>

      <p className="avionic break-all text-[11px] text-cream">{url}</p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded-md border border-border px-3 py-1.5 text-xs text-cream hover:border-gold/40"
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
          Open form
        </Link>
        <button
          type="button"
          className="rounded-md border border-border px-3 py-1.5 text-xs text-cream hover:border-gold/40"
          onClick={() => setPreviewOpen(true)}
        >
          Preview email
        </button>
      </div>

      <div className="grid gap-2">
        <label className={label}>
          Company <span className="normal-case text-muted">(optional)</span>
          <input
            className={input}
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            placeholder="PSA Airlines"
          />
        </label>
        <label className={label}>
          Email
          <input
            type="email"
            className={input}
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="ops@client.com"
            autoComplete="email"
          />
        </label>
        <label className={label}>
          Cell <span className="normal-case text-muted">(SMS)</span>
          <input
            className={`${input} avionic`}
            value={cell}
            onChange={(e) => setCell(e.target.value)}
            placeholder="+1…"
          />
        </label>
        <div className="flex flex-wrap gap-3 text-xs text-cream">
          {(['email', 'sms', 'both'] as const).map((ch) => (
            <label key={ch} className="flex items-center gap-1.5">
              <input
                type="radio"
                name="invite_channel"
                checked={channel === ch}
                onChange={() => setChannel(ch)}
              />
              {ch === 'both' ? 'Email + SMS' : ch === 'sms' ? 'SMS' : 'Email'}
            </label>
          ))}
        </div>
        <button
          type="button"
          disabled={busy || !canSend}
          onClick={() => void send()}
          className="rounded-md bg-gold px-3 py-2 text-sm font-medium text-ink disabled:opacity-50"
        >
          {busy ? 'Sending…' : 'Send onboarding link'}
        </button>
        {status && <p className="text-[11px] text-muted">{status}</p>}
      </div>

      {previewOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-ink/70 p-0 sm:items-center sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-label="Email preview"
        >
          <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-xl border border-border bg-cream sm:rounded-xl">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <h3 className="text-sm font-semibold text-ink">Email preview</h3>
              <button
                type="button"
                className="text-sm text-muted"
                onClick={() => setPreviewOpen(false)}
              >
                Close
              </button>
            </div>
            <iframe
              title="Client onboard email preview"
              className="min-h-[50vh] w-full flex-1 bg-white"
              srcDoc={previewHtml}
            />
          </div>
        </div>
      )}
    </div>
  )
}

export default function ClientsPage() {
  const clients = useSyncExternalStore(subscribeClients, listClients, listClients)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [newName, setNewName] = useState('')
  const [seedNote, setSeedNote] = useState<string | null>(null)

  useEffect(() => {
    void ensureClientsDirectorySeeded().then((n) => {
      if (n > 0) {
        setSeedNote(
          `Loaded ${n} clients from the financials ledger — complete profiles here or via /client.`,
        )
      }
    })
  }, [])

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
            Same subjects as the public /client setup form. Flag who rings the phone
            vs who gets invoices.
          </p>
          <p className="mt-2 text-xs text-muted">
            Portal: set{' '}
            <span className="text-cream/80">Portal access domains</span> on the
            company profile, or grant one-off emails under{' '}
            <Link to="/admin/portal-access" className="text-gold hover:text-gold-lt">
              Portal access
            </Link>
            .
          </p>
          {seedNote && (
            <p className="mt-2 text-[11px] text-gold/90">{seedNote}</p>
          )}
          {clients.length > 0 && (
            <p className="mt-1 avionic text-[11px] text-muted">
              {clients.length} in directory
            </p>
          )}
        </header>

        <ClientInviteCard />

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
            className={`${input} min-w-0 flex-1`}
          />
          <button
            type="button"
            className="shrink-0 rounded-md bg-gold px-4 py-2.5 text-sm font-medium text-ink"
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

        <ul
          className={[
            'space-y-1 overflow-auto',
            selected ? 'hidden max-h-[40vh] lg:block lg:max-h-[60vh]' : 'max-h-[60vh]',
          ].join(' ')}
        >
          {filtered.length === 0 && (
            <li className="rounded-md border border-border bg-surface px-3 py-4 text-center text-xs text-muted">
              No clients yet — send an onboarding link or add a name.
            </li>
          )}
          {filtered.map((c) => {
            const ring = c.contacts.filter((x) => x.notify_prefs.request_alert).length
            const inv = c.contacts.filter((x) => x.notify_prefs.invoice).length
            const ops =
              c.contacts.find((x) => x.notify_prefs.request_alert)?.email ||
              c.email ||
              c.invoice_email
            return (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(c.id)}
                  className={[
                    'w-full rounded-md border px-3 py-3 text-left text-sm sm:py-2',
                    selected?.id === c.id
                      ? 'border-gold bg-gold/10 text-cream'
                      : 'border-border bg-surface text-muted hover:text-cream',
                  ].join(' ')}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-cream">{c.name}</span>
                    {c.profile?.needs_vendor_number || c.profile?.vendor_number ? (
                      <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-muted">
                        Vendor #
                        {c.profile.vendor_number
                          ? ` ${c.profile.vendor_number}`
                          : ' required'}
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-0.5 truncate font-mono text-[11px] text-muted">
                    {ops || 'No email'}
                  </div>
                  <div className="mt-0.5 text-[11px] text-muted">
                    {c.contacts.length} contacts · {ring} ring · {inv} AP
                    {(c.profile?.bases?.length ?? 0) > 0
                      ? ` · ${c.profile.bases!.length} bases`
                      : ''}
                  </div>
                </button>
              </li>
            )
          })}
        </ul>
      </aside>

      <main className="min-w-0 flex-1">
        {!selected ? (
          <p className="text-sm text-muted lg:block">
            <span className="lg:hidden">Tap a client above, or add one.</span>
            <span className="hidden lg:inline">Select or add a client.</span>
          </p>
        ) : (
          <ClientDetailPanel
            client={selected}
            onBack={() => setSelectedId(null)}
          />
        )}
      </main>
    </div>
  )
}

