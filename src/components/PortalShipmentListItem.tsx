/**
 * Compact selectable shipment row for the client dashboard sidebar.
 * Shows lane, cargo/pax, tail, and ETA — no ADS-B poll; labels from trip spine.
 */

import {
  buildPortalTrackingView,
  clientOpsStageLabel,
  tripToTrackingInput,
  type PortalShipmentPhase,
} from '@/domain/portalTracking'
import { getTrip } from '@/lib/tripStore'

export type PortalShipmentListItemProps = {
  id: string
  tripRef: number
  state: string
  lane: string
  nextLabel: string | null
  payloadSummary?: string | null
  selected: boolean
  onSelect: (id: string) => void
}

function phaseLabel(phase: PortalShipmentPhase): string {
  if (phase === 'in_flight') return 'In flight'
  if (phase === 'on_truck') return 'On truck'
  if (phase === 'delivered') return 'Delivered'
  if (phase === 'booked') return 'Booked'
  return 'In progress'
}

function phaseBadgeClass(phase: PortalShipmentPhase): string {
  if (phase === 'in_flight')
    return 'border-[#C9A227]/50 bg-[#C9A227]/15 text-[#C9A227]'
  if (phase === 'on_truck') return 'border-ink/20 bg-ink/5 text-ink'
  if (phase === 'delivered')
    return 'border-[#2E7D32]/40 bg-[#2E7D32]/10 text-[#2E7D32]'
  if (phase === 'booked') return 'border-border text-muted'
  return 'border-border text-muted'
}

function cargoLabel(view: ReturnType<typeof buildPortalTrackingView> | null, fallback?: string | null): string {
  if (view?.cargo) {
    const c = view.cargo
    if (c.payloadKind === 'pax') {
      return c.paxCount > 0 ? `${c.paxCount} pax` : 'Passengers'
    }
    if (c.payloadKind === 'both') {
      const bits = [
        c.paxCount > 0 ? `${c.paxCount} pax` : null,
        c.cargoLines[0] || null,
      ].filter(Boolean)
      return bits.join(' · ') || 'Cargo + pax'
    }
    return c.cargoLines[0] || c.summaryLine || 'Cargo'
  }
  return (fallback ?? '').trim() || '—'
}

export function PortalShipmentListItem(props: PortalShipmentListItemProps) {
  const trip = getTrip(props.id)
  const view = trip
    ? buildPortalTrackingView(tripToTrackingInput(trip), { adsb: null })
    : null
  const phase: PortalShipmentPhase = view?.phase ?? 'other'
  const active = view?.opsForecastRows.find((r) => r.status === 'active')
  const stage = active
    ? clientOpsStageLabel(active)
    : props.nextLabel || phaseLabel(phase)
  const po =
    view?.poNumber?.trim() ||
    trip?.po_number?.trim() ||
    trip?.quick?.po?.trim() ||
    `T-${props.tripRef}`
  const lane = view?.lane || props.lane || '—'
  const tail = view?.tail || trip?.quick?.tail || null
  const typeName = view?.aircraftType || trip?.quick?.aircraft_type || null
  const payload = cargoLabel(view, props.payloadSummary)
  const eta =
    view?.eteLabel ||
    view?.projectedDisplay ||
    view?.promisedDisplay ||
    null

  return (
    <li>
      <button
        type="button"
        onClick={() => props.onSelect(props.id)}
        aria-current={props.selected ? 'true' : undefined}
        className={[
          'portal-glass-row w-full rounded-xl px-3.5 py-3 text-left',
          props.selected ? 'is-selected' : '',
        ].join(' ')}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="avionic text-sm font-semibold text-ink">
            PO #{po.replace(/^PO\s*#?\s*/i, '')}
          </div>
          <span
            className={[
              'shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider',
              phaseBadgeClass(phase),
            ].join(' ')}
          >
            {phaseLabel(phase)}
          </span>
        </div>
        <div className="avionic mt-1 text-xs font-medium text-gold">{lane}</div>
        <p className="mt-1 truncate text-[11px] text-muted">
          {[
            payload,
            tail ? `Tail ${tail}` : null,
            typeName,
            eta ? `ETA ${eta}` : null,
            stage,
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
      </button>
    </li>
  )
}
