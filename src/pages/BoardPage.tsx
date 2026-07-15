import { Link } from 'react-router-dom'

export default function BoardPage() {
  return (
    <div className="flex flex-col gap-6 p-8">
      <header>
        <h1 className="text-2xl font-semibold text-cream">Dispatch Board</h1>
        <p className="mt-1 text-sm text-muted">
          Exception queue and live trips land here in Chunk 4. Foundation scaffold is ready.
        </p>
      </header>
      <div className="rounded-lg border border-border border-dashed bg-surface p-8 text-center">
        <div className="text-sm uppercase tracking-[0.15em] text-gold">Placeholder</div>
        <p className="mt-3 text-muted">
          No active exceptions. Import the fleet on{' '}
          <Link className="text-gold hover:text-gold-lt" to="/network">
            Network
          </Link>{' '}
          and open a sample trip to inspect the state machine.
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
