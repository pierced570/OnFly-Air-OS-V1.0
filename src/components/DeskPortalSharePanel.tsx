/**
 * Desk outreach — copy different portal hyperlinks for a company / trip.
 * Company portal, one-click login, book, quote, history, trip, guest track.
 */

import { useMemo, useState } from 'react'
import { deskPortalShareRows } from '@/lib/portalShareLinks'
import { getClient } from '@/lib/clientStore'

export function DeskPortalSharePanel(props: {
  clientId: string
  tripId?: string | null
  /** Mint guest track token when tripId present (default true). */
  includeTrackToken?: boolean
  className?: string
}) {
  const client = getClient(props.clientId)
  const [copied, setCopied] = useState<string | null>(null)
  const rows = useMemo(
    () =>
      deskPortalShareRows({
        clientId: props.clientId,
        tripId: props.tripId,
        includeTrackToken: props.includeTrackToken !== false && Boolean(props.tripId),
        viaLogin: true,
      }),
    [props.clientId, props.tripId, props.includeTrackToken],
  )

  if (!client || rows.length === 0) return null

  async function copy(url: string, kind: string) {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(kind)
      window.setTimeout(() => setCopied(null), 2000)
    } catch {
      setCopied(null)
    }
  }

  return (
    <div
      className={
        props.className ??
        'space-y-2 rounded-md border border-border/50 bg-ink/40 p-2.5'
      }
    >
      <div className="text-sm font-medium text-cream">
        Client links · {client.name}
      </div>
      <p className="text-[11px] text-muted">
        Copy the right hyperlink for outreach — company portal, login, book,
        quote, history, or this trip&apos;s track.
      </p>
      <ul className="space-y-1.5">
        {rows.map((r) => (
          <li
            key={r.kind}
            className="flex flex-wrap items-center justify-between gap-2 rounded border border-border/40 bg-ink/30 px-2.5 py-2"
          >
            <div className="min-w-0">
              <div className="text-xs font-semibold text-cream">{r.label}</div>
              <p className="truncate text-[10px] text-muted">{r.hint}</p>
              <p className="mt-0.5 truncate font-mono text-[10px] text-cream/55">
                {r.path}
              </p>
            </div>
            <button
              type="button"
              className="shrink-0 rounded border border-gold/40 px-2.5 py-1.5 text-[11px] font-semibold text-gold hover:bg-gold/10"
              onClick={() => void copy(r.path, r.kind)}
            >
              {copied === r.kind ? 'Copied' : 'Copy'}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
