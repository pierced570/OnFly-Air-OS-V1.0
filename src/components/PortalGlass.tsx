/**
 * Shared glass primitives for the client portal.
 * Brand: cream + gold + Falcon cargo atmosphere — never navy.
 */

import type { ReactNode } from 'react'
import {
  BRAND_FALCON_CARGO_DETAIL_PATH,
  BRAND_FALCON_CARGO_HERO_PATH,
} from '@/domain/brand'

export const PORTAL_ATMOSPHERE_STYLE = {
  ['--portal-atmosphere-image' as string]: `url(${BRAND_FALCON_CARGO_HERO_PATH})`,
} as React.CSSProperties

export function PortalAtmosphere(props: {
  children: ReactNode
  className?: string
  /** Use hold-detail photo instead of ramp hero. */
  detail?: boolean
}) {
  const style = {
    ['--portal-atmosphere-image' as string]: `url(${
      props.detail ? BRAND_FALCON_CARGO_DETAIL_PATH : BRAND_FALCON_CARGO_HERO_PATH
    })`,
  } as React.CSSProperties
  return (
    <div
      className={['portal-atmosphere min-h-screen', props.className ?? ''].join(
        ' ',
      )}
      style={style}
      data-theme="client"
    >
      {props.children}
    </div>
  )
}

export function PortalGlassPanel(props: {
  children: ReactNode
  className?: string
  /** Stronger fill for forms / primary cards. */
  strong?: boolean
  /** Dark glass for map / ink strips. */
  ink?: boolean
}) {
  const tone = props.ink
    ? 'portal-glass-ink text-cream'
    : props.strong
      ? 'portal-glass-strong text-ink'
      : 'portal-glass text-ink'
  return (
    <div className={[tone, 'rounded-2xl', props.className ?? ''].join(' ')}>
      {props.children}
    </div>
  )
}
