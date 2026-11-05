/**
 * Logged-in portal desktop shell (≥900px) — doc 04 + 04b.
 * MapBackdrop + glass chrome; presentation only over existing portal APIs.
 */

import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react'
import { Link } from 'react-router-dom'
import { MapBackdrop } from '@/components/MapBackdrop'
import { PortalRequestReceived } from '@/components/PortalRequestReceived'
import portalMapData from '@/data/portalMapData.json'
import {
  BRAND_LOGO_PATH,
  BRAND_PHONE,
  BRAND_PHONE_E164,
  dialBrandOps,
} from '@/domain/brand'
import {
  projectLonLat,
  type MapAirport,
  type MapProjection,
} from '@/domain/portalMap'
import {
  buildPortalDesktopTrip,
  buildPortalDesktopTripFromRequest,
} from '@/domain/portalDesktopBuild'
import {
  collectPortalDesktopDocs,
  formatPortalAirportField,
  formatPortalAirportResolved,
  portalDesktopBucket,
  portalDesktopCta,
  portalDesktopStatusMeta,
  portalDesktopTripSummary,
  resolveAirportText,
  resolveSoftQuoteMapPick,
  type PortalDesktopBucket,
  type PortalDesktopTrip,
} from '@/domain/portalDesktopTrips'
import { lookupAirport } from '@/domain/airports'
import {
  PORTAL_SOFT_QUOTE_FINE_PRINT,
  softQuoteFor,
  softQuoteHardNotes,
  softQuotePointLabel,
  type SoftQuotePoint,
} from '@/domain/portalSoftQuote'
import { quoteHint } from '@/domain/portalMap'
import { emptyTripRequestDraft } from '@/domain/tripRequest'
import type { ClientProfile } from '@/lib/clientStore'
import { updateClient } from '@/lib/clientStore'
import { portalTrackingUrlForTrip } from '@/lib/etaSheetSender'
import {
  requestHardQuote,
  submitTripRequest,
} from '@/lib/requestStore'
import { getTrip } from '@/lib/tripStore'
import {
  buildPortalTrackingView,
  tripToTrackingInput,
  type PortalShipmentPhase,
} from '@/domain/portalTracking'

export type PortalDesktopShipmentIn = {
  id: string
  ref: number
  state: string
  lane: string
  ready_label: string
  payload_summary: string
  trackHref: string
  nextLabel: string | null
  phase: PortalShipmentPhase
  requestedAt?: string | null
  poNumber?: string | null
  code?: string | null
}

export type PortalDesktopPendingIn = {
  id: string
  ref: number
  lane: string
  statusLabel: string
  summary: string
  href: string
  at?: string | null
  hardQuote?: boolean
}

export type PortalDesktopPanel =
  | 'trips'
  | 'request'
  | 'quote'
  | 'docs'
  | 'account'

type QuotePick = SoftQuotePoint & { label?: string }

const mapProjection = portalMapData.us_map.projection as MapProjection
const mapAirports = portalMapData.airports as MapAirport[]
const mapAirportByIcao = new Map(mapAirports.map((a) => [a.icao, a]))

function toMapAirport(ap: {
  icao: string
  city: string
  lat: number
  lon: number
}): MapAirport {
  const hub = mapAirportByIcao.get(ap.icao)
  if (hub) return hub
  const pt = projectLonLat(ap.lon, ap.lat, mapProjection)
  return {
    icao: ap.icao,
    city: ap.city,
    lat: ap.lat,
    lon: ap.lon,
    x: pt.x,
    y: pt.y,
  }
}

function toMapPoint(p: QuotePick): {
  x: number
  y: number
  lat: number
  lon: number
  label: string
  icao?: string
} {
  if (p.code) {
    const hub = mapAirportByIcao.get(p.code)
    if (hub) {
      return {
        x: hub.x,
        y: hub.y,
        lat: hub.lat,
        lon: hub.lon,
        label: p.code,
        icao: p.code,
      }
    }
  }
  const pt = projectLonLat(p.lon, p.lat, mapProjection)
  return {
    x: pt.x,
    y: pt.y,
    lat: p.lat,
    lon: p.lon,
    label: p.code || softQuotePointLabel(p),
    icao: p.code ?? undefined,
  }
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

function usePortalClocks() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 30_000)
    return () => window.clearInterval(id)
  }, [])
  return {
    local: `${pad2(now.getHours())}:${pad2(now.getMinutes())}`,
    utc: `${pad2(now.getUTCHours())}:${pad2(now.getUTCMinutes())}Z`,
  }
}

function addressLine(client: ClientProfile | null | undefined): string {
  const a = client?.profile.address
  if (!a) return ''
  const parts = [a.street, a.city, a.state, a.zip].filter(Boolean)
  return parts.join(', ')
}

function RailIcon({ id }: { id: PortalDesktopPanel }) {
  const common = {
    width: 20,
    height: 20,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.7,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  }
  if (id === 'trips') {
    return (
      <svg {...common}>
        <path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z" />
      </svg>
    )
  }
  if (id === 'request') {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 8v8M8 12h8" />
      </svg>
    )
  }
  if (id === 'quote') {
    return (
      <svg {...common}>
        <circle cx="5" cy="18" r="2.5" />
        <circle cx="19" cy="6" r="2.5" />
        <path d="M7 16.5C10 12 14 12 17 7.5" strokeDasharray="2.5 2.5" />
      </svg>
    )
  }
  if (id === 'docs') {
    return (
      <svg {...common}>
        <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
        <path d="M14 3v5h5M9 13h6M9 17h6" />
      </svg>
    )
  }
  return (
    <svg {...common}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4 3.6-7 8-7s8 3 8 7" />
    </svg>
  )
}

