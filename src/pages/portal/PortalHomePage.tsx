import { Link } from 'react-router-dom'

/** Client portal shell — magic-link auth wired later; demo uses seeded client view. */
export default function PortalHomePage() {
  return (
    <div className="min-h-screen bg-cream text-ink" data-theme="client">
      <header className="border-b border-border px-6 py-4">
        <div className="text-xs uppercase tracking-[0.2em] text-gold">OnFly Air</div>
        <h1 className="text-xl font-semibold">Client portal</h1>
      </header>
      <main className="mx-auto max-w-3xl space-y-6 p-6">
        <section className="rounded-lg border border-border bg-surface-2 p-5">
          <h2 className="font-medium">Active trips</h2>
          <p className="mt-1 text-sm text-muted">
            Demo Freight Co — live tracker cards appear here after booking (safe views, no cost/margin).
          </p>
          <div className="mt-4 rounded-md border border-dashed border-border p-4 text-sm text-muted">
            No active portal trips yet. Request below feeds the dispatch quote path.
          </div>
        </section>
        <Link
          to="/portal/request"
          className="inline-flex rounded-md bg-gold px-4 py-2 text-sm font-medium text-ink"
        >
          Request a trip
        </Link>
        <p className="text-xs text-muted">
          Magic-link auth + RLS portal_* views ship with Supabase Auth wiring; mock path is open for demo.
        </p>
      </main>
    </div>
  )
}
