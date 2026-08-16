/**
 * Client directory detail — cleaned tabs: Info / Contacts / Bases / Billing.
 * Diagrams live under each base. Contacts mix people + DLs (incl. base DLs).
 */

import { useMemo, useState } from 'react'
import { AirportSelect } from '@/components/AirportSelect'
import {
  syncBaseEmailFields,
  type ClientBaseRef,
} from '@/domain/clientBaseEmails'
import {
  addClientContact,
  listMixedDirectoryContacts,
  removeClientContact,
  updateClient,
  updateClientContact,
  type ClientProfile,
  type ContactKind,
  type ContactRole,
} from '@/lib/clientStore'
import {
  formatPortalDomainList,
  parsePortalDomainList,
  suggestPortalDomainFromWebsite,
} from '@/domain/portalDomains'

const input =
  'mt-1 w-full rounded-md border border-border bg-ink px-3 py-2 text-sm text-cream outline-none focus:border-gold'
const label = 'block text-xs font-medium uppercase tracking-wider text-muted'

type TabId = 'info' | 'contacts' | 'bases' | 'billing'

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

function primaryLine(client: ClientProfile): string {
  const ops = client.contacts.find((c) => c.notify_prefs.request_alert)?.email
  return ops || client.email || client.invoice_email || 'No ops email'
}

export function ClientDetailPanel({
  client,
  onBack,
}: {
  client: ClientProfile
  onBack?: () => void
}) {
  const [tab, setTab] = useState<TabId>('info')
  const profile = client.profile ?? {}
  const mixed = useMemo(
    () => listMixedDirectoryContacts(client.id),
    [client.id, client.contacts, client.profile.bases],
  )
  const apCount = client.contacts.filter((c) => c.notify_prefs.invoice).length
  const baseCount = profile.bases?.length ?? 0

  function patchProfile(patch: Partial<NonNullable<ClientProfile['profile']>>) {
    updateClient(client.id, { profile: { ...profile, ...patch } })
  }

  const tabs: Array<{ id: TabId; label: string }> = [
    { id: 'info', label: 'Info' },
    { id: 'contacts', label: `Contacts (${mixed.length})` },
    { id: 'bases', label: `Bases (${baseCount})` },
    { id: 'billing', label: 'Billing' },
  ]

  return (
    <div className="space-y-4">
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
          <input
            className={`${input} text-xl font-semibold text-cream`}
            value={client.name}
            onChange={(e) => updateClient(client.id, { name: e.target.value })}
            aria-label="Client name"
          />
          <p className="mt-1 truncate font-mono text-xs text-muted">
            {primaryLine(client)}
            {client.pay_terms ? ` · ${client.pay_terms}` : ''}
            {profile.vendor_number ? ` · Vendor # ${profile.vendor_number}` : ''}
          </p>
        </div>
      </header>

      <nav
        className="flex flex-wrap gap-1 border-b border-border pb-2"
        aria-label="Client sections"
      >
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={[
              'rounded-md px-3 py-1.5 text-sm transition-colors',
              tab === t.id
                ? 'bg-gold/15 text-gold'
                : 'text-muted hover:bg-surface-2 hover:text-cream',
            ].join(' ')}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {tab === 'info' && (
        <InfoTab client={client} profile={profile} patchProfile={patchProfile} />
      )}
      {tab === 'contacts' && (
        <ContactsTab client={client} mixed={mixed} apCount={apCount} />
      )}
      {tab === 'bases' && (
        <BasesTab client={client} profile={profile} patchProfile={patchProfile} />
      )}
      {tab === 'billing' && (
        <BillingTab client={client} profile={profile} patchProfile={patchProfile} />
      )}
    </div>
  )
}

