/**
 * One-tap check-in page (no login).
 */
import { useState } from 'react'
import { useParams } from 'react-router-dom'

export default function OneTapPage() {
  const { legToken } = useParams()
  const [done, setDone] = useState(false)
  const label =
    legToken?.includes('del') ? 'DELIVERED — capture POD' : legToken?.includes('load') ? 'LOADED' : 'ARRIVED AT PICKUP'

  return (
    <div className="flex min-h-screen items-center justify-center bg-ink p-6" data-theme="dispatcher">
      <div className="w-full max-w-sm space-y-4 text-center">
        <div className="text-xs uppercase tracking-[0.2em] text-gold">OnFly check-in</div>
        {done ? (
          <p className="text-onplan">Logged. You can close this page.</p>
        ) : (
          <button
            type="button"
            className="w-full rounded-xl bg-gold py-10 text-xl font-semibold text-ink"
            onClick={() => setDone(true)}
          >
            {label}
          </button>
        )}
      </div>
    </div>
  )
}