function Seg({
  options,
  value,
  onChange,
}: {
  options: Array<{ id: string; label: ReactNode }>
  value: string
  onChange: (id: string) => void
}) {
  return (
    <div className="g-seg" style={{ marginTop: 12 }}>
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          className={value === o.id ? 'is-on' : undefined}
          onClick={() => onChange(o.id)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function PortalDesktopApp(props: {
  email: string
  client: ClientProfile | null | undefined
  shipments: PortalDesktopShipmentIn[]
  pending: PortalDesktopPendingIn[]
  onSignOut: () => void
  onSwitchCompany: () => void
}) {
  const clocks = usePortalClocks()
  const [panel, setPanel] = useState<PortalDesktopPanel>('trips')
  const [tab, setTab] = useState<PortalDesktopBucket>('live')
  const [sel, setSel] = useState<string | null>(null)
  const [qa, setQa] = useState<QuotePick | null>(null)
  const [qb, setQb] = useState<QuotePick | null>(null)
  const [qaText, setQaText] = useState('')
  const [qbText, setQbText] = useState('')
  const [fromText, setFromText] = useState('')
  const [toText, setToText] = useState('')
  const [moving, setMoving] = useState<'cargo' | 'pax'>('cargo')
  const [loadText, setLoadText] = useState('')
  const [poText, setPoText] = useState('')
  const [pickup, setPickup] = useState(false)
  const [deliver, setDeliver] = useState(false)
  const [courierAddr, setCourierAddr] = useState('')
  const [need, setNeed] = useState<'asap' | 'today' | 'tomorrow'>('asap')
  const [notes, setNotes] = useState('')
  const [sent, setSent] = useState(false)
  const [sentTrip, setSentTrip] = useState<PortalDesktopTrip | null>(null)
  const [sentAt, setSentAt] = useState<Date | null>(null)
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const [approveGap, setApproveGap] = useState<string | null>(null)
  const [acctName, setAcctName] = useState(props.client?.name ?? '')
  const [acctDesk, setAcctDesk] = useState(
    props.client?.profile.front_desk_phone ?? '',
  )
  const [acctOps, setAcctOps] = useState(
    props.client?.profile.ops_callback_phone ?? '',
  )
  const [acctInv, setAcctInv] = useState(
    props.client?.invoice_email || props.client?.email || '',
  )
  const [acctAddr, setAcctAddr] = useState(addressLine(props.client))
  const [smsOn, setSmsOn] = useState(true)
  const [emailOn, setEmailOn] = useState(true)
  const [acctSaved, setAcctSaved] = useState(false)
  const [acctError, setAcctError] = useState<string | null>(null)

  useEffect(() => {
    setAcctName(props.client?.name ?? '')
    setAcctDesk(props.client?.profile.front_desk_phone ?? '')
    setAcctOps(props.client?.profile.ops_callback_phone ?? '')
    setAcctInv(props.client?.invoice_email || props.client?.email || '')
    setAcctAddr(addressLine(props.client))
  }, [props.client])

  const trips: PortalDesktopTrip[] = useMemo(() => {
    const byId = new Map<string, PortalDesktopTrip>()

    for (const s of props.shipments) {
      const trip = getTrip(s.id)
      const view = trip
        ? buildPortalTrackingView(tripToTrackingInput(trip))
        : null
      const facts = view?.flightFacts
      const aircraftPos = view?.aircraft
      const progress =
        aircraftPos?.progressPct != null &&
        Number.isFinite(aircraftPos.progressPct)
          ? Math.min(1, Math.max(0, aircraftPos.progressPct / 100))
          : aircraftPos?.phase === 'airborne'
            ? 0.55
            : null
      const tele =
        aircraftPos?.summary && aircraftPos.phase === 'airborne'
          ? aircraftPos.summary
          : null
      const docs = trip?.documents ?? []
      const built = buildPortalDesktopTrip({
        id: s.id,
        ref: s.ref,
        code: s.code ?? trip?.code,
        state: s.state,
        lane: s.lane,
        payload_summary: s.payload_summary,
        ready_label: s.ready_label,
        po_number: s.poNumber ?? trip?.po_number,
        phase: s.phase,
        tail: view?.tail ?? trip?.quick?.tail,
        aircraft_type: view?.aircraftType ?? trip?.quick?.aircraft_type,
        pickup_street: view?.pickupStreet ?? trip?.portal_pickup_address,
        dropoff_street: view?.dropoffStreet ?? trip?.portal_dropoff_address,
        service_pattern: trip?.service_pattern ?? null,
        hard_quote_sent: Boolean(trip?.hard_quote?.sent_at || trip?.hard_quote),
        hard_quote_accepted:
          trip?.hard_quote?.client_decision === 'accepted' ||
          s.state === 'booked',
        accept_token: trip?.hard_quote?.accept_token ?? null,
        trackHref: s.trackHref,
        originIcao: facts?.originIcao ?? null,
        destIcao: facts?.destIcao ?? null,
        originLat: aircraftPos?.fromLat ?? null,
        originLon: aircraftPos?.fromLon ?? null,
        destLat: aircraftPos?.toLat ?? null,
        destLon: aircraftPos?.toLon ?? null,
        progress: progress ?? null,
        telemetry: tele,
        lastEvent: facts?.wheelsUpDisplay
          ? `WHEELS UP ${facts.wheelsUpDisplay}`
          : null,
        nextEvent: s.nextLabel,
        updated_at: s.requestedAt ?? trip?.events?.[0]?.at ?? null,
        hasQuoteDoc:
          Boolean(trip?.hard_quote) || docs.some((d) => d.kind === 'quote'),
        hasInvoiceDoc:
          Boolean(trip?.invoice?.url) ||
          docs.some(
            (d) => d.kind === 'other' && /invoice/i.test(d.title),
          ),
        hasPodDoc: docs.some((d) => d.kind === 'pod'),
      })
      if (s.nextLabel) built.nextEvent = s.nextLabel.toUpperCase()
      byId.set(s.id, built)
    }

    for (const p of props.pending) {
      if (byId.has(p.id)) continue
      byId.set(
        p.id,
        buildPortalDesktopTripFromRequest({
          id: p.id,
          ref: p.ref,
          lane: p.lane,
          summary: p.summary,
          hardQuote: Boolean(p.hardQuote) || /quote/i.test(p.statusLabel),
          created_at: p.at || new Date().toISOString(),
          href: p.href,
        }),
      )
    }

    if (sentTrip && !byId.has(sentTrip.id)) byId.set(sentTrip.id, sentTrip)

    return [...byId.values()]
  }, [props.shipments, props.pending, sentTrip])

  const counts = useMemo(() => {
    const c = { live: 0, pending: 0, history: 0 }
    for (const t of trips) c[portalDesktopBucket(t.status)]++
    return c
  }, [trips])

  const rows = useMemo(
    () => trips.filter((t) => portalDesktopBucket(t.status) === tab),
    [trips, tab],
  )

  const selected = useMemo(
    () => trips.find((t) => t.id === sel) ?? null,
    [trips, sel],
  )

  const docs = useMemo(() => collectPortalDesktopDocs(trips), [trips])

  const soft =
    qa && qb
      ? softQuoteFor(qa, qb)
      : null

  const fromAp = resolveAirportText(fromText)
  const toAp = resolveAirportText(toText)

  const ambientOpacity = selected || qa ? 0.35 : 1
  const hud = quoteHint({ a: qa, b: qb })

  function clearQuote() {
    setQa(null)
    setQb(null)
    setQaText('')
    setQbText('')
  }

  function goPanel(next: PortalDesktopPanel) {
    setPanel(next)
    if (next === 'request') setSent(false)
    setApproveGap(null)
  }

  function pickTrip(id: string) {
    setSel(id)
    clearQuote()
  }

  function onMapClick(p: { lat: number; lon: number; icao?: string }) {
    const pick = resolveSoftQuoteMapPick(p)
    const point: QuotePick = {
      lat: pick.lat,
      lon: pick.lon,
      code: pick.code ?? null,
      city: pick.city ?? null,
      label: pick.label,
    }
    const field = pick.code
      ? formatPortalAirportField({
          icao: pick.code,
          city: pick.city ?? '',
          name: pick.name ?? undefined,
          lat: pick.lat,
          lon: pick.lon,
        })
      : pick.label
    if (!qa || qb) {
      setQa(point)
      setQb(null)
      setQaText(field)
      setQbText('')
      setSel(null)
      setFromText(field)
      setToText('')
    } else {
      setQb(point)
      setQbText(field)
      setSel(null)
      setToText(field)
    }
  }

  function quoteToDesk() {
    if (!qa || !qb) return
    setPanel('request')
    setSent(false)
    setFromText(
      qa.code
        ? formatPortalAirportField({
            icao: qa.code,
            city: qa.city ?? '',
            lat: qa.lat,
            lon: qa.lon,
          })
        : softQuotePointLabel(qa),
    )
    setToText(
      qb.code
        ? formatPortalAirportField({
            icao: qb.code,
            city: qb.city ?? '',
            lat: qb.lat,
            lon: qb.lon,
          })
        : softQuotePointLabel(qb),
    )
    setNotes(softQuoteHardNotes(qa, qb))
  }

  function bookAgain(t: PortalDesktopTrip) {
    setPanel('request')
    setSent(false)
    setFromText(t.from.icao)
    setToText(t.to.icao)
    setMoving(/passenger/i.test(t.load) ? 'pax' : 'cargo')
    setNotes(`Repeat of ${t.displayId}${t.po ? ` (PO ${t.po})` : ''}`)
    setLoadText(t.load)
    setPoText(t.po && t.po !== '—' ? t.po : '')
  }

  async function sendRequest() {
    setSending(true)
    setSendError(null)
    try {
      const origin = fromAp?.icao || fromText.trim().toUpperCase() || 'TBD'
      const dest = toAp?.icao || toText.trim().toUpperCase() || 'TBD'
      const draft = emptyTripRequestDraft()
      draft.email = props.email
      draft.client_id = props.client?.id ?? null
      draft.client_name = props.client?.name ?? (acctName || null)
      draft.urgent_phone = acctOps || acctDesk || ''
      draft.cargo_only = moving === 'cargo'
      draft.timing = need === 'asap' ? 'asap' : 'scheduled'
      draft.service_mode = pickup || deliver ? 'd2d' : 'a2a'
      draft.po_number = poText.trim()
      draft.notes = [
        notes.trim(),
        loadText.trim() ? `Load: ${loadText.trim()}` : '',
        need !== 'asap' ? `Need: ${need}` : '',
        courierAddr.trim() ? `Courier address: ${courierAddr.trim()}` : '',
      ]
        .filter(Boolean)
        .join('\n')
      draft.legs = [
        {
          ...draft.legs[0]!,
          origin_icao: origin,
          dest_icao: dest,
          pickup_address: pickup ? courierAddr : '',
          dropoff_address: deliver ? courierAddr : '',
          pickup_tbd: pickup && !courierAddr.trim(),
          dropoff_tbd: deliver && !courierAddr.trim(),
          payload: moving === 'cargo' ? 'cargo' : 'pax',
          cargo_notes: moving === 'cargo' ? loadText : '',
          cargo_dims_status: 'not_yet',
        },
      ]
      if (moving === 'pax') {
        const n = Number.parseInt(loadText, 10)
        draft.pax_details_deferred = true
        draft.pax = Array.from({ length: Number.isFinite(n) && n > 0 ? n : 1 }, () => ({
          name: '',
          weight_lbs: '',
          dob: '',
        }))
      }

      // Hard-quote path rings desk phones (requestHardQuote → RingOut).
      const row = submitTripRequest(draft, 'portal', { alert: 'none' })
      await requestHardQuote(row.id)

      const card = buildPortalDesktopTripFromRequest({
        id: row.id,
        ref: row.ref,
        lane: row.lane,
        summary: row.summary,
        hardQuote: true,
        created_at: row.created_at,
        href: `/portal/request?requestId=${row.id}&mode=book`,
      })
      setSentTrip(card)
      setSel(card.id)
      setSentAt(new Date())
      setSent(true)
      const a = lookupAirport(card.from.icao)
      const b = lookupAirport(card.to.icao)
      if (a) {
        setQa({
          lat: a.lat,
          lon: a.lon,
          code: a.icao,
          city: a.state ? `${a.city}, ${a.state}` : a.city,
          label: a.icao,
        })
      }
      if (b) {
        setQb({
          lat: b.lat,
          lon: b.lon,
          code: b.icao,
          city: b.state ? `${b.city}, ${b.state}` : b.city,
          label: b.icao,
        })
      }
    } catch (e) {
      setSendError(e instanceof Error ? e.message : 'Could not send request')
    } finally {
      setSending(false)
    }
  }

  function onApprove(t: PortalDesktopTrip) {
    if (t.acceptHref) {
      window.location.assign(t.acceptHref)
      return
    }
    setApproveGap(
      'No portal approve endpoint on this trip yet — open the accept link from your quote email, or ask the desk to resend the hard quote.',
    )
  }

  function onShare(t: PortalDesktopTrip) {
    try {
      const href =
        t.trackHref ||
        (getTrip(t.id) ? portalTrackingUrlForTrip(t.id, props.email) : null)
      if (!href) return
      const absolute = href.startsWith('http')
        ? href
        : `${window.location.origin}${href}`
      void navigator.clipboard?.writeText(absolute)
    } catch {
      /* ignore */
    }
  }

  function saveAccount(e: FormEvent) {
    e.preventDefault()
    setAcctError(null)
    setAcctSaved(false)
    if (!props.client) {
      setAcctError('No company profile linked to this email yet.')
      return
    }
    const name = acctName.trim()
    if (!name) {
      setAcctError('Company name is required.')
      return
    }
    const street = acctAddr.trim()
    const updated = updateClient(props.client.id, {
      name,
      invoice_email: acctInv.trim(),
      profile: {
        ...props.client.profile,
        front_desk_phone: acctDesk.trim(),
        ops_callback_phone: acctOps.trim(),
        address: street
          ? {
              street,
              city: props.client.profile.address?.city ?? '',
              state: props.client.profile.address?.state ?? '',
              zip: props.client.profile.address?.zip ?? '',
            }
          : props.client.profile.address,
        update_channel: smsOn && emailOn ? 'both' : smsOn ? 'sms' : 'email',
      },
    })
    if (!updated) {
      setAcctError('Could not save — try again.')
      return
    }
    setAcctSaved(true)
  }

  const selectedRoute =
    selected &&
    Number.isFinite(selected.from.lat) &&
    Number.isFinite(selected.to.lat)
      ? {
          from: toMapAirport(selected.from),
          to: toMapAirport(selected.to),
          progress:
            selected.status === 'live'
              ? selected.progress
              : selected.status === 'done'
                ? 1
                : undefined,
          telemetry:
            selected.status === 'live'
              ? selected.telemetry ?? undefined
              : undefined,
        }
      : undefined

  const quotePoints = qa
    ? {
        a: toMapPoint(qa),
        b: qb ? toMapPoint(qb) : undefined,
        nm: soft?.nm,
      }
    : undefined

  const companyName = props.client?.name?.trim() || 'Your company'

  return (
    <div className="ofa-portal-desk ofa-glass" data-theme="client">
      <div className="ofa-map-host">
        <MapBackdrop
          mode="interactive"
          viewBox="0 0 1440 900"
          ambientOpacity={ambientOpacity}
          selectedRoute={selectedRoute}
          quotePoints={quotePoints}
          onMapClick={onMapClick}
          planeScale={0.75}
          showQuoteHint={false}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
        />
      </div>

      {/* Top bar */}
      <header className="ofa-portal-top g-panel g-panel--dense">
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <img
            src={BRAND_LOGO_PATH}
            alt="OnFly Air"
            style={{ height: 20, display: 'block' }}
          />
          <div
            style={{
              width: 1,
              height: 22,
              background: 'rgba(255,255,255,.1)',
            }}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span
              style={{
                fontSize: 13,
                fontWeight: 500,
                color: '#F7F2E3',
              }}
            >
              {companyName}
            </span>
            <button
              type="button"
              className="g-pill"
              onClick={props.onSwitchCompany}
              style={{ fontSize: 11.5, padding: '6px 9px', borderRadius: 8 }}
            >
              Switch ⌄
            </button>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 22 }}>
          <div
            className="g-mono"
            style={{
              display: 'flex',
              gap: 14,
              fontSize: 11.5,
              letterSpacing: '.06em',
              color: '#9A9A9A',
            }}
          >
            <span>
              LOCAL <span style={{ color: '#F7F2E3' }}>{clocks.local}</span>
            </span>
            <span>
              UTC <span style={{ color: '#F7F2E3' }}>{clocks.utc}</span>
            </span>
          </div>
          <div
            style={{
              width: 1,
              height: 22,
              background: 'rgba(255,255,255,.1)',
            }}
          />
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 12,
            }}
          >
            <span className="g-live g-live--ops" />
            <span style={{ color: '#8E8E93' }}>24-hr ops</span>
            <a
              href={`tel:${BRAND_PHONE_E164}`}
              className="g-mono"
              style={{
                color: '#E3B341',
                fontWeight: 500,
                textDecoration: 'none',
              }}
            >
              {BRAND_PHONE}
            </a>
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              fontSize: 12,
              color: '#9A9A9A',
            }}
          >
            <span>{props.email}</span>
            <button
              type="button"
              onClick={props.onSignOut}
              style={{
                color: '#E3B341',
                fontWeight: 500,
                background: 'none',
                border: 0,
                cursor: 'pointer',
                font: 'inherit',
              }}
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      {/* Rail */}
      <nav className="ofa-portal-rail g-panel g-panel--dense" aria-label="Portal">
        {(
          [
            { id: 'trips' as const, label: 'Trips', badge: counts.live },
            { id: 'request' as const, label: 'Request', badge: 0 },
            { id: 'quote' as const, label: 'Quote', badge: 0 },
            { id: 'docs' as const, label: 'Docs', badge: 0 },
            { id: 'account' as const, label: 'Account', badge: 0 },
          ] as const
        ).map((n) => (
          <button
            key={n.id}
            type="button"
            className={['ofa-rail-btn', panel === n.id ? 'is-on' : '']
              .filter(Boolean)
              .join(' ')}
            onClick={() => goPanel(n.id)}
          >
            <RailIcon id={n.id} />
            <span className="lbl">{n.label}</span>
            {n.badge > 0 ? (
              <span className="ofa-rail-badge">{n.badge}</span>
            ) : null}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <a
          href={`tel:${BRAND_PHONE_E164}`}
          className="ofa-rail-btn"
          style={{
            color: '#E3B341',
            textDecoration: 'none',
            background: 'rgba(201,162,39,.1)',
          }}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z" />
          </svg>
          <span className="lbl">Call</span>
        </a>
      </nav>

      {/* Side panel */}
      <aside className="ofa-portal-side g-panel g-panel--dense">
        {panel === 'trips' ? (
          <TripsPanel
            summary={portalDesktopTripSummary(counts)}
            tab={tab}
            counts={counts}
            rows={rows}
            sel={sel}
            onTab={setTab}
            onPick={pickTrip}
            onNew={() => goPanel('request')}
          />
        ) : null}

        {panel === 'request' ? (
          <RequestPanel
            companyName={companyName}
            opsPhone={acctOps || acctDesk || '—'}
            invEmail={acctInv || props.email}
            sent={sent}
            sentTrip={sentTrip}
            sentAt={sentAt}
            clocksLocal={clocks.local}
            fromText={fromText}
            toText={toText}
            fromAp={fromAp}
            toAp={toAp}
            moving={moving}
            loadText={loadText}
            poText={poText}
            pickup={pickup}
            deliver={deliver}
            courierAddr={courierAddr}
            need={need}
            notes={notes}
            sending={sending}
            sendError={sendError}
            onEditAcct={() => goPanel('account')}
            onFrom={(v) => {
              const ap = resolveAirportText(v)
              const tok = v.trim().split(/[\s—–\-·(,]/)[0] ?? ''
              const exact = lookupAirport(tok)
              setFromText(
                ap && (exact || /^[A-Za-z]{3,4}$/.test(tok))
                  ? formatPortalAirportField(ap)
                  : v,
              )
            }}
            onTo={(v) => {
              const ap = resolveAirportText(v)
              const tok = v.trim().split(/[\s—–\-·(,]/)[0] ?? ''
              const exact = lookupAirport(tok)
              setToText(
                ap && (exact || /^[A-Za-z]{3,4}$/.test(tok))
                  ? formatPortalAirportField(ap)
                  : v,
              )
            }}
            onMoving={setMoving}
            onLoad={setLoadText}
            onPo={setPoText}
            onPickup={() => setPickup((v) => !v)}
            onDeliver={() => setDeliver((v) => !v)}
            onCourierAddr={setCourierAddr}
            onNeed={setNeed}
            onNotes={setNotes}
            onSend={() => void sendRequest()}
            onTrack={() => {
              setPanel('trips')
              setTab('pending')
              setSent(false)
              if (sentTrip) setSel(sentTrip.id)
            }}
            onAnother={() => {
              setSent(false)
              setSentAt(null)
              setFromText('')
              setToText('')
              setNotes('')
              setLoadText('')
              setPoText('')
              setPickup(false)
              setDeliver(false)
              setCourierAddr('')
              setSel(null)
              setSentTrip(null)
              clearQuote()
            }}
          />
        ) : null}

        {panel === 'quote' ? (
          <QuotePanel
            qaText={qaText}
            qbText={qbText}
            soft={soft}
            qa={qa}
            qb={qb}
            onQa={(v) => {
              const ap = resolveAirportText(v)
              const exactTok = v.trim().split(/[\s—–\-·(,]/)[0] ?? ''
              const exact = lookupAirport(exactTok)
              if (ap) {
                setQa({
                  code: ap.icao,
                  city: ap.state ? `${ap.city}, ${ap.state}` : ap.city,
                  lat: ap.lat,
                  lon: ap.lon,
                  label: formatPortalAirportField(ap),
                })
                // Exact ICAO/IATA → fill city + airport name into the field.
                setQaText(
                  exact || /^[A-Za-z]{3,4}$/.test(exactTok)
                    ? formatPortalAirportField(ap)
                    : v,
                )
              } else {
                setQa(null)
                setQaText(v)
              }
              setSel(null)
            }}
            onQb={(v) => {
              const ap = resolveAirportText(v)
              const exactTok = v.trim().split(/[\s—–\-·(,]/)[0] ?? ''
              const exact = lookupAirport(exactTok)
              if (ap) {
                setQb({
                  code: ap.icao,
                  city: ap.state ? `${ap.city}, ${ap.state}` : ap.city,
                  lat: ap.lat,
                  lon: ap.lon,
                  label: formatPortalAirportField(ap),
                })
                setQbText(
                  exact || /^[A-Za-z]{3,4}$/.test(exactTok)
                    ? formatPortalAirportField(ap)
                    : v,
                )
              } else {
                setQb(null)
                setQbText(v)
              }
              setSel(null)
            }}
            onHard={quoteToDesk}
            onClear={clearQuote}
          />
        ) : null}

        {panel === 'docs' ? (
          <DocsPanel
            docs={docs}
            onPick={(tripId, bucket) => {
              setPanel('trips')
              setTab(bucket)
              setSel(tripId)
              clearQuote()
            }}
          />
        ) : null}

        {panel === 'account' ? (
          <AccountPanel
            email={props.email}
            companyName={companyName}
            acctName={acctName}
            acctDesk={acctDesk}
            acctOps={acctOps}
            acctInv={acctInv}
            acctAddr={acctAddr}
            smsOn={smsOn}
            emailOn={emailOn}
            saved={acctSaved}
            error={acctError}
            onName={setAcctName}
            onDesk={setAcctDesk}
            onOps={setAcctOps}
            onInv={setAcctInv}
            onAddr={setAcctAddr}
            onSms={() => setSmsOn((v) => !v)}
            onEmail={() => setEmailOn((v) => !v)}
            onSave={saveAccount}
          />
        ) : null}
      </aside>

      {/* HUD */}
      <div className="ofa-portal-hud g-panel g-panel--dense">
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#E3B341"
          strokeWidth="2"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="7" />
          <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
        </svg>
        <span style={{ font: '500 12.5px/1 var(--ofa-font)', color: '#F4F2EC' }}>
          {hud}
        </span>
      </div>

      {/* Detail card */}
      {selected && !qb ? (
        <DetailCard
          trip={selected}
          approveGap={approveGap}
          onClose={() => {
            setSel(null)
            setApproveGap(null)
          }}
          onDocs={() => goPanel('docs')}
          onShare={() => onShare(selected)}
          onCta={() => {
            const cta = portalDesktopCta(selected.status)
            if (cta === 'Approve quote') onApprove(selected)
            else if (cta === 'Call the desk') dialBrandOps()
            else bookAgain(selected)
          }}
        />
      ) : null}

      {/* Soft-quote card when not on Quote panel */}
      {soft && panel !== 'quote' ? (
        <SoftQuoteCard
          soft={soft}
          route={`${softQuotePointLabel(qa!)} → ${softQuotePointLabel(qb!)}`}
          onClose={clearQuote}
          onHard={quoteToDesk}
        />
      ) : null}
    </div>
  )
}

/* ─── Panels ─────────────────────────────────────────────── */

function TripsPanel(props: {
  summary: string
  tab: PortalDesktopBucket
  counts: { live: number; pending: number; history: number }
  rows: PortalDesktopTrip[]
  sel: string | null
  onTab: (t: PortalDesktopBucket) => void
  onPick: (id: string) => void
  onNew: () => void
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '16px 16px 10px' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
          }}
        >
          <div className="g-kicker">Trips</div>
          <div
            className="g-mono"
            style={{ fontSize: 10.5, color: '#9A9A9A', letterSpacing: '.06em' }}
          >
            {props.summary}
          </div>
        </div>
        <Seg
          value={props.tab}
          onChange={(id) => props.onTab(id as PortalDesktopBucket)}
          options={[
            {
              id: 'live',
              label: (
                <>
                  Live{' '}
                  <span className="g-count">{props.counts.live}</span>
                </>
              ),
            },
            {
              id: 'pending',
              label: (
                <>
                  Pending{' '}
                  <span className="g-count">{props.counts.pending}</span>
                </>
              ),
            },
            {
              id: 'history',
              label: (
                <>
                  History{' '}
                  <span className="g-count">{props.counts.history}</span>
                </>
              ),
            },
          ]}
        />
      </div>
      <div className="ofa-portal-scroll" style={{ padding: '0 8px 8px' }}>
        {props.rows.length === 0 ? (
          <p className="g-body" style={{ padding: 12 }}>
            No trips in this tab yet.
          </p>
        ) : null}
        {props.rows.map((tr) => {
          const st = portalDesktopStatusMeta(tr.status)
          const on = props.sel === tr.id
          const chip =
            tr.status === 'done' && tr.date ? tr.date : st.chip
          return (
            <button
              key={tr.id}
              type="button"
              className={['ofa-trip-row', on ? 'is-on' : '']
                .filter(Boolean)
                .join(' ')}
              onClick={() => props.onPick(tr.id)}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 8,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    minWidth: 0,
                  }}
                >
                  <span
                    className={tr.status === 'live' ? 'g-live' : undefined}
                    style={
                      tr.status === 'live'
                        ? undefined
                        : {
                            width: 7,
                            height: 7,
                            borderRadius: '50%',
                            background: st.color,
                            boxShadow: `0 0 8px ${st.color}`,
                            flexShrink: 0,
                          }
                    }
                  />
                  <span
                    style={{
                      fontSize: 14,
                      fontWeight: 500,
                      letterSpacing: '-.01em',
                      color: '#F4F2EC',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {tr.po ? `PO ${tr.po}` : tr.displayId}
                  </span>
                  <span
                    className="g-mono"
                    style={{ fontSize: 10.5, color: '#6F6F74' }}
                  >
                    {tr.displayId}
                  </span>
                </div>
                <span
                  className="g-chip"
                  style={{
                    color: st.color,
                    borderColor: `${st.color}66`,
                  }}
                >
                  {chip}
                </span>
              </div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginTop: 7,
                  gap: 8,
                }}
              >
                <span
                  className="g-mono"
                  style={{
                    fontSize: 12.5,
                    color: '#E3B341',
                    letterSpacing: '.04em',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {tr.from.icao} → {tr.to.icao}
                </span>
                <span
                  style={{
                    fontSize: 11,
                    color: '#9A9A9A',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {[tr.tail, tr.aircraft].filter(Boolean).join(' · ') ||
                    'Sourcing'}
                </span>
              </div>
              {tr.status !== 'done' ? (
                <>
                  <div
                    style={{
                      height: 3,
                      background: 'rgba(255,255,255,.08)',
                      borderRadius: 2,
                      marginTop: 9,
                    }}
                  >
                    <div
                      style={{
                        height: 3,
                        borderRadius: 2,
                        background: '#C9A227',
                        width: `${Math.round(tr.progress * 100)}%`,
                      }}
                    />
                  </div>
                  <div
                    className="g-mono"
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: 10,
                      color: '#9A9A9A',
                      marginTop: 5,
                      letterSpacing: '.04em',
                    }}
                  >
                    <span>{tr.lastEvent}</span>
                    <span style={{ color: '#E3B341', fontWeight: 500 }}>
                      {tr.nextEvent}
                    </span>
                  </div>
                </>
              ) : null}
            </button>
          )
        })}
      </div>
      <div className="ofa-portal-foot">
        <button type="button" className="g-btn g-btn--portal" onClick={props.onNew}>
          + New request
        </button>
      </div>
    </div>
  )
}

function RequestPanel(props: {
  companyName: string
  opsPhone: string
  invEmail: string
  sent: boolean
  sentTrip: PortalDesktopTrip | null
  sentAt: Date | null
  clocksLocal: string
  fromText: string
  toText: string
  fromAp: ReturnType<typeof resolveAirportText>
  toAp: ReturnType<typeof resolveAirportText>
  moving: 'cargo' | 'pax'
  loadText: string
  poText: string
  pickup: boolean
  deliver: boolean
  courierAddr: string
  need: 'asap' | 'today' | 'tomorrow'
  notes: string
  sending: boolean
  sendError: string | null
  onEditAcct: () => void
  onFrom: (v: string) => void
  onTo: (v: string) => void
  onMoving: (v: 'cargo' | 'pax') => void
  onLoad: (v: string) => void
  onPo: (v: string) => void
  onPickup: () => void
  onDeliver: () => void
  onCourierAddr: (v: string) => void
  onNeed: (v: 'asap' | 'today' | 'tomorrow') => void
  onNotes: (v: string) => void
  onSend: () => void
  onTrack: () => void
  onAnother: () => void
}) {
  if (props.sent && props.sentTrip) {
    return (
      <div style={{ padding: '18px 16px', height: '100%', boxSizing: 'border-box' }}>
        <PortalRequestReceived
          dense
          displayId={props.sentTrip.displayId}
          sentAt={props.sentAt ?? undefined}
          onTrack={props.onTrack}
          onAnother={props.onAnother}
        />
      </div>
    )
  }

  const hint = (txt: string, ap: typeof props.fromAp) =>
    !txt
      ? ''
      : ap
        ? formatPortalAirportResolved(ap)
        : 'Desk will confirm airport'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '16px 16px 0' }}>
        <div className="g-kicker">New request</div>
        <div
          style={{
            fontSize: 18,
            fontWeight: 500,
            letterSpacing: '-.02em',
            color: '#F4F2EC',
            marginTop: 9,
            lineHeight: 1.25,
          }}
        >
          Airports and what&apos;s moving. We handle the rest.
        </div>
      </div>
      <div className="ofa-portal-scroll" style={{ padding: '12px 16px 4px' }}>
        <div className="ofa-onfile">
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                font: '500 11.5px/1 var(--ofa-font)',
                color: '#C9A227',
              }}
            >
              On file · auto-filled
            </div>
            <div
              style={{
                fontSize: 12,
                color: '#F7F2E3',
                marginTop: 5,
                fontWeight: 500,
              }}
            >
              {props.companyName}
            </div>
            <div
              style={{
                fontSize: 11,
                color: '#9A9A9A',
                marginTop: 2,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              Ops desk {props.opsPhone} · {props.invEmail}
            </div>
          </div>
          <button type="button" className="ofa-link" onClick={props.onEditAcct}>
            Edit
          </button>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
            gap: 8,
            marginTop: 12,
          }}
        >
          <label>
            <div className="g-label" style={{ marginBottom: 6 }}>
              From
            </div>
            <input
              className="ofa-portal-input ofa-portal-input--mono"
              value={props.fromText}
              onChange={(e) => props.onFrom(e.target.value)}
              placeholder="ICAO or city"
              autoComplete="off"
            />
            <div
              style={{
                fontSize: 10.5,
                color: props.fromAp ? '#3F7D51' : '#9A9A9A',
                marginTop: 5,
                minHeight: 13,
              }}
            >
              {hint(props.fromText, props.fromAp)}
            </div>
          </label>
          <label>
            <div className="g-label" style={{ marginBottom: 6 }}>
              To
            </div>
            <input
              className="ofa-portal-input ofa-portal-input--mono"
              value={props.toText}
              onChange={(e) => props.onTo(e.target.value)}
              placeholder="ICAO or city"
              autoComplete="off"
            />
            <div
              style={{
                fontSize: 10.5,
                color: props.toAp ? '#3F7D51' : '#9A9A9A',
                marginTop: 5,
                minHeight: 13,
              }}
            >
              {hint(props.toText, props.toAp)}
            </div>
          </label>
        </div>
        <div style={{ fontSize: 10.5, color: '#6F6F74', marginTop: 2 }}>
          Or click two airports on the map — we snap to the nearest field.
        </div>

        <div className="g-label" style={{ margin: '14px 0 6px' }}>
          What&apos;s moving
        </div>
        <Seg
          value={props.moving}
          onChange={(id) => props.onMoving(id as 'cargo' | 'pax')}
          options={[
            { id: 'cargo', label: 'Cargo' },
            { id: 'pax', label: 'Passengers' },
          ]}
        />
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
            gap: 8,
            marginTop: 8,
          }}
        >
          <input
            className="ofa-portal-input"
            placeholder={
              props.moving === 'cargo'
                ? 'Pieces · weight (lb) · dims'
                : 'Passenger count'
            }
            value={props.loadText}
            onChange={(e) => props.onLoad(e.target.value)}
          />
          <input
            className="ofa-portal-input"
            placeholder="PO number (optional)"
            value={props.poText}
            onChange={(e) => props.onPo(e.target.value)}
          />
        </div>

        <div className="g-label" style={{ margin: '14px 0 6px' }}>
          Ground courier
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
            gap: 8,
          }}
        >
          <button
            type="button"
            className={['g-check', props.pickup ? 'is-on' : '']
              .filter(Boolean)
              .join(' ')}
            onClick={props.onPickup}
          >
            <span className="g-check-box" />
            <span style={{ fontSize: 11.5 }}>Pick up at origin</span>
          </button>
          <button
            type="button"
            className={['g-check', props.deliver ? 'is-on' : '']
              .filter(Boolean)
              .join(' ')}
            onClick={props.onDeliver}
          >
            <span className="g-check-box" />
            <span style={{ fontSize: 11.5 }}>Deliver to site</span>
          </button>
        </div>
        {props.pickup || props.deliver ? (
          <input
            className="ofa-portal-input"
            style={{ marginTop: 8 }}
            placeholder="Street address for the courier"
            value={props.courierAddr}
            onChange={(e) => props.onCourierAddr(e.target.value)}
          />
        ) : null}

        <div className="g-label" style={{ margin: '14px 0 6px' }}>
          Need it
        </div>
        <Seg
          value={props.need}
          onChange={(id) =>
            props.onNeed(id as 'asap' | 'today' | 'tomorrow')
          }
          options={[
            { id: 'asap', label: 'ASAP' },
            { id: 'today', label: 'Today' },
            { id: 'tomorrow', label: 'Tomorrow' },
          ]}
        />

        <textarea
          className="ofa-portal-textarea"
          style={{ marginTop: 12 }}
          rows={2}
          placeholder="Notes for the desk — hazmat, dims, forklift, deadline…"
          value={props.notes}
          onChange={(e) => props.onNotes(e.target.value)}
        />
        {props.sendError ? (
          <p style={{ color: 'var(--ofa-red)', fontSize: 12, marginTop: 8 }}>
            {props.sendError}
          </p>
        ) : null}
      </div>
      <div
        style={{
          padding: '10px 16px 14px',
          borderTop: '1px solid rgba(255,255,255,.07)',
        }}
      >
        <button
          type="button"
          className="g-btn g-btn--portal"
          disabled={props.sending}
          onClick={props.onSend}
        >
          {props.sending
            ? 'Ringing desk…'
            : 'Send to desk — rings our phones'}
        </button>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: 11.5,
            color: '#7A7A80',
            marginTop: 10,
          }}
        >
          <span>Hard quote in 10–15 min · dispatch calls first</span>
          <Link
            to="/portal/request?mode=book"
            className="ofa-link"
            style={{ fontSize: 12, textDecoration: 'none' }}
          >
            Full booking form →
          </Link>
        </div>
      </div>
    </div>
  )
}

