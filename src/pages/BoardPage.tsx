import { Link } from 'react-router-dom'

export default function BoardPage() {
  return (
    <div className="flex flex-col gap-6 p-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-cream">Dispatch Board</h1>
          <p className="mt-1 text-sm text-muted">
            Exception queue lands in Chunk 4. Instant quotes are live now.
          </p>
        </div>
        <Link
          to="/trips/new"
          className="rounded-md bg-gold px-4 py-2 text-sm font-medium text-ink hover:bg-gold-lt"
        >
          New trip
        </Link>
      </header>
      <div className="rounded-lg border border-border border-dashed bg-surface p-8 text-center">
        <div className="text-sm uppercase tracking-[0.15em] text-gold">Ready</div>
        <p className="mt-3 text-muted">
          Run the Akron → Chicago worked example from{' '}
          <Link className="text-gold hover:text-gold-lt" to="/trips/new">
            New trip
          </Link>
          .
        </p>
        <Link
          to="/trips/11111111-aaaa-4000-8000-000000000001"
          className="mt-6 inline-flex rounded-md border border-gold/40 bg-gold/10 px-4 py-2 text-sm text-gold hover:bg-gold/20"
        >
          Open sample trip T-1001
        </Link>
      </div>
    </div>
  )
}
