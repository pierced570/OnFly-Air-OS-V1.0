/**
 * D085 review table — match Network tails; require accept on new / conflicts.
 */

import { useEffect, useState } from 'react'
import type { D085ReviewRow } from '@/domain/d085Match'
import { normalizeTail } from '@/domain/d085Parse'

type EditableRow = D085ReviewRow & { accepted: boolean; rowKey: string }

type Props = {
  rows: D085ReviewRow[]
  source?: string
  note?: string
  busy?: boolean
  /** Hide accept button when parent handles save elsewhere (Admin wizard). */
  hideAcceptButton?: boolean
  acceptLabel?: string
  onChange?: (accepted: EditableRow[]) => void
  onAccept?: (accepted: EditableRow[]) => void
  onCancel?: () => void
}

function matchBadge(kind: D085ReviewRow['match_kind']): {
  label: string
  cls: string
} {
  if (kind === 'linked') return { label: 'Matched', cls: 'text-onplan' }
  if (kind === 'conflict') return { label: 'Conflict', cls: 'text-late' }
  return { label: 'New — confirm', cls: 'text-gold' }
}

export function D085ReviewPanel({
  rows,
  source,
  note,
  busy,
  hideAcceptButton,
  acceptLabel = 'Accept selected',
  onChange,
  onAccept,
  onCancel,
}: Props) {
  const [edits, setEdits] = useState<EditableRow[]>(() =>
    rows.map((r) => ({ ...r, accepted: r.default_accept, rowKey: r.tail })),
  )

  useEffect(() => {
    setEdits(
      rows.map((r) => ({ ...r, accepted: r.default_accept, rowKey: r.tail })),
    )
  }, [rows])

  useEffect(() => {
    onChange?.(edits)
  }, [edits, onChange])

  function patch(rowKey: string, next: Partial<EditableRow>) {
    setEdits((prev) =>
      prev.map((r) => (r.rowKey === rowKey ? { ...r, ...next } : r)),
    )
  }

  const selected = edits.filter((r) => r.accepted)
  const needsConfirm = edits.filter(
    (r) =>
      r.accepted && (r.match_kind === 'new' || r.match_kind === 'conflict'),
  )

  return (
    <div className="space-y-3 rounded-lg border border-gold/40 bg-gold/5 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="text-xs font-medium uppercase tracking-wider text-gold">
            D085 review
          </div>
          <p className="mt-0.5 text-xs text-muted">
            Matched tails link to Network. New or conflicting tails need your
            accept before we add them.
            {source ? ` · ${source}` : ''}
          </p>
          {note ? <p className="mt-1 text-xs text-muted">{note}</p> : null}
        </div>
        {onCancel ? (
          <button
            type="button"
            className="text-xs text-muted hover:text-cream"
            onClick={onCancel}
          >
            Cancel
          </button>
        ) : null}
      </div>

      <ul className="space-y-2">
        {edits.map((r) => {
          const badge = matchBadge(r.match_kind)
          return (
            <li
              key={r.rowKey}
              className={[
                'space-y-2 rounded-md border px-3 py-2.5',
                r.accepted
                  ? 'border-gold/50 bg-ink/60'
                  : 'border-border bg-ink/40',
              ].join(' ')}
            >
              <div className="flex flex-wrap items-start gap-3">
                <label className="flex items-start gap-2 pt-1">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={r.accepted}
                    onChange={(e) =>
                      patch(r.rowKey, { accepted: e.target.checked })
                    }
                    aria-label={`Accept ${r.tail}`}
                  />
                </label>
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span
                      className={`text-[11px] uppercase tracking-wider ${badge.cls}`}
                    >
                      {badge.label}
                    </span>
                    <span className="text-xs text-muted">{r.match_label}</span>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <label className="block text-xs text-muted">
                      Tail
                      <input
                        className="mt-1 w-full rounded border border-border bg-ink px-2 py-1.5 font-mono text-sm text-cream"
                        value={r.tail}
                        onChange={(e) =>
                          patch(r.rowKey, {
                            tail: normalizeTail(e.target.value) || r.tail,
                          })
                        }
                      />
                    </label>
                    <label className="block text-xs text-muted">
                      Type
                      <input
                        className="mt-1 w-full rounded border border-border bg-ink px-2 py-1.5 text-sm text-cream"
                        value={r.type_name}
                        onChange={(e) =>
                          patch(r.rowKey, { type_name: e.target.value })
                        }
                      />
                    </label>
                  </div>
                  {r.match_kind === 'new' && r.accepted ? (
                    <p className="text-[11px] text-gold">
                      Confirm tail and type look right — accepting adds this
                      aircraft to the operator.
                    </p>
                  ) : null}
                  {r.match_kind === 'conflict' && r.accepted ? (
                    <p className="text-[11px] text-late">
                      This N-number is already on another operator. Accept only
                      if you mean to list it here too.
                    </p>
                  ) : null}
                  {r.conflict && r.match_kind === 'linked' ? (
                    <p className="text-[11px] text-muted">{r.conflict}</p>
                  ) : null}
                </div>
              </div>
            </li>
          )
        })}
      </ul>

      {!hideAcceptButton ? (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={busy || selected.length === 0}
            className="rounded-md bg-gold px-3 py-2 text-sm font-semibold text-ink hover:bg-gold-lt disabled:opacity-40"
            onClick={() => onAccept?.(selected)}
          >
            {busy
              ? 'Saving…'
              : `${acceptLabel} (${selected.length}${
                  needsConfirm.length
                    ? ` · ${needsConfirm.length} confirm`
                    : ''
                })`}
          </button>
          <span className="text-xs text-muted">
            {edits.filter((r) => r.match_kind === 'linked').length} matched ·{' '}
            {edits.filter((r) => r.match_kind === 'new').length} new ·{' '}
            {edits.filter((r) => r.match_kind === 'conflict').length} conflict
          </span>
        </div>
      ) : null}
    </div>
  )
}
