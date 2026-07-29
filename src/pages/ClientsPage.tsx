import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { Link } from 'react-router-dom'
import { AirportSelect } from '@/components/AirportSelect'
import {
  isLiveEmailConfigured,
  isRealEmailEnabled,
} from '@/adapters/email'
import {
  addClient,
  addClientContact,
  ensureClientsDirectorySeeded,
  listClients,
  removeClientContact,
  subscribeClients,
  updateClient,
  updateClientContact,
  type ClientProfile,
  type ContactRole,
} from '@/lib/clientStore'
import {
  defaultClientOnboardTemplate,
  renderClientOnboardEmailHtml,
  sendClientOnboardInvite,
} from '@/lib/clientOnboardEmail'

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
            Portal magic-link logins:{' '}
            <Link to="/admin/portal-access" className="text-gold hover:text-gold-lt">
              Portal access
            </Link>
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
                  <div className="font-medium text-cream">{c.name}</div>
                  <div className="mt-0.5 text-[11px] text-muted">
                    {c.contacts.length} contacts · {ring} ring · {inv} invoice
                    {c.profile?.source === 'import' ? ' · from financials' : ''}
                    {c.profile?.source === 'portal_onboard' ? ' · from /client' : ''}
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
          <ClientDetail
            client={selected}
            onBack={() => setSelectedId(null)}
          />
        )}
      </main>
    </div>
  )
}

function payTermsSelectValue(terms: string): string {
  const known = ['Prepay', 'Net 15', 'Net 30', 'Net 60']
  if (known.includes(terms)) return terms
  const lower = terms.toLowerCase()
  if (lower.includes('prepay') || lower.includes('prepaid')) return 'Prepay'
  if (lower.includes('15')) return 'Net 15'
  if (lower.includes('60')) return 'Net 60'
  if (lower.includes('30')) return 'Net 30'
  return terms
}

