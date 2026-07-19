/**
 * One-tap check-in page (no login) — writes actuals + optional POD photo to Storage.
 */
import { useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  addTripDocument,
  completeLegCheckIn,
  getTripByLegToken,
} from '@/lib/tripStore'
import { canUseStorage, uploadTripDocToStorage } from '@/lib/storage'

export default function OneTapPage() {
  const { legToken } = useParams()
  const hit = useMemo(
    () => (legToken ? getTripByLegToken(legToken) : null),
    [legToken],
  )
  const [done, setDone] = useState(false)
  const [podNote, setPodNote] = useState('')
  const [podFile, setPodFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
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
        <div className="text-xs uppercase tracking-[0.2em] text-gold">
          OnFly check-in
        </div>
        <p className="text-sm text-muted">
          T-{trip.ref} · {leg.label}
        </p>
        {done || leg.status === 'done' ? (
          <p className="text-onplan">Logged. You can close this page.</p>
        ) : (
          <>
            {isPod && (
              <>
                <input
                  className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-cream"
                  placeholder="POD note / receiver name (optional)"
                  value={podNote}
                  onChange={(e) => setPodNote(e.target.value)}
                />
                <label className="block text-left text-xs text-muted">
                  POD photo / PDF
                  <input
                    type="file"
                    accept="image/*,application/pdf"
                    capture="environment"
                    className="mt-1 w-full text-sm text-cream"
                    onChange={(e) => setPodFile(e.target.files?.[0] ?? null)}
                  />
                </label>
              </>
            )}
            {error && <p className="text-sm text-late">{error}</p>}
            <button
              type="button"
              disabled={busy}
              className="w-full rounded-xl bg-gold py-10 text-xl font-semibold text-ink disabled:opacity-60"
              onClick={() => {
                setBusy(true)
                setError(null)
                void (async () => {
                  const result = completeLegCheckIn(legToken, 'field', podNote)
                  if (!result) {
                    setError('Could not log check-in')
                    setBusy(false)
                    return
                  }
                  if (isPod && podFile && canUseStorage()) {
                    try {
                      const up = await uploadTripDocToStorage({
                        tripId: trip.id,
                        kind: 'pod',
                        file: podFile,
                      })
                      addTripDocument(trip.id, {
                        kind: 'pod',
                        title:
                          podNote.trim() ||
                          `POD photo · T-${trip.ref}`,
                        url: up.signedUrl || up.path,
                      })
                    } catch (e) {
                      console.warn('[pod] storage upload failed', e)
                      setError(
                        'Check-in logged; photo upload failed — dispatch has the note.',
                      )
                    }
                  }
                  setDone(true)
                  setBusy(false)
                })()
              }}
            >
              {busy ? 'Saving…' : label}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
