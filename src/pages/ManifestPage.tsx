/**
 * Printable load manifest (cream client-doc family). Interim for render-doc PDF.
 */

import { Link, useParams } from 'react-router-dom'
import { useMemo, useSyncExternalStore } from 'react'
import { buildManifestModel, renderManifestHtml } from '@/domain/manifest'
import {
  getTrip,
  listTripsStable,
  subscribeTrips,
} from '@/lib/tripStore'

export default function ManifestPage() {
  useSyncExternalStore(subscribeTrips, listTripsStable, listTripsStable)
  const { id } = useParams()
  const trip = id ? getTrip(id) : null

  const html = useMemo(() => {
    if (!trip) return null
    const selected = trip.offers.find((o) => o.state === 'selected')
    const model = buildManifestModel({
      tripRef: trip.ref,
      lane: trip.lane,
      po: trip.quick?.po,
      operatorName:
        selected?.operator_name || trip.quick?.operator_name || 'TBD',
      tail: selected?.tail || trip.quick?.tail || 'TBD',
      typeName: selected?.type_name || trip.quick?.aircraft_type || 'TBD',
      pieces: [],
      etaSummary: trip.legs.map((l) => ({
        label: l.label,
        est_end: l.est_end,
      })),
    })
    return renderManifestHtml(model)
  }, [trip])

  if (!trip || !html) {
    return (
      <div className="p-8 text-cream">
        <p className="text-muted">Trip not found.</p>
        <Link to="/dispatch" className="text-gold">
          Dispatch center
        </Link>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-ink">
      <div className="no-print sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 border-b border-border bg-surface px-4 py-3">
        <div className="text-sm text-cream">
          Manifest · T-{trip.ref}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            className="tap rounded-md bg-gold px-3 py-2 text-sm font-medium text-ink"
            onClick={() => window.print()}
          >
            Print / PDF
          </button>
          <Link
            to={`/trips/${trip.id}`}
            className="tap rounded-md border border-border px-3 py-2 text-sm text-cream"
          >
            Back to trip
          </Link>
        </div>
      </div>
      <iframe
        title={`Manifest T-${trip.ref}`}
        srcDoc={html}
        className="min-h-[calc(100vh-3.5rem)] w-full border-0 bg-cream"
      />
    </div>
  )
}
