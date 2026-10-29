/**
 * Client app — History hub: previous trips, POs, and invoices in one place.
 * Mobile-first. Never shows operator identity, margins, or vendor cost.
 */

import {
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react'
import { Link } from 'react-router-dom'
import { PortalShell } from '@/components/PortalShell'
import { PortalGuestContinue } from '@/components/PortalGuestContinue'
import {
  buildPortalHistoryLedger,
  buildPortalOpenRequestCards,
  filterPortalHistoryLedger,
  isPortalAppHistoryState,
  portalAppStateLabel,
  type PortalHistoryRow,
} from '@/domain/portalClientApp'
import type { PortalTripCard } from '@/domain/portalAuth'
import { usePortalSession } from '@/hooks/usePortalSession'
import {
  endPortalSession,
  listPortalHistoryForSession,
} from '@/lib/portalAuth'
import { sameClientId } from '@/lib/clientStore'
import { listRequests, subscribeRequests } from '@/lib/requestStore'
import {
  getTrip,
  listTripsStable,
  subscribeTrips,
} from '@/lib/tripStore'

type FilterKind = 'all' | 'trip' | 'po' | 'invoice'

function money(n: number | null): string | null {
  if (n == null || !Number.isFinite(n)) return null
  return `$${Math.round(n).toLocaleString('en-US')}`
}

function KindChip({ kind }: { kind: PortalHistoryRow['kind'] }) {
  const label =
    kind === 'trip' ? 'Trip' : kind === 'po' ? 'PO' : 'Invoice'
  return (
    <span className="rounded border border-[#D4CFC0] bg-white px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[#6B6560]">
      {label}
    </span>
  )
}

function HistoryRowLink(props: {
  row: PortalHistoryRow
  children: ReactNode
}) {
  const href = props.row.href
  const className =
    'flex min-h-[4.25rem] items-center justify-between gap-3 rounded-xl border border-[#E5DFD0] bg-white px-4 py-3 active:bg-[#F7F2E3]'
  if (href.startsWith('http')) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className={className}
      >
        {props.children}
      </a>
    )
  }
  const to =
    href.startsWith('#') || !href.startsWith('/')
      ? `/portal/trips/${props.row.tripId}`
      : href
  return (
    <Link to={to} className={className}>
      {props.children}
    </Link>
  )
}

