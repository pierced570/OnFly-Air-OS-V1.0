/**
 * Logged-in portal phone shell (<900px) — doc 05 + 05b.
 * Map full-bleed + top bar + floating tab bar + glass bottom sheet.
 * Presentation only; reuses desktop trip/soft-quote domain + request/account APIs.
 */

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import { Link } from 'react-router-dom'
import { MapBackdrop } from '@/components/MapBackdrop'
import { PortalInstallBanner } from '@/components/PortalInstallBanner'
import {
  BRAND_LOGO_PATH,
  BRAND_PHONE_E164,
  dialBrandOps,
} from '@/domain/brand'
import {
  buildPortalDesktopTrip,
  buildPortalDesktopTripFromRequest,
} from '@/domain/portalDesktopBuild'
import {
  collectPortalDesktopDocs,
  portalDesktopBucket,
  portalDesktopCta,
  portalDesktopStatusMeta,
  portalDesktopTripSummary,
  resolveAirportText,
  type PortalDesktopBucket,
  type PortalDesktopTrip,
} from '@/domain/portalDesktopTrips'
import {
  PORTAL_SOFT_QUOTE_FINE_PRINT,
  softQuoteFor,
  softQuoteHardNotes,
  softQuotePointLabel,
  type SoftQuotePoint,
} from '@/domain/portalSoftQuote'
import {
  easeOutCubic,
  frameMapViewBox,
  lerpViewBox,
  MAP_VIEWBOX,
  projectLonLat,
  type MapAirport,
  type MapProjection,
} from '@/domain/portalMap'
import portalMapData from '@/data/portalMapData.json'
import { emptyTripRequestDraft } from '@/domain/tripRequest'
import type { ClientProfile } from '@/lib/clientStore'
import { updateClient } from '@/lib/clientStore'
import { portalTrackingUrlForTrip } from '@/lib/etaSheetSender'
import { requestHardQuote, submitTripRequest } from '@/lib/requestStore'
import { getTrip } from '@/lib/tripStore'
import {
  buildPortalTrackingView,
  tripToTrackingInput,
} from '@/domain/portalTracking'
import type {
  PortalDesktopPanel,
  PortalDesktopPendingIn,
  PortalDesktopShipmentIn,
} from '@/components/PortalDesktopApp'

type QuotePick = SoftQuotePoint & { label?: string }
type Snap = 'peek' | 'half' | 'detail' | 'full'

const DESIGN_H = 844
/** Sheet top Y on a 390×844 reference (doc 05). */
const SNAP_TOP: Record<Snap, number> = {
  peek: 430,
  half: 400,
  detail: 300,
  full: 96,
}
const SNAP_ORDER: Snap[] = ['peek', 'half', 'detail', 'full']

const projection = portalMapData.us_map.projection as MapProjection

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
  return [a.street, a.city, a.state, a.zip].filter(Boolean).join(', ')
}

function haptic(ms = 8) {
  try {
    navigator.vibrate?.(ms)
  } catch {
    /* ignore */
  }
}

function toMapAirport(ap: {
  icao: string
  city: string
  lat: number
  lon: number
}): MapAirport {
  const p = projectLonLat(ap.lon, ap.lat, projection)
  return { icao: ap.icao, city: ap.city, lat: ap.lat, lon: ap.lon, x: p.x, y: p.y }
}

function defaultSnapFor(
  panel: PortalDesktopPanel,
  detail: boolean,
): Snap {
  if (detail) return 'detail'
  if (panel === 'quote') return 'peek'
  if (panel === 'request' || panel === 'account') return 'full'
  return 'half'
}

function snapTopPx(snap: Snap, height: number): number {
  return (SNAP_TOP[snap] / DESIGN_H) * height
}

function nearestSnap(top: number, height: number, velocityY: number): Snap {
  const ranked = SNAP_ORDER.map((s) => ({
    s,
    d: Math.abs(snapTopPx(s, height) - top),
  })).sort((a, b) => a.d - b.d)
  let pick = ranked[0]!.s
  if (Math.abs(velocityY) > 0.55) {
    const idx = SNAP_ORDER.indexOf(pick)
    if (velocityY < 0 && idx < SNAP_ORDER.length - 1) {
      pick = SNAP_ORDER[idx + 1]!
    } else if (velocityY > 0 && idx > 0) {
      pick = SNAP_ORDER[idx - 1]!
    }
  }
  return pick
}

function cycleSnap(current: Snap): Snap {
  const i = SNAP_ORDER.indexOf(current)
  return SNAP_ORDER[(i + 1) % SNAP_ORDER.length]!
}