function QuotePanel(props: {
  qaText: string
  qbText: string
  soft: ReturnType<typeof softQuoteFor> | null
  qa: QuotePick | null
  qb: QuotePick | null
  onQa: (v: string) => void
  onQb: (v: string) => void
  onHard: () => void
  onClear: () => void
}) {
  const prompt = !props.qa
    ? 'Click your origin on the map — we snap to the nearest airport.'
    : !props.qb
      ? `Origin set: ${props.qa.label || softQuotePointLabel(props.qa)}. Now click the destination.`
      : ''

  const resolvedHint = (txt: string, pick: QuotePick | null) => {
    if (!txt.trim()) return ''
    if (!pick?.code) return 'Keep typing an ICAO, IATA, or city'
    const ap = resolveAirportText(pick.code)
    return formatPortalAirportResolved(ap) || softQuotePointLabel(pick)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '16px 16px 0' }}>
        <div className="g-kicker">Soft quote</div>
        <div
          style={{
            fontSize: 18,
            fontWeight: 500,
            letterSpacing: '-.02em',
            color: '#F4F2EC',
            marginTop: 9,
            lineHeight: 1.25,
          }}
        >
          Click two airports on the map, or type them.
        </div>
        <div className="g-body" style={{ marginTop: 6, lineHeight: 1.5 }}>
          Rough numbers in seconds. Send it to the desk for a hard quote from a
          vetted Part 135 carrier.
        </div>
      </div>
      <div style={{ padding: '12px 16px' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
            gap: 8,
          }}
        >
          <label>
            <div className="g-label" style={{ marginBottom: 6 }}>
              Origin
            </div>
            <input
              className="ofa-portal-input ofa-portal-input--mono"
              value={props.qaText}
              onChange={(e) => props.onQa(e.target.value)}
              placeholder="ICAO, city, or map"
              autoComplete="off"
            />
            <div
              style={{
                fontSize: 10.5,
                color: props.qa?.code ? '#5FA36F' : '#9A9A9A',
                marginTop: 5,
                minHeight: 13,
              }}
            >
              {resolvedHint(props.qaText, props.qa)}
            </div>
          </label>
          <label>
            <div className="g-label" style={{ marginBottom: 6 }}>
              Destination
            </div>
            <input
              className="ofa-portal-input ofa-portal-input--mono"
              value={props.qbText}
              onChange={(e) => props.onQb(e.target.value)}
              placeholder="ICAO, city, or map"
              autoComplete="off"
            />
            <div
              style={{
                fontSize: 10.5,
                color: props.qb?.code ? '#5FA36F' : '#9A9A9A',
                marginTop: 5,
                minHeight: 13,
              }}
            >
              {resolvedHint(props.qbText, props.qb)}
            </div>
          </label>
        </div>
      </div>
      <div className="ofa-portal-scroll" style={{ padding: '0 16px 12px' }}>
        {props.soft ? (
          <>
            <div
              style={{
                display: 'flex',
                alignItems: 'baseline',
                justifyContent: 'space-between',
                padding: '4px 0 10px',
                borderBottom: '1px solid rgba(255,255,255,.08)',
              }}
            >
              <span
                className="g-mono"
                style={{ fontSize: 15, color: '#E3B341', letterSpacing: '.04em' }}
              >
                {softQuotePointLabel(props.qa!)} →{' '}
                {softQuotePointLabel(props.qb!)}
              </span>
              <span
                className="g-mono"
                style={{ fontSize: 11, color: '#9A9A9A' }}
              >
                {props.soft.nmLabel} nm · {props.soft.smLabel} sm
              </span>
            </div>
            {props.soft.classes.map((c) => (
              <div
                key={c.name}
                style={{
                  padding: '11px 0',
                  borderBottom: '1px solid rgba(255,255,255,.06)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 10,
                  opacity: c.opacity,
                }}
              >
                <div>
                  <div
                    style={{
                      fontSize: 13.5,
                      fontWeight: 500,
                      letterSpacing: '-.01em',
                      color: '#F4F2EC',
                    }}
                  >
                    {c.name}
                  </div>
                  <div
                    style={{ fontSize: 10.5, color: '#9A9A9A', marginTop: 3 }}
                  >
                    {c.sub}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div
                    className="g-mono"
                    style={{
                      fontSize: 13,
                      color: '#E3B341',
                      fontWeight: 500,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {c.price}
                  </div>
                  <div
                    className="g-mono"
                    style={{ fontSize: 10.5, color: '#9A9A9A', marginTop: 3 }}
                  >
                    {c.block}
                  </div>
                </div>
              </div>
            ))}
            <div
              style={{
                fontSize: 10.5,
                color: '#6F6F74',
                marginTop: 10,
                lineHeight: 1.5,
              }}
            >
              {PORTAL_SOFT_QUOTE_FINE_PRINT}
            </div>
          </>
        ) : (
          <div
            style={{
              border: '1px dashed rgba(255,255,255,.14)',
              borderRadius: 10,
              padding: '18px 14px',
              textAlign: 'center',
              color: '#9A9A9A',
              fontSize: 12,
              lineHeight: 1.5,
            }}
          >
            {prompt}
          </div>
        )}
      </div>
      {props.soft ? (
        <div
          style={{
            padding: '10px 16px 14px',
            borderTop: '1px solid rgba(255,255,255,.07)',
            display: 'flex',
            gap: 8,
          }}
        >
          <button
            type="button"
            className="g-btn g-btn--portal"
            style={{ flex: 1 }}
            onClick={props.onHard}
          >
            Get a hard quote
          </button>
          <button
            type="button"
            className="g-ghost"
            style={{ height: 48 }}
            onClick={props.onClear}
          >
            Clear
          </button>
        </div>
      ) : null}
    </div>
  )
}

