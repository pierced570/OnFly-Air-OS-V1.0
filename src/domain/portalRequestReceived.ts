/**
 * Post hard-quote request confirmation — copy + timeline for portal glass UI.
 * Pure TypeScript.
 */

export type PortalRequestReceivedStepState = 'done' | 'live' | 'todo'

export type PortalRequestReceivedStep = {
  label: string
  time: string
  state: PortalRequestReceivedStepState
}

/** Client-facing confirmation after a hard-quote request is submitted. */
export const PORTAL_REQUEST_RECEIVED = {
  chip: 'Request received',
  title: 'Our desk phones are ringing now.',
  /** Mobile sheet body. */
  body: 'Expect a call within 10 minutes and a hard quote in 10–15. You approve it before anything is booked.',
  cta: 'Track it in Pending',
  another: 'Send another',
  callDesk: 'Call the desk',
} as const

export type PortalRequestReceivedSummaryInput = {
  aircraftClass?: string | null
  fromCode: string
  toCode: string
  need?: string | null
  estimateLow?: number | null
  estimateHigh?: number | null
}

/** Format local HH:MM for the "Request sent" step. */
export function formatPortalRequestSentClock(at: Date): string {
  const h = at.getHours()
  const m = at.getMinutes()
  return `${h < 10 ? `0${h}` : h}:${m < 10 ? `0${m}` : m}`
}

function money(n: number): string {
  return `$${Math.round(n).toLocaleString('en-US')}`
}

/**
 * Desktop summary line under the headline — class, route, need, optional soft band.
 */
export function portalRequestReceivedSummary(
  input: PortalRequestReceivedSummaryInput,
): string {
  const bits: string[] = []
  const cls = input.aircraftClass?.trim()
  const from = input.fromCode.trim().toUpperCase() || '—'
  const to = input.toCode.trim().toUpperCase() || '—'
  const need = (input.need?.trim() || 'ASAP').toUpperCase()
  if (cls) bits.push(cls)
  bits.push(`${from} → ${to}`)
  bits.push(need)
  const head = `${bits.join(', ')}.`
  const low = input.estimateLow
  const high = input.estimateHigh
  const estimate =
    low != null && high != null && low > 0 && high > 0
      ? ` Your estimate was ${money(low)} – ${money(high)}.`
      : ''
  return `${head}${estimate} A dispatcher will call you to confirm details, then send the hard quote here and by email.`
}

/**
 * Mobile vertical timeline (4 steps) — approve + wheels up combined.
 */
export function portalRequestReceivedSteps(
  sentAt: Date = new Date(),
): PortalRequestReceivedStep[] {
  return [
    {
      label: 'Request sent',
      time: formatPortalRequestSentClock(sentAt),
      state: 'done',
    },
    {
      label: 'Desk calls you',
      time: '≤ 10 min',
      state: 'live',
    },
    {
      label: 'Hard quote ready',
      time: '10–15 min',
      state: 'todo',
    },
    {
      label: 'You approve · wheels up',
      time: '~2–3 h',
      state: 'todo',
    },
  ]
}

/**
 * Desktop horizontal timeline (5 steps) — approve and wheels up split.
 */
export function portalRequestReceivedDesktopSteps(
  sentAt: Date = new Date(),
): PortalRequestReceivedStep[] {
  return [
    {
      label: 'Request sent',
      time: formatPortalRequestSentClock(sentAt),
      state: 'done',
    },
    {
      label: 'Desk calls you',
      time: 'within 10 min',
      state: 'live',
    },
    {
      label: 'Hard quote ready',
      time: '10–15 min',
      state: 'todo',
    },
    {
      label: 'You approve',
      time: 'one tap',
      state: 'todo',
    },
    {
      label: 'Wheels up',
      time: '~2–3 h',
      state: 'todo',
    },
  ]
}
