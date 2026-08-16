/**
 * Network → Recommend — client + base priority call lists.
 * Priority only (no nearby directory). Fuzzy matches require confirm.
 */

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { OperatorSelect } from '@/components/OperatorSelect'
import { formatAirportShort, lookupAirport } from '@/domain/airports'
import { haversineNm } from '@/domain/geo'
import {
  addPriorityEntry,
  confirmPriorityMatch,
  dismissPriorityMatch,
  getBasePriorityList,
  listBasePriorityClients,
  listBasePriorityLists,
  movePriorityEntry,
  removePriorityEntry,
  subscribeBasePriority,
} from '@/lib/basePriorityStore'
import {
  ensureDeskOperatorsLoaded,
  listDeskOperators,
} from '@/lib/deskOperatorSearch'
import { getCachedNetwork, loadNetwork } from '@/lib/networkData'
import type { BasePriorityEntry, BasePriorityList } from '@/domain/basePriority'
import type { AircraftRow } from '@/lib/types'

function telHref(phone: string): string {
  const digits = phone.replace(/[^\d+]/g, '')
  return digits ? `tel:${digits}` : '#'
}

function fleetForOperator(operatorId: string | null): AircraftRow[] {
  if (!operatorId) return []
  const net = getCachedNetwork()
  return (net?.aircraft ?? []).filter(
    (a) => a.operator_id === operatorId && a.active !== false,
  )
}

function distanceNm(
  fromIcao: string | null,
  opBase: string | null | undefined,
): string | null {
  if (!fromIcao || !opBase) return null
  const a = lookupAirport(fromIcao)
  const b = lookupAirport(opBase)
  if (!a || !b) return `${opBase}`
  const nm = Math.round(haversineNm(a.lat, a.lon, b.lat, b.lon))
  return `${opBase} · ${nm} NM`
}

export function BasePriorityPanel() {
  const lists = useSyncExternalStore(
    subscribeBasePriority,
    listBasePriorityLists,
    listBasePriorityLists,
  )
  const clients = useMemo(() => listBasePriorityClients(), [lists])
  const [client, setClient] = useState<string | null>(null)
  const [listId, setListId] = useState<string | null>(null)
  const [addName, setAddName] = useState('')
  const [addOpId, setAddOpId] = useState<string | null>(null)
  const [netTick, setNetTick] = useState(0)

  useEffect(() => {
    void loadNetwork().then(() => setNetTick((n) => n + 1))
    void ensureDeskOperatorsLoaded().then(() => setNetTick((n) => n + 1))
  }, [])

  useEffect(() => {
    if (!client && clients[0]) setClient(clients[0])
  }, [clients, client])

  const clientLists = useMemo(
    () => lists.filter((l) => l.client_name === client),
    [lists, client],
  )

  useEffect(() => {
    if (!listId && clientLists[0]) setListId(clientLists[0].id)
    else if (listId && !clientLists.some((l) => l.id === listId)) {
      setListId(clientLists[0]?.id ?? null)
    }
  }, [clientLists, listId])

  const selected = listId ? getBasePriorityList(listId) : null
  void netTick

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 lg:flex-row">
      <aside className="w-full shrink-0 space-y-3 lg:w-52">
        <div>
          <h2 className="text-lg font-semibold text-cream">Recommend</h2>
          <p className="mt-1 text-xs text-muted">
            Priority call lists by client + base. Confirm fuzzy matches before
            they link to network fleet.
          </p>
        </div>
        <div className="space-y-1">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted">
            Client
          </p>
          {clients.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => {
                setClient(c)
                setListId(null)
              }}
              className={[
                'block w-full rounded-md px-3 py-2 text-left text-sm',
                client === c
                  ? 'bg-gold/15 text-gold'
                  : 'text-muted hover:bg-surface-2 hover:text-cream',
              ].join(' ')}
            >
              {c}
            </button>
          ))}
        </div>
        <div className="space-y-1">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted">
            Base
          </p>
          {clientLists.map((l) => {
            const label = l.base_icao
              ? `${l.base_icao}${l.base_label ? ` · ${l.base_label}` : ''}`
              : l.base_label
            return (
              <button
                key={l.id}
                type="button"
                onClick={() => setListId(l.id)}
                className={[
                  'block w-full rounded-md px-3 py-2 text-left text-sm',
                  listId === l.id
                    ? 'bg-gold/15 font-mono text-gold'
                    : 'font-mono text-muted hover:bg-surface-2 hover:text-cream',
                ].join(' ')}
              >
                <span className="block truncate">{label}</span>
                <span className="text-[11px] text-muted">
                  {l.entries.length} operators
                </span>
              </button>
            )
          })}
        </div>
      </aside>

      <main className="min-w-0 flex-1 space-y-4">
        {!selected ? (
          <p className="text-sm text-muted">Select a client and base.</p>
        ) : (
          <>
            <header className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-xl font-semibold text-cream">
                  Priority list for{' '}
                  <span className="font-mono text-gold">
                    {selected.base_icao ?? selected.base_label}
                  </span>
                </h3>
                <p className="mt-1 text-sm text-muted">
                  {selected.client_name}
                  {selected.base_label && selected.base_icao
                    ? ` · ${selected.base_label}`
                    : ''}
                  {' · '}
                  Manually ranked — sourced first
                </p>
              </div>
            </header>

            <div className="rounded-lg border border-dashed border-border p-3">
              <p className="text-xs uppercase tracking-wider text-muted">
                + Add to priority
              </p>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-end">
                <OperatorSelect
                  label="Operator"
                  value={addName}
                  onChange={(name, hit) => {
                    setAddName(name)
                    setAddOpId(hit?.operator_id ?? null)
                  }}
                  className="min-w-0 flex-1"
                />
                <button
                  type="button"
                  className="rounded-md bg-gold px-4 py-2.5 text-sm font-medium text-ink hover:bg-gold-lt"
                  onClick={() => {
                    if (!addOpId || !addName.trim()) return
                    const desk = listDeskOperators().find((o) => o.id === addOpId)
                    addPriorityEntry(selected.id, {
                      company_name: addName,
                      operator_id: addOpId,
                      general_email: desk?.contact_email || desk?.ops_email || '',
                      contact_phone: desk?.contact_cell || '',
                    })
                    setAddName('')
                    setAddOpId(null)
                  }}
                >
                  Add to priority
                </button>
              </div>
            </div>

            <ol className="space-y-3">
              {selected.entries.map((e) => (
                <PriorityCard
                  key={e.id}
                  list={selected}
                  entry={e}
                />
              ))}
            </ol>
            {!selected.entries.length && (
              <p className="text-sm text-muted">No operators on this list yet.</p>
            )}
          </>
        )}
      </main>
    </div>
  )
}

