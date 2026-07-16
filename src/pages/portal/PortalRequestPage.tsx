import { Link } from 'react-router-dom'

export default function PortalRequestPage() {
  return (
    <div className="min-h-screen bg-cream text-ink" data-theme="client">
      <div className="mx-auto max-w-xl space-y-4 p-6">
        <Link to="/portal" className="text-sm text-muted">
          ← Portal
        </Link>
        <h1 className="text-2xl font-semibold">Request a trip</h1>
        <p className="text-sm text-muted">
          Same dims parser as dispatch. For the full form, use the dispatcher{' '}
          <Link className="text-gold" to="/trips/new">
            New trip
          </Link>{' '}
          flow (portal form binds client_rules + requester on submit in the next hardening pass).
        </p>
        <Link
          to="/trips/new"
          className="inline-flex rounded-md bg-gold px-4 py-2 text-sm font-medium text-ink"
        >
          Continue to request form
        </Link>
      </div>
    </div>
  )
}
