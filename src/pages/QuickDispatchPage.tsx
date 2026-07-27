import { useMemo, useState, useSyncExternalStore } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AirportSelect } from '@/components/AirportSelect'
import {
  addClient,
  addClientContact,
  getClient,
  listClients,
  listInvoiceEmails,
  rememberEmailsOnClient,
  recordPoUsed,
  suggestNextPo,
  subscribeClients,
  type ClientProfile,
} from '@/lib/clientStore'
import { unifyAircraftType } from '@/lib/aircraftTypeCatalog'
import { createQuickDispatchTrip } from '@/lib/tripStore'
import { sendQuickDispatchEtaSheetAndPortalLinks } from '@/lib/etaSheetSender'
import {
  getReferral,
  listActiveReferrals,
  subscribeReferrals,
} from '@/lib/referralStore'
import { computeReferralShareAmount } from '@/domain/referrals'

type Leg = {
  id: string
  origin_icao: string
  dest_icao: string
  date: string
  pax: number
  repo_time: string
  live_leg_time: string
}

function newLeg(): Leg {
  return {
    id: crypto.randomUUID(),
    origin_icao: '',
    dest_icao: '',
    date: '',
    pax: 0,
    repo_time: '',
    live_leg_time: '',
  }
}

const input =
  'mt-1 w-full rounded-md border border-border bg-ink px-3 py-2.5 text-sm text-cream outline-none focus:border-gold placeholder:text-muted'
const label = 'block text-xs font-medium uppercase tracking-wider text-muted'
const seg = (on: boolean) =>
  [
    'flex-1 rounded-md px-3 py-2 text-sm font-medium',
    on ? 'bg-gold text-ink' : 'bg-surface-2 text-muted',
  ].join(' ')

function parseCc(raw: string): string[] {
  return raw
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter((s) => s.includes('@'))
}

