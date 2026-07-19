import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { createWxAdapter, type WxBrief } from '@/adapters/wx'
import { listTrips } from '@/lib/tripStore'
import { getOnShift, updateShiftNotes } from '@/lib/shiftStore'
import { raiseException } from '@/lib/exceptionStore'

export default function BriefingPage() {
  const trips = listTrips()
  const active = trips.filter((t) =>
    ['offers_out', 'quoted_hard', 'booked', 'in_progress'].includes(t.state),
  )
  const pendingQuotes = trips.filter((t) =>
    ['quoted_estimated', 'offers_out'].includes(t.state),
  )
  const onShift = getOnShift()
  const [notes, setNotes] = useState(onShift?.notes ?? '')
  const [briefs, setBriefs] = useState<WxBrief[]>([])
  const [wxBusy, setWxBusy] = useState(false)

  const watchIcaos = useMemo(() => {
    const set = new Set<string>()
    for (const t of active) {
      for (const leg of t.legs) {
        if (leg.origin) set.add(leg.origin.toUpperCase())
        if (leg.dest) set.add(leg.dest.toUpperCase())
      }
      if (t.quick) {
        for (const l of t.quick.legs) {
          if (l.origin_icao) set.add(l.origin_icao.toUpperCase())
          if (l.dest_icao) set.add(l.dest_icao.toUpperCase())
        }
      }
      const lane = t.lane.match(/([A-Z0-9]{3,4})/g)
      for (const m of lane ?? []) set.add(m)
    }
    if (set.size === 0) set.add('KCAK')
    return [...set].slice(0, 8)
  }, [active])

  async function loadWx() {
    setWxBusy(true)
    try {
      const wx = createWxAdapter()
      const rows = await Promise.all(watchIcaos.map((icao) => wx.brief(icao)))
      setBriefs(rows)
      for (const b of rows) {
        for (const flag of b.hardFlags) {
          raiseException({
            trip_id: null,
            trip_ref: null,
            title: `WX flag · ${b.icao}`,
            detail: flag,
            severity: 'attn',
          })
        }
      }
    } finally {
      setWxBusy(false)
    }
  }

  useEffect(() => {
    void loadWx()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchIcaos.join(',')])

  return (
    <div className="flex flex-col gap-4 p-4 sm:gap-6 sm:p-6 lg:p-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-[0.2em] text-gold">Shift ops</div>
          <h1 className="mt-1 text-2xl font-semibold text-cream">Shift briefing</h1>
          <p className="mt-1 text-sm text-muted">
            Cold-load for the on-shift dispatcher — WX watch from aviationweather.gov.
          </p>
          {onShift && (
            <p className="mt-1 text-xs text-gold">
              On shift: {onShift.person_name} · {onShift.phone}
            </p>
          )}
        </div>
        <button
          type="button"
          className="rounded-md border border-gold/40 px-3 py-1.5 text-sm text-gold"
          disabled={wxBusy}
          onClick={() => void loadWx()}
        >
          {wxBusy ? 'Refreshing WX…' : 'Refresh WX'}
        </button>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-lg border border-border bg-surface p-4">
          <h2 className="text-xs uppercase tracking-wider text-muted">Active trips</h2>
          {active.length === 0 ? (
            <p className="mt-2 text-sm text-muted">None yet</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {active.map((t) => (
                <li key={t.id}>
                  <Link
                    className="text-sm text-cream hover:text-gold"
                    to={`/trips/${t.id}`}
                  >
                    T-{t.ref} · {t.lane}{' '}
                    <span className="avionic text-muted">{t.state}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-lg border border-border bg-surface p-4">
          <h2 className="text-xs uppercase tracking-wider text-muted">
            Pending offers / quotes
          </h2>
          <p className="mt-2 avionic text-cream">{pendingQuotes.length}</p>
          <ul className="mt-2 space-y-1 text-sm text-muted">
            {pendingQuotes.map((t) => (
              <li key={t.id}>
                T-{t.ref} · {t.state}
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-lg border border-border bg-surface p-4 lg:col-span-2">
          <h2 className="text-xs uppercase tracking-wider text-muted">
            WX watch list
          </h2>
          <p className="mt-1 text-xs text-muted">
            METAR/TAF live · NOTAMs stub until FAA API approval · source{' '}
            {briefs[0]?.source ?? '…'}
          </p>
          {briefs.length === 0 ? (
            <p className="mt-2 text-sm text-muted">Loading…</p>
          ) : (
            <ul className="mt-3 space-y-3">
              {briefs.map((b) => (
                <li
                  key={b.icao}
                  className="rounded border border-border/60 bg-ink px-3 py-2 text-sm"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="avionic text-gold">{b.icao}</span>
                    <span className="text-[11px] text-muted">
                      {new Date(b.fetchedAt).toISOString().slice(11, 19)}Z
                    </span>
                  </div>
                  <p className="mt-1 text-cream">{b.summary}</p>
                  {b.hardFlags.length > 0 && (
                    <ul className="mt-1 text-xs text-late">
                      {b.hardFlags.map((f) => (
                        <li key={f}>{f}</li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-lg border border-border bg-surface p-4">
          <h2 className="text-xs uppercase tracking-wider text-muted">Network</h2>
          <p className="mt-2 text-sm text-muted">
            Operator response stats fill in as you run trips.
          </p>
          <Link to="/radar" className="mt-3 inline-block text-xs text-gold">
            Open Fleet Radar →
          </Link>
        </section>
      </div>

      <section className="rounded-lg border border-border bg-surface p-4">
        <h2 className="text-xs uppercase tracking-wider text-muted">Handoff notes</h2>
        <textarea
          className="mt-2 w-full rounded border border-border bg-ink px-3 py-2 text-sm text-cream"
          rows={3}
          value={notes}
          onChange={(e) => {
            setNotes(e.target.value)
            updateShiftNotes(e.target.value)
          }}
          placeholder="What the next dispatcher needs to know…"
        />
      </section>
    </div>
  )
}
