/**
 * Post hard-quote submission confirmation — glass timeline matching the
 * mobile reference (Request received → desk call → quote → approve).
 */

import {
  PORTAL_REQUEST_RECEIVED,
  portalRequestReceivedSteps,
  type PortalRequestReceivedStep,
} from '@/domain/portalRequestReceived'

function Timeline(props: { steps: PortalRequestReceivedStep[] }) {
  return (
    <ol
      className="ofa-req-recv-steps"
      style={{
        listStyle: 'none',
        margin: '18px 0 0',
        padding: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: 0,
      }}
    >
      {props.steps.map((step, i) => {
        const next = props.steps[i + 1]
        const lineDone = step.state === 'done'
        const lineLive = step.state === 'live'
        const color =
          step.state === 'todo'
            ? '#6F6F74'
            : step.state === 'live'
              ? 'var(--ofa-gold-2, #E3B341)'
              : 'var(--ofa-ink, #F4F2EC)'
        const timeColor =
          step.state === 'live'
            ? 'var(--ofa-gold-2, #E3B341)'
            : step.state === 'done'
              ? '#9A9A9A'
              : '#6F6F74'
        return (
          <li
            key={step.label}
            style={{
              display: 'grid',
              gridTemplateColumns: '18px 1fr auto',
              columnGap: 12,
              alignItems: 'start',
              minHeight: next ? 44 : undefined,
            }}
          >
            <span
              style={{
                position: 'relative',
                display: 'flex',
                justifyContent: 'center',
                paddingTop: 4,
                height: '100%',
              }}
            >
              <i
                aria-hidden="true"
                style={{
                  width: step.state === 'live' ? 12 : 10,
                  height: step.state === 'live' ? 12 : 10,
                  borderRadius: '50%',
                  boxSizing: 'border-box',
                  background:
                    step.state === 'done'
                      ? 'var(--ofa-gold, #C9A227)'
                      : 'transparent',
                  border:
                    step.state === 'todo'
                      ? '1.5px solid rgba(255,255,255,.22)'
                      : step.state === 'live'
                        ? '2px solid var(--ofa-gold-2, #E3B341)'
                        : '1px solid var(--ofa-gold, #C9A227)',
                  boxShadow:
                    step.state === 'live'
                      ? '0 0 10px rgba(227,179,65,.45)'
                      : undefined,
                  zIndex: 1,
                }}
              />
              {next ? (
                <i
                  aria-hidden="true"
                  style={{
                    position: 'absolute',
                    top: 16,
                    bottom: -4,
                    width: 2,
                    borderRadius: 1,
                    background: lineDone
                      ? 'var(--ofa-gold, #C9A227)'
                      : lineLive
                        ? 'linear-gradient(180deg, var(--ofa-gold, #C9A227), rgba(255,255,255,.12))'
                        : 'rgba(255,255,255,.12)',
                  }}
                />
              ) : null}
            </span>
            <span
              style={{
                font: '500 14px/1.25 var(--ofa-font)',
                letterSpacing: '-.01em',
                color,
                paddingTop: 1,
              }}
            >
              {step.label}
            </span>
            <span
              className="g-mono"
              style={{
                fontSize: 12.5,
                color: timeColor,
                paddingTop: 2,
                whiteSpace: 'nowrap',
              }}
            >
              {step.time}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

export function PortalRequestReceived(props: {
  displayId: string
  sentAt?: Date
  onTrack: () => void
  onAnother?: () => void
  /** Compact embed inside desktop request panel. */
  dense?: boolean
}) {
  const steps = portalRequestReceivedSteps(props.sentAt ?? new Date())
  const copy = PORTAL_REQUEST_RECEIVED

  return (
    <div
      className="ofa-req-recv g-rise"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: 0,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="g-live" aria-hidden="true" />
          <span
            style={{
              font: '500 13px/1 var(--ofa-font)',
              color: 'var(--ofa-gold-2, #E3B341)',
            }}
          >
            {copy.chip}
          </span>
        </div>
        <span
          className="g-mono"
          style={{ fontSize: 12, color: '#6F6F74', letterSpacing: '.04em' }}
        >
          {props.displayId}
        </span>
      </div>

      <h2
        className="m-h2"
        style={{
          margin: props.dense ? '14px 0 0' : '16px 0 0',
          font: '500 26px/1.15 var(--ofa-font)',
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
          fontSize: 13.5,
          lineHeight: 1.45,
          color: 'var(--ofa-mute, #8E8E93)',
        }}
      >
        {copy.body}
      </p>

      <Timeline steps={steps} />

      <div style={{ flex: 1, minHeight: props.dense ? 12 : 20 }} />

      <button
        type="button"
        className="g-btn"
        style={{ width: '100%' }}
        onClick={props.onTrack}
      >
        {copy.cta}
      </button>
      {props.onAnother ? (
        <button
          type="button"
          className="ofa-link"
          style={{
            textAlign: 'center',
            padding: '14px 0 2px',
            background: 'none',
            border: 0,
            cursor: 'pointer',
            width: '100%',
            font: '500 13px/1 var(--ofa-font)',
            color: 'var(--ofa-mute, #8E8E93)',
          }}
          onClick={props.onAnother}
        >
          {copy.another}
        </button>
      ) : null}
    </div>
  )
}