export default function QuickDispatchPage() {
  const nav = useNavigate()
  const clients = useSyncExternalStore(subscribeClients, listClients, listClients)
  const referrers = useSyncExternalStore(
    subscribeReferrals,
    listActiveReferrals,
    listActiveReferrals,
  )

  const [clientId, setClientId] = useState('')
  const [showNew, setShowNew] = useState(false)
  const [newName, setNewName] = useState('')
  const [newInvoice, setNewInvoice] = useState('')
  const [newContactName, setNewContactName] = useState('')
  const [newContactEmail, setNewContactEmail] = useState('')

  const [po, setPo] = useState('')
  const [timing, setTiming] = useState<'asap' | 'scheduled'>('asap')
  const [roundtrip, setRoundtrip] = useState(false)
  const [cargoOnly, setCargoOnly] = useState(true)
  const [legs, setLegs] = useState<Leg[]>([newLeg()])

  const [operator, setOperator] = useState('')
  const [aircraftType, setAircraftType] = useState('')
  const [tail, setTail] = useState('')

  const [vendorCost, setVendorCost] = useState('')
  const [clientPrice, setClientPrice] = useState('')
  const [payTerms, setPayTerms] = useState('Net 30')

  const [sendInvoice, setSendInvoice] = useState(true)
  const [invoiceEmail, setInvoiceEmail] = useState('')
  const [cc, setCc] = useState('')
  const [referredById, setReferredById] = useState('')
  const [referralShareOverride, setReferralShareOverride] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const client: ClientProfile | undefined = clientId
    ? getClient(clientId)
    : undefined

  const lastPoHint = client?.last_po ?? null
  const suggestedPo = useMemo(() => suggestNextPo(lastPoHint), [lastPoHint])

  const margin = useMemo(() => {
    const v = Number(vendorCost)
    const p = Number(clientPrice)
    if (!Number.isFinite(v) || !Number.isFinite(p)) return null
    return p - v
  }, [vendorCost, clientPrice])

  const selectedReferrer = referredById ? getReferral(referredById) : undefined
  const previewShare =
    selectedReferrer && margin != null
      ? computeReferralShareAmount({
          share_mode: selectedReferrer.share_mode,
          share_value: selectedReferrer.share_value,
          margin,
          override_amount:
            referralShareOverride === ''
              ? null
              : Number(referralShareOverride),
        })
      : null

  function selectClient(id: string) {
    setClientId(id)
    const c = getClient(id)
    if (!c) return
    setPo(suggestNextPo(c.last_po))
    setPayTerms(c.pay_terms || 'Net 30')
    const invoiceTargets = listInvoiceEmails(id)
    setInvoiceEmail(invoiceTargets[0] || c.invoice_email || c.email || '')
    const trackerCc = c.contacts
      .filter((x) => x.notify_prefs.tracker && x.email)
      .map((x) => x.email)
      .filter(
        (e) =>
          !invoiceTargets.includes(e.toLowerCase()) &&
          e.toLowerCase() !== (invoiceTargets[0] || '').toLowerCase(),
      )
    setCc(trackerCc.join(', '))
  }

  function toggleCc(email: string) {
    const set = new Set(parseCc(cc))
    if (set.has(email)) set.delete(email)
    else set.add(email)
    setCc([...set].join(', '))
  }

  async function dispatchNow() {
    setError(null)
    setBusy(true)
    try {
      if (!client) {
        setError('Select or create a client')
        return
      }
      for (const [i, leg] of legs.entries()) {
        if (!leg.origin_icao.trim() || !leg.dest_icao.trim()) {
          setError(`Leg ${i + 1}: origin and destination ICAO required`)
          return
        }
        if (timing === 'scheduled' && !leg.date) {
          setError(`Leg ${i + 1}: date required for scheduled`)
          return
        }
      }
      if (!operator.trim() || !tail.trim()) {
        setError('Operator and tail required')
        return
      }

      const poFinal = po.trim() || suggestedPo
      const ccList = parseCc(cc)
      rememberEmailsOnClient(client.id, invoiceEmail, ccList)
      recordPoUsed(client.id, poFinal)

      const trip = createQuickDispatchTrip({
        client_id: client.id,
        client_name: client.name,
        po: poFinal,
        timing,
        roundtrip,
        cargo_only: cargoOnly,
        operator_name: operator.trim(),
        aircraft_type: unifyAircraftType(aircraftType) || aircraftType.trim(),
        tail: tail.trim().toUpperCase(),
        vendor_cost: Number(vendorCost) || 0,
        client_price: Number(clientPrice) || 0,
        pay_terms: payTerms,
        invoice_email: invoiceEmail.trim(),
        cc_emails: ccList,
        send_invoice: sendInvoice,
        referred_by: selectedReferrer?.name ?? '',
        referral_id: selectedReferrer?.id ?? null,
        referral_share_amount:
          referralShareOverride === ''
            ? null
            : Number(referralShareOverride) || 0,
        notes: notes.trim(),
        legs: legs.map((l) => ({
          origin_icao: l.origin_icao.trim().toUpperCase(),
          dest_icao: l.dest_icao.trim().toUpperCase(),
          date: l.date,
          pax: cargoOnly ? 0 : l.pax,
          repo_time: l.repo_time.trim(),
          live_leg_time: l.live_leg_time.trim(),
        })),
      })

      // Manifest + checkpoint timers + ETA/track links (system of record path)
      const { runOnBookedAutomations } = await import('@/lib/onBooked')
      await runOnBookedAutomations(trip.id)

      // QD also fans ETA to explicit CC list (onBooked uses client tracker emails)
      const { listTrackerEmails } = await import('@/lib/clientStore')
      const trackerFromClient = listTrackerEmails(client.id)
      const recipients = [...trackerFromClient, ...ccList]
      const already = new Set(trackerFromClient.map((e) => e.toLowerCase()))
      const extra = recipients.filter(
        (r) => r.trim().includes('@') && !already.has(r.trim().toLowerCase()),
      )
      if (extra.length) {
        await sendQuickDispatchEtaSheetAndPortalLinks({ trip, recipients: extra })
      }

      nav(`/trips/${trip.id}`)
    } finally {
      setBusy(false)
    }
  }

  const selectedCc = new Set(parseCc(cc))

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-5 p-4 pb-28 sm:p-6">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-cream">Quick Dispatch</h1>
          <p className="mt-1 text-sm text-muted">
            Skip the full workflow. Enter trip details, pricing, and go straight
            to tracking.
          </p>
        </div>
        <Link
          to="/dispatch"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-border text-muted hover:text-cream"
          aria-label="Close"
        >
          ✕
        </Link>
      </header>

      {/* Client */}
      <section className="space-y-2">
        <div className="text-xs font-medium uppercase tracking-wider text-muted">
          Trip info
        </div>
        <div className="flex items-end gap-2">
          <label className={`${label} flex-1`}>
            Client *
            <select
              value={clientId}
              onChange={(e) => selectClient(e.target.value)}
              className={input}
            >
              <option value="">Select client…</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => setShowNew((v) => !v)}
            className="rounded-md border border-border px-3 py-2.5 text-sm text-gold"
          >
            + New
          </button>
        </div>
        {showNew && (
          <div className="space-y-2 rounded-lg border border-border bg-surface p-3">
            <input
              className={input}
              placeholder="Client name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
            <input
              className={input}
              type="email"
              placeholder="Invoice email"
              value={newInvoice}
              onChange={(e) => setNewInvoice(e.target.value)}
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                className={input}
                placeholder="Contact name (optional)"
                value={newContactName}
                onChange={(e) => setNewContactName(e.target.value)}
              />
              <input
                className={input}
                type="email"
                placeholder="Contact email"
                value={newContactEmail}
                onChange={(e) => setNewContactEmail(e.target.value)}
              />
            </div>
            <button
              type="button"
              className="w-full rounded-md bg-gold py-2 text-sm font-medium text-ink"
              onClick={() => {
                if (!newName.trim()) return
                const c = addClient({
                  name: newName,
                  email: newInvoice,
                  invoice_email: newInvoice,
                })
                const contactEmail = newContactEmail.trim()
                const invEmail = newInvoice.trim()
                if (contactEmail) {
                  addClientContact(
                    c.id,
                    newContactName || contactEmail.split('@')[0] || 'Contact',
                    contactEmail,
                    'requester',
                  )
                }
                if (
                  invEmail &&
                  invEmail.toLowerCase() !== contactEmail.toLowerCase()
                ) {
                  addClientContact(
                    c.id,
                    invEmail.split('@')[0] || 'AP',
                    invEmail,
                    'ap',
                  )
                }
                selectClient(c.id)
                setShowNew(false)
                setNewName('')
                setNewInvoice('')
                setNewContactName('')
                setNewContactEmail('')
              }}
            >
              Save client
            </button>
          </div>
        )}

        <label className={label}>
          PO / Trip #
          <div className="mt-1 flex overflow-hidden rounded-md border border-border">
            <span className="flex items-center bg-surface-2 px-3 text-xs text-muted">
              PO #
            </span>
            <input
              value={po}
              onChange={(e) => setPo(e.target.value)}
              placeholder={suggestedPo}
              className="min-w-0 flex-1 bg-ink px-3 py-2.5 text-sm text-cream outline-none focus:border-gold"
            />
          </div>
          {client && (
            <span className="mt-1 block text-[11px] text-muted">
              {lastPoHint
                ? `Last used ${lastPoHint} · suggesting ${suggestedPo}`
                : `No prior PO — suggesting ${suggestedPo}`}
            </span>
          )}
        </label>

        <div className="flex rounded-lg border border-border bg-surface-2 p-0.5">
          <button
            type="button"
            className={seg(timing === 'asap')}
            onClick={() => setTiming('asap')}
          >
            ASAP
          </button>
          <button
            type="button"
            className={seg(timing === 'scheduled')}
            onClick={() => setTiming('scheduled')}
          >
            Scheduled
          </button>
        </div>

        <div className="flex flex-wrap gap-4 text-sm text-cream">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={roundtrip}
              onChange={(e) => setRoundtrip(e.target.checked)}
            />
            Roundtrip
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={cargoOnly}
              onChange={(e) => setCargoOnly(e.target.checked)}
            />
            Cargo Only
          </label>
        </div>
      </section>

      {/* Legs */}
      <section className="space-y-3">
        {legs.map((leg, idx) => (
          <div
            key={leg.id}
            className="rounded-lg border border-border bg-surface p-3"
          >
            <div className="mb-2 flex items-center justify-between">
              <div className="text-sm font-semibold text-cream">Leg {idx + 1}</div>
              {legs.length > 1 && (
                <button
                  type="button"
                  className="text-xs text-muted hover:text-late"
                  onClick={() =>
                    setLegs((xs) => xs.filter((l) => l.id !== leg.id))
                  }
                >
                  Remove
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <AirportSelect
                label="Origin"
                value={leg.origin_icao}
                required
                onChange={(icao) =>
                  setLegs((xs) =>
                    xs.map((l) =>
                      l.id === leg.id ? { ...l, origin_icao: icao } : l,
                    ),
                  )
                }
              />
              <AirportSelect
                label="Destination"
                value={leg.dest_icao}
                required
                onChange={(icao) =>
                  setLegs((xs) =>
                    xs.map((l) =>
                      l.id === leg.id ? { ...l, dest_icao: icao } : l,
                    ),
                  )
                }
              />
              {timing === 'scheduled' && (
                <label className={label}>
                  Date
                  <input
                    type="date"
                    className={input}
                    value={leg.date}
                    onChange={(e) =>
                      setLegs((xs) =>
                        xs.map((l) =>
                          l.id === leg.id ? { ...l, date: e.target.value } : l,
                        ),
                      )
                    }
                  />
                </label>
              )}
              {!cargoOnly && (
                <label className={label}>
                  PAX
                  <input
                    type="number"
                    min={0}
                    className={input}
                    value={leg.pax}
                    onChange={(e) =>
                      setLegs((xs) =>
                        xs.map((l) =>
                          l.id === leg.id
                            ? { ...l, pax: Number(e.target.value) || 0 }
                            : l,
                        ),
                      )
                    }
                  />
                </label>
              )}
              <label className={label}>
                Repo time
                <input
                  className={input}
                  value={leg.repo_time}
                  onChange={(e) =>
                    setLegs((xs) =>
                      xs.map((l) =>
                        l.id === leg.id
                          ? { ...l, repo_time: e.target.value }
                          : l,
                      ),
                    )
                  }
                  placeholder="e.g. 1h 30m"
                />
              </label>
              <label className={label}>
                Live leg time
                <input
                  className={input}
                  value={leg.live_leg_time}
                  onChange={(e) =>
                    setLegs((xs) =>
                      xs.map((l) =>
                        l.id === leg.id
                          ? { ...l, live_leg_time: e.target.value }
                          : l,
                      ),
                    )
                  }
                  placeholder="e.g. 2h 15m"
                />
              </label>
            </div>
          </div>
        ))}
        <button
          type="button"
          className="text-sm font-medium text-gold"
          onClick={() =>
            setLegs((xs) => [
              ...xs,
              {
                ...newLeg(),
                origin_icao: xs[xs.length - 1]?.dest_icao ?? '',
              },
            ])
          }
        >
          + Add Leg
        </button>
      </section>

      {/* Operator */}
      <section className="space-y-2">
        <div className="text-xs font-medium uppercase tracking-wider text-muted">
          Operator &amp; aircraft
        </div>
        <label className={label}>
          Operator / Vendor
          <input
            className={input}
            value={operator}
            onChange={(e) => setOperator(e.target.value)}
            placeholder="Search operator name…"
          />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className={label}>
            Aircraft type
            <input
              className={input}
              value={aircraftType}
              onChange={(e) => setAircraftType(e.target.value)}
              placeholder="e.g. C310, KA200"
            />
          </label>
          <label className={label}>
            Tail number
            <input
              className={`${input} avionic uppercase`}
              value={tail}
              onChange={(e) => setTail(e.target.value.toUpperCase())}
              placeholder="N12345"
            />
          </label>
        </div>
      </section>

      {/* Pricing */}
      <section className="space-y-2">
        <div className="text-xs font-medium uppercase tracking-wider text-muted">
          Pricing &amp; invoice
        </div>
        <div className="grid grid-cols-3 gap-2">
          <label className={label}>
            Vendor cost ($)
            <input
              type="number"
              min={0}
              step="0.01"
              className={input}
              value={vendorCost}
              onChange={(e) => setVendorCost(e.target.value)}
              placeholder="0.00"
            />
          </label>
          <label className={label}>
            Client price ($)
            <input
              type="number"
              min={0}
              step="0.01"
              className={input}
              value={clientPrice}
              onChange={(e) => setClientPrice(e.target.value)}
              placeholder="0.00"
            />
          </label>
          <label className={label}>
            Margin
            <div className="mt-1 rounded-md border border-border bg-surface-2 px-3 py-2.5 avionic text-sm text-cream">
              {margin == null
                ? '—'
                : `$${margin.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
            </div>
          </label>
        </div>
        <label className={label}>
          Pay terms
          <input
            className={input}
            value={payTerms}
            onChange={(e) => setPayTerms(e.target.value)}
          />
        </label>
      </section>

      {/* Invoice email */}
      <section className="space-y-2">
        <div className="text-xs font-medium uppercase tracking-wider text-muted">
          Invoice email
        </div>
        <label className="flex items-center gap-2 text-sm text-cream">
          <input
            type="checkbox"
            checked={sendInvoice}
            onChange={(e) => setSendInvoice(e.target.checked)}
          />
          Send invoice email to client
        </label>
        <label className={label}>
          Invoice To (email)
          <input
            type="email"
            className={input}
            value={invoiceEmail}
            onChange={(e) => setInvoiceEmail(e.target.value)}
            placeholder="client@company.com"
          />
          {client && (
            <span className="mt-1 block text-[11px] text-muted">
              Auto-filled from client profile. Edits save on dispatch.
            </span>
          )}
        </label>

        {client && client.contacts.length > 0 && (
          <div>
            <div className="mb-2 text-xs text-muted">Saved contacts — click to CC</div>
            <div className="flex flex-wrap gap-1.5">
              {client.contacts.map((c) => {
                const on = selectedCc.has(c.email)
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => toggleCc(c.email)}
                    className={[
                      'rounded-full border px-2.5 py-1 text-left text-[11px] transition-colors',
                      on
                        ? 'border-gold bg-gold/20 text-cream'
                        : 'border-border bg-surface-2 text-muted hover:text-cream',
                    ].join(' ')}
                  >
                    {c.name} &lt;{c.email}&gt;
                  </button>
                )
              })}
            </div>
          </div>
        )}

        <label className={label}>
          CC (comma-separated)
          <input
            className={input}
            value={cc}
            onChange={(e) => setCc(e.target.value)}
            placeholder="ops@client.com, ap@client.com"
          />
          <span className="mt-1 block text-[11px] text-muted">
            Type any email — new addresses are saved to the client profile on
            dispatch.
          </span>
        </label>
      </section>

      <section className="space-y-2">
        <div className="text-xs font-medium uppercase tracking-wider text-muted">
          Referral / profit share
        </div>
        <label className={label}>
          Referred by
          <select
            className={input}
            value={referredById}
            onChange={(e) => {
              setReferredById(e.target.value)
              setReferralShareOverride('')
            }}
          >
            <option value="">None — no referral</option>
            {referrers.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
                {r.share_mode === 'percent_margin'
                  ? ` (${r.share_value}% margin)`
                  : r.share_value
                    ? ` ($${r.share_value})`
                    : ''}
              </option>
            ))}
          </select>
          <span className="mt-1 block text-[11px] text-muted">
            Manage partners on{' '}
            <Link to="/referrals" className="text-gold">
              Referrals
            </Link>
            .
          </span>
        </label>
        {selectedReferrer && (
          <label className={label}>
            Share amount ($)
            <input
              type="number"
              className={`${input} avionic`}
              value={referralShareOverride}
              onChange={(e) => setReferralShareOverride(e.target.value)}
              placeholder={
                previewShare != null
                  ? `Default ${previewShare.toFixed(0)}`
                  : 'Optional override'
              }
            />
            {previewShare != null && referralShareOverride === '' && (
              <span className="mt-1 block text-[11px] text-gold">
                Will record {previewShare.toLocaleString(undefined, {
                  style: 'currency',
                  currency: 'USD',
                  maximumFractionDigits: 0,
                })}{' '}
                on Financials
              </span>
            )}
          </label>
        )}
        <label className={label}>
          Notes
          <textarea
            className={input}
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Any additional info…"
          />
        </label>
      </section>

      {error && (
        <p className="rounded-md border border-late/40 bg-late/10 px-3 py-2 text-sm text-late">
          {error}
        </p>
      )}

      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-border bg-ink/95 px-4 pt-3 safe-bottom backdrop-blur sm:static sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none">
        <button
          type="button"
          onClick={() => void dispatchNow()}
          disabled={busy}
          className="mx-auto flex w-full max-w-lg min-h-12 items-center justify-center gap-2 rounded-md bg-gold py-3.5 text-sm font-semibold text-ink hover:bg-gold-lt disabled:opacity-60"
        >
          Dispatch Now
        </button>
      </div>
    </div>
  )
}