function TabIcon({ id }: { id: PortalDesktopPanel }) {
  const common = {
    width: 16,
    height: 16,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
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
    <div className="g-seg" style={{ marginTop: 4 }}>
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

function useAnimatedViewBox(target: string, reduced: boolean): string {
  const [vb, setVb] = useState(target)
  const fromRef = useRef(target)
  useEffect(() => {
    if (reduced || target === fromRef.current) {
      fromRef.current = target
      setVb(target)
      return
    }
    const from = fromRef.current
    const start = performance.now()
    let raf = 0
    const tick = (now: number) => {
      const t = easeOutCubic((now - start) / 450)
      setVb(lerpViewBox(from, target, t))
      if (t < 1) raf = requestAnimationFrame(tick)
      else fromRef.current = target
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, reduced])
  return vb
}

function useKeyboardInset(): number {
  const [inset, setInset] = useState(0)
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const apply = () => {
      const overlap = Math.max(
        0,
        window.innerHeight - vv.height - vv.offsetTop,
      )
      setInset(overlap)
    }
    apply()
    vv.addEventListener('resize', apply)
    vv.addEventListener('scroll', apply)
    return () => {
      vv.removeEventListener('resize', apply)
      vv.removeEventListener('scroll', apply)
    }
  }, [])
  return inset
}

export function PortalPhoneApp(props: {
  email: string
  client: ClientProfile | null | undefined
  shipments: PortalDesktopShipmentIn[]
  pending: PortalDesktopPendingIn[]
  onSignOut: () => void
  onSwitchCompany: () => void
}) {
  const clocks = usePortalClocks()
  const keyboardInset = useKeyboardInset()
  const [panel, setPanel] = useState<PortalDesktopPanel>('trips')
  const [prevPanel, setPrevPanel] = useState<PortalDesktopPanel>('trips')
  const [tab, setTab] = useState<PortalDesktopBucket>('live')
  const [sel, setSel] = useState<string | null>(null)
  const [detail, setDetail] = useState(false)
  const [snap, setSnap] = useState<Snap>('half')
  const [sheetTop, setSheetTop] = useState(() =>
    typeof window !== 'undefined'
      ? snapTopPx('half', window.innerHeight)
      : SNAP_TOP.half,
  )
  const [dragging, setDragging] = useState(false)
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
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const [approveGap, setApproveGap] = useState<string | null>(null)
  const [docQuery, setDocQuery] = useState('')
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
  const [viewport, setViewport] = useState(() => ({
    w: typeof window !== 'undefined' ? window.innerWidth : 390,
    h: typeof window !== 'undefined' ? window.innerHeight : 844,
  }))
  const [reducedMotion, setReducedMotion] = useState(false)

  const dragRef = useRef<{
    startY: number
    startTop: number
    lastY: number
    lastT: number
    v: number
  } | null>(null)
  const bodyRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setAcctName(props.client?.name ?? '')
    setAcctDesk(props.client?.profile.front_desk_phone ?? '')
    setAcctOps(props.client?.profile.ops_callback_phone ?? '')
    setAcctInv(props.client?.invoice_email || props.client?.email || '')
    setAcctAddr(addressLine(props.client))
  }, [props.client])

  useEffect(() => {
    const onResize = () =>
      setViewport({ w: window.innerWidth, h: window.innerHeight })
    onResize()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const apply = () => setReducedMotion(mq.matches)
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [])

  useEffect(() => {
    if (keyboardInset > 40) {
      setSnap('full')
      setSheetTop(snapTopPx('full', viewport.h))
    }
  }, [keyboardInset, viewport.h])

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
          docs.some((d) => d.kind === 'other' && /invoice/i.test(d.title)),
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
  const filteredDocs = useMemo(() => {
    const q = docQuery.trim().toLowerCase()
    if (!q) return docs
    return docs.filter(
      (d) =>
        d.name.toLowerCase().includes(q) ||
        d.po.toLowerCase().includes(q) ||
        d.route.toLowerCase().includes(q) ||
        d.tripId.toLowerCase().includes(q),
    )
  }, [docs, docQuery])

  const soft = qa && qb ? softQuoteFor(qa, qb) : null
  const fromAp = resolveAirportText(fromText)
  const toAp = resolveAirportText(toText)

  function applySnap(next: Snap, vibrate = true) {
    setSnap(next)
    setSheetTop(snapTopPx(next, viewport.h))
    if (vibrate) haptic(10)
  }

  function goPanel(next: PortalDesktopPanel) {
    setPrevPanel(panel)
    setPanel(next)
    setDetail(false)
    setApproveGap(null)
    if (next === 'request') setSent(false)
    const s = defaultSnapFor(next, false)
    applySnap(s)
  }

  function openDetail(id: string) {
    setSel(id)
    setDetail(true)
    setPanel('trips')
    applySnap('detail')
  }

  function closeDetail() {
    setDetail(false)
    applySnap('half')
  }

  function clearQuote() {
    setQa(null)
    setQb(null)
    setQaText('')
    setQbText('')
  }

  function onMapClick(p: { lat: number; lon: number; icao?: string }) {
    if (panel === 'trips' || panel === 'docs' || panel === 'account') {
      applySnap('peek')
      return
    }
    const point: QuotePick = {
      lat: p.lat,
      lon: p.lon,
      code: p.icao ?? null,
      city: p.icao ? resolveAirportText(p.icao)?.city : 'Custom point',
      label: p.icao || softQuotePointLabel({ lat: p.lat, lon: p.lon }),
    }
    const label = point.code || softQuotePointLabel(point)
    if (panel === 'request' || panel === 'quote') {
      if (!qa || qb) {
        setQa(point)
        setQb(null)
        setQaText(label)
        setQbText('')
        setSel(null)
        setFromText(point.code || label)
        setToText('')
        if (panel === 'quote') applySnap('peek')
      } else {
        setQb(point)
        setQbText(label)
        setSel(null)
        setToText(point.code || label)
        if (panel === 'quote') applySnap('peek')
      }
    }
  }

  function quoteToDesk() {
    if (!qa || !qb) return
    goPanel('request')
    setFromText(qa.code || softQuotePointLabel(qa))
    setToText(qb.code || softQuotePointLabel(qb))
    setNotes(softQuoteHardNotes(qa, qb))
  }

  function bookAgain(t: PortalDesktopTrip) {
    goPanel('request')
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
        draft.pax = Array.from(
          { length: Number.isFinite(n) && n > 0 ? n : 1 },
          () => ({ name: '', weight_lbs: '', dob: '' }),
        )
      }
      const row = submitTripRequest(draft, 'portal', { alert: 'none' })
      await requestHardQuote(row.id)
      haptic(18)
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
      setSent(true)
      clearQuote()
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

  function onCta(t: PortalDesktopTrip) {
    const label = portalDesktopCta(t.status)
    if (label === 'Approve quote') onApprove(t)
    else if (label === 'Call the desk') dialBrandOps()
    else bookAgain(t)
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
    haptic(10)
  }

  const selectedRoute =
    selected &&
    detail &&
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
                : 0,
          telemetry: selected.telemetry ?? undefined,
        }
      : undefined

  const quotePoints = qa
    ? {
        a: {
          ...projectLonLat(qa.lon, qa.lat, projection),
          lat: qa.lat,
          lon: qa.lon,
          label: qa.code || softQuotePointLabel(qa),
          icao: qa.code ?? undefined,
        },
        b: qb
          ? {
              ...projectLonLat(qb.lon, qb.lat, projection),
              lat: qb.lat,
              lon: qb.lon,
              label: qb.code || softQuotePointLabel(qb),
              icao: qb.code ?? undefined,
            }
          : undefined,
        nm: soft?.nm,
      }
    : undefined

  const liveTrips = trips.filter((t) => t.status === 'live')
  const liveFlights = liveTrips.map((t) => ({
    from: toMapAirport(t.from),
    to: toMapAirport(t.to),
    progress: t.progress,
    telemetry: t.telemetry ?? undefined,
  }))

  const framePoints = useMemo(() => {
    if (selectedRoute) {
      return [
        { x: selectedRoute.from.x, y: selectedRoute.from.y },
        { x: selectedRoute.to.x, y: selectedRoute.to.y },
      ]
    }
    if (qa) {
      const pts = [projectLonLat(qa.lon, qa.lat, projection)]
      if (qb) pts.push(projectLonLat(qb.lon, qb.lat, projection))
      return pts
    }
    if (liveTrips.length) {
      const pts: Array<{ x: number; y: number }> = []
      for (const t of liveTrips) {
        pts.push(projectLonLat(t.from.lon, t.from.lat, projection))
        pts.push(projectLonLat(t.to.lon, t.to.lat, projection))
      }
      return pts
    }
    return []
  }, [selectedRoute, qa, qb, liveTrips])

  const targetVb = useMemo(() => {
    if (!framePoints.length) return MAP_VIEWBOX.portalDesktop
    return frameMapViewBox({
      points: framePoints,
      screenW: viewport.w,
      screenH: viewport.h,
      bandTop: 110,
      bandBottom: Math.max(140, sheetTop - 30),
      pad: 65,
    })
  }, [framePoints, viewport.w, viewport.h, sheetTop])

  const viewBox = useAnimatedViewBox(targetVb, reducedMotion || dragging)
  const companyName = props.client?.name?.trim() || 'Your company'
  const companyShort = companyName.split(/\s+/).slice(0, 2).join(' ')
  const sheetPadBottom = Math.max(
    104,
    104 + keyboardInset - 8,
  )

  function onHandlePointerDown(e: ReactPointerEvent) {
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = {
      startY: e.clientY,
      startTop: sheetTop,
      lastY: e.clientY,
      lastT: performance.now(),
      v: 0,
    }
    setDragging(true)
  }

  function onHandlePointerMove(e: ReactPointerEvent) {
    const d = dragRef.current
    if (!d) return
    const now = performance.now()
    const dy = e.clientY - d.startY
    const next = Math.min(
      snapTopPx('peek', viewport.h) + 40,
      Math.max(snapTopPx('full', viewport.h) - 8, d.startTop + dy),
    )
    const dt = Math.max(1, now - d.lastT)
    d.v = (e.clientY - d.lastY) / dt
    d.lastY = e.clientY
    d.lastT = now
    setSheetTop(next)
  }

  function onHandlePointerUp() {
    const d = dragRef.current
    dragRef.current = null
    setDragging(false)
    if (!d) return
    const next = nearestSnap(sheetTop, viewport.h, d.v)
    applySnap(next)
  }

  function onHandleClick() {
    if (dragging) return
    applySnap(cycleSnap(snap))
  }

  const tabs: PortalDesktopPanel[] = [
    'trips',
    'request',
    'quote',
    'docs',
    'account',
  ]

  return (
    <div className="ofa-portal-phone ofa-glass" data-theme="client">
      <div className="ofa-map-host">
        <MapBackdrop
          mode="interactive"
          viewBox={viewBox}
          ambientOpacity={selectedRoute || qa ? 0.35 : 1}
          selectedRoute={selectedRoute}
          quotePoints={quotePoints}
          liveFlights={
            !selectedRoute && !qa && liveFlights.length
              ? liveFlights
              : undefined
          }
          onMapClick={onMapClick}
          planeScale={1}
          showQuoteHint={false}
          showHubLabels={false}
          animationsPaused={dragging}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
        />
      </div>

      {panel === 'quote' ? (
        <div className="m-hint">Tap any two points for a soft quote</div>
      ) : null}

      <header className="m-top">
        <img src={BRAND_LOGO_PATH} alt="OnFly Air" />
        <button
          type="button"
          className="g-pill m-co"
          onClick={props.onSwitchCompany}
          aria-label="Switch company"
        >
          {companyShort} <span style={{ opacity: 0.6 }}>⌄</span>
        </button>
        <a
          className="m-call"
          href={`tel:${BRAND_PHONE_E164}`}
          aria-label="Call 24-hr ops"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z" />
          </svg>
        </a>
      </header>

      <section
        className={[
          'm-sheet',
          snap === 'full' || panel === 'request' || panel === 'account'
            ? 'is-full'
            : '',
          !dragging ? 'is-scroll' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        style={{
          top: sheetTop,
          paddingBottom: sheetPadBottom + Math.max(0, keyboardInset),
          transition: dragging || reducedMotion ? undefined : 'top .28s ease-out',
        }}
      >
        <div
          className="m-handle"
          role="button"
          tabIndex={0}
          aria-label="Resize sheet"
          onPointerDown={onHandlePointerDown}
          onPointerMove={onHandlePointerMove}
          onPointerUp={onHandlePointerUp}
          onPointerCancel={onHandlePointerUp}
          onClick={onHandleClick}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              applySnap(cycleSnap(snap))
            }
          }}
        />

        {panel === 'trips' && !detail ? (
          <>
            <div className="m-sh-h">
              <span className="m-kick">Trips</span>
              <span className="m-sum">
                {portalDesktopTripSummary({
                  live: counts.live,
                  pending: counts.pending,
                })}
              </span>
            </div>
            <div className="m-body" ref={bodyRef}>
              <Seg
                value={tab}
                onChange={(id) => setTab(id as PortalDesktopBucket)}
                options={[
                  {
                    id: 'live',
                    label: (
                      <>
                        Live <em className="g-count">{counts.live}</em>
                      </>
                    ),
                  },
                  {
                    id: 'pending',
                    label: (
                      <>
                        Pending <em className="g-count">{counts.pending}</em>
                      </>
                    ),
                  },
                  {
                    id: 'history',
                    label: (
                      <>
                        History <em className="g-count">{counts.history}</em>
                      </>
                    ),
                  },
                ]}
              />
              <div className="m-list">
                {rows.length === 0 ? (
                  <p className="g-body" style={{ padding: '12px 4px' }}>
                    No trips in this bucket yet.
                  </p>
                ) : (
                  rows.map((t) => {
                    const meta = portalDesktopStatusMeta(t.status)
                    return (
                      <button
                        key={t.id}
                        type="button"
                        className={['m-row', sel === t.id ? 'is-on' : '']
                          .filter(Boolean)
                          .join(' ')}
                        onClick={() => openDetail(t.id)}
                      >
                        <div className="m-row-h">
                          <span
                            className={
                              t.status === 'live' ? 'm-dot g-live' : 'm-dot'
                            }
                            style={
                              t.status === 'live'
                                ? undefined
                                : {
                                    background: meta.color,
                                    boxShadow: `0 0 8px ${meta.color}`,
                                  }
                            }
                          />
                          <span className="m-po">
                            {t.po && t.po !== '—' ? `PO ${t.po}` : t.displayId}
                          </span>
                          <span className="m-id">{t.displayId}</span>
                          <span
                            className="g-chip"
                            style={{
                              color: meta.color,
                              borderColor: `${meta.color}66`,
                              marginLeft: 'auto',
                            }}
                          >
                            {tab === 'history' && t.date
                              ? t.date
                              : meta.chip}
                          </span>
                        </div>
                        <div className="m-row-r">
                          <span className="m-route">
                            {t.from.icao} → {t.to.icao}
                          </span>
                          <span className="m-meta">
                            {[t.tail, t.aircraft].filter(Boolean).join(' · ') ||
                              'vetted Part 135 carrier'}
                          </span>
                        </div>
                        {tab !== 'history' ? (
                          <>
                            <div className="m-bar">
                              <i
                                style={{
                                  width: `${Math.round(t.progress * 100)}%`,
                                }}
                              />
                            </div>
                            <div className="m-times">
                              <span>{t.lastEvent}</span>
                              <b>{t.nextEvent}</b>
                            </div>
                          </>
                        ) : null}
                      </button>
                    )
                  })
                )}
              </div>
            </div>
            <div className="m-sticky">
              <button
                type="button"
                className="g-btn m-cta"
                onClick={() => goPanel('request')}
              >
                New request
              </button>
            </div>
          </>
        ) : null}

        {panel === 'trips' && detail && selected ? (
          <>
            <button type="button" className="m-back" onClick={closeDetail}>
              ‹ Trips
            </button>
            <div className="m-body">
              <div className="m-det-h">
                <span
                  className={
                    selected.status === 'live' ? 'm-dot g-live' : 'm-dot'
                  }
                  style={
                    selected.status === 'live'
                      ? undefined
                      : {
                          background: portalDesktopStatusMeta(selected.status)
                            .color,
                        }
                  }
                />
                <span className="m-stat">
                  {portalDesktopStatusMeta(selected.status).chip}
                </span>
                <span className="m-id" style={{ marginLeft: 'auto' }}>
                  {selected.displayId}
                </span>
              </div>
              <div className="m-det-t">
                <span>
                  {selected.po && selected.po !== '—'
                    ? `PO ${selected.po}`
                    : selected.displayId}
                </span>
                <span className="m-route">
                  {selected.from.icao} → {selected.to.icao}
                </span>
              </div>
              <div className="m-det-s">
                {[selected.aircraft, selected.tail, 'vetted Part 135 carrier']
                  .filter(Boolean)
                  .join(' · ')}
              </div>
              {selected.status === 'live' && selected.telemetry ? (
                <div className="m-tele">
                  {selected.telemetry.split(/\s{2,}|\s·\s/).map((bit) => (
                    <span key={bit}>{bit}</span>
                  ))}
                </div>
              ) : null}
              <div className="m-facts">
                <div className="m-fact">
                  <span>Wheels up</span>
                  <b>{selected.lastEvent}</b>
                </div>
                <div className="m-fact">
                  <span>ETA / next</span>
                  <b className="gold">{selected.nextEvent}</b>
                </div>
                <div className="m-fact">
                  <span>Load</span>
                  <b>{selected.load}</b>
                </div>
                <div className="m-fact">
                  <span>Service</span>
                  <b>{selected.service}</b>
                </div>
                <div className="m-fact">
                  <span>Courier</span>
                  <b>{selected.courier}</b>
                </div>
                <div className="m-fact">
                  <span>Dispatcher</span>
                  <b>
                    {selected.dispatcher?.name ?? 'Desk'}
                    {selected.dispatcher?.phone
                      ? ` · ${selected.dispatcher.phone}`
                      : ''}
                  </b>
                </div>
              </div>
              <div className="m-steps">
                <div className="m-steps-line">
                  <i
                    style={{
                      width: `${Math.min(
                        100,
                        (selected.currentStep / 4) * 100,
                      )}%`,
                    }}
                  />
                </div>
                {selected.steps.map((step, i) => {
                  const cls =
                    i < selected.currentStep
                      ? 'done'
                      : i === selected.currentStep
                        ? 'live'
                        : ''
                  return (
                    <div key={step.label} className={['m-step', cls].join(' ')}>
                      <i />
                      <span>{step.label}</span>
                      <em>{step.time}</em>
                    </div>
                  )
                })}
              </div>
              <div className="m-docs">
                {(['Quote', 'Invoice', 'POD'] as const).map((kind) => {
                  const on = selected.docs.includes(kind)
                  return (
                    <button
                      key={kind}
                      type="button"
                      className={on ? 'g-pill g-pill--gold' : 'g-pill'}
                      style={{ opacity: on ? 1 : 0.45 }}
                      onClick={() => {
                        if (!on) return
                        goPanel('docs')
                      }}
                    >
                      {kind}
                    </button>
                  )
                })}
              </div>
              {approveGap ? (
                <p className="g-body" style={{ color: 'var(--ofa-red)', marginTop: 10 }}>
                  {approveGap}
                </p>
              ) : null}
            </div>
            <div className="m-sticky">
              <div className="m-actions">
                <button
                  type="button"
                  className="g-ghost"
                  onClick={() => onShare(selected)}
                >
                  Share
                </button>
                <button
                  type="button"
                  className="g-btn"
                  onClick={() => onCta(selected)}
                >
                  {portalDesktopCta(selected.status)}
                </button>
              </div>
            </div>
          </>
        ) : null}

        {panel === 'request' ? (
          <>
            <div className="m-sh-h">
              <span className="m-kick">New request</span>
              <button
                type="button"
                className="m-x"
                aria-label="Close request"
                onClick={() => goPanel(prevPanel === 'request' ? 'trips' : prevPanel)}
              >
                ×
              </button>
            </div>
            {sent && sentTrip ? (
              <div className="m-body">
                <div className="m-det-h">
                  <span className="m-dot g-live" />
                  <span className="m-stat">Request received</span>
                </div>
                <h2 className="m-h2">Our desk phones are ringing now.</h2>
                <p className="g-body">
                  Expect a call from dispatch within 10 minutes and a hard quote
                  in 10–15. Your request is in Pending with trip number{' '}
                  <b>{sentTrip.displayId}</b>.
                </p>
                <div className="m-sent-box">
                  ROUTE {sentTrip.from.icao} → {sentTrip.to.icao}
                  <br />
                  LOAD {sentTrip.load}
                  <br />
                  NEED {need}
                </div>
                <div className="m-sticky" style={{ marginTop: 16 }}>
                  <button
                    type="button"
                    className="g-btn"
                    style={{ width: '100%' }}
                    onClick={() => {
                      setTab('pending')
                      openDetail(sentTrip.id)
                    }}
                  >
                    Track it in Pending
                  </button>
                  <div className="m-fine">
                    <button type="button" onClick={() => setSent(false)}>
                      Send another
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <>
                <div className="m-body">
                  <h2 className="m-h2">
                    Airports and what&apos;s moving. We handle the rest.
                  </h2>
                  <div className="m-onfile">
                    <div>
                      <em>On file · auto-filled</em>
                      <b>{companyName}</b>
                      <span>
                        {[acctOps || acctDesk, acctInv]
                          .filter(Boolean)
                          .join(' · ') || props.email}
                      </span>
                    </div>
                    <button type="button" onClick={() => goPanel('account')}>
                      Edit
                    </button>
                  </div>
                  <div className="m-2">
                    <div>
                      <label htmlFor="m-from">From</label>
                      <div className="g-field g-field--icao">
                        <input
                          id="m-from"
                          value={fromText}
                          onChange={(e) => setFromText(e.target.value)}
                          placeholder="ICAO or city"
                          autoCapitalize="characters"
                          autoComplete="off"
                          inputMode="text"
                        />
                      </div>
                      <small className={fromAp ? undefined : 'g-field-hint is-pending'} style={{ color: fromAp ? undefined : 'var(--ofa-mute)' }}>
                        {fromAp
                          ? `${fromAp.icao} · ${fromAp.city}`
                          : 'Desk will confirm airport'}
                      </small>
                    </div>
                    <div>
                      <label htmlFor="m-to">To</label>
                      <div className="g-field g-field--icao">
                        <input
                          id="m-to"
                          value={toText}
                          onChange={(e) => setToText(e.target.value)}
                          placeholder="ICAO or city"
                          autoCapitalize="characters"
                          autoComplete="off"
                          inputMode="text"
                        />
                      </div>
                      <small style={{ color: toAp ? undefined : 'var(--ofa-mute)' }}>
                        {toAp
                          ? `${toAp.icao} · ${toAp.city}`
                          : 'Desk will confirm airport'}
                      </small>
                    </div>
                  </div>
                  <label>What&apos;s moving</label>
                  <Seg
                    value={moving}
                    onChange={(id) => setMoving(id as 'cargo' | 'pax')}
                    options={[
                      { id: 'cargo', label: 'Cargo' },
                      { id: 'pax', label: 'Passengers' },
                    ]}
                  />
                  <div className="m-2">
                    <div>
                      <label htmlFor="m-load">
                        {moving === 'cargo'
                          ? 'Pieces · weight (lb) · dims'
                          : 'Passenger count'}
                      </label>
                      <div className="g-field">
                        <input
                          id="m-load"
                          value={loadText}
                          onChange={(e) => setLoadText(e.target.value)}
                          inputMode={moving === 'pax' ? 'numeric' : 'text'}
                        />
                      </div>
                    </div>
                    <div>
                      <label htmlFor="m-po">PO number (optional)</label>
                      <div className="g-field">
                        <input
                          id="m-po"
                          value={poText}
                          onChange={(e) => setPoText(e.target.value)}
                          autoComplete="off"
                        />
                      </div>
                    </div>
                  </div>
                  <label>Ground courier</label>
                  <div className="m-2">
                    <button
                      type="button"
                      className={['m-check', pickup ? 'is-on' : ''].join(' ')}
                      onClick={() => setPickup((v) => !v)}
                    >
                      <i /> Pick up at origin
                    </button>
                    <button
                      type="button"
                      className={['m-check', deliver ? 'is-on' : ''].join(' ')}
                      onClick={() => setDeliver((v) => !v)}
                    >
                      <i /> Deliver to site
                    </button>
                  </div>
                  {pickup || deliver ? (
                    <>
                      <label htmlFor="m-courier">Street address for the courier</label>
                      <div className="g-field">
                        <input
                          id="m-courier"
                          value={courierAddr}
                          onChange={(e) => setCourierAddr(e.target.value)}
                          autoComplete="street-address"
                        />
                      </div>
                    </>
                  ) : null}
                  <label>Need it</label>
                  <Seg
                    value={need}
                    onChange={(id) =>
                      setNeed(id as 'asap' | 'today' | 'tomorrow')
                    }
                    options={[
                      { id: 'asap', label: 'ASAP' },
                      { id: 'today', label: 'Today' },
                      { id: 'tomorrow', label: 'Tomorrow' },
                    ]}
                  />
                  <label htmlFor="m-notes">Notes for the desk</label>
                  <div className="g-field" style={{ height: 'auto', padding: '10px 14px' }}>
                    <textarea
                      id="m-notes"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      rows={3}
                      placeholder="Hazmat, dims, forklift, deadline…"
                      style={{
                        width: '100%',
                        background: 'transparent',
                        border: 0,
                        outline: 0,
                        color: 'var(--ofa-ink)',
                        font: '400 14px/1.35 var(--ofa-font)',
                        resize: 'none',
                      }}
                    />
                  </div>
                  {sendError ? (
                    <p className="g-body" style={{ color: 'var(--ofa-red)' }}>
                      {sendError}
                    </p>
                  ) : null}
                </div>
                <div className="m-sticky">
                  <button
                    type="button"
                    className="g-btn"
                    style={{ width: '100%' }}
                    disabled={sending}
                    onClick={() => void sendRequest()}
                  >
                    {sending
                      ? 'Sending…'
                      : 'Send to desk — rings our phones'}
                  </button>
                  <div className="m-fine">
                    <span>Hard quote in 10–15 min</span>
                    <Link to="/portal/request">Full booking form →</Link>
                  </div>
                </div>
              </>
            )}
          </>
        ) : null}

        {panel === 'quote' ? (
          <>
            <div className="m-sh-h">
              <span className="m-kick">Soft quote</span>
              {soft ? (
                <span className="m-sum">
                  {soft.nmLabel} nm · {soft.smLabel} sm
                </span>
              ) : null}
            </div>
            <div className="m-body">
              {(snap === 'half' || snap === 'detail' || snap === 'full') && (
                <div className="m-2" style={{ marginBottom: 8 }}>
                  <div>
                    <label htmlFor="m-qa">Origin</label>
                    <div className="g-field g-field--icao">
                      <input
                        id="m-qa"
                        value={qaText}
                        onChange={(e) => {
                          const v = e.target.value
                          setQaText(v)
                          const ap = resolveAirportText(v)
                          if (ap) {
                            setQa({
                              lat: ap.lat,
                              lon: ap.lon,
                              code: ap.icao,
                              city: ap.city,
                            })
                          }
                        }}
                        placeholder="Tap map"
                        autoCapitalize="characters"
                      />
                    </div>
                  </div>
                  <div>
                    <label htmlFor="m-qb">Destination</label>
                    <div className="g-field g-field--icao">
                      <input
                        id="m-qb"
                        value={qbText}
                        onChange={(e) => {
                          const v = e.target.value
                          setQbText(v)
                          const ap = resolveAirportText(v)
                          if (ap) {
                            setQb({
                              lat: ap.lat,
                              lon: ap.lon,
                              code: ap.icao,
                              city: ap.city,
                            })
                          }
                        }}
                        placeholder="Tap map"
                        autoCapitalize="characters"
                      />
                    </div>
                  </div>
                </div>
              )}
              {soft && qa && qb ? (
                <>
                  <div className="m-qroute">
                    <span className="mono">
                      {softQuotePointLabel(qa)} → {softQuotePointLabel(qb)}
                    </span>
                    <button type="button" onClick={clearQuote}>
                      Clear
                    </button>
                  </div>
                  {soft.classes.map((c) => (
                    <div
                      key={c.name}
                      className="m-cls"
                      style={{ opacity: c.opacity }}
                    >
                      <div>
                        <b>{c.name}</b>
                        <span>{c.sub}</span>
                      </div>
                      <div>
                        <b className="mono">{c.price}</b>
                        <span>{c.block}</span>
                      </div>
                    </div>
                  ))}
                  <p className="g-body" style={{ marginTop: 10 }}>
                    {PORTAL_SOFT_QUOTE_FINE_PRINT}
                  </p>
                </>
              ) : (
                <p className="g-body" style={{ padding: '8px 0' }}>
                  Tap two points on the map — or drag the sheet up to type
                  airports.
                </p>
              )}
            </div>
            <div className="m-sticky">
              <button
                type="button"
                className="g-btn"
                style={{ width: '100%' }}
                disabled={!soft}
                onClick={quoteToDesk}
              >
                Get a hard quote
              </button>
            </div>
          </>
        ) : null}

        {panel === 'docs' ? (
          <>
            <div className="m-sh-h">
              <span className="m-kick">Documents</span>
              <span className="m-sum">{docs.length} files</span>
            </div>
            <div className="m-body">
              <div className="g-field" style={{ marginBottom: 8 }}>
                <input
                  value={docQuery}
                  onChange={(e) => setDocQuery(e.target.value)}
                  placeholder="Search PO, trip or route"
                  inputMode="search"
                  aria-label="Search documents"
                />
              </div>
              <div className="m-list">
                {filteredDocs.length === 0 ? (
                  <p className="g-body">No documents yet.</p>
                ) : (
                  filteredDocs.map((d) => (
                    <button
                      key={`${d.tripId}-${d.kind}-${d.name}`}
                      type="button"
                      className="m-doc"
                      onClick={() => openDetail(d.tripId)}
                    >
                      <span
                        className="m-doc-k"
                        style={{
                          color: d.kind === 'POD' ? '#5FA36F' : '#E3B341',
                        }}
                      >
                        {d.kind}
                      </span>
                      <div>
                        <b>{d.name}</b>
                        <span className="mono">
                          PO {d.po} · {d.route} · {d.date}
                        </span>
                      </div>
                      <span className="m-doc-dl" aria-hidden>
                        ↓
                      </span>
                    </button>
                  ))
                )}
              </div>
            </div>
          </>
        ) : null}

        {panel === 'account' ? (
          <form
            onSubmit={saveAccount}
            style={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1 }}
          >
            <div className="m-sh-h">
              <span className="m-kick">Account</span>
            </div>
            <div className="m-body">
              <div className="m-h2" style={{ marginBottom: 2 }}>
                {companyName}
              </div>
              <div className="m-fine" style={{ marginBottom: 6, display: 'block' }}>
                <span>
                  {props.email} · these details auto-fill every request
                </span>
              </div>
              <label htmlFor="m-co-name">Company name</label>
              <div className="g-field">
                <input
                  id="m-co-name"
                  value={acctName}
                  onChange={(e) => setAcctName(e.target.value)}
                  autoComplete="organization"
                />
              </div>
              <div className="m-2">
                <div>
                  <label htmlFor="m-desk">Front desk</label>
                  <div className="g-field">
                    <input
                      id="m-desk"
                      className="mono"
                      value={acctDesk}
                      onChange={(e) => setAcctDesk(e.target.value)}
                      inputMode="tel"
                      autoComplete="tel"
                    />
                  </div>
                </div>
                <div>
                  <label htmlFor="m-ops">Ops callback</label>
                  <div className="g-field">
                    <input
                      id="m-ops"
                      className="mono"
                      value={acctOps}
                      onChange={(e) => setAcctOps(e.target.value)}
                      inputMode="tel"
                      autoComplete="tel"
                    />
                  </div>
                </div>
              </div>
              <label htmlFor="m-inv">Invoice email</label>
              <div className="g-field">
                <input
                  id="m-inv"
                  value={acctInv}
                  onChange={(e) => setAcctInv(e.target.value)}
                  inputMode="email"
                  autoComplete="email"
                />
              </div>
              <label htmlFor="m-ship">Default ship-to</label>
              <div className="g-field">
                <input
                  id="m-ship"
                  value={acctAddr}
                  onChange={(e) => setAcctAddr(e.target.value)}
                  autoComplete="street-address"
                />
              </div>
              <label>Notifications</label>
              <button
                type="button"
                className={['m-toggle', smsOn ? 'is-on' : ''].join(' ')}
                onClick={() => setSmsOn((v) => !v)}
              >
                SMS on wheels-up / landing
                <i />
              </button>
              <button
                type="button"
                className={['m-toggle', emailOn ? 'is-on' : ''].join(' ')}
                onClick={() => setEmailOn((v) => !v)}
              >
                Email quotes &amp; POD
                <i />
              </button>
              <div className="m-acct-foot">
                <div className="m-clocks">
                  LOCAL {clocks.local} · UTC {clocks.utc}
                </div>
                <button
                  type="button"
                  className="g-ghost"
                  style={{ width: '100%', marginBottom: 12 }}
                  onClick={props.onSignOut}
                >
                  Sign out
                </button>
                <PortalInstallBanner density="a2hs" variant="glass" />
              </div>
              {acctError ? (
                <p className="g-body" style={{ color: 'var(--ofa-red)' }}>
                  {acctError}
                </p>
              ) : null}
              {acctSaved ? (
                <p className="g-body" style={{ color: 'var(--ofa-green-2)' }}>
                  Saved.
                </p>
              ) : null}
            </div>
            <div className="m-sticky">
              <button type="submit" className="g-btn" style={{ width: '100%' }}>
                Save changes
              </button>
              <div className="m-fine">
                <span>
                  Sign-in email is fixed. Dispatch logins are separate.
                </span>
              </div>
            </div>
          </form>
        ) : null}
      </section>

      <nav className="m-tabs" aria-label="Portal sections">
        {tabs.map((id) => {
          const on = panel === id || (id === 'trips' && detail)
          return (
            <button
              key={id}
              type="button"
              className={['m-tab', on ? 'is-on' : ''].filter(Boolean).join(' ')}
              aria-current={on ? 'page' : undefined}
              onClick={() => goPanel(id)}
            >
              {id === 'trips' && counts.live > 0 ? (
                <b className="m-badge">{counts.live}</b>
              ) : null}
              <span className="m-tab-ic">
                <TabIcon id={id} />
              </span>
              <span>
                {id === 'trips'
                  ? 'Trips'
                  : id === 'request'
                    ? 'Request'
                    : id === 'quote'
                      ? 'Quote'
                      : id === 'docs'
                        ? 'Docs'
                        : 'Account'}
              </span>
            </button>
          )
        })}
      </nav>
    </div>
  )
}