export default function PortalHistoryPage() {
  const { session, loading, signedIn, setSession } = usePortalSession()
  const localTrips = useSyncExternalStore(
    subscribeTrips,
    listTripsStable,
    listTripsStable,
  )
  const allRequests = useSyncExternalStore(
    subscribeRequests,
    listRequests,
    listRequests,
  )
  const [remote, setRemote] = useState<PortalTripCard[]>([])
  const [kind, setKind] = useState<FilterKind>('all')
  const [q, setQ] = useState('')

  useEffect(() => {
    let cancelled = false
    void (async () => {
      if (!session?.clientId) {
        if (!cancelled) setRemote([])
        return
      }
      const rows = await listPortalHistoryForSession()
      if (!cancelled) setRemote(rows)
    })()
    return () => {
      cancelled = true
    }
  }, [session?.clientId, session?.email])

  const ledger = useMemo(() => {
    if (!signedIn || !session?.clientId) return []
    type Row = Parameters<typeof buildPortalHistoryLedger>[0][number]
    const byId = new Map<string, Row>()

    for (const t of remote) {
      if (!isPortalAppHistoryState(t.state)) continue
      const local = getTrip(t.id)
      byId.set(t.id, {
        id: t.id,
        ref: t.ref,
        state: t.state,
        lane: t.lane,
        po_number: t.po_number ?? local?.po_number ?? local?.quick?.po ?? null,
        code: t.code ?? local?.code ?? null,
        updated_at: t.updated_at ?? null,
        invoice: local?.invoice ?? null,
        documents: local?.documents,
      })
    }

    for (const t of localTrips) {
      if (!sameClientId(t.client_id, session.clientId)) continue
      if (!isPortalAppHistoryState(t.state)) continue
      const cur = byId.get(t.id)
      byId.set(t.id, {
        id: t.id,
        ref: t.ref,
        state: t.state,
        lane: t.lane,
        po_number:
          cur?.po_number || t.po_number || t.quick?.po || null,
        code: cur?.code || t.code || null,
        updated_at: cur?.updated_at ?? null,
        invoice: t.invoice ?? cur?.invoice ?? null,
        documents: t.documents?.length ? t.documents : cur?.documents,
      })
    }

    return buildPortalHistoryLedger([...byId.values()])
  }, [remote, localTrips, signedIn, session?.clientId])

  const filtered = useMemo(
    () => filterPortalHistoryLedger(ledger, { kind, q }),
    [ledger, kind, q],
  )

  const openRequestCards = useMemo(() => {
    if (!signedIn || !session) return []
    const mine = allRequests.filter((r) => {
      if (r.source !== 'portal') return false
      if (session.clientId && r.client_id === session.clientId) return true
      if (
        session.email &&
        r.email?.trim().toLowerCase() === session.email.toLowerCase()
      ) {
        return true
      }
      return false
    })
    return buildPortalOpenRequestCards(mine)
  }, [allRequests, signedIn, session])

  if (loading) {
    return (
      <PortalShell>
        <p className="text-sm text-muted">Checking session…</p>
      </PortalShell>
    )
  }

  if (!signedIn) {
    return (
      <PortalGuestContinue
        title="Sign in for trip history"
        hint="POs and invoices need a verified desk email. You can still request another trip without signing in."
        nextHref="/portal/history"
      />
    )
  }

  const headerActions = (
    <>
      <span className="hidden text-cream/60 md:inline">{session?.email}</span>
      <button
        type="button"
        className="text-gold hover:text-gold-lt"
        onClick={() => {
          void endPortalSession().then(() => setSession(null))
        }}
      >
        Sign out
      </button>
    </>
  )

  return (
    <PortalShell headerActions={headerActions} appNav>
      <section className="space-y-5">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gold">
            History
          </div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
            Trips, POs &amp; invoices
          </h1>
          <p className="mt-1 text-sm text-muted">
            Prior trips plus open quotes from the portal — tap a row to open
            tracking or the invoice link.
          </p>
        </div>

        {openRequestCards.length > 0 ? (
          <div className="space-y-2">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gold">
              Open quotes &amp; requests
            </h2>
            <ul className="space-y-2">
              {openRequestCards.map((r) => (
                <li key={r.id}>
                  <Link
                    to={r.href}
                    className="flex min-h-[4.25rem] items-center justify-between gap-3 rounded-xl border border-gold/30 bg-white px-4 py-3 active:bg-[#F7F2E3]"
                  >
                    <div className="min-w-0">
                      <div className="avionic text-sm font-semibold text-ink">
                        R-{r.ref} · {r.lane}
                      </div>
                      <p className="truncate text-xs text-[#6B6560]">
                        {r.statusLabel} · {r.summary}
                      </p>
                    </div>
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-gold">
                      Open
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2">
          {(
            [
              ['all', 'All'],
              ['trip', 'Trips'],
              ['po', 'POs'],
              ['invoice', 'Invoices'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setKind(id)}
              className={[
                'min-h-11 rounded-md px-3 text-xs font-semibold uppercase tracking-[0.1em]',
                kind === id
                  ? 'bg-[#C9A227] text-[#0C0C0E]'
                  : 'border border-[#D4CFC0] bg-white text-[#6B6560]',
              ].join(' ')}
            >
              {label}
            </button>
          ))}
        </div>

        <label className="block text-xs font-medium text-[#6B6560]">
          Search
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="PO, T-ref, lane…"
            className="mt-1 w-full rounded-md border border-[#D4CFC0] bg-white px-3 py-3 text-sm text-ink outline-none focus:border-[#C9A227]"
          />
        </label>

        {filtered.length === 0 ? (
          <div className="rounded-md border border-dashed border-[#D4CFC0] bg-white/70 p-6 text-sm text-muted">
            No past trips yet. After delivery you&apos;ll see POs and invoices
            here.{' '}
            <Link to="/portal/request" className="text-gold">
              Book a trip
            </Link>
          </div>
        ) : (
          <ul className="space-y-2">
            {filtered.map((row) => (
              <li key={row.id}>
                <HistoryRowLink row={row}>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <KindChip kind={row.kind} />
                      <span className="text-sm font-semibold text-ink">
                        {row.title}
                      </span>
                    </div>
                    <p className="mt-1 truncate text-xs text-[#6B6560]">
                      {row.subtitle}
                    </p>
                    <p className="mt-0.5 text-[10px] uppercase tracking-wider text-[#8A8680]">
                      {portalAppStateLabel(row.state)}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    {money(row.amountUsd) ? (
                      <div className="avionic text-sm font-semibold text-ink">
                        {money(row.amountUsd)}
                      </div>
                    ) : null}
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-gold">
                      Open
                    </div>
                  </div>
                </HistoryRowLink>
              </li>
            ))}
          </ul>
        )}
      </section>
    </PortalShell>
  )
}
