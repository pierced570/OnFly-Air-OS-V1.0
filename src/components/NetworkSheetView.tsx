/**
 * Spreadsheet-style Network backend view — one row per tail.
 * Door dims, contacts, bases editable; new operators still via Admin wizard.
 */

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
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
        {filtered.length} aircraft · gold door numbers are type-library defaults
        (edit to lock per-tail) · contact edits apply to every tail for that
        operator · new operators still via Admin wizard
      </p>
      <div className="board-rail max-h-[70vh] overflow-auto rounded-lg border border-border">
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
                <td className="sticky left-0 z-[1] bg-ink px-2 py-1 font-medium text-cream">
                  {r.operator_name}
                </td>
                <td className="px-2 py-1">
                  <span className="avionic text-gold">{r.tail}</span>
                </td>
                <td className="px-2 py-1 text-muted">{r.type_name ?? '—'}</td>
                <td className="px-2 py-1 text-muted">{r.category ?? '—'}</td>
                <td className="px-1 py-1">
                  <input
                    className={`${cellInput} uppercase`}
                    defaultValue={r.base_icao ?? ''}
                    key={`${r.aircraft_id}-base-${r.base_icao}`}
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
                  <input
                    className={cellText}
                    defaultValue={r.ops_email ?? ''}
                    key={`${r.operator_id}-oe-${r.ops_email}`}
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