function InfoTab({
  client,
  profile,
  patchProfile,
}: {
  client: ClientProfile
  profile: NonNullable<ClientProfile['profile']>
  patchProfile: (p: Partial<NonNullable<ClientProfile['profile']>>) => void
}) {
  const suggested = suggestPortalDomainFromWebsite(profile.website)
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="space-y-3 rounded-lg border border-border bg-surface p-4">
        <h3 className="text-xs font-medium uppercase tracking-wider text-muted">
          Company
        </h3>
        <label className={label}>
          Desk phone (inbound)
          <input
            className={input}
            value={profile.front_desk_phone ?? ''}
            onChange={(e) =>
              patchProfile({ front_desk_phone: e.target.value || undefined })
            }
          />
        </label>
        <label className={label}>
          Client callback (outbound)
          <input
            className={input}
            value={profile.ops_callback_phone ?? ''}
            onChange={(e) =>
              patchProfile({ ops_callback_phone: e.target.value || undefined })
            }
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
          Portal email domains
          <input
            className={input}
            value={formatPortalDomainList(profile.allowed_email_domains)}
            onChange={(e) => {
              const domains = parsePortalDomainList(e.target.value)
              patchProfile({
                allowed_email_domains: domains.length ? domains : undefined,
              })
            }}
            placeholder="psaairlines.com"
          />
        </label>
        {suggested &&
          !(profile.allowed_email_domains ?? []).includes(suggested) && (
            <button
              type="button"
              className="text-xs text-gold"
              onClick={() => {
                const domains = parsePortalDomainList(
                  [...(profile.allowed_email_domains ?? []), suggested].join(
                    ', ',
                  ),
                )
                patchProfile({ allowed_email_domains: domains })
              }}
            >
              + Add {suggested} from website
            </button>
          )}
        <label className={label}>
          Notes
          <textarea
            className={`${input} min-h-[88px]`}
            value={client.notes}
            onChange={(e) => updateClient(client.id, { notes: e.target.value })}
          />
        </label>
      </section>

      <section className="space-y-3 rounded-lg border border-border bg-surface p-4">
        <h3 className="text-xs font-medium uppercase tracking-wider text-muted">
          Emergency
        </h3>
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
            className={input}
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

        <h3 className="pt-2 text-xs font-medium uppercase tracking-wider text-muted">
          Aircraft rules
        </h3>
        {(
          [
            ['dual_pilot_required', 'Dual pilot required'],
            ['multi_engine_only', 'Multi-engine only'],
            ['freight_only', 'Freight only'],
            ['exceptions_with_permission', 'Exceptions w/ permission'],
          ] as const
        ).map(([key, text]) => (
          <label key={key} className="flex items-center gap-2 text-sm text-cream">
            <input
              type="checkbox"
              checked={Boolean(client.rules[key])}
              onChange={(e) =>
                updateClient(client.id, {
                  rules: { [key]: e.target.checked },
                })
              }
            />
            {text}
          </label>
        ))}
      </section>
    </div>
  )
}

