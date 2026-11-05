/**
 * Desktop rough-estimate modal — three class cards, need/round toggles,
 * Ask the desk / Book this trip (glass portal laptop reference).
 */

import { useState, type ReactNode } from 'react'
import {
  softQuotePointCode,
  softQuoteRoundTripCosts,
  softQuoteSelectionSummary,
  type SoftQuoteClassResult,
  type SoftQuotePoint,
  type SoftQuoteResult,
} from '@/domain/portalSoftQuote'

export function SoftQuoteRoughEstimateDesktop(props: {
  soft: SoftQuoteResult
  from: SoftQuotePoint
  to: SoftQuotePoint
  /** e.g. "Cargo · 2 pcs · 420 lb" */
  loadLine?: string | null
  need: 'asap' | 'today' | 'tomorrow'
  onNeed: (v: 'asap' | 'today' | 'tomorrow') => void
  editing: boolean
  onEdit: () => void
  onClose: () => void
  onAskDesk: (cls: SoftQuoteClassResult, roundTrip: boolean) => void
  onBook: (cls: SoftQuoteClassResult, roundTrip: boolean) => void
  editors?: ReactNode
}) {
  const classes = props.soft.classes
  const defaultIdx = Math.max(
    0,
    classes.findIndex((c) => c.name === 'Light jet' && !c.overRange),
  )
  const [idx, setIdx] = useState(defaultIdx >= 0 ? defaultIdx : 1)
  const [roundTrip, setRoundTrip] = useState(false)
  const selected = classes[idx] ?? classes[0]!

  const route = `${softQuotePointCode(props.from)} → ${softQuotePointCode(props.to)}`
  const meta = [
    `${props.soft.nmLabel} nm`,
    props.loadLine?.trim() || 'Cargo',
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <div
      className="ofa-rough-desk g-panel g-rise"
      style={{
        position: 'absolute',
        left: '50%',
        top: '50%',
        transform: 'translate(-50%, -50%)',
        width: 'min(920px, calc(100% - 120px))',
        maxHeight: 'calc(100% - 100px)',
        zIndex: 6,
        padding: 0,
        overflow: 'auto',
        borderRadius: 18,
      }}
    >
      <div
        style={{
          height: 2,
          background: 'linear-gradient(90deg,#C9A227,rgba(201,162,39,0))',
        }}
      />
      <div style={{ padding: '16px 18px 18px' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div className="g-kicker">Rough estimate</div>
            <div
              style={{
                marginTop: 8,
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'baseline',
                gap: '6px 12px',
              }}
            >
              <span
                className="g-mono"
                style={{
                  fontSize: 18,
                  letterSpacing: '.04em',
                  color: 'var(--ofa-ink)',
                }}
              >
                {route}
              </span>
              <span
                style={{
                  font: '400 12.5px/1.3 var(--ofa-font)',
                  color: 'var(--ofa-mute)',
                }}
              >
                {meta}
              </span>
              <button
                type="button"
                onClick={props.onEdit}
                style={{
                  background: 'none',
                  border: 0,
                  padding: 0,
                  cursor: 'pointer',
                  font: '500 13px/1 var(--ofa-font)',
                  color: 'var(--ofa-gold-2)',
                }}
              >
                {props.editing ? 'Done' : 'Edit'}
              </button>
            </div>
          </div>
          <button
            type="button"
            className="g-close"
            aria-label="Close rough estimate"
            onClick={props.onClose}
          >
            ×
          </button>
        </div>

        {props.editing && props.editors ? (
          <div style={{ marginTop: 12 }}>{props.editors}</div>
        ) : null}

        <div
          style={{
            marginTop: 14,
            display: 'flex',
            flexWrap: 'wrap',
            gap: 10,
            alignItems: 'center',
          }}
        >
          <div className="g-seg" role="group" aria-label="Need">
            {(
              [
                ['asap', 'ASAP'],
                ['today', 'Today'],
                ['tomorrow', 'Tomorrow'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={props.need === id ? 'is-on' : undefined}
                onClick={() => props.onNeed(id)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="g-seg" role="group" aria-label="Trip type">
            <button
              type="button"
              className={!roundTrip ? 'is-on' : undefined}
              onClick={() => setRoundTrip(false)}
            >
              One-way
            </button>
            <button
              type="button"
              className={roundTrip ? 'is-on' : undefined}
              onClick={() => setRoundTrip(true)}
            >
              Round trip
            </button>
          </div>
        </div>

        <div
          style={{
            marginTop: 16,
            display: 'grid',
            gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
            gap: 12,
          }}
        >
          {classes.map((c, i) => {
            const on = i === idx
            const band = roundTrip
              ? softQuoteRoundTripCosts(c).price.replace(' – ', ' — ')
              : c.price.replace(' – ', ' — ')
            return (
              <div
                key={c.name}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  padding: '14px 14px 12px',
                  borderRadius: 14,
                  opacity: c.opacity,
                  border: on
                    ? '1px solid rgba(201,162,39,.65)'
                    : '1px solid rgba(255,255,255,.12)',
                  background: on
                    ? 'linear-gradient(165deg, rgba(44,44,50,.95), rgba(12,12,14,.92))'
                    : 'rgba(255,255,255,.03)',
                  boxShadow: on
                    ? 'inset 0 1px 0 rgba(255,255,255,.12)'
                    : 'inset 0 1px 0 rgba(255,255,255,.05)',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                    gap: 8,
                  }}
                >
                  <div>
                    <div
                      style={{
                        font: '500 15px/1.2 var(--ofa-font)',
                        letterSpacing: '-.01em',
                        color: 'var(--ofa-ink)',
                      }}
                    >
                      {c.name}
                    </div>
                    <div
                      style={{
                        marginTop: 4,
                        font: '400 11.5px/1.3 var(--ofa-font)',
                        color: 'var(--ofa-mute)',
                      }}
                    >
                      {c.examples}
                    </div>
                  </div>
                  <span
                    style={{
                      flexShrink: 0,
                      font: '500 10px/1 var(--ofa-font)',
                      letterSpacing: '.04em',
                      textTransform: 'uppercase',
                      color: 'var(--ofa-gold-2)',
                      border: '1px solid rgba(201,162,39,.45)',
                      borderRadius: 999,
                      padding: '5px 8px',
                    }}
                  >
                    {c.overRange ? 'Fuel stop' : c.badge}
                  </span>
                </div>

                <div
                  className="g-mono"
                  style={{
                    marginTop: 14,
                    fontSize: 22,
                    fontWeight: 500,
                    letterSpacing: '-.02em',
                    color: 'var(--ofa-gold-2)',
                    lineHeight: 1.15,
                  }}
                >
                  {band}
                </div>
                <div
                  style={{
                    marginTop: 4,
                    font: '400 11px/1 var(--ofa-font)',
                    color: 'var(--ofa-mute)',
                  }}
                >
                  {roundTrip ? 'round trip' : 'one-way'}
                </div>

                <dl
                  style={{
                    margin: '14px 0 0',
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '8px 10px',
                    font: '400 11.5px/1.3 var(--ofa-font)',
                    color: 'var(--ofa-mute)',
                  }}
                >
                  <div>
                    <dt style={{ color: '#6F6F74' }}>Block</dt>
                    <dd
                      className="g-mono"
                      style={{ margin: '2px 0 0', color: 'var(--ofa-ink)' }}
                    >
                      {c.blockShort}
                    </dd>
                  </div>
                  <div>
                    <dt style={{ color: '#6F6F74' }}>Ready in</dt>
                    <dd
                      className="g-mono"
                      style={{ margin: '2px 0 0', color: 'var(--ofa-ink)' }}
                    >
                      {c.ready}
                    </dd>
                  </div>
                  <div>
                    <dt style={{ color: '#6F6F74' }}>Payload</dt>
                    <dd
                      className="g-mono"
                      style={{ margin: '2px 0 0', color: 'var(--ofa-ink)' }}
                    >
                      {c.payload}
                    </dd>
                  </div>
                  <div>
                    <dt style={{ color: '#6F6F74' }}>Cruise</dt>
                    <dd
                      className="g-mono"
                      style={{ margin: '2px 0 0', color: 'var(--ofa-ink)' }}
                    >
                      {c.kts} kts
                    </dd>
                  </div>
                </dl>

                <button
                  type="button"
                  className={on ? 'g-btn g-btn--sm' : 'g-ghost'}
                  style={{
                    marginTop: 14,
                    width: '100%',
                    height: 38,
                    paddingRight: on ? 42 : undefined,
                  }}
                  onClick={() => setIdx(i)}
                >
                  {on ? 'Selected' : 'Select'}
                </button>
              </div>
            )
          })}
        </div>

        <div
          style={{
            marginTop: 16,
            paddingTop: 14,
            borderTop: '1px solid rgba(255,255,255,.08)',
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <div
            style={{
              font: '400 12.5px/1.35 var(--ofa-font)',
              color: 'var(--ofa-mute)',
              minWidth: 0,
              flex: '1 1 220px',
            }}
          >
            {softQuoteSelectionSummary(selected, { roundTrip })}
          </div>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <button
              type="button"
              className="g-ghost"
              style={{ height: 44, padding: '0 16px' }}
              onClick={() => props.onAskDesk(selected, roundTrip)}
            >
              Ask the desk
            </button>
            <button
              type="button"
              className="g-btn"
              style={{ height: 44 }}
              onClick={() => props.onBook(selected, roundTrip)}
            >
              Book this trip
            </button>
          </div>
        </div>
        <p
          className="g-body"
          style={{
            margin: '12px 0 0',
            fontSize: 11.5,
            lineHeight: 1.45,
            color: '#6F6F74',
          }}
        >
          Rough, typical market rates — not a firm offer. You approve the hard
          quote from a vetted Part 135 carrier before anything is booked.
        </p>
      </div>
    </div>
  )
}
