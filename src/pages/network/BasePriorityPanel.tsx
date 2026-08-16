/**
 * Network → Recommend — group + base priority call lists.
 * Dense cards: aircraft first, compact dial lines. Fuzzy matches need confirm.
 */

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { AirportSelect } from '@/components/AirportSelect'
import { OperatorSelect } from '@/components/OperatorSelect'
import { formatAirportShort, lookupAirport } from '@/domain/airports'
import { haversineNm } from '@/domain/geo'
import {
  addPriorityEntry,
  confirmPriorityMatch,
  dismissPriorityMatch,
  ensureBasePriorityList,
  getBasePriorityList,
  listBasePriorityGroups,
  listBasePriorityLists,
  movePriorityEntry,
  removePriorityEntry,
  subscribeBasePriority,
  updatePriorityEntry,
} from '@/lib/basePriorityStore'
import {
  ensureDeskOperatorsLoaded,
  listDeskOperators,
} from '@/lib/deskOperatorSearch'
import { getCachedNetwork, loadNetwork } from '@/lib/networkData'
import type {
  BasePriorityEntry,
  BasePriorityList,
  PriorityCallLine,
} from '@/domain/basePriority'
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

function shortPhoneLabel(label: string): string {
  const t = label.trim()
  if (/24\s*\/?\s*7|24hr|24-hr/i.test(t)) return '24/7'
  if (/after/i.test(t)) return 'A/H'
  if (/main|company|office/i.test(t)) return 'Main'
  if (/cell|mobile/i.test(t)) return 'Cell'
  return t.length > 10 ? `${t.slice(0, 9)}…` : t
}