function DocsPanel(props: {
  docs: ReturnType<typeof collectPortalDesktopDocs>
  onPick: (tripId: string, bucket: PortalDesktopBucket) => void
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div
        style={{
          padding: '16px 16px 10px',
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
        }}
      >
        <div className="g-kicker">Documents</div>
        <div className="g-mono" style={{ fontSize: 10.5, color: '#9A9A9A' }}>
          {props.docs.length} files
        </div>
      </div>
      <div className="ofa-portal-scroll" style={{ padding: '0 8px 10px' }}>
        {props.docs.length === 0 ? (
          <p className="g-body" style={{ padding: 12 }}>
            Quotes, invoices, and PODs from your trips will show here.
          </p>
        ) : null}
        {props.docs.map((d, i) => (
          <button
            key={`${d.tripId}-${d.kind}-${i}`}
            type="button"
            className="ofa-trip-row"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '10px 10px',
              borderRadius: 9,
              borderLeft: 0,
            }}
            onClick={() => props.onPick(d.tripId, d.bucket)}
          >
            <span
              style={{
                width: 30,
                height: 36,
                border: '1px solid rgba(255,255,255,.14)',
                borderRadius: 5,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                font: '700 8px/1 Helvetica Neue,sans-serif',
                letterSpacing: '.08em',
                color: d.kind === 'POD' ? '#3F7D51' : '#E3B341',
                flexShrink: 0,
              }}
            >
              {d.kind}
            </span>
            <div style={{ minWidth: 0, flex: 1, textAlign: 'left' }}>
              <div
                style={{
                  fontSize: 13.5,
                  fontWeight: 500,
                  letterSpacing: '-.01em',
                  color: '#F4F2EC',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {d.name}
              </div>
              <div
                className="g-mono"
                style={{
                  fontSize: 10.5,
                  color: '#9A9A9A',
                  marginTop: 3,
                  letterSpacing: '.04em',
                }}
              >
                PO {d.po} · {d.route} · {d.date}
              </div>
            </div>
            <span
              style={{
                font: '700 9px/1 Helvetica Neue,sans-serif',
                letterSpacing: '.12em',
                color: '#E3B341',
              }}
            >
              ↓
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

function AccountPanel(props: {
  email: string
  companyName: string
  acctName: string
  acctDesk: string
  acctOps: string
  acctInv: string
  acctAddr: string
  smsOn: boolean
  emailOn: boolean
  saved: boolean
  error: string | null
  onName: (v: string) => void
  onDesk: (v: string) => void
  onOps: (v: string) => void
  onInv: (v: string) => void
  onAddr: (v: string) => void
  onSms: () => void
  onEmail: () => void
  onSave: (e: FormEvent) => void
}) {
  return (
    <form
      onSubmit={props.onSave}
      style={{ display: 'flex', flexDirection: 'column', height: '100%' }}
    >
      <div style={{ padding: '16px 16px 0' }}>
        <div className="g-kicker">Account</div>
        <div
          style={{
            fontSize: 18,
            fontWeight: 500,
            letterSpacing: '-.02em',
            color: '#F4F2EC',
            marginTop: 9,
            lineHeight: 1.25,
          }}
        >
          {props.companyName}
        </div>
        <div style={{ fontSize: 11, color: '#9A9A9A', marginTop: 4 }}>
          Signed in as {props.email} · these details auto-fill every request.
        </div>
      </div>
      <div className="ofa-portal-scroll" style={{ padding: '14px 16px' }}>
        <label>
          <div className="g-label" style={{ marginBottom: 6 }}>
            Company name
          </div>
          <input
            className="ofa-portal-input"
            value={props.acctName}
            onChange={(e) => props.onName(e.target.value)}
          />
        </label>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
            gap: 8,
            marginTop: 12,
          }}
        >
          <label>
            <div className="g-label" style={{ marginBottom: 6 }}>
              Front desk
            </div>
            <input
              className="ofa-portal-input ofa-portal-input--mono"
              value={props.acctDesk}
              onChange={(e) => props.onDesk(e.target.value)}
            />
          </label>
          <label>
            <div className="g-label" style={{ marginBottom: 6 }}>
              Ops callback
            </div>
            <input
              className="ofa-portal-input ofa-portal-input--mono"
              value={props.acctOps}
              onChange={(e) => props.onOps(e.target.value)}
            />
          </label>
        </div>
        <label>
          <div className="g-label" style={{ margin: '12px 0 6px' }}>
            Invoice email
          </div>
          <input
            className="ofa-portal-input"
            value={props.acctInv}
            onChange={(e) => props.onInv(e.target.value)}
          />
        </label>
        <label>
          <div className="g-label" style={{ margin: '12px 0 6px' }}>
            Default ship-to address
          </div>
          <input
            className="ofa-portal-input"
            value={props.acctAddr}
            onChange={(e) => props.onAddr(e.target.value)}
          />
        </label>
        <div className="g-label" style={{ margin: '14px 0 8px' }}>
          Notifications
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '9px 10px',
              border: '1px solid rgba(255,255,255,.1)',
              borderRadius: 8,
            }}
          >
            <span style={{ fontSize: 12, color: '#F7F2E3' }}>
              SMS on wheels-up / landing
            </span>
            <button
              type="button"
              className={['g-toggle', props.smsOn ? 'is-on' : '']
                .filter(Boolean)
                .join(' ')}
              aria-pressed={props.smsOn}
              onClick={props.onSms}
            />
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '9px 10px',
              border: '1px solid rgba(255,255,255,.1)',
              borderRadius: 8,
            }}
          >
            <span style={{ fontSize: 12, color: '#F7F2E3' }}>
              Email quotes &amp; POD
            </span>
            <button
              type="button"
              className={['g-toggle', props.emailOn ? 'is-on' : '']
                .filter(Boolean)
                .join(' ')}
              aria-pressed={props.emailOn}
              onClick={props.onEmail}
            />
          </div>
        </div>
        <div style={{ fontSize: 10.5, color: '#6F6F74', marginTop: 12 }}>
          Sign-in email is fixed. Contact OnFly to change portal access.
        </div>
        {props.error ? (
          <p style={{ color: 'var(--ofa-red)', fontSize: 12, marginTop: 8 }}>
            {props.error}
          </p>
        ) : null}
        {props.saved ? (
          <p style={{ color: 'var(--ofa-green-2)', fontSize: 12, marginTop: 8 }}>
            Saved.
          </p>
        ) : null}
      </div>
      <div
        style={{
          padding: '10px 16px 14px',
          borderTop: '1px solid rgba(255,255,255,.07)',
        }}
      >
        <button type="submit" className="g-btn g-btn--portal">
          Save changes
        </button>
      </div>
    </form>
  )
}

