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
  body: 'Expect a call within 10 minutes and a hard quote in 10–15. You approve it before anything is booked.',
  cta: 'Track it in Pending',
  another: 'Send another',
} as const

/** Format local HH:MM for the "Request sent" step. */
export function formatPortalRequestSentClock(at: Date): string {
  const h = at.getHours()
  const m = at.getMinutes()
  return `${h < 10 ? `0${h}` : h}:${m < 10 ? `0${m}` : m}`
}

/**
 * Four-step post-submit timeline matching the glass portal reference.
 * Step 0 done (sent), step 1 live (desk calling), rest todo.
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
