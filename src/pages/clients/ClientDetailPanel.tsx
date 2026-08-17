/**
 * Client directory detail — cleaned tabs: Info / Contacts / Bases / Billing.
 * Diagrams live under each base. Contacts mix people + DLs (incl. base DLs).
 */

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { AirportSelect } from '@/components/AirportSelect'
import {
  syncBaseEmailFields,
  type ClientBaseRef,
} from '@/domain/clientBaseEmails'
import {
  alwaysInvoiceEmails,
  invoiceSometimesBubbleContacts,
  isAlwaysInvoiceContact,
  isOptionalInvoiceContact,
  optionalInvoiceEmails,
} from '@/domain/clientInvoiceRecipients'
import {
  applyFreightPolicyToRules,
  summarizeClientRulesGuide,
} from '@/domain/clientRulesGuide'
import {
  emptyMissionAircraftPolicy,
  normalizeMissionPolicy,
  type MissionAircraftPolicy,
} from '@/domain/clientOnboard'
import {
  addClientContact,
  getClient,
  listClients,
  listMixedDirectoryContacts,
  removeClientContact,
  subscribeClients,
  updateClient,
  updateClientContact,
  type ClientContact,
  type ClientProfile,
  type ContactKind,
  type ContactRole,
} from '@/lib/clientStore'
import {
  formatPortalDomainList,
  inferPortalDomainsFromOnFile,
  mergePortalDomainAllowlist,
  parsePortalDomainList,
  suggestPortalDomainFromWebsite,
} from '@/domain/portalDomains'

const input =
  'mt-1 w-full rounded-md border border-border bg-ink px-3 py-2 text-sm text-cream outline-none focus:border-gold'
const label = 'block text-xs font-medium uppercase tracking-wider text-muted'
const check =
  'flex items-start gap-2 text-sm text-cream'

