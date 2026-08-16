/**
 * Shared mobile-first chrome for operator trip-offer pages.
 * Even type scale — labeled departure/arrival, pax, cargo.
 * Never recommend a tail (operators pick their own aircraft).
 */

import type { ReactNode } from 'react'
import {
  buildOfferMissionDisplay,
  type OfferMissionDisplay,
} from '@/domain/offerMissionDisplay'

const shell =
  'min-h-dvh bg-ink px-4 py-5 pt-[max(1.25rem,env(safe-area-inset-top))] pb-[max(1.25rem,env(safe-area-inset-bottom))] text-cream text-base leading-snug sm:py-8'
const card = 'mx-auto w-full max-w-md space-y-5'

export const offerInput =
  'mt-1.5 w-full min-h-12 rounded-lg border border-border bg-surface px-3 py-3 text-base text-cream avionic outline-none focus:border-gold placeholder:text-muted'

export const offerLabel = 'block text-base text-cream'

export const offerBtnPrimary =
  'min-h-14 w-full rounded-lg bg-gold px-4 py-3.5 text-base font-semibold text-ink disabled:opacity-50'

export const offerBtnYes =
  'min-h-14 w-full rounded-lg bg-onplan px-4 py-3.5 text-base font-semibold text-ink disabled:opacity-50'

export const offerBtnNo =
  'min-h-14 w-full rounded-lg border border-late/50 bg-late/10 px-4 py-3.5 text-base font-semibold text-late disabled:opacity-50'

type Props = {
  lane: string
  payloadSummary: string
  readyLabel: string
  /** Optional banner (e.g. preview notice). */
  banner?: ReactNode
  children: ReactNode
  footer?: ReactNode
}

function MissionRow({
  label,
  value,
  mono,
}: {
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <div className="space-y-0.5">
      <div className="text-base text-muted">{label}</div>
      <div
        className={[
          'text-base text-cream',
          mono ? 'avionic tracking-wide' : '',
        ].join(' ')}
      >
        {value}
      </div>
    </div>
  )
}

function MissionBlock({ mission }: { mission: OfferMissionDisplay }) {
  return (
    <div className="space-y-3 border-t border-border/60 pt-3">
      {mission.departure ? (
        <MissionRow
          label="Departure airport"
          value={mission.departure.label}
          mono
        />
      ) : null}
      {mission.arrival ? (
        <MissionRow
          label="Arrival airport"
          value={mission.arrival.label}
          mono
        />
      ) : null}
      {!mission.departure && !mission.arrival && mission.extraLane ? (
        <MissionRow label="Route" value={mission.extraLane} mono />
      ) : null}
      {mission.extraLane && mission.departure ? (
        <MissionRow label="Additional legs" value={mission.extraLane} mono />
      ) : null}
      <MissionRow label="Passengers" value={mission.passengers} />
      <MissionRow label="Cargo" value={mission.cargo} />
      <MissionRow label="Ready" value={mission.ready} />
    </div>
  )
}

export function OfferBoardChrome({
  lane,
  payloadSummary,
  readyLabel,
  banner,
  children,
  footer,
}: Props) {
  const mission = buildOfferMissionDisplay({
    lane,
    payload_summary: payloadSummary,
    ready_label: readyLabel,
  })

  return (
    <div className={shell} data-theme="dispatcher">
      <div className={card}>
        {banner}
        <header className="space-y-3">
          <p className="text-base font-medium text-gold">OnFly trip offer</p>
          <MissionBlock mission={mission} />
        </header>
        {children}
        {footer}
      </div>
    </div>
  )
}
