/**
 * Send client estimated (or hard) quote with ETA sheet — used from quote composer / request flow.
 * Never includes operator identity, cost, or margin.
 */

import { createEmailAdapter } from '@/adapters/email'
import type { Candidate } from '@/domain/routing'
import {
  quoteEmailSubject,
  renderQuoteEmailHtml,
  renderQuoteEmailText,
  type QuoteEmailTaxLine,
} from '@/domain/quoteEmail'
import { getClient, listRequestAlertEmails } from '@/lib/clientStore'
import { getRequest } from '@/lib/requestStore'
import {
  addTripDocument,
  createTripFromCandidates,
  getTrip,
  mutateTrip,
  type TripStoreRow,
} from '@/lib/tripStore'

export type SendEstimatedQuoteOpts = {
  originLabel: string
  destLabel: string
  readyLabel: string
  payloadKind: 'cargo' | 'pax' | 'both'
  candidates: Candidate[]
  selected: Candidate
  airSubtotal: number
  total: number
  taxLines: QuoteEmailTaxLine[]
  /** Override recipient list (dispatcher-edited) */
  to?: string[]
  clientId?: string | null
  requestId?: string | null
  requestRef?: number | null
  kind?: 'estimated' | 'hard'
  acceptUrl?: string | null
  /** Reuse existing trip instead of creating one */
  tripId?: string | null
}

export type SendEstimatedQuoteResult = {
  emailIds: string[]
  to: string[]
  trip: TripStoreRow
  subject: string
}

/** Resolve who should receive a quote email for this request/client. */
export function resolveQuoteRecipients(opts: {
  to?: string[]
  clientId?: string | null
  requestId?: string | null
}): string[] {
  if (opts.to?.length) {
    return uniqEmails(opts.to)
  }
  const out: string[] = []
  if (opts.requestId) {
    const req = getRequest(opts.requestId)
    if (req?.email) out.push(req.email)
  }
  if (opts.clientId) {
    const c = getClient(opts.clientId)
    if (c?.email) out.push(c.email)
    out.push(...listRequestAlertEmails(opts.clientId))
    // Requester contacts also get quotes (not AP-only)
    for (const contact of c?.contacts ?? []) {
      if (
        contact.email &&
        (contact.role === 'requester' || contact.notify_prefs.request_alert)
      ) {
        out.push(contact.email)
      }
    }
  }
  return uniqEmails(out)
}

function uniqEmails(emails: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of emails) {
    const e = raw.trim().toLowerCase()
    if (!e.includes('@') || seen.has(e)) continue
    seen.add(e)
    out.push(e)
  }
  return out
}

function acceptAbsoluteUrl(pathOrUrl: string | null | undefined): string | null {
  if (!pathOrUrl?.trim()) return null
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl
  if (typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}${pathOrUrl.startsWith('/') ? '' : '/'}${pathOrUrl}`
  }
  return pathOrUrl
}

/**
 * Email quote + estimated timeline to the client, create/update trip, log event.
 */
export async function sendEstimatedQuote(
  opts: SendEstimatedQuoteOpts,
): Promise<SendEstimatedQuoteResult> {
  const to = resolveQuoteRecipients({
    to: opts.to,
    clientId: opts.clientId,
    requestId: opts.requestId,
  })
  if (!to.length) {
    throw new Error(
      'No client email — add a requester email on the request or client, or enter To:',
    )
  }
  if (!opts.selected.chain?.length) {
    throw new Error('Selected option has no ETA chain — re-run estimates first')
  }

  const kind = opts.kind ?? 'estimated'
  const refLabel =
    opts.requestRef != null
      ? `R-${opts.requestRef}`
      : opts.requestId
        ? `REQ-${opts.requestId.slice(0, 6)}`
        : null

  const acceptUrl = acceptAbsoluteUrl(opts.acceptUrl)
  const payload = {
    originLabel: opts.originLabel,
    destLabel: opts.destLabel,
    total: opts.total,
    airSubtotal: opts.airSubtotal,
    taxLines: opts.taxLines,
    chain: opts.selected.chain,
    kind,
    refLabel,
    acceptUrl,
  }
  const subject = quoteEmailSubject(payload)
  const html = renderQuoteEmailHtml(payload)
  const text = renderQuoteEmailText(payload)

  const email = createEmailAdapter()
  const emailIds: string[] = []
  for (const recipient of to) {
    const r = await email.send({ to: recipient, subject, html, text })
    emailIds.push(r.id)
  }

  let trip: TripStoreRow
  if (opts.tripId) {
    const existing = getTrip(opts.tripId)
    if (!existing) throw new Error('Trip not found')
    trip = existing
  } else {
    trip = createTripFromCandidates({
      lane: `${opts.originLabel} → ${opts.destLabel}`,
      payload_summary: opts.payloadKind,
      ready_label: opts.readyLabel,
      candidates: opts.candidates,
      payload_kind: opts.payloadKind,
      client_id: opts.clientId ?? undefined,
      selectedChain: opts.selected.chain,
    })
  }

  const at = new Date().toISOString()
  mutateTrip(trip.id, (t) => {
    t.events.push({
      at,
      actor: 'dispatcher',
      kind: 'estimated_quote_sent',
      payload: {
        to,
        total: opts.total,
        kind,
        email_ids: emailIds,
        chain_legs: opts.selected.chain.length,
        candidate_tail: opts.selected.tail,
      },
    })
  })
  addTripDocument(trip.id, {
    kind: 'quote',
    title: `${kind === 'hard' ? 'Hard' : 'Estimated'} quote · $${opts.total.toFixed(0)}`,
    url: `#quote-${trip.id.slice(0, 8)}`,
    at,
  })
  addTripDocument(trip.id, {
    kind: 'eta_sheet',
    title: `ETA sheet · ${opts.originLabel}→${opts.destLabel}`,
    url: `#eta-${trip.id.slice(0, 8)}`,
    at,
  })

  // Durable quotes row (tax_breakdown + options)
  void import('@/lib/db/persistQuote').then((m) =>
    m.persistQuoteRow({
      tripId: trip.id,
      kind,
      total: opts.total,
      airSubtotal: opts.airSubtotal,
      taxLines: opts.taxLines.map((l) => ({
        code: l.code,
        label: l.note,
        amount: l.amount,
      })),
      options: opts.candidates.slice(0, 5).map((c) => ({
        tail: c.tail,
        type_name: c.type_name,
        price: c.price,
        eta_end: c.eta_end,
        aircraft_id: c.aircraft_id,
        operator_id: c.operator_id,
      })),
      acceptToken: opts.acceptUrl?.split('/').pop() ?? null,
    }),
  )

  return { emailIds, to, trip, subject }
}
