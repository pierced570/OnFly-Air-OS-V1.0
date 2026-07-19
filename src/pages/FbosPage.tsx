import { useMemo, useState, useSyncExternalStore } from 'react'
import { Link } from 'react-router-dom'
import { AirportSelect } from '@/components/AirportSelect'
import { lookupAirport } from '@/domain/airports'
import { listFbos, rankFbosForCargo, subscribeFbos } from '@/lib/fboStore'

export default function FbosPage() {
  const fbos = useSyncExternalStore(subscribeFbos, listFbos, listFbos)
  const [q, setQ] = useState('')
  const [rankIcao, setRankIcao] = useState('')

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return fbos
    return fbos.filter(
      (f) =>
        f.name.toLowerCase().includes(needle) ||
        f.airport_icao.toLowerCase().includes(needle),
    )
  }, [fbos, q])

  const ranked = rankIcao.trim().length >= 3 ? rankFbosForCargo(rankIcao) : []

  return (
    <div className="flex flex-col gap-4 p-4 sm:gap-6 sm:p-6 lg:p-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-cream">FBOs</h1>
          <p className="mt-1 text-sm text-muted">
            Survey data for airport choice — 24hr + forklift + insured ranks first on cargo.
          </p>
        </div>
        <Link
          to="/admin"
          className="rounded-md bg-gold px-3 py-2 text-sm font-medium text-ink"
        >
          + Add FBO wizard
        </Link>
      </header>

      <div className="grid gap-3 sm:grid-cols-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name or ICAO…"
          className="rounded-md border border-border bg-ink px-3 py-2 text-sm text-cream"
        />
        <AirportSelect
          label="Rank cargo FBOs at"
          value={rankIcao}
          onChange={setRankIcao}
          placeholder="Search airport…"
        />
      </div>

      {ranked.length > 0 && (
        <section className="rounded-lg border border-gold/40 bg-gold/10 p-4">
          <h2 className="text-xs uppercase tracking-wider text-gold">
            Cargo rank @ {rankIcao.toUpperCase()}
          </h2>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-cream">
            {ranked.map((f) => (
              <li key={f.id}>
                {f.name}
                <span className="ml-2 text-xs text-muted">
                  {[
                    f.is_24hr && '24hr',
                    f.forklift && 'forklift',
                    f.gl_insurance && 'insured',
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}

      <ul className="space-y-2">
        {filtered.map((f) => {
          const ap = lookupAirport(f.airport_icao)
          return (
          <li
            key={f.id}
            className="rounded-lg border border-border bg-surface px-4 py-3"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <span className="avionic text-gold">{f.airport_icao}</span>
                {ap && (
                  <span className="ml-1 text-xs text-muted">
                    {ap.city}, {ap.state}
                  </span>
                )}
                <span className="ml-2 font-medium text-cream">{f.name}</span>
              </div>
              <div className="text-xs text-muted">
                verified {f.last_verified}
              </div>
            </div>
            {(f.street || f.city) && (
              <p className="mt-1 text-xs text-cream">
                {[f.street, f.city, f.state, f.zip].filter(Boolean).join(', ')}
              </p>
            )}
            <div className="mt-1 flex flex-wrap gap-2 text-xs text-muted">
              {f.is_24hr && <span className="text-onplan">24hr</span>}
              {f.forklift && (
                <span>
                  forklift
                  {f.forklift_capacity_lbs
                    ? ` ${f.forklift_capacity_lbs.toLocaleString()} lb`
                    : ''}
                </span>
              )}
              {f.gl_insurance && <span>GL insured</span>}
              {f.fee_handling != null && <span>handling ${f.fee_handling}</span>}
              {f.phone && <span className="avionic">{f.phone}</span>}
            </div>
            {f.needs_info.length > 0 && (
              <p className="mt-1 text-xs text-late">
                NEEDS-INFO: {f.needs_info.join(', ')}
              </p>
            )}
          </li>
          )
        })}
      </ul>
    </div>
  )
}
