/**
 * Mobile rough-estimate sheet — horizontal class carousel matching glass ref.
 */

import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type UIEvent,
} from 'react'
import {
  softQuoteBookCta,
  softQuotePointCode,
  type SoftQuoteClassResult,
  type SoftQuotePoint,
  type SoftQuoteResult,
} from '@/domain/portalSoftQuote'

export function SoftQuoteRoughEstimate(props: {
  soft: SoftQuoteResult
  from: SoftQuotePoint
  to: SoftQuotePoint
  /** Show origin/dest editors under the header. */
  editing: boolean
  onEdit: () => void
  onBook: (cls: SoftQuoteClassResult) => void
  onAskDesk: () => void
  editors?: ReactNode
}) {
  const classes = props.soft.classes
  const defaultIdx = Math.min(
    1,
    Math.max(0, classes.findIndex((c) => !c.overRange)),
  )
  const [idx, setIdx] = useState(defaultIdx >= 0 ? defaultIdx : 0)
  const scroller = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setIdx(defaultIdx >= 0 ? defaultIdx : 0)
  }, [props.soft.nmLabel, defaultIdx])

  useEffect(() => {
    const el = scroller.current
    if (!el) return
    const card = el.querySelector<HTMLElement>(`[data-soft-idx="${idx}"]`)
    if (!card) return
    const left = card.offsetLeft - (el.clientWidth - card.clientWidth) / 2
    el.scrollTo({ left: Math.max(0, left), behavior: 'smooth' })
  }, [idx])

  function onScroll(e: UIEvent<HTMLDivElement>) {
    const el = e.currentTarget
    const cards = Array.from(
      el.querySelectorAll<HTMLElement>('[data-soft-idx]'),
    )
    if (!cards.length) return
    const mid = el.scrollLeft + el.clientWidth / 2
    let best = 0
    let bestDist = Number.POSITIVE_INFINITY
    cards.forEach((card, i) => {
      const c = card.offsetLeft + card.clientWidth / 2
      const d = Math.abs(c - mid)
      if (d < bestDist) {
        bestDist = d
        best = i
      }
    })
    if (best !== idx) setIdx(best)
  }

  const selected = classes[idx] ?? classes[0]!
  const route = `${softQuotePointCode(props.from)} → ${softQuotePointCode(props.to)}`

  return (
    <div className="ofa-rough">
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
            className="g-mono"
            style={{
              marginTop: 8,
              fontSize: 18,
              letterSpacing: '.04em',
              color: 'var(--ofa-ink)',
            }}
          >
            {route}
          </div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div
            className="g-mono"
            style={{ fontSize: 12, color: 'var(--ofa-mute)' }}
          >
            {props.soft.nmLabel} nm · ASAP
          </div>
          <button
            type="button"
            onClick={props.onEdit}
            style={{
              marginTop: 8,
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

      {props.editing && props.editors ? (
        <div style={{ marginTop: 12 }}>{props.editors}</div>
      ) : null}

      <div
        ref={scroller}
        onScroll={onScroll}
        className="ofa-rough-scroller"
        style={{
          display: 'flex',
          gap: 12,
          overflowX: 'auto',
          scrollSnapType: 'x mandatory',
          WebkitOverflowScrolling: 'touch',
          margin: '16px -4px 0',
          padding: '4px 18% 6px',
          scrollbarWidth: 'none',
        }}
      >
        {classes.map((c, i) => {
          const on = i === idx
          return (
            <button
              key={c.name}
              type="button"
              data-soft-idx={i}
              onClick={() => setIdx(i)}
              style={{
                flex: '0 0 78%',
                scrollSnapAlign: 'center',
                textAlign: 'left',
                padding: '16px 16px 14px',
                borderRadius: 16,
                cursor: 'pointer',
                opacity: c.opacity,
                border: on
                  ? '1px solid rgba(201,162,39,.65)'
                  : '1px solid rgba(255,255,255,.12)',
                background: on
                  ? 'linear-gradient(165deg, rgba(44,44,50,.95), rgba(12,12,14,.92))'
                  : 'rgba(255,255,255,.04)',
                boxShadow: on
                  ? 'inset 0 1px 0 rgba(255,255,255,.12), 0 12px 28px rgba(0,0,0,.35)'
                  : 'inset 0 1px 0 rgba(255,255,255,.06)',
                color: 'var(--ofa-ink)',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 8,
                }}
              >
                <span
                  style={{
                    font: '500 16px/1.2 var(--ofa-font)',
                    letterSpacing: '-.015em',
                  }}
                >
                  {c.name}
                </span>
                <span
                  style={{
                    font: '500 10px/1 var(--ofa-font)',
                    letterSpacing: '.04em',
                    textTransform: 'uppercase',
                    color: 'var(--ofa-gold-2)',
                    border: '1px solid rgba(201,162,39,.45)',
                    borderRadius: 999,
                    padding: '5px 8px',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {c.overRange ? 'Fuel stop' : c.badge}
                </span>
              </div>
              <div
                className="g-mono"
                style={{
                  marginTop: 14,
                  fontSize: 28,
                  fontWeight: 500,
                  letterSpacing: '-.02em',
                  color: 'var(--ofa-gold-2)',
                  lineHeight: 1.1,
                }}
              >
                {c.price.replace(' – ', ' — ')}
              </div>
              <div
                style={{
                  marginTop: 10,
                  font: '400 12.5px/1.35 var(--ofa-font)',
                  color: 'var(--ofa-mute)',
                }}
              >
                {c.block} · {c.payload}
              </div>
              <div
                style={{
                  marginTop: 4,
                  font: '400 12.5px/1.35 var(--ofa-font)',
                  color: 'var(--ofa-mute)',
                }}
              >
                {c.examples}
              </div>
            </button>
          )
        })}
      </div>

      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          gap: 6,
          marginTop: 12,
        }}
        aria-hidden="true"
      >
        {classes.map((c, i) => (
          <i
            key={c.name}
            style={{
              width: i === idx ? 18 : 6,
              height: 6,
              borderRadius: 999,
              background:
                i === idx
                  ? 'var(--ofa-gold, #C9A227)'
                  : 'rgba(255,255,255,.22)',
              transition: 'width .2s ease',
            }}
          />
        ))}
      </div>

      <button
        type="button"
        className="g-btn"
        style={{ width: '100%', marginTop: 16 }}
        onClick={() => props.onBook(selected)}
      >
        {softQuoteBookCta(selected)}
      </button>

      <p
        className="g-body"
        style={{
          margin: '12px 0 0',
          textAlign: 'center',
          fontSize: 12,
        }}
      >
        Rough estimate, not a firm offer.{' '}
        <button
          type="button"
          onClick={props.onAskDesk}
          style={{
            background: 'none',
            border: 0,
            padding: 0,
            cursor: 'pointer',
            font: '500 12px/1.4 var(--ofa-font)',
            color: 'var(--ofa-gold-2)',
          }}
        >
          Ask the desk
        </button>
      </p>
    </div>
  )
}
