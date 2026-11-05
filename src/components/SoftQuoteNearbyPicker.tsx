/**
 * Glass chips for popular airports near a soft-quote map click.
 * Lets the client confirm / switch the snapped field.
 */

import type { SoftQuoteNearbyOption } from '@/domain/portalDesktopTrips'

export function SoftQuoteNearbyPicker(props: {
  slot: 'origin' | 'destination'
  options: SoftQuoteNearbyOption[]
  selectedCode: string | null
  onSelect: (opt: SoftQuoteNearbyOption) => void
  onDismiss: () => void
  /** Lift above SoftQuoteCard when both are open. */
  bottom?: number
  /** Desktop overlay vs phone sheet embed. */
  variant?: 'overlay' | 'inline'
}) {
  if (props.options.length <= 1) return null
  const title =
    props.slot === 'origin'
      ? 'Popular airports near origin'
      : 'Popular airports near destination'
  const inline = props.variant === 'inline'

  return (
    <div
      className={
        inline
          ? 'ofa-soft-nearby'
          : 'g-panel g-panel--dense g-rise ofa-soft-nearby'
      }
      style={
        inline
          ? { marginTop: 10, padding: 0 }
          : {
              position: 'absolute',
              right: 18,
              bottom: props.bottom ?? 18,
              width: 320,
              maxWidth: 'calc(100% - 36px)',
              zIndex: 6,
              padding: '12px 14px 14px',
            }
      }
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
        }}
      >
        <div className="g-kicker">{title}</div>
        <button
          type="button"
          className="g-close"
          aria-label="Dismiss airport list"
          onClick={props.onDismiss}
        >
          ×
        </button>
      </div>
      <p className="g-body" style={{ margin: '8px 0 10px' }}>
        We snapped to the nearest civil field — tap another if you meant a
        different airport.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {props.options.map((opt) => {
          const on = opt.code === props.selectedCode
          return (
            <button
              key={opt.code}
              type="button"
              onClick={() => props.onSelect(opt)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 10,
                width: '100%',
                textAlign: 'left',
                padding: '10px 12px',
                borderRadius: 12,
                cursor: 'pointer',
                border: on
                  ? '1px solid rgba(201,162,39,.55)'
                  : '1px solid rgba(255,255,255,.1)',
                background: on
                  ? 'rgba(201,162,39,.14)'
                  : 'rgba(255,255,255,.03)',
                color: 'var(--ofa-ink)',
                font: '500 12.5px/1.25 var(--ofa-font)',
              }}
            >
              <span style={{ minWidth: 0 }}>
                <span className="g-mono" style={{ color: 'var(--ofa-gold-2)' }}>
                  {opt.code}
                </span>
                <span style={{ color: 'var(--ofa-mute)' }}> · {opt.city}</span>
                <div
                  style={{
                    marginTop: 3,
                    font: '400 11px/1.3 var(--ofa-font)',
                    color: 'var(--ofa-mute)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {opt.name}
                </div>
              </span>
              <span
                className="g-mono"
                style={{
                  flexShrink: 0,
                  fontSize: 11,
                  color: on ? 'var(--ofa-gold-2)' : 'var(--ofa-mute)',
                }}
              >
                {opt.nm < 10 ? opt.nm.toFixed(1) : Math.round(opt.nm)} nm
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
