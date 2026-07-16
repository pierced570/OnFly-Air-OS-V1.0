import { useEffect, useState } from 'react'
import { createAdsbAdapter, restChipFromGs, type AdsbPosition } from '@/adapters/adsb'
import { createWxAdapter } from '@/adapters/wx'
import { loadNetwork } from '@/lib/networkData'

export default function RadarPage() {
  const [positions, setPositions] = useState<AdsbPosition[]>([])
  const [wx, setWx] = useState<string>('')

  useEffect(() => {
    void (async () => {
      const net = await loadNetwork()
      const tails = net.aircraft.map((a) => a.tail).filter((t) => !t.startsWith('TBD')).slice(0, 20)
      const adsb = createAdsbAdapter()
      setPositions(await adsb.positions(tails))
      const brief = await createWxAdapter().brief('KCAK')
      setWx(brief.summary)
    })()
  }, [])

  return (
    <div className="flex flex-col gap-6 p-8">
      <header>
        <h1 className="text-2xl font-semibold text-cream">Fleet Radar</h1>
        <p className="mt-1 text-sm text-muted">
          Mock ADS-B fixtures · rest chips advisory only (not a 135.267 determination)
        </p>
      </header>

      <div className="rounded-lg border border-border bg-surface p-4 text-sm text-muted">
        MapLibre map placeholder — {positions.length} fixture positions loaded.
        <div className="mt-2 h-48 rounded bg-ink/60 relative overflow-hidden">
          {positions.map((p) => (
            <span
              key={p.tail}
              title={p.tail}
              className="absolute h-2 w-2 rounded-full bg-gold"
              style={{
                left: `${((p.lon + 90) / 20) * 100}%`,
                top: `${((45 - p.lat) / 10) * 100}%`,
              }}
            />
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-border bg-surface p-4">
        <h2 className="text-xs uppercase tracking-wider text-muted">WX brief</h2>
        <p className="mt-2 text-sm text-cream">{wx || '…'}</p>
      </div>

      <ul className="space-y-2">
        {positions.map((p) => {
          const chip = restChipFromGs(p.gs)
          return (
            <li
              key={p.tail}
              className="flex items-center justify-between rounded border border-border bg-surface px-3 py-2 text-sm"
            >
              <span className="avionic text-gold">{p.tail}</span>
              <span className="text-muted">
                {p.gs} kt ·{' '}
                <span className="text-cream" title="estimate from ADS-B; operator confirms legality">
                  {chip.replace(/_/g, ' ')}
                </span>
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
