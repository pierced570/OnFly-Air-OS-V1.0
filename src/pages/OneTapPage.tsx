/**
 * One-tap check-in page (no login) — writes actuals + optional POD.
 */
import { useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { completeLegCheckIn, getTripByLegToken } from '@/lib/tripStore'
import { BrandLockup } from '@/components/BrandLockup'

export default function OneTapPage() {
  const { legToken } = useParams()
  const hit = useMemo(
    () => (legToken ? getTripByLegToken(legToken) : null),
    [legToken],
  )
  const [done, setDone] = useState(false)
  const [podNote, setPodNote] = useState('')
  const [error, setError] = useState<string | null>(null)

  if (!legToken || !hit) {
    return (
      <div
        className="flex min-h-screen items-center justify-center bg-ink p-6"
        data-theme="dispatcher"
      >
        <p className="text-muted">Invalid or expired check-in link.</p>
      </div>
    )
  }

  const { trip, leg } = hit
  const isPod = leg.type === 'offload' || legToken.includes('del')
  const label =
    leg.status === 'done'
      ? 'Already logged'
      : isPod
        ? 'DELIVERED — capture POD'
        : leg.type === 'position'
          ? 'ARRIVED / IN POSITION'
          : leg.label.toUpperCase()

  return (
    <div
      className="flex min-h-screen items-center justify-center bg-ink p-6"
      data-theme="dispatcher"
    >
      <div className="w-full max-w-sm space-y-4 text-center">
        <div className="flex flex-col items-center gap-2">
          <BrandLockup variant="mark" className="!h-12 !w-12" />
          <div className="text-xs uppercase tracking-[0.2em] text-gold">Check-in</div>
        </div>
        <p className="text-sm text-muted">
          T-{trip.ref} · {leg.label}
        </p>
        {done || leg.status === 'done' ? (
          <p className="text-onplan">Logged. You can close this page.</p>
        ) : (
          <>
            {isPod && (
              <input
                className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-cream"
                placeholder="POD note / receiver name (optional)"
                value={podNote}
                onChange={(e) => setPodNote(e.target.value)}
              />
            )}
            {error && <p className="text-sm text-late">{error}</p>}
            <button
              type="button"
              className="w-full rounded-xl bg-gold py-10 text-xl font-semibold text-ink"
              onClick={() => {
                const result = completeLegCheckIn(legToken, 'field', podNote)
                if (!result) {
                  setError('Could not log check-in')
                  return
                }
                setDone(true)
              }}
            >
              {label}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