function DetailCard(props: {
  trip: PortalDesktopTrip
  approveGap: string | null
  onClose: () => void
  onDocs: () => void
  onShare: () => void
  onCta: () => void
}) {
  const t = props.trip
  const st = portalDesktopStatusMeta(t.status)
  const cta = portalDesktopCta(t.status)
  const facts = [
    {
      k: t.status === 'live' ? 'Wheels up' : 'Timing',
      v: t.lastEvent.replace(
        /^(WHEELS UP|DEPARTS|REQUESTED|HARD QUOTE SENT|DELIVERED|COMPLETE|IN PROGRESS|CONFIRMED|SOURCING)\s*/i,
        '',
      ) || t.lastEvent,
      color: '#F7F2E3',
    },
    { k: t.status === 'live' ? 'ETA' : 'Next', v: t.nextEvent, color: '#E3B341' },
    { k: 'Load', v: t.load, color: '#F7F2E3' },
    { k: 'Service', v: t.service, color: '#F7F2E3' },
    { k: 'Courier', v: t.courier, color: '#F7F2E3' },
    {
      k: 'Dispatcher',
      v: `${t.dispatcher?.name ?? 'Desk'} · ${t.dispatcher?.phone ?? BRAND_PHONE}`,
      color: '#F7F2E3',
    },
  ]
  const linePct = Math.round((Math.min(t.currentStep, 4) / 4) * 100)

  return (
    <div className="ofa-portal-detail g-panel g-panel--dense g-rise">
      <div
        style={{
          height: 2,
          background: 'linear-gradient(90deg,#C9A227,rgba(201,162,39,0))',
        }}
      />
      <div
        style={{
          padding: '14px 16px 0',
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 10,
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span
              className={t.status === 'live' ? 'g-live' : undefined}
              style={
                t.status === 'live'
                  ? undefined
                  : {
                      width: 7,
                      height: 7,
                      borderRadius: '50%',
                      background: st.color,
                      boxShadow: `0 0 8px ${st.color}`,
                    }
              }
            />
            <span
              style={{
                font: '500 12.5px/1 var(--ofa-font)',
                color: st.color,
              }}
            >
              {st.chip}
            </span>
            <span
              className="g-mono"
              style={{ fontSize: 10.5, color: '#6F6F74' }}
            >
              {t.displayId}
            </span>
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'baseline',
              gap: 10,
              marginTop: 8,
            }}
          >
            <span
              style={{
                fontSize: 20,
                fontWeight: 500,
                letterSpacing: '-.02em',
                color: '#F4F2EC',
              }}
            >
              {t.po ? `PO ${t.po}` : t.displayId}
            </span>
            <span
              className="g-mono"
              style={{ fontSize: 15, color: '#E3B341', letterSpacing: '.04em' }}
            >
              {t.from.icao} → {t.to.icao}
            </span>
          </div>
          <div style={{ fontSize: 11.5, color: '#9A9A9A', marginTop: 4 }}>
            {t.aircraft || 'Aircraft TBD'}
            {t.tail ? (
              <>
                {' '}
                · <span className="g-mono">{t.tail}</span>
              </>
            ) : null}{' '}
            · vetted Part 135 carrier
          </div>
        </div>
        <button type="button" className="g-close" onClick={props.onClose} aria-label="Close">
          ×
        </button>
      </div>

      <div className="ofa-fact-grid">
        {facts.map((f) => (
          <div key={f.k}>
            <div
              style={{
                font: '400 11px/1 var(--ofa-font)',
                color: '#7A7A80',
              }}
            >
              {f.k}
            </div>
            <div
              style={{
                fontSize: 13,
                color: f.color,
                marginTop: 6,
                lineHeight: 1.3,
                letterSpacing: '-.005em',
              }}
            >
              {f.v}
            </div>
          </div>
        ))}
      </div>

      <div style={{ padding: '12px 16px 0' }}>
        <div
          style={{
            position: 'relative',
            height: 2,
            background: 'rgba(255,255,255,.1)',
            margin: '8px 12px 0',
            borderRadius: 1,
          }}
        >
          <div
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              height: 2,
              background: '#C9A227',
              width: `${linePct}%`,
            }}
          />
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(5, minmax(0, 1fr))',
            marginTop: -7,
          }}
        >
          {t.steps.map((s, i) => {
            const done = i < t.currentStep
            const live = i === t.currentStep && t.status !== 'done'
            return (
              <div key={s.label} style={{ textAlign: 'center' }}>
                <span
                  style={{
                    display: 'inline-block',
                    width: 10,
                    height: 10,
                    borderRadius: '50%',
                    background: done ? '#C9A227' : live ? '#0C0C0E' : '#1A1A1E',
                    border: done
                      ? '1px solid #C9A227'
                      : live
                        ? '2px solid #E3B341'
                        : '1px solid rgba(255,255,255,.2)',
                    boxSizing: 'border-box',
                    animation: live ? 'ofaBlink 1.6s infinite' : 'none',
                  }}
                />
                <div
                  style={{
                    font: '500 11px/1 var(--ofa-font)',
                    color: done || live ? '#F7F2E3' : '#6F6F74',
                    marginTop: 6,
                  }}
                >
                  {s.label}
                </div>
                <div
                  className="g-mono"
                  style={{
                    fontSize: 9.5,
                    color: live ? '#E3B341' : done ? '#9A9A9A' : '#55555A',
                    marginTop: 3,
                  }}
                >
                  {s.time}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {props.approveGap ? (
        <p
          style={{
            margin: '10px 16px 0',
            fontSize: 11.5,
            color: 'var(--ofa-gold-2)',
            lineHeight: 1.4,
          }}
        >
          {props.approveGap}
        </p>
      ) : null}

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          padding: '12px 16px 14px',
          marginTop: 4,
          borderTop: '1px solid rgba(255,255,255,.07)',
        }}
      >
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {(['Quote', 'Invoice', 'POD'] as const).map((k) => {
            const has = t.docs.includes(k)
            return (
              <button
                key={k}
                type="button"
                onClick={props.onDocs}
                style={{
                  font: '500 11.5px/1 var(--ofa-font)',
                  color: has ? '#E3B341' : '#4A4A50',
                  border: `1px solid ${has ? 'rgba(201,162,39,.45)' : 'rgba(255,255,255,.07)'}`,
                  background: 'rgba(255,255,255,.03)',
                  padding: '7px 10px',
                  borderRadius: 20,
                  cursor: 'pointer',
                }}
              >
                {k}
              </button>
            )
          })}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button type="button" className="g-ghost" onClick={props.onShare}>
            Share
          </button>
          <button type="button" className="g-btn g-btn--sm" onClick={props.onCta}>
            {cta}
          </button>
        </div>
      </div>
    </div>
  )
}

