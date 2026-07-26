/**
 * Shared mobile-first chrome for operator trip-offer pages.
 * Even type scale — no recommended tail (operators pick their own aircraft).
 */

import type { ReactNode } from 'react'

const shell =
  'min-h-dvh bg-ink px-4 py-5 text-cream text-base leading-snug sm:py-8'
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
  missionLine: string
  /** Optional banner (e.g. preview notice). */
  banner?: ReactNode
  children: ReactNode
  footer?: ReactNode
}

export function OfferBoardChrome({
  lane,
  missionLine,
  banner,
  children,
  footer,
}: Props) {
  return (
    <div className={shell} data-theme="dispatcher">
      <div className={card}>
        {banner}
        <header className="space-y-2">
          <p className="text-base font-medium text-gold">OnFly trip offer</p>
          <h1 className="avionic text-xl font-semibold tracking-wide text-cream sm:text-xl">
            {lane}
          </h1>
          <p className="text-base text-muted">{missionLine}</p>
        </header>
        {children}
        {footer}
      </div>
    </div>
  )
}
