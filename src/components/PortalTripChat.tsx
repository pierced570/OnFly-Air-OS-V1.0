/**
 * Running client ↔ OnFly chat on the trip portal (cream) and desk (dark).
 * Separate from the ops SMS thread (crew / FBO / dispatch).
 */

import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { usePortalSession } from '@/hooks/usePortalSession'
import {
  refreshPortalChat,
  sendPortalChatMessage,
} from '@/lib/portalChatNotify'
import { getSession } from '@/lib/staffStore'
import {
  getTrip,
  listTripsStable,
  subscribeTrips,
} from '@/lib/tripStore'

type Variant = 'portal' | 'desk'

type Props = {
  tripId: string
  variant: Variant
  /** Magic-link token so guests can persist without a work-email session. */
  token?: string | null
}

const POLL_MS = 8000

export function PortalTripChat({ tripId, variant, token = null }: Props) {
  useSyncExternalStore(subscribeTrips, listTripsStable, listTripsStable)
  const trip = getTrip(tripId)
  const { session } = usePortalSession()
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement | null>(null)
  const messages = trip?.portal_chat ?? []
  const isPortal = variant === 'portal'

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages.length, tripId])

  useEffect(() => {
    let stopped = false
    const tick = () => {
      if (stopped) return
      void refreshPortalChat({ tripId, token }).catch(() => {})
    }
    tick()
    const id = window.setInterval(tick, POLL_MS)
    return () => {
      stopped = true
      window.clearInterval(id)
    }
  }, [tripId, token])

  if (!trip) return null

  async function send() {
    const text = body.trim()
    if (!text || busy) return
    setBusy(true)
    setErr(null)
    try {
      const fromLabel = isPortal
        ? session?.email?.trim() || 'Client'
        : getSession()?.name?.trim() || 'OnFly'
      await sendPortalChatMessage({
        tripId,
        role: isPortal ? 'client' : 'onfly',
        body: text,
        fromLabel,
        token,
        email: isPortal ? session?.email ?? null : null,
      })
      setBody('')
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not send')
    } finally {
      setBusy(false)
    }
  }

  const wrapCls = isPortal
    ? 'mt-6 space-y-3 rounded-xl border border-[#E5DFD0] bg-white p-4 sm:p-5'
    : 'flex min-h-0 flex-col rounded-lg border border-border bg-surface p-4'
  const titleCls = isPortal
    ? 'text-[11px] font-semibold uppercase tracking-[0.14em] text-[#C9A227]'
    : 'text-xs uppercase tracking-wider text-muted'
  const hintCls = isPortal ? 'mt-1 text-xs text-[#6B6560]' : 'mt-1 text-[11px] text-muted'
  const listCls = isPortal
    ? 'max-h-64 space-y-2 overflow-y-auto'
    : 'mt-3 max-h-48 space-y-2 overflow-y-auto'
  const inputCls = isPortal
    ? 'min-w-0 flex-1 rounded-md border border-[#D4CFC0] bg-white px-3 py-2.5 text-sm text-ink outline-none focus:border-[#C9A227]'
    : 'min-w-0 flex-1 rounded border border-border bg-ink px-3 py-2 text-sm text-cream'
  const sendCls = isPortal
    ? 'rounded-md bg-[#C9A227] px-3 py-2 text-xs font-semibold text-[#0C0C0E] disabled:opacity-50'
    : 'rounded bg-gold px-3 py-2 text-sm font-medium text-ink disabled:opacity-40'
  const emptyCls = isPortal ? 'text-sm text-[#6B6560]' : 'text-sm text-muted'
  const errCls = isPortal ? 'text-xs text-[#C0392B]' : 'text-xs text-late'

  return (
    <section className={wrapCls}>
      <div>
        <h2 className={titleCls}>Chat with OnFly</h2>
        <p className={hintCls}>
          {isPortal
            ? 'Message dispatch on this trip. We email OnFly when you send, and replies show up here.'
            : 'Client portal chat — not the ops SMS thread. Replies appear on their tracking page.'}
        </p>
      </div>

      <ul className={listCls}>
        {messages.length === 0 ? (
          <li className={emptyCls}>
            {isPortal
              ? 'No messages yet — ask us anything about this trip.'
              : 'No portal messages yet.'}
          </li>
        ) : (
          messages.map((m) => {
            const mine = isPortal ? m.role === 'client' : m.role === 'onfly'
            const label = isPortal
              ? m.role === 'onfly'
                ? 'OnFly'
                : 'You'
              : m.role === 'onfly'
                ? m.from_label || 'OnFly'
                : m.from_label || 'Client'
            const bubble = isPortal
              ? mine
                ? 'ml-8 border-[#E5DFD0] bg-[#F7F2E3]'
                : 'mr-8 border-[#E5DFD0] bg-white'
              : mine
                ? 'ml-4 border-gold/30 bg-gold/5'
                : 'mr-4 border-border bg-ink/40'
            const nameCls = isPortal ? 'font-medium text-ink/80' : 'font-medium text-cream/80'
            const timeCls = isPortal
              ? 'avionic text-[10px] text-[#8A8680]'
              : 'avionic text-[10px] text-muted'
            const bodyCls = isPortal
              ? 'mt-1 whitespace-pre-wrap text-sm text-ink'
              : 'mt-1 whitespace-pre-wrap text-sm text-cream'
            return (
              <li
                key={m.id}
                className={`rounded-md border px-3 py-2 ${bubble}`}
              >
                <div className="flex flex-wrap gap-2 text-[10px]">
                  <span className={timeCls}>
                    {new Date(m.at).toISOString().slice(11, 19)}Z
                  </span>
                  <span className={nameCls}>{label}</span>
                </div>
                <p className={bodyCls}>{m.body}</p>
              </li>
            )
          })
        )}
        <div ref={bottomRef} />
      </ul>

      {err ? <p className={errCls}>{err}</p> : null}

      <div className={isPortal ? 'flex gap-2 pt-1' : 'mt-3 flex gap-2 border-t border-border pt-3'}>
        <input
          className={inputCls}
          placeholder={
            isPortal ? 'Message OnFly…' : 'Reply on the client portal…'
          }
          value={body}
          maxLength={4000}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              void send()
            }
          }}
        />
        <button
          type="button"
          className={sendCls}
          disabled={!body.trim() || busy}
          onClick={() => void send()}
        >
          {busy ? 'Sending…' : 'Send'}
        </button>
      </div>
    </section>
  )
}
