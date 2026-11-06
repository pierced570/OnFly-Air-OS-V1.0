/**
 * Mobile AOG / urgent sheet — map + “Need it moving now?” capture, then ring desk.
 */

import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AirportSelect } from '@/components/AirportSelect'
import { MapBackdrop } from '@/components/MapBackdrop'
import PhoneInput from '@/components/PhoneInput'
import {
  BRAND_LOGO_PATH,
  BRAND_PHONE,
  BRAND_PHONE_E164,
  dialBrandOps,
} from '@/domain/brand'
import { lookupAirport } from '@/domain/airports'
import { softQuoteFor, softQuotePointLabel } from '@/domain/portalSoftQuote'
import { projectLonLat, type MapProjection } from '@/domain/portalMap'
import portalMapData from '@/data/portalMapData.json'
import {
  emptyTripRequestDraft,
  newLeg,
  type TripRequestDraft,
} from '@/domain/tripRequest'
import { writeFastQuoteDraft } from '@/components/PortalFastQuote'
import { submitTripRequest } from '@/lib/requestStore'
import { connectPortalRequestToSpine } from '@/lib/portalRequestConnect'

const projection = portalMapData.us_map.projection as MapProjection

function toMapPoint(code: string) {
  const c = code.trim().toUpperCase()
  if (!c) return null
  const ap = lookupAirport(c)
  const lat = ap?.lat ?? 39.5
  const lon = ap?.lon ?? -98.3
  const pt = projectLonLat(lon, lat, projection)
  return {
    x: pt.x,
    y: pt.y,
    lat,
    lon,
    icao: c,
    label: ap ? softQuotePointLabel({ lat, lon, code: c, city: ap.city }) : c,
  }
}