function ClientDetail({
  client,
  onBack,
}: {
  client: ClientProfile
  onBack?: () => void
}) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [cell, setCell] = useState('')
  const [role, setRole] = useState<ContactRole>('requester')

  const ringers = client.contacts.filter((c) => c.notify_prefs.request_alert)
  const invoiceTo = client.contacts.filter((c) => c.notify_prefs.invoice)
  const profile = client.profile ?? {}

  function patchProfile(
    patch: Partial<NonNullable<ClientProfile['profile']>>,
  ) {
    updateClient(client.id, { profile: { ...profile, ...patch } })
  }

  return (
    <div className="space-y-6">
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="tap -ml-2 text-sm text-gold lg:hidden"
        >
          ← Clients
        </button>
      )}
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <label className={label}>
            Legal name
            <input
              className={`${input} text-lg font-semibold text-cream`}
              value={client.name}
              onChange={(e) => updateClient(client.id, { name: e.target.value })}
            />
          </label>
          <p className="mt-1 text-sm text-muted">
            Pay terms {client.pay_terms}
            {client.last_po ? ` · last PO ${client.last_po}` : ''}
            {profile.source === 'portal_onboard' ? ' · from /client setup' : ''}
            {profile.source === 'import' ? ' · from financials' : ''}
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
          <select
            className={input}
            value={payTermsSelectValue(client.pay_terms)}
            onChange={(e) => {
              const v = e.target.value
              if (v === 'other') return
              updateClient(client.id, { pay_terms: v })
            }}
          >
            <option value="Prepay">Prepay</option>
            <option value="Net 15">Net 15</option>
            <option value="Net 30">Net 30</option>
            <option value="Net 60">Net 60</option>
            <option value={client.pay_terms}>
              {payTermsSelectValue(client.pay_terms) === client.pay_terms
                ? client.pay_terms
                : `Other (${client.pay_terms})`}
            </option>
          </select>
          <input
            className={`${input} mt-1`}
            value={client.pay_terms}
            onChange={(e) => updateClient(client.id, { pay_terms: e.target.value })}
            placeholder="Or type custom terms"
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
          <span className="ml-2 normal-case tracking-normal text-muted/70">
            (same fields as /client)
          </span>
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
          {profile.needs_vendor_number && (
            <label className={label}>
              Vendor # instructions
              <input
                className={input}
                value={profile.vendor_number_notes ?? ''}
                onChange={(e) =>
                  patchProfile({
                    vendor_number_notes: e.target.value || undefined,
                  })
                }
                placeholder="Portal / AP contact for vendor registration"
              />
            </label>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <div className="text-[11px] uppercase tracking-wider text-muted">
              Company address
            </div>
            {(
              [
                ['street', 'Street'],
                ['city', 'City'],
                ['state', 'State'],
                ['zip', 'ZIP'],
              ] as const
            ).map(([key, lab]) => (
              <label key={key} className={label}>
                {lab}
                <input
                  className={input}
                  value={profile.address?.[key] ?? ''}
                  onChange={(e) =>
                    patchProfile({
                      address: {
                        street: profile.address?.street ?? '',
                        city: profile.address?.city ?? '',
                        state: profile.address?.state ?? '',
                        zip: profile.address?.zip ?? '',
                        [key]: e.target.value,
                      },
                    })
                  }
                />
              </label>
            ))}
          </div>
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm text-cream">
              <input
                type="checkbox"
                checked={profile.billing_same_as_address !== false}
                onChange={(e) =>
                  patchProfile({ billing_same_as_address: e.target.checked })
                }
              />
              Billing same as company address
            </label>
            {profile.billing_same_as_address === false &&
              (
                [
                  ['street', 'Billing street'],
                  ['city', 'City'],
                  ['state', 'State'],
                  ['zip', 'ZIP'],
                ] as const
              ).map(([key, lab]) => (
                <label key={key} className={label}>
                  {lab}
                  <input
                    className={input}
                    value={profile.billing_address?.[key] ?? ''}
                    onChange={(e) =>
                      patchProfile({
                        billing_address: {
                          street: profile.billing_address?.street ?? '',
                          city: profile.billing_address?.city ?? '',
                          state: profile.billing_address?.state ?? '',
                          zip: profile.billing_address?.zip ?? '',
                          [key]: e.target.value,
                        },
                      })
                    }
                  />
                </label>
              ))}
            <div className="space-y-2 pt-2">
              <div className="text-[11px] uppercase tracking-wider text-muted">
                Emergency contact
              </div>
              <label className={label}>
                Name
                <input
                  className={input}
                  value={profile.emergency?.name ?? ''}
                  onChange={(e) =>
                    patchProfile({
                      emergency: {
                        name: e.target.value,
                        email: profile.emergency?.email ?? '',
                        phone: profile.emergency?.phone ?? '',
                      },
                    })
                  }
                />
              </label>
              <label className={label}>
                Phone
                <input
                  className={`${input} avionic`}
                  value={profile.emergency?.phone ?? ''}
                  onChange={(e) =>
                    patchProfile({
                      emergency: {
                        name: profile.emergency?.name ?? '',
                        email: profile.emergency?.email ?? '',
                        phone: e.target.value,
                      },
                    })
                  }
                />
              </label>
              <label className={label}>
                Email
                <input
                  className={input}
                  value={profile.emergency?.email ?? ''}
                  onChange={(e) =>
                    patchProfile({
                      emergency: {
                        name: profile.emergency?.name ?? '',
                        email: e.target.value,
                        phone: profile.emergency?.phone ?? '',
                      },
                    })
                  }
                />
              </label>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-4 text-sm text-cream">
          <label className={label}>
            PO assigned by
            <select
              className={input}
              value={profile.po_assigned_by ?? ''}
              onChange={(e) => {
                const v = e.target.value
                const po_assigned_by =
                  v === 'client' || v === 'onfly' ? v : null
                patchProfile({
                  po_assigned_by,
                  requires_po: po_assigned_by === 'client',
                })
              }}
            >
              <option value="">— confirm —</option>
              <option value="client">Client provides PO</option>
              <option value="onfly">OnFly assigns PO</option>
            </select>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={Boolean(profile.needs_vendor_number)}
              onChange={(e) =>
                patchProfile({ needs_vendor_number: e.target.checked })
              }
            />
            Needs vendor #
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={profile.card_on_file === true}
              onChange={(e) =>
                patchProfile({ card_on_file: e.target.checked ? true : null })
              }
            />
            Card on file
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={Boolean(profile.shipping_flags?.temp_control)}
              onChange={(e) =>
                patchProfile({
                  shipping_flags: {
                    ...profile.shipping_flags,
                    temp_control: e.target.checked,
                  },
                })
              }
            />
            Temp control
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={Boolean(profile.shipping_flags?.oversized)}
              onChange={(e) =>
                patchProfile({
                  shipping_flags: {
                    ...profile.shipping_flags,
                    oversized: e.target.checked,
                  },
                })
              }
            />
            Oversized
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

        <div className="space-y-2">
          <div className="text-[11px] uppercase tracking-wider text-muted">
            Bases (ETA / tracking)
          </div>
          <p className="text-[11px] text-muted">
            Company locations. Leave emails blank to auto-send{' '}
            <span className="avionic">cak@company.com</span> from the client
            domain / website on Quick Dispatch.
          </p>
          <div className="space-y-2">
            {(profile.bases?.length ? profile.bases : []).map((base, i) => (
              <div
                key={`base-${i}`}
                className="grid gap-2 rounded-md border border-border/60 p-2 sm:grid-cols-[1fr_2fr_auto]"
              >
                <AirportSelect
                  value={base.icao}
                  onChange={(icao) => {
                    const bases = [...(profile.bases ?? [])]
                    bases[i] = { ...bases[i]!, icao }
                    patchProfile({ bases })
                  }}
                  label="Base ICAO"
                  inputClassName={input}
                />
                <label className="block text-xs text-muted">
                  Emails (comma-separated, optional)
                  <input
                    className={input}
                    value={(base.emails ?? []).join(', ')}
                    onChange={(e) => {
                      const bases = [...(profile.bases ?? [])]
                      const emails = e.target.value
                        .split(/[,;\s]+/)
                        .map((s) => s.trim())
                        .filter((s) => s.includes('@'))
                      bases[i] = { ...bases[i]!, emails }
                      patchProfile({ bases })
                    }}
                    placeholder="auto from domain if empty"
                  />
                </label>
                <button
                  type="button"
                  className="self-end text-xs text-muted hover:text-late"
                  onClick={() => {
                    const bases = [...(profile.bases ?? [])]
                    bases.splice(i, 1)
                    patchProfile({ bases })
                  }}
                >
                  Remove
                </button>
              </div>
            ))}
            <button
              type="button"
              className="text-xs text-gold"
              onClick={() =>
                patchProfile({
                  bases: [...(profile.bases ?? []), { icao: '', emails: [] }],
                })
              }
            >
              + Add base
            </button>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-[11px] uppercase tracking-wider text-muted">
              Frequent lanes
            </div>
            <label className="flex items-center gap-2 text-xs text-cream">
              <input
                type="checkbox"
                checked={Boolean(profile.no_frequent_lanes)}
                onChange={(e) =>
                  patchProfile({
                    no_frequent_lanes: e.target.checked,
                    frequent_lanes: e.target.checked
                      ? []
                      : profile.frequent_lanes,
                  })
                }
              />
              No frequent lanes
            </label>
          </div>
          {!profile.no_frequent_lanes && (
            <div className="space-y-2">
              {(profile.frequent_lanes?.length
                ? profile.frequent_lanes
                : [{ origin: '', destination: '' }]
              ).map((lane, i) => (
                <div key={i} className="grid gap-2 sm:grid-cols-2">
                  <AirportSelect
                    value={lane.origin}
                    onChange={(icao) => {
                      const lanes = [
                        ...(profile.frequent_lanes?.length
                          ? profile.frequent_lanes
                          : [{ origin: '', destination: '' }]),
                      ]
                      lanes[i] = { ...lanes[i]!, origin: icao }
                      patchProfile({ frequent_lanes: lanes })
                    }}
                    label="Origin"
                    inputClassName={input}
                  />
                  <AirportSelect
                    value={lane.destination}
                    onChange={(icao) => {
                      const lanes = [
                        ...(profile.frequent_lanes?.length
                          ? profile.frequent_lanes
                          : [{ origin: '', destination: '' }]),
                      ]
                      lanes[i] = { ...lanes[i]!, destination: icao }
                      patchProfile({ frequent_lanes: lanes })
                    }}
                    label="Destination"
                    inputClassName={input}
                  />
                </div>
              ))}
              <button
                type="button"
                className="text-xs text-gold"
                onClick={() =>
                  patchProfile({
                    frequent_lanes: [
                      ...(profile.frequent_lanes ?? []),
                      { origin: '', destination: '' },
                    ],
                  })
                }
              >
                + Add lane
              </button>
            </div>
          )}
        </div>
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
              checked={client.rules.single_engine_turboprop_only}
              onChange={(e) =>
                updateClient(client.id, {
                  rules: { single_engine_turboprop_only: e.target.checked },
                })
              }
            />
            SE OK if turboprop
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
              <div className="mt-2">
                <button
                  type="button"
                  className="text-xs text-gold underline"
                  onClick={() => {
                    void (async () => {
                      const { createCommsAdapter } = await import(
                        '@/adapters/comms'
                      )
                      const { createEmailAdapter } = await import(
                        '@/adapters/email'
                      )
                      const { portalInviteSmsBody } = await import(
                        '@/domain/tripThread'
                      )
                      const portalUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/portal/login`
                      const body = portalInviteSmsBody({
                        clientName: client.name,
                        portalUrl,
                      })
                      if (c.cell) {
                        await createCommsAdapter().send({
                          channel: 'sms',
                          to: c.cell,
                          body,
                        })
                      }
                      if (c.email) {
                        await createEmailAdapter().send({
                          to: c.email,
                          subject: `OnFly Air portal — ${client.name}`,
                          text: body,
                          html: `<p>${body}</p><p><a href="${portalUrl}">Open portal</a></p>`,
                        })
                      }
                    })()
                  }}
                >
                  Invite to portal (SMS / email)
                </button>
              </div>
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