function PriorityCard({
  list,
  entry,
}: {
  list: BasePriorityList
  entry: BasePriorityEntry
}) {
  const fleet = fleetForOperator(entry.operator_id)
  const dist = distanceNm(list.base_icao, entry.operator_base_icao)
  const place = entry.operator_base_icao
    ? lookupAirport(entry.operator_base_icao)
    : null

  const emails = [entry.general_email].filter((e) => e.includes('@'))
  const callLines =
    entry.call_lines.length > 0
      ? entry.call_lines
      : [
          entry.phone_24hr && { label: '24/7', phone: entry.phone_24hr },
          entry.company_phone && { label: 'Company', phone: entry.company_phone },
          entry.contact_phone && { label: 'Contact', phone: entry.contact_phone },
        ].filter(Boolean) as { label: string; phone: string }[]

  const pills: string[] = []
  if (entry.caps.hrs24) pills.push('24/7')
  if (entry.caps.pax) pills.push('Pax')
  if (entry.caps.cargo) pills.push('Cargo')
  if (entry.caps.hazmat) pills.push('Hazmat')
  if (entry.caps.medevac) pills.push('Medevac')

  return (
    <li className="rounded-lg border border-gold/35 bg-surface p-4">
      <div className="flex flex-wrap items-start gap-3">
        <span className="font-mono text-sm text-gold">#{entry.rank}</span>
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-baseline gap-2">
            <h4 className="text-base font-semibold text-cream">
              {entry.company_name}
            </h4>
            {pills.map((p) => (
              <span
                key={p}
                className="rounded-full border border-border px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted"
              >
                {p}
              </span>
            ))}
          </div>
          <p className="font-mono text-xs text-muted">
            {dist ||
              (place
                ? formatAirportShort(place)
                : entry.operator_base_icao || 'Base unknown')}
            {entry.call_out_time ? ` · Call-out ${entry.call_out_time}` : ''}
          </p>

          {(entry.match_status === 'suggested' ||
            entry.match_status === 'unmatched') && (
            <div className="rounded-md border border-gold/40 bg-gold/10 px-3 py-2 text-sm">
              {entry.match_status === 'suggested' ? (
                <>
                  <p className="text-gold">
                    Suggested match:{' '}
                    <span className="font-medium text-cream">
                      {entry.match_candidate_name}
                    </span>
                    {entry.match_score != null
                      ? ` (${entry.match_score})`
                      : ''}
                    {' — confirm before linking fleet'}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="rounded-md bg-gold px-3 py-1.5 text-xs font-medium text-ink"
                      onClick={() => {
                        if (!entry.suggested_operator_id) return
                        confirmPriorityMatch(
                          list.id,
                          entry.id,
                          entry.suggested_operator_id,
                          entry.match_candidate_name || entry.company_name,
                        )
                      }}
                    >
                      Confirm match
                    </button>
                    <button
                      type="button"
                      className="rounded-md border border-border px-3 py-1.5 text-xs text-muted hover:text-cream"
                      onClick={() => dismissPriorityMatch(list.id, entry.id)}
                    >
                      Leave unmatched
                    </button>
                  </div>
                </>
              ) : (
                <p className="text-muted">
                  No network match — add via operator picker or leave as CSV-only
                  card.
                </p>
              )}
            </div>
          )}

          {entry.match_status === 'confirmed' && (
            <p className="text-[11px] text-onplan">
              Linked to network
              {entry.match_candidate_name
                ? `: ${entry.match_candidate_name}`
                : ''}
            </p>
          )}

          <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
            <div className="space-y-2">
              {emails.map((em) => (
                <a
                  key={em}
                  href={`mailto:${em}`}
                  className="flex items-center gap-2 font-mono text-sm text-gold hover:underline"
                >
                  ✉ {em}
                </a>
              ))}
              <div className="space-y-1">
                {fleet.length > 0 ? (
                  <p className="text-xs text-cream">
                    {summarizeFleet(fleet)}
                  </p>
                ) : entry.aircraft_locations_csv || entry.fleet_types_csv ? (
                  <p className="text-xs text-muted">
                    {entry.fleet_types_csv || entry.aircraft_locations_csv}
                  </p>
                ) : null}
                {entry.notes ? (
                  <p className="text-xs italic text-muted">{entry.notes}</p>
                ) : null}
              </div>
            </div>

            <div className="flex min-w-[12rem] flex-col gap-1">
              {callLines.map((c) => (
                <a
                  key={`${c.label}-${c.phone}`}
                  href={telHref(c.phone)}
                  className="rounded-md border border-border bg-ink/50 px-2.5 py-1.5 text-left text-xs text-cream hover:border-gold/50"
                >
                  <span className="font-mono text-gold">{c.phone}</span>
                  <span className="mt-0.5 block text-[10px] uppercase tracking-wider text-muted">
                    {c.label}
                  </span>
                </a>
              ))}
            </div>
          </div>
        </div>

        <div className="flex shrink-0 flex-col gap-1">
          <button
            type="button"
            aria-label="Move up"
            className="rounded border border-border px-2 py-1 text-xs text-muted enabled:hover:text-cream disabled:opacity-30"
            disabled={entry.rank <= 1}
            onClick={() => movePriorityEntry(list.id, entry.id, -1)}
          >
            ↑
          </button>
          <button
            type="button"
            aria-label="Move down"
            className="rounded border border-border px-2 py-1 text-xs text-muted enabled:hover:text-cream disabled:opacity-30"
            disabled={entry.rank >= list.entries.length}
            onClick={() => movePriorityEntry(list.id, entry.id, 1)}
          >
            ↓
          </button>
          <button
            type="button"
            aria-label="Remove"
            className="rounded border border-border px-2 py-1 text-xs text-muted hover:border-late hover:text-late"
            onClick={() => removePriorityEntry(list.id, entry.id)}
          >
            ✕
          </button>
        </div>
      </div>
    </li>
  )
}

function summarizeFleet(aircraft: AircraftRow[]): string {
  const byType = new Map<string, number>()
  for (const a of aircraft) {
    const t = (a.type_name || 'Unknown').trim()
    byType.set(t, (byType.get(t) ?? 0) + 1)
  }
  return [...byType.entries()]
    .map(([t, n]) => `${t} (${n})`)
    .join(' · ')
}