function PhoneFab() {
  return (
    <a
      href={`tel:${BRAND_PHONE_E164}`}
      aria-label={`Call dispatch ${BRAND_PHONE}`}
      style={{
        width: 40,
        height: 40,
        borderRadius: '50%',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(145deg, var(--ofa-gold-2), #A8841C)',
        color: '#0C0C0E',
        boxShadow: '0 8px 20px rgba(201,162,39,.35)',
        textDecoration: 'none',
        flexShrink: 0,
      }}
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z" />
      </svg>
    </a>
  )
}

export function PortalGuestAogSheet(props: {
  signedIn: boolean
  loginHref: string
  email?: string | null
}) {
  const [origin, setOrigin] = useState('')
  const [dest, setDest] = useState('')
  const [timing, setTiming] = useState<'asap' | 'scheduled'>('asap')
  const [email, setEmail] = useState(() => (props.email ?? '').trim())
  const [phone, setPhone] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const quotePoints = useMemo(() => {
    const a = toMapPoint(origin)
    const b = toMapPoint(dest)
    if (!a || !b) return undefined
    const soft = softQuoteFor(
      { lat: a.lat, lon: a.lon, code: a.icao },
      { lat: b.lat, lon: b.lon, code: b.icao },
    )
    return { a, b, nm: soft.nm }
  }, [origin, dest])

  async function ringDispatch() {
    setError(null)
    const o = origin.trim().toUpperCase()
    const d = dest.trim().toUpperCase()
    if (o.length < 3 || d.length < 3) {
      setError('Pick from and to airports.')
      return
    }
    if (o === d) {
      setError('From and to need to be different.')
      return
    }

    const draft: TripRequestDraft = {
      ...emptyTripRequestDraft(),
      email: email.trim().toLowerCase(),
      urgent_phone: phone,
      timing,
      direction: 'one_way',
      service_mode: 'a2a',
      cargo_only: true,
      cargo_dims_status: 'not_yet',
      notes: 'AOG / urgent — ring desk; cargo details after call',
      legs: [
        newLeg({
          origin_icao: o,
          dest_icao: d,
          payload: 'cargo',
          cargo_dims_status: 'not_yet',
        }),
      ],
    }

    setBusy(true)
    try {
      writeFastQuoteDraft(draft)
      const row = submitTripRequest(draft, 'portal', { alert: 'none' })
      void connectPortalRequestToSpine(row).catch(() => {})
      dialBrandOps()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="ofa-glass ofa-guest-aog" style={{ minHeight: '100dvh' }}>
      <div
        style={{ position: 'fixed', inset: 0, zIndex: 0 }}
        aria-hidden="true"
      >
        <MapBackdrop
          mode="interactive"
          viewBox="0 0 1440 900"
          quotePoints={quotePoints}
          showQuoteHint={false}
          planeScale={0.95}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
        />
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background:
              'linear-gradient(180deg, rgba(8,8,10,.2) 0%, rgba(8,8,10,.45) 40%, rgba(8,8,10,.78) 100%)',
            pointerEvents: 'none',
          }}
        />
      </div>

      <header
        style={{
          position: 'relative',
          zIndex: 2,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          padding: '14px 16px',
        }}
      >
        <Link to="/">
          <img src={BRAND_LOGO_PATH} alt="OnFly Air" style={{ height: 20 }} />
        </Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {!props.signedIn ? (
            <Link
              to={props.loginHref}
              className="g-ghost"
              style={{ height: 36, padding: '0 14px' }}
            >
              Sign in
            </Link>
          ) : (
            <Link to="/" className="g-ghost" style={{ height: 36, padding: '0 14px' }}>
              My trips
            </Link>
          )}
          <PhoneFab />
        </div>
      </header>

      <main
        style={{
          position: 'relative',
          zIndex: 2,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'flex-end',
          minHeight: 'calc(100dvh - 64px)',
          padding: '0 12px 12px',
        }}
      >
        <section
          className="g-panel g-panel--dense"
          style={{
            borderRadius: '22px 22px 18px 18px',
            padding: '10px 14px 16px',
            maxHeight: 'min(68dvh, 560px)',
            overflow: 'auto',
          }}
        >
          <div
            style={{
              width: 36,
              height: 4,
              borderRadius: 999,
              background: 'rgba(255,255,255,.18)',
              margin: '0 auto 12px',
            }}
            aria-hidden="true"
          />
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 10,
            }}
          >
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                font: '500 11.5px/1 var(--ofa-font)',
                color: 'var(--ofa-gold-2)',
              }}
            >
              <i
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: '50%',
                  background: 'var(--ofa-gold-2)',
                  boxShadow: '0 0 8px rgba(201,162,39,.55)',
                }}
              />
              AOG / urgent
            </span>
            <Link
              to="/portal/request?mode=book"
              style={{
                font: '500 12.5px/1 var(--ofa-font)',
                color: 'var(--ofa-gold-2)',
                textDecoration: 'none',
              }}
            >
              Full form →
            </Link>
          </div>

          <h1
            style={{
              margin: '12px 0 0',
              font: '500 24px/1.15 var(--ofa-font)',
              letterSpacing: '-.025em',
              color: 'var(--ofa-ink)',
            }}
          >
            Need it moving now?
          </h1>

          <div
            style={{
              marginTop: 14,
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 10,
            }}
          >
            <label className="block text-xs font-medium text-muted">
              From
              <AirportSelect
                label=""
                value={origin}
                onChange={setOrigin}
                required
                inputClassName="portal-glass-input mt-1 rounded-xl px-3 py-3 text-sm text-ink outline-none"
              />
            </label>
            <label className="block text-xs font-medium text-muted">
              To
              <AirportSelect
                label=""
                value={dest}
                onChange={setDest}
                required
                inputClassName="portal-glass-input mt-1 rounded-xl px-3 py-3 text-sm text-ink outline-none"
              />
            </label>
          </div>

          <div style={{ marginTop: 12 }}>
            <div className="text-xs font-medium text-muted">Ready</div>
            <div className="portal-glass mt-2 grid grid-cols-2 gap-1 rounded-xl p-1">
              <button
                type="button"
                onClick={() => setTiming('asap')}
                className={[
                  'rounded-xl px-3 py-2.5 text-sm font-medium',
                  timing === 'asap'
                    ? 'bg-gold/20 font-semibold text-ink'
                    : 'text-muted hover:text-ink',
                ].join(' ')}
              >
                Within 4 h
              </button>
              <button
                type="button"
                onClick={() => setTiming('scheduled')}
                className={[
                  'rounded-xl px-3 py-2.5 text-sm font-medium',
                  timing === 'scheduled'
                    ? 'bg-gold/20 font-semibold text-ink'
                    : 'text-muted hover:text-ink',
                ].join(' ')}
              >
                Pick time
              </button>
            </div>
          </div>

          <label
            className="block text-xs font-medium text-muted"
            style={{ marginTop: 12 }}
          >
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              placeholder="you@company.com"
              className="portal-glass-input mt-1 w-full rounded-xl px-3 py-3 text-sm text-ink outline-none"
            />
          </label>

          <label
            className="block text-xs font-medium text-muted"
            style={{ marginTop: 12 }}
          >
            Phone
            <PhoneInput
              international
              value={phone}
              onChange={(e164) => setPhone(e164)}
              placeholder="(555) 555-5555"
              className="min-w-0 flex-1 border-0 bg-transparent px-3 py-2.5 font-mono text-sm text-[var(--text)] outline-none"
              rowClassName="portal-glass-input mt-1 flex min-w-0 overflow-hidden rounded-xl focus-within:border-gold"
              selectClassName="shrink-0 border-0 border-r border-border bg-transparent px-2 py-2.5 text-sm text-[var(--text)] outline-none"
              autoComplete="tel"
            />
          </label>

          {error ? (
            <p className="mt-3 text-sm text-[#C0392B]">{error}</p>
          ) : null}

          <button
            type="button"
            className="g-btn"
            style={{ width: '100%', marginTop: 16 }}
            disabled={busy}
            onClick={() => void ringDispatch()}
          >
            {busy ? 'Opening dialer…' : 'Ring dispatch now'}
          </button>
          <p
            className="g-body"
            style={{
              marginTop: 10,
              textAlign: 'center',
              fontSize: 11.5,
              lineHeight: 1.4,
            }}
          >
            Add cargo details after the call starts
          </p>
        </section>
      </main>
    </div>
  )
}
