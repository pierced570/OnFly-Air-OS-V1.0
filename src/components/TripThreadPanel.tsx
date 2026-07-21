/**
 * Shared trip SMS/ops thread — messages between dispatch, crew, ground, FBO.
 * Same source of truth as TripPage (tripStore.thread).
 */

import { useEffect, useRef, useState } from 'react'
import {
  postThreadMessage,
  type TripStoreRow,
} from '@/lib/tripStore'
import { getSession } from '@/lib/staffStore'

type Props = {
  trip: TripStoreRow
  /** Taller pane for the Chat workspace */
  tall?: boolean
  /** Optional label override */
  title?: string
}

export function TripThreadPanel({
  trip,
  tall = false,
  title = 'Trip thread',
}: Props) {
  const [body, setBody] = useState('')
  const [simFrom, setSimFrom] = useState('Pilot')
  const bottomRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [trip.thread.length, trip.id])

  const dispatcherName = getSession()?.name?.trim() || 'OnFly Dispatch'

  function postAsDispatch() {
    const text = body.trim()
    if (!text) return
    postThreadMessage(trip.id, {
      from: dispatcherName,
      channel: 'web',
      body: text,
    })
    setBody('')
  }

  function simulateInbound() {
    const text = body.trim()
    if (!text) return
    postThreadMessage(trip.id, {
      from: simFrom.trim() || 'Crew',
      channel: 'sms',
      body: text,
    })
    setBody('')
  }

  const maxH = tall ? 'max-h-[min(28rem,50vh)]' : 'max-h-48'

  return (
    <section className="flex min-h-0 flex-col rounded-lg border border-border bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-xs uppercase tracking-wider text-muted">{title}</h2>
          <p className="mt-1 text-[11px] text-muted">
            Ops SMS thread — crew, ground, FBO, dispatch. Clients stay on
            portal / tracker (not on this chat).
          </p>
        </div>
        {trip.thread_number && !trip.thread_disbanded_at ? (
          <div className="avionic rounded border border-gold/40 bg-gold/10 px-2 py-1 text-xs text-gold">
            {trip.thread_number}
          </div>
        ) : trip.thread_disbanded_at ? (
          <div className="rounded border border-border px-2 py-1 text-xs text-muted">
            Disbanded
          </div>
        ) : (
          <div className="rounded border border-border px-2 py-1 text-xs text-muted">
            No DID yet
          </div>
        )}
      </div>

      <ul className={`mt-3 space-y-2 overflow-y-auto ${maxH}`}>
        {trip.thread.length === 0 && (
          <li className="text-sm text-muted">No messages yet — say hello.</li>
        )}
        {trip.thread.map((m) => {
          const isDispatch =
            /dispatch|onfly/i.test(m.from) || m.channel === 'web'
          return (
            <li
              key={m.id}
              className={[
                'rounded-md border px-3 py-2 text-sm',
                isDispatch
                  ? 'ml-4 border-gold/30 bg-gold/5'
                  : 'mr-4 border-border bg-ink/40',
              ].join(' ')}
            >
              <div className="flex flex-wrap gap-2 text-[10px] text-muted">
                <span className="avionic">
                  {new Date(m.at).toISOString().slice(11, 19)}Z
                </span>
                <span className="font-medium text-cream/80">{m.from}</span>
                <span className="uppercase tracking-wider">{m.channel}</span>
                {m.parsed_kind && (
                  <span className="text-gold">parsed: {m.parsed_kind}</span>
                )}
              </div>
              <p className="mt-1 whitespace-pre-wrap text-cream">{m.body}</p>
            </li>
          )
        })}
        <div ref={bottomRef} />
      </ul>

      <div className="mt-3 space-y-2 border-t border-border pt-3">
        <div className="flex flex-wrap items-center gap-2 text-[10px] text-muted">
          <span>Simulate as</span>
          <select
            className="rounded border border-border bg-ink px-2 py-1 text-xs text-cream"
            value={simFrom}
            onChange={(e) => setSimFrom(e.target.value)}
          >
            <option>Pilot</option>
            <option>Driver</option>
            <option>FBO</option>
            <option>Operator ops</option>
          </select>
          <span className="text-muted/70">· or post as you (dispatch)</span>
        </div>
        <div className="flex gap-2">
          <input
            className="min-w-0 flex-1 rounded border border-border bg-ink px-3 py-2 text-sm text-cream"
            placeholder="Message · wheels up / arrived / delivered…"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                postAsDispatch()
              }
            }}
            disabled={Boolean(trip.thread_disbanded_at)}
          />
          <button
            type="button"
            className="rounded bg-gold px-3 py-2 text-sm font-medium text-ink disabled:opacity-40"
            disabled={!body.trim() || Boolean(trip.thread_disbanded_at)}
            onClick={postAsDispatch}
          >
            Send
          </button>
          <button
            type="button"
            className="rounded border border-border px-3 py-2 text-xs text-muted hover:text-cream disabled:opacity-40"
            disabled={!body.trim() || Boolean(trip.thread_disbanded_at)}
            onClick={simulateInbound}
            title="Demo inbound SMS from crew/ground"
          >
            As crew
          </button>
        </div>
      </div>
    </section>
  )
}
