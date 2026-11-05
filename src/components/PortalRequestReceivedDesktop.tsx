/**
 * Desktop post hard-quote confirmation — bottom-right glass card with
 * horizontal timeline (desk call → hard quote → approve → wheels up).
 */

import { BRAND_PHONE, BRAND_PHONE_E164, dialBrandOps } from '@/domain/brand'
import {
  PORTAL_REQUEST_RECEIVED,
  portalRequestReceivedDesktopSteps,
  portalRequestReceivedSummary,
  type PortalRequestReceivedSummaryInput,
} from '@/domain/portalRequestReceived'

export function PortalRequestReceivedDesktop(props: {
  displayId: string
  summary: PortalRequestReceivedSummaryInput
  sentAt?: Date
  onTrack: () => void
  onClose?: () => void
}) {
  const copy = PORTAL_REQUEST_RECEIVED
  const steps = portalRequestReceivedDesktopSteps(props.sentAt ?? new Date())
  const body = portalRequestReceivedSummary(props.summary)

  return (
    <div
      className="ofa-portal-detail g-panel g-panel--dense g-rise ofa-req-recv-desk"
      style={{
        position: 'absolute',
        right: 18,
        bottom: 18,
        width: 420,
        maxWidth: 'calc(100% - 100px)',
        zIndex: 5,
        padding: 0,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          height: 2,
          background: 'linear-gradient(90deg,#C9A227,rgba(201,162,39,0))',
        }}
      />
      <div style={{ padding: '14px 16px 16px' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 10,
          }}
        >
          <div
            style={{
              font: '500 13px/1.2 var(--ofa-font)',
              color: 'var(--ofa-gold-2, #E3B341)',
            }}
          >
            {copy.chip} ·{' '}
            <span className="g-mono" style={{ letterSpacing: '.04em' }}>
              {props.displayId}
            </span>
          </div>
          {props.onClose ? (
            <button
              type="button"
              className="g-close"
              aria-label="Dismiss"
              onClick={props.onClose}
            >
              ×
            </button>
          ) : null}
        </div>

        <h2
          style={{
            margin: '10px 0 0',
            font: '500 22px/1.15 var(--ofa-font)',
            letterSpacing: '-.025em',
            color: 'var(--ofa-ink, #F4F2EC)',
          }}
        >
          {copy.title}
        </h2>
        <p
          className="g-body"
          style={{
            margin: '10px 0 0',
            fontSize: 13,
            lineHeight: 1.45,
            color: 'var(--ofa-mute, #8E8E93)',
          }}
        >
          {body}
        </p>

        <ol
          style={{
            listStyle: 'none',
            margin: '18px 0 0',
            padding: 0,
            display: 'grid',
            gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))`,
            gap: 0,
          }}
        >
          {steps.map((step, i) => {
            const next = steps[i + 1]
            const done = step.state === 'done'
            const live = step.state === 'live'
            return (
              <li key={step.label} style={{ position: 'relative', minWidth: 0 }}>
                {next ? (
                  <i
                    aria-hidden="true"
                    style={{
                      position: 'absolute',
                      left: 'calc(50% + 8px)',
                      right: 'calc(-50% + 8px)',
                      top: 5,
                      height: 2,
                      background: done
                        ? 'var(--ofa-gold, #C9A227)'
                        : live
                          ? 'linear-gradient(90deg, var(--ofa-gold, #C9A227), rgba(255,255,255,.12))'
                          : 'rgba(255,255,255,.12)',
                    }}
                  />
                ) : null}
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                  <i
                    aria-hidden="true"
                    style={{
                      width: live ? 12 : 10,
                      height: live ? 12 : 10,
                      borderRadius: '50%',
                      boxSizing: 'border-box',
                      background: done
                        ? 'var(--ofa-gold, #C9A227)'
                        : 'transparent',
                      border: done
                        ? '1px solid var(--ofa-gold, #C9A227)'
                        : live
                          ? '2px solid var(--ofa-gold-2, #E3B341)'
                          : '1.5px solid rgba(255,255,255,.22)',
                      boxShadow: live
                        ? '0 0 10px rgba(227,179,65,.45)'
                        : undefined,
                      zIndex: 1,
                    }}
                  />
                </div>
                <div
                  style={{
                    marginTop: 8,
                    textAlign: 'center',
                    font: '500 11px/1.25 var(--ofa-font)',
                    color: live
                      ? 'var(--ofa-gold-2, #E3B341)'
                      : done
                        ? 'var(--ofa-ink, #F4F2EC)'
                        : '#6F6F74',
                  }}
                >
                  {step.label}
                </div>
                <div
                  className="g-mono"
                  style={{
                    marginTop: 3,
                    textAlign: 'center',
                    fontSize: 10,
                    color: live ? 'var(--ofa-gold-2, #E3B341)' : '#6F6F74',
                  }}
                >
                  {step.time}
                </div>
              </li>
            )
          })}
        </ol>

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            marginTop: 18,
          }}
        >
          <button
            type="button"
            className="g-btn"
            style={{ width: '100%' }}
            onClick={props.onTrack}
          >
            {copy.cta}
          </button>
          <button
            type="button"
            className="g-ghost"
            style={{ width: '100%', height: 44 }}
            onClick={() => dialBrandOps()}
          >
            {copy.callDesk} · {BRAND_PHONE}
          </button>
          <a
            href={`tel:${BRAND_PHONE_E164}`}
            className="sr-only"
            aria-hidden="true"
            tabIndex={-1}
          >
            {BRAND_PHONE}
          </a>
        </div>
      </div>
    </div>
  )
}