type TabId = 'info' | 'contacts' | 'bases' | 'billing' | 'rules'

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
  client: clientProp,
  onBack,
}: {
  client: ClientProfile
  onBack?: () => void
}) {
  // Always read the live directory row so flag toggles re-render immediately.
  useSyncExternalStore(subscribeClients, listClients, listClients)
  const client = getClient(clientProp.id) ?? clientProp
  const profile = client.profile ?? {}
  // Recompute every render — contacts mutate often; memoizing on the array
  // reference left Title / Name / etc. stuck on stale copies.
  const mixed = listMixedDirectoryContacts(client.id)
  const [tab, setTab] = useState<TabId>('info')
  useEffect(() => {
    setTab(mixed.length > 0 ? 'contacts' : 'info')
  }, [client.id])
  const apCount = client.contacts.filter((c) => c.notify_prefs.invoice).length
  const baseCount = profile.bases?.length ?? 0

  const guide = useMemo(
    () =>
      summarizeClientRulesGuide({
        notes: client.notes,
        rules: client.rules,
        profile,
      }),
    [client.notes, client.rules, profile],
  )
  const hardCount = guide.chips.filter((c) => c.tone === 'hard').length

  function patchProfile(patch: Partial<NonNullable<ClientProfile['profile']>>) {
    updateClient(client.id, { profile: { ...profile, ...patch } })
  }

  const tabs: Array<{ id: TabId; label: string }> = [
    { id: 'info', label: 'Info' },
    { id: 'contacts', label: `Contacts (${mixed.length})` },
    { id: 'bases', label: `Bases (${baseCount})` },
    { id: 'billing', label: 'Billing' },
    {
      id: 'rules',
      label: hardCount ? `Rules guide (${hardCount})` : 'Rules guide',
    },
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
              'min-h-11 rounded-md px-3 py-2 text-sm transition-colors',
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
      {tab === 'rules' && (
        <RulesGuideTab
          client={client}
          profile={profile}
          patchProfile={patchProfile}
        />
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
          Ops email
          <input
            className={`${input} avionic`}
            value={client.email}
            onChange={(e) => updateClient(client.id, { email: e.target.value })}
            placeholder="ops@client.com"
          />
        </label>
        <label className={label}>
          Always invoice (To)
          <input
            className={`${input} avionic`}
            value={client.invoice_email}
            onChange={(e) =>
              updateClient(client.id, { invoice_email: e.target.value })
            }
            placeholder="ap@client.com"
          />
        </label>
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
            className={`${input} avionic`}
            value={formatPortalDomainList(profile.allowed_email_domains)}
            onChange={(e) => {
              const domains = parsePortalDomainList(e.target.value)
              patchProfile({
                allowed_email_domains: domains.length ? domains : undefined,
              })
            }}
            placeholder="company.com"
          />
        </label>
        <p className="text-[11px] leading-relaxed text-muted">
          Verified emails will be routed to the correct client portal. Anyone
          with an address at these domains sees this client&apos;s shipments.
          Exact contacts on file still work one-by-one even if their domain is
          not listed. Public mailboxes are never allowed.
        </p>
        {inferPortalDomainsFromOnFile(client).length > 0 ? (
          <p className="text-[11px] text-muted">
            From emails on file:{' '}
            <span className="avionic text-ink">
              {formatPortalDomainList(inferPortalDomainsFromOnFile(client))}
            </span>
          </p>
        ) : null}
        <div className="flex flex-wrap gap-3">
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
          <button
            type="button"
            className="text-xs text-gold"
            onClick={() => {
              const domains = mergePortalDomainAllowlist(client)
              patchProfile({
                allowed_email_domains: domains.length ? domains : undefined,
              })
            }}
          >
            + Sync domains from emails on file
          </button>
        </div>
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
        <p className="pt-2 text-xs text-muted">
          Aircraft / hazmat / standing trip rules live on the{' '}
          <span className="text-gold">Rules guide</span> tab.
        </p>
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
        People and distribution lists in one list. Set Invoice to{' '}
        <span className="text-gold">Always (To)</span> or{' '}
        <span className="text-gold">Sometimes (CC)</span> — Billing shows the
        bubbles. Flag <span className="text-gold">Always ETA</span> for sheet
        recipients. Base supervisor/stores DLs appear here from the Bases tab.
      </p>
      <p className="text-xs text-muted">{apCount} on invoice lists</p>

      {/* Mobile contact cards */}
      <ul className="space-y-2 sm:hidden">
        {mixed.map((c) => {
          const synthetic = c.id.startsWith('base:')
          return (
            <li
              key={c.id}
              className="space-y-2 rounded-lg border border-border bg-surface px-3 py-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
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
                {!synthetic && (
                  <button
                    type="button"
                    className="tap text-xs text-muted hover:text-late"
                    onClick={() => removeClientContact(client.id, c.id)}
                  >
                    Remove
                  </button>
                )}
              </div>
              {synthetic ? (
                <div className="text-sm text-cream">{c.name}</div>
              ) : (
                <input
                  className="w-full rounded-md border border-border bg-ink px-3 py-2.5 text-sm text-cream outline-none focus:border-gold"
                  value={c.name}
                  onChange={(e) =>
                    updateClientContact(client.id, c.id, {
                      name: e.target.value,
                    })
                  }
                  placeholder="Name"
                />
              )}
              {synthetic ? (
                <div className="font-mono text-xs text-cream">{c.email}</div>
              ) : (
                <input
                  className="w-full rounded-md border border-border bg-ink px-3 py-2.5 font-mono text-xs text-cream outline-none focus:border-gold"
                  value={c.email}
                  onChange={(e) =>
                    updateClientContact(client.id, c.id, {
                      email: e.target.value,
                    })
                  }
                  placeholder="Email"
                />
              )}
              {!synthetic && (
                <>
                  <input
                    className="w-full rounded-md border border-border bg-ink px-3 py-2.5 text-sm text-cream outline-none focus:border-gold"
                    value={c.title ?? ''}
                    placeholder="Title"
                    onChange={(e) =>
                      updateClientContact(client.id, c.id, {
                        title: e.target.value,
                      })
                    }
                  />
                  <input
                    className="w-full rounded-md border border-border bg-ink px-3 py-2.5 font-mono text-xs text-cream outline-none focus:border-gold"
                    value={c.cell}
                    placeholder="Phone"
                    onChange={(e) =>
                      updateClientContact(client.id, c.id, {
                        cell: e.target.value,
                      })
                    }
                  />
                  <div className="flex flex-wrap gap-3 text-[11px] text-cream">
                    <label className="flex min-h-11 items-center gap-2">
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
                    <InvoiceModeSelect clientId={client.id} contact={c} />
                    <label className="flex min-h-11 items-center gap-2">
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
                </>
              )}
              {synthetic && (
                <p className="text-[11px] text-muted">From Bases tab</p>
              )}
            </li>
          )
        })}
      </ul>

      <div className="hidden overflow-x-auto rounded-lg border border-border sm:block">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-border bg-surface text-xs uppercase tracking-wider text-muted">
            <tr>
              <th className="px-3 py-2">Type</th>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Email</th>
              <th className="px-3 py-2">Title</th>
              <th className="px-3 py-2">Phone</th>
              <th className="px-3 py-2">Flags</th>
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
                      <span className="text-[11px] text-muted">Base DL</span>
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
                        <InvoiceModeSelect clientId={client.id} contact={c} />
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
          Operational bases. Supervisor / stores emails autofill the ETA sheet
          when that ICAO is on the trip. Diagrams sit on each base — download
          anytime.
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

function parseEmailField(raw: string): string[] {
  return [
    ...new Set(
      raw
        .split(/[,;\s]+/)
        .map((s) => s.trim().toLowerCase())
        .filter((s) => s.includes('@')),
    ),
  ]
}

type InvoiceMode = 'off' | 'always' | 'sometimes'

function invoiceModeOf(c: ClientContact): InvoiceMode {
  if (!c.notify_prefs.invoice) return 'off'
  return isOptionalInvoiceContact(c) ? 'sometimes' : 'always'
}

function setContactInvoiceMode(
  clientId: string,
  contact: ClientContact,
  mode: InvoiceMode,
) {
  if (mode === 'off') {
    updateClientContact(clientId, contact.id, {
      notify_prefs: { invoice: false },
    })
    return
  }
  // Keep Quotes / Always ETA — do not reset prefs via role-only defaults.
  updateClientContact(clientId, contact.id, {
    ...(mode === 'always' ? { role: 'ap' as const } : {}),
    notify_prefs: {
      invoice: true,
      invoice_always: mode === 'always',
    },
  })
}

/**
 * Sync typed Always-To emails onto the client: invoice_email = first,
 * matching contacts marked always; create AP rows for unknown addresses.
 */
function applyAlwaysInvoiceEmails(client: ClientProfile, emails: string[]) {
  const uniq = parseEmailField(emails.join(','))
  updateClient(client.id, { invoice_email: uniq[0] ?? '' })
  const byEmail = new Map(
    client.contacts.map((c) => [c.email.trim().toLowerCase(), c] as const),
  )
  for (const email of uniq) {
    const hit = byEmail.get(email)
    if (hit) {
      setContactInvoiceMode(client.id, hit, 'always')
    } else {
      addClientContact(client.id, email.split('@')[0] || 'AP', email, 'ap', '', {
        notify_prefs: { invoice: true, invoice_always: true },
      })
    }
  }
  // Demote former always contacts no longer in the list (keep as sometimes if still invoice)
  for (const c of client.contacts) {
    const e = c.email.trim().toLowerCase()
    if (!isAlwaysInvoiceContact(c)) continue
    if (uniq.includes(e)) continue
    if (c.notify_prefs.invoice) {
      setContactInvoiceMode(client.id, c, 'sometimes')
    }
  }
}

function applyOptionalInvoiceEmails(client: ClientProfile, emails: string[]) {
  const uniq = parseEmailField(emails.join(','))
  const always = new Set(alwaysInvoiceEmails(client))
  const byEmail = new Map(
    client.contacts.map((c) => [c.email.trim().toLowerCase(), c] as const),
  )
  for (const email of uniq) {
    if (always.has(email)) continue
    const hit = byEmail.get(email)
    if (hit) {
      setContactInvoiceMode(client.id, hit, 'sometimes')
    } else {
      addClientContact(
        client.id,
        email.split('@')[0] || 'Contact',
        email,
        'supply_chain',
        '',
        { notify_prefs: { invoice: true, invoice_always: false } },
      )
    }
  }
  for (const c of client.contacts) {
    if (!isOptionalInvoiceContact(c)) continue
    const e = c.email.trim().toLowerCase()
    if (!uniq.includes(e)) {
      setContactInvoiceMode(client.id, c, 'off')
    }
  }
}

function InvoiceModeSelect({
  clientId,
  contact,
}: {
  clientId: string
  contact: ClientContact
}) {
  const mode = invoiceModeOf(contact)
  return (
    <label className="flex min-h-11 items-center gap-2 text-[11px] text-gold">
      Invoice
      <select
        className="rounded border border-border bg-ink px-1.5 py-1 text-cream"
        value={mode}
        onChange={(e) =>
          setContactInvoiceMode(
            clientId,
            contact,
            e.target.value as InvoiceMode,
          )
        }
      >
        <option value="off">Off</option>
        <option value="always">Always (To)</option>
        <option value="sometimes">Sometimes (CC)</option>
      </select>
    </label>
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
  const always = alwaysInvoiceEmails(client)
  const sometimes = optionalInvoiceEmails(client)
  const bubbles = invoiceSometimesBubbleContacts(client.contacts, always)
  const [alwaysDraft, setAlwaysDraft] = useState(always.join(', '))
  const [sometimesDraft, setSometimesDraft] = useState(sometimes.join(', '))
  const termsValue = payTermsSelectValue(client.pay_terms)
  const known = ['Prepay', 'Net 15', 'Net 30', 'Net 60']

  useEffect(() => {
    setAlwaysDraft(always.join(', '))
    setSometimesDraft(sometimes.join(', '))
  }, [client.id, always.join('|'), sometimes.join('|')])

  function dropBubbleIntoSometimes(email: string) {
    const next = parseEmailField(`${sometimesDraft},${email}`)
    setSometimesDraft(next.join(', '))
    applyOptionalInvoiceEmails(client, next)
  }

  return (
    <div className="grid max-w-2xl gap-4">
      <section className="space-y-3 rounded-lg border border-gold/35 bg-gold/5 p-4">
        <div>
          <h3 className="text-xs font-medium uppercase tracking-wider text-gold">
            Invoice recipients
          </h3>
          <p className="mt-1 text-xs text-muted">
            <span className="text-cream">Always</span> prefills To on every
            invoice. Everyone else is a bubble — click to drop them into
            Sometimes (CC).
          </p>
        </div>

        <label className={label}>
          Always send to (To)
          <input
            className={`${input} avionic`}
            value={alwaysDraft}
            onChange={(e) => setAlwaysDraft(e.target.value)}
            onBlur={() => applyAlwaysInvoiceEmails(client, parseEmailField(alwaysDraft))}
            placeholder="ap@client.com"
            autoComplete="off"
          />
        </label>
        {always.length > 0 ? (
          <ul className="flex flex-wrap gap-1.5">
            {always.map((email) => {
              const c = client.contacts.find(
                (x) => x.email.trim().toLowerCase() === email,
              )
              return (
                <li
                  key={email}
                  className="rounded-full border border-gold/50 bg-gold/20 px-2.5 py-1 font-mono text-[11px] text-cream"
                >
                  To · {c?.name ? `${c.name} · ${email}` : email}
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="text-xs text-muted">
            No always-To yet — type an AP address above.
          </p>
        )}

        <div>
          <div className="text-xs font-medium uppercase tracking-wider text-muted">
            Directory — click into Sometimes (CC)
          </div>
          {bubbles.length === 0 ? (
            <p className="mt-2 text-xs text-muted">
              No other contacts on file. Add people under Contacts.
            </p>
          ) : (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {bubbles.map((c) => {
                const on = isOptionalInvoiceContact(c)
                return (
                  <button
                    key={c.id}
                    type="button"
                    title={
                      on
                        ? 'Already in Sometimes — click to remove'
                        : 'Add to Sometimes (CC)'
                    }
                    onClick={() => {
                      if (on) {
                        setContactInvoiceMode(client.id, c, 'off')
                      } else {
                        dropBubbleIntoSometimes(c.email)
                      }
                    }}
                    className={[
                      'rounded-full border px-2.5 py-1 text-left text-[11px] transition-colors',
                      on
                        ? 'border-gold bg-gold/25 text-cream'
                        : 'border-border bg-ink/40 text-muted hover:border-gold/40 hover:text-cream',
                    ].join(' ')}
                  >
                    <span className="font-medium">{on ? 'CC' : '·'}</span>{' '}
                    {c.name?.trim() ? `${c.name} · ${c.email}` : c.email}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        <label className={label}>
          Sometimes (CC)
          <input
            className={`${input} avionic`}
            value={sometimesDraft}
            onChange={(e) => setSometimesDraft(e.target.value)}
            onBlur={() =>
              applyOptionalInvoiceEmails(client, parseEmailField(sometimesDraft))
            }
            placeholder="ops@client.com"
            autoComplete="off"
          />
          <span className="mt-1 block text-[11px] normal-case tracking-normal text-muted">
            Prefills CC when sending — not on every invoice unless you keep them
            here.
          </span>
        </label>
      </section>

      <section className="space-y-3 rounded-lg border border-border bg-surface p-4">
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
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
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
    </div>
  )
}

function toneClass(tone: 'attention' | 'hard' | 'ok'): string {
  if (tone === 'hard') return 'border-late/50 bg-late/10 text-late'
  if (tone === 'ok') return 'border-onplan/40 bg-onplan/10 text-onplan'
  return 'border-gold/40 bg-gold/10 text-gold'
}

function RulesGuideTab({
  client,
  profile,
  patchProfile,
}: {
  client: ClientProfile
  profile: NonNullable<ClientProfile['profile']>
  patchProfile: (p: Partial<NonNullable<ClientProfile['profile']>>) => void
}) {
  const guide = useMemo(
    () =>
      summarizeClientRulesGuide({
        notes: client.notes,
        rules: client.rules,
        profile,
      }),
    [client.notes, client.rules, profile],
  )

  const freight = normalizeMissionPolicy(
    profile.freight_policy ?? guide.freight,
  )
  const passenger = normalizeMissionPolicy(
    profile.passenger_policy ?? emptyMissionAircraftPolicy(),
  )
  const movesPax = Boolean(profile.passenger_policy) || guide.hasPassengerRules

  function setFreight(next: MissionAircraftPolicy) {
    const rules = applyFreightPolicyToRules(
      client.rules,
      next,
      client.rules.exceptions_with_permission,
    )
    updateClient(client.id, {
      rules,
      profile: { ...profile, freight_policy: next },
    })
  }

  function setPassenger(next: MissionAircraftPolicy | undefined) {
    patchProfile({ passenger_policy: next })
  }

  const otherText = client.rules.other_rules.join('\n')

  return (
    <div className="space-y-4">
      <header className="rounded-lg border border-border bg-surface p-4">
        <h3 className="text-sm font-semibold text-cream">Client rules guide</h3>
        <p className="mt-1 text-sm text-muted">
          Standing constraints desk must honor on every trip for{' '}
          <span className="text-cream">{client.name}</span>. Hard filters block
          candidates; exceptions-with-permission soft-blocks with sign-off.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {guide.chips.map((c) => (
            <span
              key={c.id}
              className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${toneClass(c.tone)}`}
            >
              {c.label}
            </span>
          ))}
        </div>
      </header>

      {guide.standingNotes.length > 0 && (
        <section className="rounded-lg border border-gold/35 bg-gold/10 p-4">
          <h4 className="text-xs font-medium uppercase tracking-wider text-gold">
            Standing notes (read first)
          </h4>
          <ul className="mt-2 space-y-2">
            {guide.standingNotes.map((n) => (
              <li key={n.slice(0, 80)} className="text-sm text-cream">
                {n}
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="space-y-3 rounded-lg border border-border bg-surface p-4">
          <h4 className="text-xs font-medium uppercase tracking-wider text-muted">
            Freight aircraft
          </h4>
          <p className="text-xs text-muted">
            Everything allowed unless checked — maps into quote hard filters.
          </p>
          <RestrictionChecksDesk policy={freight} onChange={setFreight} />
          <label className={check}>
            <input
              type="checkbox"
              checked={client.rules.freight_only}
              onChange={(e) =>
                updateClient(client.id, {
                  rules: { freight_only: e.target.checked },
                })
              }
            />
            Freight only (no passenger trips)
          </label>
        </section>

        <section className="space-y-3 rounded-lg border border-border bg-surface p-4">
          <h4 className="text-xs font-medium uppercase tracking-wider text-muted">
            Passenger aircraft
          </h4>
          <label className={check}>
            <input
              type="checkbox"
              checked={movesPax}
              onChange={(e) => {
                if (e.target.checked) {
                  setPassenger(
                    profile.passenger_policy ?? emptyMissionAircraftPolicy(),
                  )
                } else {
                  setPassenger(undefined)
                }
              }}
            />
            This client moves passengers with us
          </label>
          {movesPax ? (
            <RestrictionChecksDesk
              policy={passenger}
              onChange={(next) => setPassenger(next)}
            />
          ) : (
            <p className="text-xs text-muted">No passenger policy on file.</p>
          )}
        </section>
      </div>

      <section className="space-y-3 rounded-lg border border-border bg-surface p-4">
        <h4 className="text-xs font-medium uppercase tracking-wider text-muted">
          Other standing rules
        </h4>
        <p className="text-xs text-muted">
          One rule per line (shown with standing notes above).
        </p>
        <textarea
          className={`${input} min-h-[100px]`}
          value={otherText}
          onChange={(e) =>
            updateClient(client.id, {
              rules: {
                other_rules: e.target.value
                  .split('\n')
                  .map((s) => s.trim())
                  .filter(Boolean),
              },
            })
          }
          placeholder="e.g. Always dual pilot on overnight legs"
        />
        <label className={label}>
          Free-form client notes (also surfaced above)
          <textarea
            className={`${input} min-h-[80px]`}
            value={client.notes}
            onChange={(e) => updateClient(client.id, { notes: e.target.value })}
          />
        </label>
      </section>
    </div>
  )
}

function RestrictionChecksDesk({
  policy,
  onChange,
}: {
  policy: MissionAircraftPolicy
  onChange: (next: MissionAircraftPolicy) => void
}) {
  function set(partial: Partial<MissionAircraftPolicy>) {
    const next = { ...policy, ...partial }
    if (partial.no_single_engine === true) next.no_single_engine_pistons = false
    if (partial.no_single_engine_pistons === true) next.no_single_engine = false
    if (partial.other_restriction === false) next.other_notes = ''
    onChange(next)
  }

  return (
    <div className="flex flex-col gap-2">
      <label className={check}>
        <input
          type="checkbox"
          checked={policy.no_single_engine}
          onChange={(e) => set({ no_single_engine: e.target.checked })}
        />
        No single-engine aircraft
      </label>
      <label className={check}>
        <input
          type="checkbox"
          checked={policy.no_single_engine_pistons}
          disabled={policy.no_single_engine}
          onChange={(e) => set({ no_single_engine_pistons: e.target.checked })}
        />
        No single-engine pistons (SE turboprops OK)
      </label>
      <label className={check}>
        <input
          type="checkbox"
          checked={policy.dual_pilot_required}
          onChange={(e) => set({ dual_pilot_required: e.target.checked })}
        />
        Dual pilot required
      </label>
      <label className={check}>
        <input
          type="checkbox"
          checked={policy.other_restriction}
          onChange={(e) => set({ other_restriction: e.target.checked })}
        />
        Other restriction
      </label>
      {policy.other_restriction ? (
        <input
          className={input}
          value={policy.other_notes}
          onChange={(e) => set({ other_notes: e.target.value })}
          placeholder="Describe the restriction"
        />
      ) : null}
    </div>
  )
}
