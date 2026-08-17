/**
 * Spreadsheet-style Network backend view — one row per tail.
 * Every column is editable inline; new operators still via Admin wizard.
 */

import { useEffect, useMemo, useState, useSyncExternalStore, type KeyboardEvent } from 'react'
import type { NetworkSheetRow } from '@/domain/networkSheet'
import {
  ensureNetworkSheetLoaded,
  listNetworkSheetRows,
  networkSheetReady,
  subscribeNetworkSheet,
  updateSheetAircraftField,
  updateSheetOperatorField,
} from '@/lib/networkSheetStore'

const cellInput =
  'w-full min-w-[4.5rem] rounded border border-transparent bg-transparent px-1.5 py-1 text-xs text-cream outline-none hover:border-border focus:border-gold focus:bg-ink avionic'
const cellText =
  'w-full min-w-[7rem] rounded border border-transparent bg-transparent px-1.5 py-1 text-xs text-cream outline-none hover:border-border focus:border-gold focus:bg-ink'

function parseNum(raw: string): number | null {
  const t = raw.trim()
  if (!t) return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

/** Enter commits like a spreadsheet cell. */
function onEnterBlur(e: KeyboardEvent<HTMLInputElement>) {
  if (e.key === 'Enter') {
    e.preventDefault()
    e.currentTarget.blur()
  }
}

function DoorCell({
  row,
  field,
}: {
  row: NetworkSheetRow
  field: 'door_w_in' | 'door_h_in'
}) {
  const v = row[field]
  return (
    <input
      className={[
        cellInput,
        row.door_from_type_spec && v != null ? 'text-gold' : '',
      ].join(' ')}
      title={
        row.door_from_type_spec
          ? 'From type library — edit to set per-tail'
          : undefined
      }
      defaultValue={v ?? ''}
      key={`${row.aircraft_id}-${field}-${v}`}
      onKeyDown={onEnterBlur}
      onBlur={(e) =>
        updateSheetAircraftField(row.aircraft_id, field, parseNum(e.target.value))
      }
    />
  )
}

export function NetworkSheetView({ filter }: { filter: string }) {
  const ready = useSyncExternalStore(
    subscribeNetworkSheet,
    networkSheetReady,
    () => false,
  )
  const rows = useSyncExternalStore(
    subscribeNetworkSheet,
    listNetworkSheetRows,
    listNetworkSheetRows,
  )
  const [loading, setLoading] = useState(!ready)

  useEffect(() => {
    let cancelled = false
    void ensureNetworkSheetLoaded().then(() => {
      if (!cancelled) setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const filtered = useMemo(() => {
    const needle = filter.trim().toLowerCase()
    if (!needle) return rows
    return rows.filter(
      (r) =>
        r.operator_name.toLowerCase().includes(needle) ||
        r.tail.toLowerCase().includes(needle) ||
        (r.type_name ?? '').toLowerCase().includes(needle) ||
        (r.category ?? '').toLowerCase().includes(needle) ||
        (r.contact_cell ?? '').includes(needle) ||
        (r.base_icao ?? '').toLowerCase().includes(needle),
    )
  }, [rows, filter])

  if (loading && !rows.length) {
    return (
      <p className="rounded-lg border border-border bg-surface px-4 py-8 text-center text-sm text-muted">
        Loading fleet sheet…
      </p>
    )
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted">
        {filtered.length} aircraft · click any cell to edit · gold door numbers
        are type-library defaults (edit to lock per-tail) · operator / contact
        edits apply to every tail for that operator · new operators still via
        Admin wizard
      </p>
      <p className="rounded-md border border-gold/30 bg-gold/10 px-3 py-2 text-xs text-gold md:hidden">
        Compact list on phone — open on a wider screen to edit the full sheet.
      </p>
      <ul className="space-y-2 md:hidden">
        {filtered.map((r) => (
          <li
            key={r.aircraft_id}
            className="rounded-lg border border-border bg-surface px-3 py-3"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="avionic text-sm font-semibold text-gold">
                {r.tail}
              </span>
              <span
                className={[
                  'text-[10px] uppercase tracking-wider',
                  r.active ? 'text-onplan' : 'text-muted',
                ].join(' ')}
              >
                {r.active ? 'Active' : 'Inactive'}
              </span>
            </div>
            <div className="mt-1 text-sm text-cream">{r.operator_name}</div>
            <div className="mt-0.5 text-xs text-muted">
              {[r.type_name, r.category, r.base_icao]
                .filter(Boolean)
                .join(' · ') || '—'}
            </div>
            {(r.contact_name || r.contact_cell || r.contact_email) && (
              <div className="mt-2 text-xs text-muted">
                {[r.contact_name, r.contact_cell, r.contact_email]
                  .filter(Boolean)
                  .join(' · ')}
              </div>
            )}
          </li>
        ))}
        {filtered.length === 0 && (
          <li className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-sm text-muted">
            No aircraft match this filter.
          </li>
        )}
      </ul>
      <div className="board-rail hidden max-h-[70vh] overflow-auto rounded-lg border border-border md:block">
        <table className="w-full min-w-[1600px] border-collapse text-left text-xs">
          <thead className="sticky top-0 z-10 bg-surface-2 text-[10px] uppercase tracking-wider text-muted">
            <tr>
              <th className="sticky left-0 z-20 bg-surface-2 px-2 py-2">Operator</th>
              <th className="px-2 py-2">Tail</th>
              <th className="px-2 py-2">Type</th>
              <th className="px-2 py-2">Category</th>
              <th className="px-2 py-2">Base</th>
              <th className="px-2 py-2">Cargo/Pax</th>
              <th className="px-2 py-2 text-right">Door W″</th>
              <th className="px-2 py-2 text-right">Door H″</th>
              <th className="px-2 py-2">Door type</th>
              <th className="px-2 py-2 text-right">Cabin L′</th>
              <th className="px-2 py-2 text-right">Cabin W′</th>
              <th className="px-2 py-2 text-right">Cabin H′</th>
              <th className="px-2 py-2 text-right">Payload</th>
              <th className="px-2 py-2 text-right">MTOW</th>
              <th className="px-2 py-2 text-right">Cruise</th>
              <th className="px-2 py-2">Contact</th>
              <th className="px-2 py-2">Cell</th>
              <th className="px-2 py-2">Email</th>
              <th className="px-2 py-2">Quote links</th>
              <th className="px-2 py-2">Ops email</th>
              <th className="px-2 py-2">Active</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr
                key={r.aircraft_id}
                className="border-t border-border/40 hover:bg-gold/5"
              >
                <td className="sticky left-0 z-[1] bg-ink px-1 py-1">
                  <input
                    className={`${cellText} min-w-[9rem] font-medium`}
                    defaultValue={r.operator_name}
                    key={`${r.operator_id}-name-${r.operator_name}`}
                    title="Renames this operator on every tail"
                    onKeyDown={onEnterBlur}
                    onBlur={(e) => {
                      const next = e.target.value.trim()
                      if (!next || next === r.operator_name) return
                      updateSheetOperatorField(r.operator_id, 'name', next)
                    }}
                  />
                </td>
                <td className="px-1 py-1">
                  <input
                    className={`${cellInput} text-gold`}
                    defaultValue={r.tail}
                    key={`${r.aircraft_id}-tail-${r.tail}`}
                    onKeyDown={onEnterBlur}
                    onBlur={(e) => {
                      const next = e.target.value.trim().toUpperCase()
                      if (!next || next === r.tail) return
                      updateSheetAircraftField(r.aircraft_id, 'tail', next)
                    }}
                  />
                </td>
                <td className="px-1 py-1">
                  <input
                    className={cellText}
                    defaultValue={r.type_name ?? ''}
                    key={`${r.aircraft_id}-type-${r.type_name}`}
                    title="Changing type reloads library door defaults until you lock them"
                    onKeyDown={onEnterBlur}
                    onBlur={(e) =>
                      updateSheetAircraftField(
                        r.aircraft_id,
                        'type_name',
                        e.target.value.trim() || null,
                      )
                    }
                  />
                </td>
                <td className="px-1 py-1">
                  <input
                    className={cellText}
                    defaultValue={r.category ?? ''}
                    key={`${r.aircraft_id}-cat-${r.category}`}
                    onKeyDown={onEnterBlur}
                    onBlur={(e) =>
                      updateSheetAircraftField(
                        r.aircraft_id,
                        'category',
                        e.target.value.trim() || null,
                      )
                    }
                  />
                </td>
                <td className="px-1 py-1">
                  <input
                    className={`${cellInput} uppercase`}
                    defaultValue={r.base_icao ?? ''}
                    key={`${r.aircraft_id}-base-${r.base_icao}`}
                    onKeyDown={onEnterBlur}
                    onBlur={(e) =>
                      updateSheetAircraftField(
                        r.aircraft_id,
                        'base_icao',
                        e.target.value.trim().toUpperCase() || null,
                      )
                    }
                  />
                </td>
                <td className="px-1 py-1">
                  <input
                    className={cellText}
                    defaultValue={r.cargo_pax ?? ''}
                    key={`${r.aircraft_id}-cp-${r.cargo_pax}`}
                    onKeyDown={onEnterBlur}
                    onBlur={(e) =>
                      updateSheetAircraftField(
                        r.aircraft_id,
                        'cargo_pax',
                        e.target.value.trim() || null,
                      )
                    }
                  />
                </td>
                <td className="px-1 py-1 text-right">
                  <DoorCell row={r} field="door_w_in" />
                </td>
                <td className="px-1 py-1 text-right">
                  <DoorCell row={r} field="door_h_in" />
                </td>
                <td className="px-1 py-1">
                  <input
                    className={cellText}
                    defaultValue={r.door_type ?? ''}
                    key={`${r.aircraft_id}-dt-${r.door_type}`}
                    onKeyDown={onEnterBlur}
                    onBlur={(e) =>
                      updateSheetAircraftField(
                        r.aircraft_id,
                        'door_type',
                        e.target.value.trim() || null,
                      )
                    }
                  />
                </td>
                <td className="px-1 py-1 text-right">
                  <input
                    className={cellInput}
                    defaultValue={r.cabin_l_ft ?? ''}
                    key={`${r.aircraft_id}-cl-${r.cabin_l_ft}`}
                    onKeyDown={onEnterBlur}
                    onBlur={(e) =>
                      updateSheetAircraftField(
                        r.aircraft_id,
                        'cabin_l_ft',
                        parseNum(e.target.value),
                      )
                    }
                  />
                </td>
                <td className="px-1 py-1 text-right">
                  <input
                    className={cellInput}
                    defaultValue={r.cabin_w_ft ?? ''}
                    key={`${r.aircraft_id}-cw-${r.cabin_w_ft}`}
                    onKeyDown={onEnterBlur}
                    onBlur={(e) =>
                      updateSheetAircraftField(
                        r.aircraft_id,
                        'cabin_w_ft',
                        parseNum(e.target.value),
                      )
                    }
                  />
                </td>
                <td className="px-1 py-1 text-right">
                  <input
                    className={cellInput}
                    defaultValue={r.cabin_h_ft ?? ''}
                    key={`${r.aircraft_id}-ch-${r.cabin_h_ft}`}
                    onKeyDown={onEnterBlur}
                    onBlur={(e) =>
                      updateSheetAircraftField(
                        r.aircraft_id,
                        'cabin_h_ft',
                        parseNum(e.target.value),
                      )
                    }
                  />
                </td>
                <td className="px-1 py-1 text-right">
                  <input
                    className={cellInput}
                    defaultValue={r.max_payload_lbs ?? ''}
                    key={`${r.aircraft_id}-pl-${r.max_payload_lbs}`}
                    onKeyDown={onEnterBlur}
                    onBlur={(e) =>
                      updateSheetAircraftField(
                        r.aircraft_id,
                        'max_payload_lbs',
                        parseNum(e.target.value),
                      )
                    }
                  />
                </td>
                <td className="px-1 py-1 text-right">
                  <input
                    className={cellInput}
                    defaultValue={r.mtow_lbs ?? ''}
                    key={`${r.aircraft_id}-mt-${r.mtow_lbs}`}
                    onKeyDown={onEnterBlur}
                    onBlur={(e) =>
                      updateSheetAircraftField(
                        r.aircraft_id,
                        'mtow_lbs',
                        parseNum(e.target.value),
                      )
                    }
                  />
                </td>
                <td className="px-1 py-1 text-right">
                  <input
                    className={cellInput}
                    defaultValue={r.cruise_kts ?? ''}
                    key={`${r.aircraft_id}-cr-${r.cruise_kts}`}
                    onKeyDown={onEnterBlur}
                    onBlur={(e) =>
                      updateSheetAircraftField(
                        r.aircraft_id,
                        'cruise_kts',
                        parseNum(e.target.value),
                      )
                    }
                  />
                </td>
                <td className="px-1 py-1">
                  <input
                    className={cellText}
                    defaultValue={r.contact_name ?? ''}
                    key={`${r.operator_id}-cn-${r.contact_name}`}
                    onKeyDown={onEnterBlur}
                    onBlur={(e) =>
                      updateSheetOperatorField(
                        r.operator_id,
                        'contact_name',
                        e.target.value.trim() || null,
                      )
                    }
                  />
                </td>
                <td className="px-1 py-1">
                  <input
                    className={cellInput}
                    defaultValue={r.contact_cell ?? ''}
                    key={`${r.operator_id}-cc-${r.contact_cell}`}
                    onKeyDown={onEnterBlur}
                    onBlur={(e) =>
                      updateSheetOperatorField(
                        r.operator_id,
                        'contact_cell',
                        e.target.value.trim() || null,
                      )
                    }
                    placeholder="cell"
                  />
                </td>
                <td className="px-1 py-1">
                  <input
                    className={cellText}
                    defaultValue={r.contact_email ?? ''}
                    key={`${r.operator_id}-ce-${r.contact_email}`}
                    onKeyDown={onEnterBlur}
                    onBlur={(e) =>
                      updateSheetOperatorField(
                        r.operator_id,
                        'contact_email',
                        e.target.value.trim() || null,
                      )
                    }
                    placeholder="email"
                  />
                </td>
                <td className="px-1 py-1">
                  <select
                    className={cellText}
                    value={r.quote_link_channel ?? 'both'}
                    title="Where trip-offer / quote links are sent"
                    onChange={(e) =>
                      updateSheetOperatorField(
                        r.operator_id,
                        'quote_link_channel',
                        e.target.value,
                      )
                    }
                  >
                    <option value="both">Email + SMS</option>
                    <option value="email">Email only</option>
                    <option value="sms">SMS only</option>
                  </select>
                </td>
                <td className="px-1 py-1">
                  <input
                    className={cellText}
                    defaultValue={r.ops_email ?? ''}
                    key={`${r.operator_id}-oe-${r.ops_email}`}
                    onKeyDown={onEnterBlur}
                    onBlur={(e) =>
                      updateSheetOperatorField(
                        r.operator_id,
                        'ops_email',
                        e.target.value.trim() || null,
                      )
                    }
                  />
                </td>
                <td className="px-2 py-1 text-center">
                  <input
                    type="checkbox"
                    checked={r.active}
                    onChange={(e) =>
                      updateSheetAircraftField(
                        r.aircraft_id,
                        'active',
                        e.target.checked,
                      )
                    }
                    aria-label={`Active ${r.tail}`}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