function SoftQuoteCard(props: {
  soft: NonNullable<ReturnType<typeof softQuoteFor>>
  route: string
  onClose: () => void
  onHard: () => void
}) {
  return (
    <div className="ofa-portal-quote-card g-panel g-panel--dense g-rise">
      <div
        style={{
          height: 2,
          background: 'linear-gradient(90deg,#C9A227,rgba(201,162,39,0))',
        }}
      />
      <div
        style={{
          padding: '14px 16px 0',
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
        }}
      >
        <div>
          <div className="g-kicker">Soft quote</div>
          <div
            style={{
              display: 'flex',
              alignItems: 'baseline',
              gap: 10,
              marginTop: 8,
            }}
          >
            <span
              className="g-mono"
              style={{ fontSize: 17, color: '#F7F2E3', letterSpacing: '.04em' }}
            >
              {props.route}
            </span>
            <span className="g-mono" style={{ fontSize: 11, color: '#9A9A9A' }}>
              {props.soft.nmLabel} nm
            </span>
          </div>
        </div>
        <button type="button" className="g-close" onClick={props.onClose} aria-label="Close">
          ×
        </button>
      </div>
      <div style={{ padding: '6px 16px 0' }}>
        {props.soft.classes.map((c) => (
          <div
            key={c.name}
            style={{
              padding: '10px 0',
              borderBottom: '1px solid rgba(255,255,255,.06)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 10,
              opacity: c.opacity,
            }}
          >
            <div>
              <div
                style={{
                  fontSize: 13.5,
                  fontWeight: 500,
                  letterSpacing: '-.01em',
                  color: '#F4F2EC',
                }}
              >
                {c.name}
              </div>
              <div style={{ fontSize: 10.5, color: '#9A9A9A', marginTop: 2 }}>
                {c.sub}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div
                className="g-mono"
                style={{
                  fontSize: 13,
                  color: '#E3B341',
                  fontWeight: 500,
                  whiteSpace: 'nowrap',
                }}
              >
                {c.price}
              </div>
              <div
                className="g-mono"
                style={{ fontSize: 10, color: '#9A9A9A', marginTop: 2 }}
              >
                {c.block}
              </div>
            </div>
          </div>
        ))}
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
          padding: '10px 16px 14px',
        }}
      >
        <div style={{ fontSize: 10, color: '#6F6F74', lineHeight: 1.4 }}>
          Rough, one-way, incl. repositioning.
          <br />
          Not a firm offer.
        </div>
        <button type="button" className="g-btn g-btn--sm" onClick={props.onHard}>
          Get a hard quote
        </button>
      </div>
    </div>
  )
}

/** Hook: true when viewport is portal-desktop (≥900px). */
export function usePortalDesktopMedia(): boolean {
  const [desktop, setDesktop] = useState(() =>
    typeof window !== 'undefined'
      ? window.matchMedia('(min-width: 900px)').matches
      : true,
  )
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 900px)')
    const apply = () => setDesktop(mq.matches)
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [])
  return desktop
}