export function BasePriorityPanel() {
  const lists = useSyncExternalStore(
    subscribeBasePriority,
    listBasePriorityLists,
    listBasePriorityLists,
  )
  const groups = useMemo(() => listBasePriorityGroups(), [lists])
  const [group, setGroup] = useState<string | null>(null)
  const [listId, setListId] = useState<string | null>(null)
  const [addName, setAddName] = useState('')
  const [addOpId, setAddOpId] = useState<string | null>(null)
  const [netTick, setNetTick] = useState(0)

  const [newGroup, setNewGroup] = useState('')
  const [fleetOnlyGroup, setFleetOnlyGroup] = useState(false)
  const [newGroupBase, setNewGroupBase] = useState('')
  const [newBaseIcao, setNewBaseIcao] = useState('')
  const [addingGroup, setAddingGroup] = useState(false)
  const [addingBase, setAddingBase] = useState(false)

  useEffect(() => {
    void loadNetwork().then(() => setNetTick((n) => n + 1))
    void ensureDeskOperatorsLoaded().then(() => setNetTick((n) => n + 1))
  }, [])

  useEffect(() => {
    if (!group && groups[0]) setGroup(groups[0])
  }, [groups, group])

  const groupLists = useMemo(
    () => lists.filter((l) => l.client_name === group),
    [lists, group],
  )

  useEffect(() => {
    if (!listId && groupLists[0]) setListId(groupLists[0].id)
    else if (listId && !groupLists.some((l) => l.id === listId)) {
      setListId(groupLists[0]?.id ?? null)
    }
  }, [groupLists, listId])

  const selected = listId ? getBasePriorityList(listId) : null
  void netTick

  function createGroup() {
    const name = newGroup.trim()
    if (!name) return
    if (fleetOnlyGroup) {
      const row = ensureBasePriorityList({
        client_name: name,
        base_icao: null,
        base_label: name,
      })
      setGroup(name)
      setListId(row.id)
    } else {
      const icao = newGroupBase.trim().toUpperCase()
      if (icao.length < 3) return
      const ap = lookupAirport(icao)
      const row = ensureBasePriorityList({
        client_name: name,
        base_icao: icao,
        base_label: ap ? formatAirportShort(ap) : icao,
      })
      setGroup(name)
      setListId(row.id)
    }
    setNewGroup('')
    setNewGroupBase('')
    setFleetOnlyGroup(false)
    setAddingGroup(false)
  }

  function createBase() {
    if (!group) return
    const icao = newBaseIcao.trim().toUpperCase()
    if (!icao || icao.length < 3) return
    const ap = lookupAirport(icao)
    const row = ensureBasePriorityList({
      client_name: group,
      base_icao: icao,
      base_label: ap ? formatAirportShort(ap) : icao,
    })
    setListId(row.id)
    setNewBaseIcao('')
    setAddingBase(false)
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 lg:flex-row">
      <aside className="w-full shrink-0 space-y-3 lg:w-56">
        <div>
          <h2 className="text-lg font-semibold text-cream">Recommend</h2>
          <p className="mt-1 text-xs text-muted">
            Priority call lists by group + base. Confirm fuzzy matches before
            they link to network fleet.
          </p>
        </div>

        <div className="space-y-1">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted">
              Group
            </p>
            <button
              type="button"
              className="text-[11px] text-gold hover:text-gold-lt"
              onClick={() => {
                setAddingGroup((v) => !v)
                setAddingBase(false)
              }}
            >
              {addingGroup ? 'Cancel' : '+ Add'}
            </button>
          </div>
          {addingGroup && (
            <div className="space-y-2 rounded-md border border-border bg-surface p-2">
              <input
                className="w-full rounded-md border border-border bg-ink px-2 py-1.5 text-sm text-cream outline-none focus:border-gold"
                value={newGroup}
                onChange={(e) => setNewGroup(e.target.value)}
                placeholder="e.g. Breeze, Heavy Cargo…"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') createGroup()
                }}
              />
              <label className="flex items-center gap-2 text-[11px] text-muted">
                <input
                  type="checkbox"
                  checked={fleetOnlyGroup}
                  onChange={(e) => setFleetOnlyGroup(e.target.checked)}
                />
                No airport (fleet group)
              </label>
              {!fleetOnlyGroup && (
                <AirportSelect
                  label="First base"
                  value={newGroupBase}
                  onChange={(icao) => setNewGroupBase(icao)}
                />
              )}
              <button
                type="button"
                className="w-full rounded-md bg-gold px-2 py-1.5 text-xs font-medium text-ink disabled:opacity-40"
                disabled={
                  !newGroup.trim() ||
                  (!fleetOnlyGroup && newGroupBase.trim().length < 3)
                }
                onClick={createGroup}
              >
                Create group
              </button>
            </div>
          )}
          {groups.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => {
                setGroup(c)
                setListId(null)
              }}
              className={[
                'block w-full rounded-md px-2.5 py-1.5 text-left text-sm',
                group === c
                  ? 'bg-gold/15 text-gold'
                  : 'text-muted hover:bg-surface-2 hover:text-cream',
              ].join(' ')}
            >
              {c}
            </button>
          ))}
        </div>

        <div className="space-y-1">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted">
              Base
            </p>
            <button
              type="button"
              className="text-[11px] text-gold hover:text-gold-lt disabled:opacity-40"
              disabled={!group}
              onClick={() => {
                setAddingBase((v) => !v)
                setAddingGroup(false)
              }}
            >
              {addingBase ? 'Cancel' : '+ Add'}
            </button>
          </div>
          {addingBase && group && (
            <div className="space-y-2 rounded-md border border-border bg-surface p-2">
              <AirportSelect
                label="Airport"
                value={newBaseIcao}
                onChange={(icao) => setNewBaseIcao(icao)}
              />
              <button
                type="button"
                className="w-full rounded-md bg-gold px-2 py-1.5 text-xs font-medium text-ink disabled:opacity-40"
                disabled={newBaseIcao.trim().length < 3}
                onClick={createBase}
              >
                Add base to {group}
              </button>
            </div>
          )}
          {groupLists.map((l) => {
            const label = l.base_icao
              ? `${l.base_icao}${l.base_label ? ` · ${l.base_label}` : ''}`
              : l.base_label
            return (
              <button
                key={l.id}
                type="button"
                onClick={() => setListId(l.id)}
                className={[
                  'block w-full rounded-md px-2.5 py-1.5 text-left text-sm',
                  listId === l.id
                    ? 'bg-gold/15 font-mono text-gold'
                    : 'font-mono text-muted hover:bg-surface-2 hover:text-cream',
                ].join(' ')}
              >
                <span className="block truncate">{label}</span>
                <span className="text-[10px] text-muted">
                  {l.entries.length} ops
                </span>
              </button>
            )
          })}
        </div>
      </aside>

      <main className="min-w-0 flex-1 space-y-3">
        {!selected ? (
          <p className="text-sm text-muted">Select a group and base.</p>
        ) : (
          <>
            <header className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <h3 className="text-lg font-semibold text-cream">
                  Priority ·{' '}
                  <span className="font-mono text-gold">
                    {selected.base_icao ?? selected.base_label}
                  </span>
                </h3>
                <p className="text-xs text-muted">
                  {selected.client_name}
                  {selected.base_label && selected.base_icao
                    ? ` · ${selected.base_label}`
                    : ''}
                  {' · '}
                  ranked first
                </p>
              </div>
            </header>

            <div className="flex flex-col gap-2 rounded-md border border-dashed border-border px-3 py-2 sm:flex-row sm:items-end">
              <OperatorSelect
                label="Add operator"
                value={addName}
                onChange={(name, hit) => {
                  setAddName(name)
                  setAddOpId(hit?.operator_id ?? null)
                }}
                className="min-w-0 flex-1"
              />
              <button
                type="button"
                className="rounded-md bg-gold px-3 py-2 text-sm font-medium text-ink hover:bg-gold-lt"
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
                Add
              </button>
            </div>

            <ol className="divide-y divide-border rounded-lg border border-border bg-surface">
              {selected.entries.map((e) => (
                <PriorityCard key={e.id} list={selected} entry={e} />
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
  const [editing, setEditing] = useState(false)
  const [draftName, setDraftName] = useState(entry.company_name)
  const [draftEmail, setDraftEmail] = useState(entry.general_email)
  const [draftBase, setDraftBase] = useState(entry.operator_base_icao)
  const [draftCallOut, setDraftCallOut] = useState(entry.call_out_time)
  const [draftFleet, setDraftFleet] = useState(entry.fleet_types_csv)
  const [draftNotes, setDraftNotes] = useState(entry.notes)
  const [draftLines, setDraftLines] = useState<PriorityCallLine[]>(() =>
    effectiveCallLines(entry),
  )

  const fleet = fleetForOperator(entry.operator_id)
  const dist = distanceNm(list.base_icao, entry.operator_base_icao)
  const place = entry.operator_base_icao
    ? lookupAirport(entry.operator_base_icao)
    : null

  const email = entry.general_email.includes('@') ? entry.general_email : ''
  const callLines = effectiveCallLines(entry)

  const pills: string[] = []
  if (entry.caps.hrs24) pills.push('24/7')
  if (entry.caps.pax) pills.push('Pax')
  if (entry.caps.cargo) pills.push('Cargo')
  if (entry.caps.hazmat) pills.push('Haz')
  if (entry.caps.medevac) pills.push('Med')

  const aircraftLine =
    fleet.length > 0
      ? summarizeFleet(fleet)
      : entry.fleet_types_csv || entry.aircraft_locations_csv || ''

  function openEdit() {
    setDraftName(entry.company_name)
    setDraftEmail(entry.general_email)
    setDraftBase(entry.operator_base_icao)
    setDraftCallOut(entry.call_out_time)
    setDraftFleet(entry.fleet_types_csv)
    setDraftNotes(entry.notes)
    setDraftLines(effectiveCallLines(entry))
    setEditing(true)
  }

  function saveEdit() {
    updatePriorityEntry(list.id, entry.id, {
      company_name: draftName,
      general_email: draftEmail,
      operator_base_icao: draftBase,
      call_out_time: draftCallOut,
      fleet_types_csv: draftFleet,
      notes: draftNotes,
      call_lines: draftLines,
      // Clear legacy phone fields so call_lines is the source of truth after edit
      phone_24hr: '',
      company_phone: '',
      contact_phone: '',
    })
    setEditing(false)
  }

  const field =
    'w-full rounded border border-border bg-ink px-2 py-1 text-sm text-cream outline-none focus:border-gold'
  const fieldMono = `${field} font-mono text-xs`

  return (
    <li className="px-3 py-2.5">
      <div className="flex items-start gap-2">
        <span className="mt-0.5 w-6 shrink-0 font-mono text-xs text-gold">
          #{entry.rank}
        </span>

        <div className="min-w-0 flex-1 space-y-1">
          {!editing ? (
            <>
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <h4 className="text-sm font-semibold text-cream">
                  {entry.company_name}
                </h4>
                {pills.map((p) => (
                  <span
                    key={p}
                    className="text-[10px] uppercase tracking-wider text-muted"
                  >
                    {p}
                  </span>
                ))}
                <span className="font-mono text-[11px] text-muted">
                  {dist ||
                    (place
                      ? formatAirportShort(place)
                      : entry.operator_base_icao || '')}
                  {entry.call_out_time ? ` · ${entry.call_out_time}` : ''}
                </span>
              </div>

              {aircraftLine ? (
                <p className="text-base font-medium leading-snug text-cream">
                  {aircraftLine}
                </p>
              ) : (
                <p className="text-xs text-muted">Fleet unknown</p>
              )}

              {callLines.length > 0 && (
                <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono text-xs">
                  {callLines.map((c, i) => (
                    <span
                      key={`${c.label}-${c.phone}`}
                      className="inline-flex items-center gap-1"
                    >
                      {i > 0 && <span className="text-muted">·</span>}
                      <a
                        href={telHref(c.phone)}
                        className="text-gold hover:underline"
                      >
                        {c.phone}
                      </a>
                      <span className="text-[10px] uppercase tracking-wider text-muted">
                        {shortPhoneLabel(c.label)}
                      </span>
                    </span>
                  ))}
                </p>
              )}

              {(email || entry.notes) && (
                <p className="truncate text-[11px] text-muted">
                  {email ? (
                    <a
                      href={`mailto:${email}`}
                      className="text-gold/80 hover:underline"
                    >
                      {email}
                    </a>
                  ) : null}
                  {email && entry.notes ? ' · ' : null}
                  {entry.notes ? (
                    <span className="italic">{entry.notes}</span>
                  ) : null}
                </p>
              )}

              {!entry.notes && (
                <button
                  type="button"
                  className="text-[11px] text-gold/80 hover:text-gold"
                  onClick={openEdit}
                >
                  + Add note
                </button>
              )}
            </>
          ) : (
            <div className="space-y-2 rounded-md border border-gold/30 bg-ink/40 p-2.5">
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="block text-[10px] uppercase tracking-wider text-muted">
                  Company
                  <input
                    className={`${field} mt-0.5`}
                    value={draftName}
                    onChange={(e) => setDraftName(e.target.value)}
                  />
                </label>
                <label className="block text-[10px] uppercase tracking-wider text-muted">
                  Email
                  <input
                    className={`${fieldMono} mt-0.5`}
                    value={draftEmail}
                    onChange={(e) => setDraftEmail(e.target.value)}
                    placeholder="ops@…"
                  />
                </label>
                <label className="block text-[10px] uppercase tracking-wider text-muted">
                  Operator base
                  <input
                    className={`${fieldMono} mt-0.5`}
                    value={draftBase}
                    onChange={(e) => setDraftBase(e.target.value.toUpperCase())}
                    placeholder="KADS"
                  />
                </label>
                <label className="block text-[10px] uppercase tracking-wider text-muted">
                  Call-out
                  <input
                    className={`${field} mt-0.5`}
                    value={draftCallOut}
                    onChange={(e) => setDraftCallOut(e.target.value)}
                    placeholder="2Hrs"
                  />
                </label>
              </div>

              <label className="block text-[10px] uppercase tracking-wider text-muted">
                Aircraft types
                <input
                  className={`${field} mt-0.5`}
                  value={draftFleet}
                  onChange={(e) => setDraftFleet(e.target.value)}
                  placeholder="CJ3 · Citation XL"
                  disabled={fleet.length > 0}
                />
                {fleet.length > 0 && (
                  <span className="mt-0.5 block normal-case tracking-normal text-[11px] text-muted">
                    Linked network fleet overrides this field.
                  </span>
                )}
              </label>

              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] uppercase tracking-wider text-muted">
                    Phones
                  </p>
                  <button
                    type="button"
                    className="text-[11px] text-gold"
                    onClick={() =>
                      setDraftLines((rows) => [
                        ...rows,
                        { label: 'Phone', phone: '' },
                      ])
                    }
                  >
                    + Line
                  </button>
                </div>
                {draftLines.map((line, idx) => (
                  <div key={idx} className="flex gap-1.5">
                    <input
                      className={`${field} w-24 shrink-0`}
                      value={line.label}
                      onChange={(e) => {
                        const v = e.target.value
                        setDraftLines((rows) =>
                          rows.map((r, i) =>
                            i === idx ? { ...r, label: v } : r,
                          ),
                        )
                      }}
                      placeholder="Label"
                    />
                    <input
                      className={`${fieldMono} min-w-0 flex-1`}
                      value={line.phone}
                      onChange={(e) => {
                        const v = e.target.value
                        setDraftLines((rows) =>
                          rows.map((r, i) =>
                            i === idx ? { ...r, phone: v } : r,
                          ),
                        )
                      }}
                      placeholder="(555) 555-5555"
                    />
                    <button
                      type="button"
                      className="shrink-0 px-1 text-xs text-muted hover:text-late"
                      aria-label="Remove phone line"
                      onClick={() =>
                        setDraftLines((rows) =>
                          rows.filter((_, i) => i !== idx),
                        )
                      }
                    >
                      ✕
                    </button>
                  </div>
                ))}
                {!draftLines.length && (
                  <p className="text-[11px] text-muted">No phone lines yet.</p>
                )}
              </div>

              <label className="block text-[10px] uppercase tracking-wider text-muted">
                Notes
                <textarea
                  className={`${field} mt-0.5 min-h-[64px]`}
                  value={draftNotes}
                  onChange={(e) => setDraftNotes(e.target.value)}
                  placeholder="Availability, who to ask for, pricing cues…"
                />
              </label>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="rounded bg-gold px-3 py-1.5 text-xs font-medium text-ink"
                  onClick={saveEdit}
                >
                  Save
                </button>
                <button
                  type="button"
                  className="rounded border border-border px-3 py-1.5 text-xs text-muted hover:text-cream"
                  onClick={() => setEditing(false)}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {(entry.match_status === 'suggested' ||
            entry.match_status === 'unmatched') &&
            !editing && (
              <div className="flex flex-wrap items-center gap-2 text-[11px]">
                {entry.match_status === 'suggested' ? (
                  <>
                    <span className="text-gold">
                      Match? {entry.match_candidate_name}
                      {entry.match_score != null
                        ? ` (${entry.match_score})`
                        : ''}
                    </span>
                    <button
                      type="button"
                      className="rounded bg-gold px-2 py-0.5 font-medium text-ink"
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
                      Confirm
                    </button>
                    <button
                      type="button"
                      className="text-muted hover:text-cream"
                      onClick={() => dismissPriorityMatch(list.id, entry.id)}
                    >
                      Skip
                    </button>
                  </>
                ) : (
                  <span className="text-muted">No network match</span>
                )}
              </div>
            )}
        </div>

        <div className="flex shrink-0 flex-col gap-0.5">
          <button
            type="button"
            aria-label={editing ? 'Close editor' : 'Edit'}
            className="rounded px-1.5 py-0.5 text-xs text-muted hover:text-gold"
            onClick={() => (editing ? setEditing(false) : openEdit())}
          >
            {editing ? '▴' : '✎'}
          </button>
          <button
            type="button"
            aria-label="Move up"
            className="rounded px-1.5 py-0.5 text-xs text-muted enabled:hover:text-cream disabled:opacity-30"
            disabled={entry.rank <= 1}
            onClick={() => movePriorityEntry(list.id, entry.id, -1)}
          >
            ↑
          </button>
          <button
            type="button"
            aria-label="Move down"
            className="rounded px-1.5 py-0.5 text-xs text-muted enabled:hover:text-cream disabled:opacity-30"
            disabled={entry.rank >= list.entries.length}
            onClick={() => movePriorityEntry(list.id, entry.id, 1)}
          >
            ↓
          </button>
          <button
            type="button"
            aria-label="Remove"
            className="rounded px-1.5 py-0.5 text-xs text-muted hover:text-late"
            onClick={() => removePriorityEntry(list.id, entry.id)}
          >
            ✕
          </button>
        </div>
      </div>
    </li>
  )
}

function effectiveCallLines(entry: BasePriorityEntry): PriorityCallLine[] {
  if (entry.call_lines.length > 0) return entry.call_lines.map((c) => ({ ...c }))
  const fallback: PriorityCallLine[] = []
  if (entry.phone_24hr) fallback.push({ label: '24/7', phone: entry.phone_24hr })
  if (entry.company_phone) {
    fallback.push({ label: 'Main', phone: entry.company_phone })
  }
  if (entry.contact_phone) {
    fallback.push({ label: 'Contact', phone: entry.contact_phone })
  }
  return fallback
}

function summarizeFleet(aircraft: AircraftRow[]): string {
  const byType = new Map<string, number>()
  for (const a of aircraft) {
    const t = (a.type_name || 'Unknown').trim()
    byType.set(t, (byType.get(t) ?? 0) + 1)
  }
  return [...byType.entries()]
    .map(([t, n]) => (n > 1 ? `${t} (${n})` : t))
    .join(' · ')
}
