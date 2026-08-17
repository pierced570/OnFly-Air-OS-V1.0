/**
 * FlightAware-style tail activity: Scheduled / En Route / Arrived.
 * Portal = cream; desk = dark. Airports and clocks only — no operator identity.
 */

import type { TailFlightActivityGroups, TailFlightLeg } from '@/domain/tailFlightActivity'
import { tailActivityHasRows } from '@/domain/tailFlightActivity'
import { formatZuluLocal } from '@/domain/timeFmt'

function clock(iso: string | null, tz: string, actual: boolean): string {
  if (!iso) return '—'
  const { local } = formatZuluLocal(iso, tz)
  return actual ? local : local
}

function dateChip(iso: string | null, tz: string): string | null {
  if (!iso) return null
  try {
    const d = new Date(iso)
    return d.toLocaleDateString('en-US', {
      month: 'numeric',
      day: 'numeric',
      timeZone: tz || 'UTC',
    })
  } catch {
    return null
  }
}

function LegCard({
  leg,
  variant,
  typeFallback,
}: {
  leg: TailFlightLeg
  variant: 'portal' | 'desk'
  typeFallback: string | null
}) {
  const type = (leg.aircraftType || typeFallback || '').toUpperCase()
  const desk = variant === 'desk'
  const active = leg.bucket === 'en_route'
  return (
    <article
      className={
        desk
          ? 'rounded-md border border-gold/25 bg-ink/50 px-3 py-3'
          : 'rounded-md border border-border bg-white px-3.5 py-3'
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span
          className={[
            'text-[11px] font-semibold uppercase tracking-[0.14em]',
            active ? 'text-gold' : desk ? 'text-[#2E7D32]' : 'text-[#2E7D32]',
          ].join(' ')}
        >
          {leg.statusLabel}
        </span>
        {type ? (
          <span className="avionic text-[11px] text-muted">{type}</span>
        ) : null}
      </div>
      {active && leg.progressPct != null ? (
        <div
          className="relative mt-2 h-1.5 overflow-hidden rounded-full bg-border"
          aria-hidden
        >
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-gold"
            style={{ width: `${leg.progressPct}%` }}
          />
        </div>
      ) : null}
      <div className="mt-2 flex items-end justify-between gap-3">
        <div>
          <div className="avionic text-lg font-semibold tracking-wide">
            {leg.originIdent}
          </div>
          <div className="text-[11px] text-muted">{leg.originPlace}</div>
          <div className="avionic mt-1 text-xs">
            {clock(leg.departAt, leg.originTz, leg.departIsActual)}
            {dateChip(leg.departAt, leg.originTz)
              ? ` · ${dateChip(leg.departAt, leg.originTz)}`
              : ''}
          </div>
        </div>
        <div className="mb-5 flex-1 border-t border-dashed border-gold/40" />
        <div className="text-right">
          <div className="avionic text-lg font-semibold tracking-wide">
            {leg.destIdent}
          </div>
          <div className="text-[11px] text-muted">{leg.destPlace}</div>
          <div className="avionic mt-1 text-xs">
            {clock(leg.arriveAt, leg.destTz, leg.arriveIsActual)}
            {dateChip(leg.arriveAt, leg.destTz)
              ? ` · ${dateChip(leg.arriveAt, leg.destTz)}`
              : ''}
          </div>
        </div>
      </div>
    </article>
  )
}

function Bucket({
  title,
  legs,
  variant,
  typeFallback,
}: {
  title: string
  legs: TailFlightLeg[]
  variant: 'portal' | 'desk'
  typeFallback: string | null
}) {
  if (!legs.length) return null
  return (
    <div>
      <div
        className={[
          'mb-2 text-[10px] font-semibold uppercase tracking-[0.16em]',
          variant === 'desk' ? 'text-gold' : 'text-muted',
        ].join(' ')}
      >
        {title}
      </div>
      <div className="space-y-2">
        {legs.map((leg) => (
          <LegCard
            key={leg.id}
            leg={leg}
            variant={variant}
            typeFallback={typeFallback}
          />
        ))}
      </div>
    </div>
  )
}

export function TailFlightActivity({
  groups,
  variant = 'portal',
  aircraftType = null,
}: {
  groups: TailFlightActivityGroups
  variant?: 'portal' | 'desk'
  aircraftType?: string | null
}) {
  if (!tailActivityHasRows(groups)) return null
  return (
    <section className="mt-6 space-y-4">
      <div
        className={[
          'text-[10px] font-semibold uppercase tracking-[0.14em]',
          variant === 'desk' ? 'text-gold' : 'text-muted',
        ].join(' ')}
      >
        Flight activity
      </div>
      <Bucket
        title="Scheduled"
        legs={groups.scheduled}
        variant={variant}
        typeFallback={aircraftType}
      />
      <Bucket
        title="En Route"
        legs={groups.enRoute}
        variant={variant}
        typeFallback={aircraftType}
      />
      <Bucket
        title="Arrived"
        legs={groups.arrived}
        variant={variant}
        typeFallback={aircraftType}
      />
    </section>
  )
}