function ContactsTab({
  client,
  mixed,
  apCount,
}: {
  client: ClientProfile
  mixed: ReturnType<typeof listMixedDirectoryContacts>
  apCount: number
}) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [cell, setCell] = useState('')
  const [role, setRole] = useState<ContactRole>('requester')
  const [kind, setKind] = useState<ContactKind>('person')
  const [title, setTitle] = useState('')

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        People and distribution lists in one list. Flag{' '}
        <span className="text-gold">AP / Invoice</span> for invoice autopopulate.
        Set <span className="text-gold">ETA airports</span> so that email joins
        the ETA sheet when those ICAOs are on the trip. Base supervisor/stores
        DLs appear here automatically.
      </p>
      <p className="text-xs text-muted">{apCount} flagged for invoices</p>

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-border bg-surface text-xs uppercase tracking-wider text-muted">
            <tr>
              <th className="px-3 py-2">Type</th>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Email</th>
              <th className="px-3 py-2">Title</th>
              <th className="px-3 py-2">Phone</th>
              <th className="px-3 py-2">Flags</th>
              <th className="px-3 py-2">ETA airports</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {mixed.map((c) => {
              const synthetic = c.id.startsWith('base:')
              return (
                <tr key={c.id} className="border-b border-border/60">
                  <td className="px-3 py-2">
                    <span
                      className={[
                        'inline-block rounded-full px-2 py-0.5 text-[11px] font-medium',
                        c.kind === 'dl'
                          ? 'border border-border text-muted'
                          : 'bg-gold/20 text-gold',
                      ].join(' ')}
                    >
                      {c.kind === 'dl' ? 'DL' : 'Person'}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-cream">
                    {synthetic ? (
                      c.name
                    ) : (
                      <input
                        className="w-full min-w-[7rem] rounded border border-transparent bg-transparent px-1 py-0.5 text-cream outline-none focus:border-gold"
                        value={c.name}
                        onChange={(e) =>
                          updateClientContact(client.id, c.id, {
                            name: e.target.value,
                          })
                        }
                      />
                    )}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-cream">
                    {synthetic ? (
                      c.email
                    ) : (
                      <input
                        className="w-full min-w-[10rem] rounded border border-transparent bg-transparent px-1 py-0.5 font-mono text-xs outline-none focus:border-gold"
                        value={c.email}
                        onChange={(e) =>
                          updateClientContact(client.id, c.id, {
                            email: e.target.value,
                          })
                        }
                      />
                    )}
                  </td>
                  <td className="px-3 py-2 text-muted">
                    {synthetic ? (
                      c.title ?? '—'
                    ) : (
                      <input
                        className="w-full min-w-[6rem] rounded border border-transparent bg-transparent px-1 py-0.5 outline-none focus:border-gold"
                        value={c.title ?? ''}
                        placeholder="Title"
                        onChange={(e) =>
                          updateClientContact(client.id, c.id, {
                            title: e.target.value,
                          })
                        }
                      />
                    )}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-muted">
                    {synthetic ? (
                      '—'
                    ) : (
                      <input
                        className="w-24 rounded border border-transparent bg-transparent px-1 py-0.5 font-mono text-xs outline-none focus:border-gold"
                        value={c.cell}
                        onChange={(e) =>
                          updateClientContact(client.id, c.id, {
                            cell: e.target.value,
                          })
                        }
                      />
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {synthetic ? (
                      <span className="text-[11px] text-muted">
                        ETA @ {(c.eta_icaos ?? []).join(', ')}
                      </span>
                    ) : (
                      <div className="flex flex-col gap-1 text-[11px]">
                        <label className="flex items-center gap-1 text-cream">
                          <input
                            type="checkbox"
                            checked={c.notify_prefs.request_alert}
                            onChange={(e) =>
                              updateClientContact(client.id, c.id, {
                                notify_prefs: {
                                  request_alert: e.target.checked,
                                },
                              })
                            }
                          />
                          Quotes
                        </label>
                        <label className="flex items-center gap-1 text-gold">
                          <input
                            type="checkbox"
                            checked={c.notify_prefs.invoice}
                            onChange={(e) =>
                              updateClientContact(client.id, c.id, {
                                notify_prefs: { invoice: e.target.checked },
                                role: e.target.checked ? 'ap' : c.role,
                              })
                            }
                          />
                          AP / Invoice
                        </label>
                        <label className="flex items-center gap-1 text-cream">
                          <input
                            type="checkbox"
                            checked={c.notify_prefs.tracker}
                            onChange={(e) =>
                              updateClientContact(client.id, c.id, {
                                notify_prefs: { tracker: e.target.checked },
                              })
                            }
                          />
                          Always ETA
                        </label>
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {synthetic ? (
                      <span className="font-mono text-xs text-muted">
                        {(c.eta_icaos ?? []).join(', ')}
                      </span>
                    ) : (
                      <input
                        className="w-28 rounded border border-border bg-ink px-2 py-1 font-mono text-xs text-cream outline-none focus:border-gold"
                        value={(c.eta_icaos ?? []).join(', ')}
                        placeholder="CAK, CLT"
                        title="Comma-separated ICAOs for ETA autopopulate"
                        onChange={(e) => {
                          const eta_icaos = e.target.value
                            .split(/[,;\s]+/)
                            .map((s) => s.trim().toUpperCase())
                            .filter(Boolean)
                          updateClientContact(client.id, c.id, { eta_icaos })
                        }}
                      />
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {!synthetic && (
                      <button
                        type="button"
                        className="text-xs text-muted hover:text-late"
                        onClick={() => removeClientContact(client.id, c.id)}
                      >
                        Remove
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="rounded-lg border border-dashed border-border p-3">
        <div className="text-xs uppercase tracking-wider text-muted">
          Add contact
        </div>
        <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
          <select
            className={input}
            value={kind}
            onChange={(e) => setKind(e.target.value as ContactKind)}
          >
            <option value="person">Person</option>
            <option value="dl">DL</option>
          </select>
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
            placeholder="Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
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
        </div>
        <button
          type="button"
          className="mt-2 rounded-md bg-gold px-3 py-2 text-sm font-medium text-ink"
          onClick={() => {
            if (!email.trim()) return
            addClientContact(client.id, name || email, email, role, cell, {
              kind,
              title: title || undefined,
            })
            setName('')
            setEmail('')
            setCell('')
            setTitle('')
            setKind('person')
            setRole('requester')
          }}
        >
          Add to directory
        </button>
      </div>
    </div>
  )
}

function BasesTab({
  client,
  profile,
  patchProfile,
}: {
  client: ClientProfile
  profile: NonNullable<ClientProfile['profile']>
  patchProfile: (p: Partial<NonNullable<ClientProfile['profile']>>) => void
}) {
  const bases = profile.bases ?? []

  function setBases(next: ClientBaseRef[]) {
    patchProfile({ bases: next.map(syncBaseEmailFields) })
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted">
          Operational bases. Supervisor / stores DLs also show on Contacts with
          ETA airport flags. Diagrams sit on each base — download anytime.
        </p>
        <button
          type="button"
          className="rounded-md border border-gold/40 px-3 py-1.5 text-xs text-gold"
          onClick={() =>
            setBases([...bases, { icao: '', supervisor_emails: [], stores_emails: [] }])
          }
        >
          + Add base
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {bases.map((base, i) => (
          <div
            key={`${base.icao}-${i}`}
            className="space-y-3 rounded-lg border border-border bg-surface p-4"
          >
            <div className="flex items-start justify-between gap-2">
              <AirportSelect
                value={base.icao}
                onChange={(icao) => {
                  const next = [...bases]
                  next[i] = syncBaseEmailFields({ ...base, icao })
                  setBases(next)
                }}
                label="Base ICAO"
                inputClassName={input}
              />
              <button
                type="button"
                className="mt-6 text-xs text-muted hover:text-late"
                onClick={() => {
                  const next = [...bases]
                  next.splice(i, 1)
                  setBases(next)
                }}
              >
                Remove
              </button>
            </div>
            <label className={label}>
              Supervisor emails
              <input
                className={input}
                value={(base.supervisor_emails ?? []).join(', ')}
                onChange={(e) => {
                  const next = [...bases]
                  next[i] = syncBaseEmailFields({
                    ...base,
                    supervisor_emails: e.target.value
                      .split(/[,;]+/)
                      .map((s) => s.trim())
                      .filter(Boolean),
                  })
                  setBases(next)
                }}
              />
            </label>
            <label className={label}>
              Stores emails
              <input
                className={input}
                value={(base.stores_emails ?? []).join(', ')}
                onChange={(e) => {
                  const next = [...bases]
                  next[i] = syncBaseEmailFields({
                    ...base,
                    stores_emails: e.target.value
                      .split(/[,;]+/)
                      .map((s) => s.trim())
                      .filter(Boolean),
                  })
                  setBases(next)
                }}
              />
            </label>

            <div className="rounded-md border border-border/70 bg-ink/40 p-3">
              <div className="text-[11px] uppercase tracking-wider text-muted">
                Diagram
              </div>
              {base.diagram_url ? (
                <div className="mt-2 space-y-2">
                  <a
                    href={base.diagram_url}
                    target="_blank"
                    rel="noreferrer"
                    className="block overflow-hidden rounded border border-border"
                  >
                    <img
                      src={base.diagram_url}
                      alt={base.diagram_caption || `${base.icao} hangar`}
                      className="max-h-40 w-full object-cover object-top"
                    />
                  </a>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-xs text-muted">
                      {base.diagram_caption || 'Hangar diagram'}
                    </span>
                    <a
                      href={base.diagram_url}
                      download={base.diagram_caption || `${base.icao}-diagram`}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-md bg-gold/15 px-2.5 py-1 text-xs font-medium text-gold hover:bg-gold/25"
                    >
                      Download
                    </a>
                  </div>
                </div>
              ) : (
                <p className="mt-2 text-xs text-muted">No diagram on file.</p>
              )}
              <label className={`${label} mt-2`}>
                Diagram URL
                <input
                  className={input}
                  value={base.diagram_url ?? ''}
                  onChange={(e) => {
                    const next = [...bases]
                    next[i] = {
                      ...base,
                      diagram_url: e.target.value.trim() || undefined,
                    }
                    setBases(next)
                  }}
                  placeholder="https://…/hangar.jpg"
                />
              </label>
              <label className={label}>
                Caption / filename
                <input
                  className={input}
                  value={base.diagram_caption ?? ''}
                  onChange={(e) => {
                    const next = [...bases]
                    next[i] = {
                      ...base,
                      diagram_caption: e.target.value.trim() || undefined,
                    }
                    setBases(next)
                  }}
                />
              </label>
            </div>
          </div>
        ))}
      </div>
      {!bases.length && (
        <p className="text-sm text-muted">No bases yet — add an ICAO above.</p>
      )}
      <p className="text-[11px] text-muted">Client id {client.id}</p>
    </div>
  )
}

function BillingTab({
  client,
  profile,
  patchProfile,
}: {
  client: ClientProfile
  profile: NonNullable<ClientProfile['profile']>
  patchProfile: (p: Partial<NonNullable<ClientProfile['profile']>>) => void
}) {
  const ap = client.contacts.filter((c) => c.notify_prefs.invoice)
  const termsValue = payTermsSelectValue(client.pay_terms)
  const known = ['Prepay', 'Net 15', 'Net 30', 'Net 60']

  return (
    <div className="grid max-w-2xl gap-4">
      <section className="space-y-3 rounded-lg border border-border bg-surface p-4">
        <label className={label}>
          Default invoice email
          <input
            className={input}
            value={client.invoice_email}
            onChange={(e) =>
              updateClient(client.id, { invoice_email: e.target.value })
            }
          />
        </label>
        <label className={label}>
          Pay terms
          <select
            className={input}
            value={known.includes(termsValue) ? termsValue : 'Net 30'}
            onChange={(e) =>
              updateClient(client.id, { pay_terms: e.target.value })
            }
          >
            {known.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label className={label}>
          PO prefix
          <input
            className={input}
            value={client.po_prefix ?? ''}
            onChange={(e) =>
              updateClient(client.id, {
                po_prefix: e.target.value.trim().toUpperCase() || null,
              })
            }
          />
        </label>
        <label className="flex items-center gap-2 text-sm text-cream">
          <input
            type="checkbox"
            checked={Boolean(profile.needs_vendor_number)}
            onChange={(e) =>
              patchProfile({ needs_vendor_number: e.target.checked })
            }
          />
          Vendor # required
        </label>
        <label className={label}>
          Vendor number
          <input
            className={input}
            value={profile.vendor_number ?? ''}
            onChange={(e) =>
              patchProfile({
                vendor_number: e.target.value.trim() || null,
              })
            }
          />
        </label>
        <label className={label}>
          Billing address (street)
          <input
            className={input}
            value={profile.billing_address?.street ?? ''}
            onChange={(e) =>
              patchProfile({
                billing_address: {
                  street: e.target.value,
                  city: profile.billing_address?.city ?? '',
                  state: profile.billing_address?.state ?? '',
                  zip: profile.billing_address?.zip ?? '',
                },
              })
            }
          />
        </label>
        <div className="grid grid-cols-3 gap-2">
          <label className={label}>
            City
            <input
              className={input}
              value={profile.billing_address?.city ?? ''}
              onChange={(e) =>
                patchProfile({
                  billing_address: {
                    street: profile.billing_address?.street ?? '',
                    city: e.target.value,
                    state: profile.billing_address?.state ?? '',
                    zip: profile.billing_address?.zip ?? '',
                  },
                })
              }
            />
          </label>
          <label className={label}>
            State
            <input
              className={input}
              value={profile.billing_address?.state ?? ''}
              onChange={(e) =>
                patchProfile({
                  billing_address: {
                    street: profile.billing_address?.street ?? '',
                    city: profile.billing_address?.city ?? '',
                    state: e.target.value,
                    zip: profile.billing_address?.zip ?? '',
                  },
                })
              }
            />
          </label>
          <label className={label}>
            ZIP
            <input
              className={input}
              value={profile.billing_address?.zip ?? ''}
              onChange={(e) =>
                patchProfile({
                  billing_address: {
                    street: profile.billing_address?.street ?? '',
                    city: profile.billing_address?.city ?? '',
                    state: profile.billing_address?.state ?? '',
                    zip: e.target.value,
                  },
                })
              }
            />
          </label>
        </div>
      </section>

      <section className="rounded-lg border border-gold/30 bg-gold/10 p-4">
        <h3 className="text-xs font-medium uppercase tracking-wider text-gold">
          Accounts payable (always on invoices)
        </h3>
        {ap.length === 0 ? (
          <p className="mt-2 text-sm text-muted">
            No contacts flagged AP / Invoice yet — use the Contacts tab.
          </p>
        ) : (
          <ul className="mt-2 space-y-1">
            {ap.map((c) => (
              <li key={c.id} className="font-mono text-sm text-cream">
                {c.email}
                {c.name ? (
                  <span className="text-muted"> ({c.name})</span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
