/**
 * Portal home shipment card — route, tail, stage (no projected-vs-actual).
 */

import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useAdsbForTail } from '@/hooks/useAdsbForTail'
import {
  buildPortalTrackingView,
  clientOpsStageLabel,
  tripToTrackingInput,
  type PortalShipmentPhase,
} from '@/domain/portalTracking'
import { getTrip } from '@/lib/tripStore'

export type PortalHomeTripCardProps = {
  id: string
  tripRef: number
  state: string
  lane: string
  ready_label: string
  payload_summary: string
  trackHref: string
  /** @deprecated ignored — cards show stage, not clocks */
  etaHint: string | null
  nextLabel: string | null
}

function phaseLabel(phase: PortalShipmentPhase): string {
  if (phase === 'in_flight') return 'In flight'
  if (phase === 'on_truck') return 'On delivery truck'
  if (phase === 'delivered') return 'Delivered'
  if (phase === 'booked') return 'Booked'
  return 'In progress'
}

function patternLabel(pattern: string | null | undefined): string {
  if (pattern === 'D2D') return 'door to door'
  if (pattern === 'D2A') return 'door to airport'
  if (pattern === 'A2D') return 'airport to door'
  return 'airport to airport'
}

export function PortalHomeTripCard(props: PortalHomeTripCardProps) {
  const trip = getTrip(props.id)
  const nowIso = useMemo(() => new Date().toISOString(), [])
  const input = trip ? tripToTrackingInput(trip) : null
  const adsb = useAdsbForTail(input?.tail)
  const view = useMemo(() => {
    if (!trip) return null
    return buildPortalTrackingView(tripToTrackingInput(trip), {
      adsb,
      nowIso,
    })
  }, [trip, adsb, nowIso])

  const phase: PortalShipmentPhase = view?.phase ?? 'other'
  const dark = phase === 'in_flight'
  const progress =
    view?.aircraft.progressPct != null
      ? Math.max(4, Math.min(100, view.aircraft.progressPct))
      : phase === 'delivered'
        ? 100
        : phase === 'on_truck'
          ? 78
          : phase === 'in_flight'
            ? 55
            : 20

  const po =
    view?.poNumber?.trim() ||
    trip?.po_number?.trim() ||
    trip?.quick?.po?.trim() ||
    `T-${props.tripRef}`
  const lane = view?.lane || props.lane || '—'
  const tail = view?.tail || trip?.quick?.tail || null
  const typeName = view?.aircraftType || trip?.quick?.aircraft_type || null
  const pattern = patternLabel(view?.pattern)
  const hasPod = (view?.documents ?? []).some((d) => d.kind === 'pod')

  const currentOps = view?.opsForecastRows.find((r) => r.status === 'active')
  const stageName = currentOps
    ? clientOpsStageLabel(currentOps)
    : phase === 'delivered'
      ? 'Delivered'
      : props.nextLabel || phaseLabel(phase)

  const leftMeta = tail ? `TAIL ${tail}` : 'TAIL TBD'
  const rightMeta =
    phase === 'delivered'
      ? hasPod
        ? 'POD ON FILE'
        : 'DELIVERED'
      : stageName.toUpperCase()

  const cta =
    phase === 'delivered'
      ? { label: 'View POD & details', href: props.trackHref }
      : {
          label: phase === 'in_flight' ? 'View live tracking' : 'View tracking',
          href: props.trackHref,
        }

  return (
    <li
      className={[
        'overflow-hidden rounded-md border',
        dark
          ? 'border-ink bg-ink text-cream'
          : 'border-border/80 bg-white text-ink',
      ].join(' ')}
    >
      <div className="px-4 pb-3 pt-4 sm:px-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em]">
            {phase === 'in_flight' ? (
              <span className="h-2 w-2 rounded-full bg-[#2E7D32]" aria-hidden />
            ) : null}
            <span
              className={
                phase === 'delivered'
                  ? 'text-[#2E7D32]'
                  : dark
                    ? 'text-cream'
                    : 'text-ink'
              }
            >
              {phaseLabel(phase)}
            </span>
          </div>
          <span
            className={[
              'rounded border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider',
              dark
                ? 'border-cream/25 text-cream/80'
                : 'border-border text-muted',
            ].join(' ')}
          >
            {stageName}
          </span>
        </div>

        <div
          className={[
            'mt-3 text-2xl font-semibold tracking-tight',
            dark ? 'text-cream' : 'text-ink',
          ].join(' ')}
        >
          PO #{po.replace(/^PO\s*#?\s*/i, '')}
        </div>
        <div className="avionic mt-1 text-sm font-medium text-gold">
          {lane}
          {tail ? ` · ${tail}` : ''}
        </div>
        <div
          className={[
            'mt-0.5 text-xs',
            dark ? 'text-cream/70' : 'text-muted',
          ].join(' ')}
        >
          {[typeName, pattern].filter(Boolean).join(' · ') || 'Aircraft TBD'}
        </div>

        <div
          className={[
            'mt-4 h-1.5 w-full overflow-hidden rounded-full',
            dark ? 'bg-cream/15' : 'bg-border/70',
          ].join(' ')}
        >
          <div
            className={[
              'h-full rounded-full',
              phase === 'delivered' ? 'bg-[#2E7D32]' : 'bg-gold',
            ].join(' ')}
            style={{ width: `${progress}%` }}
          />
        </div>

        <div className="mt-3 flex flex-wrap items-end justify-between gap-2 text-xs">
          <span
            className={[
              'avionic uppercase tracking-wider',
              dark ? 'text-cream/65' : 'text-muted',
            ].join(' ')}
          >
            {leftMeta}
          </span>
          <span
            className={[
              'font-semibold uppercase tracking-wider',
              phase === 'delivered'
                ? 'text-[#2E7D32]'
                : dark
                  ? 'text-cream'
                  : 'text-ink',
            ].join(' ')}
          >
            {rightMeta}
          </span>
        </div>
      </div>

      <Link
        to={cta.href}
        className={[
          'block px-4 py-3 text-center text-xs font-semibold uppercase tracking-[0.14em] sm:px-5',
          dark
            ? 'bg-gold text-ink hover:bg-gold-lt'
            : 'border-t border-border/70 text-gold hover:bg-gold/5',
        ].join(' ')}
      >
        {cta.label}
      </Link>
    </li>
  )
}
