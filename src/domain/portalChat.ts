/**
 * Client ↔ OnFly portal chat — per-trip, separate from ops SMS thread.
 * Pure TS. Never includes operator names, margins, or costs.
 */

export type PortalChatRole = 'client' | 'onfly'

export type PortalChatMessage = {
  id: string
  /** ISO UTC */
  at: string
  role: PortalChatRole
  from_label: string
  body: string
}

export type TripEventLike = {
  kind: string
  at: string
  actor?: string
  payload?: Record<string, unknown>
}

const MAX_BODY = 4000
const MAX_LABEL = 80

export function isPortalChatRole(v: unknown): v is PortalChatRole {
  return v === 'client' || v === 'onfly'
}

function clip(s: string, max: number): string {
  const t = s.trim()
  return t.length <= max ? t : t.slice(0, max)
}

export function normalizePortalChatMessage(
  raw: unknown,
): PortalChatMessage | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const id = typeof o.id === 'string' ? o.id.trim() : ''
  const at = typeof o.at === 'string' ? o.at.trim() : ''
  const body = typeof o.body === 'string' ? clip(o.body, MAX_BODY) : ''
  if (!id || !at || !body || !isPortalChatRole(o.role)) return null
  const from_label = clip(
    typeof o.from_label === 'string'
      ? o.from_label
      : o.role === 'onfly'
        ? 'OnFly'
        : 'Client',
    MAX_LABEL,
  )
  return {
    id,
    at,
    role: o.role,
    from_label: from_label || (o.role === 'onfly' ? 'OnFly' : 'Client'),
    body,
  }
}

export function normalizePortalChat(raw: unknown): PortalChatMessage[] {
  if (!Array.isArray(raw)) return []
  const out: PortalChatMessage[] = []
  const seen = new Set<string>()
  for (const row of raw) {
    const msg = normalizePortalChatMessage(row)
    if (!msg || seen.has(msg.id)) continue
    seen.add(msg.id)
    out.push(msg)
  }
  return out.sort((a, b) => a.at.localeCompare(b.at))
}

export function mergePortalChatMessages(
  a: PortalChatMessage[] | unknown,
  b: PortalChatMessage[] | unknown,
): PortalChatMessage[] {
  return normalizePortalChat([
    ...normalizePortalChat(a),
    ...normalizePortalChat(b),
  ])
}

export function portalChatFromEvents(
  events: TripEventLike[] | undefined | null,
): PortalChatMessage[] {
  if (!Array.isArray(events)) return []
  return normalizePortalChat(
    events
      .filter((e) => e.kind === 'portal_chat_message')
      .map((e) => ({
        id:
          typeof e.payload?.id === 'string'
            ? e.payload.id
            : `${e.at}:${e.actor ?? ''}`,
        at: e.at,
        role: e.payload?.role,
        from_label:
          typeof e.payload?.from_label === 'string'
            ? e.payload.from_label
            : e.actor,
        body: e.payload?.body,
      })),
  )
}

export function appendPortalChatMessage(
  existing: PortalChatMessage[] | unknown,
  input: {
    role: PortalChatRole
    body: string
    from_label?: string
    id?: string
    at?: string
  },
): { messages: PortalChatMessage[]; added: PortalChatMessage } {
  const body = clip(input.body, MAX_BODY)
  if (!body) {
    throw new Error('Message required')
  }
  const added: PortalChatMessage = {
    id: (input.id ?? '').trim() || crypto.randomUUID(),
    at: (input.at ?? '').trim() || new Date().toISOString(),
    role: input.role,
    from_label:
      clip(input.from_label ?? '', MAX_LABEL) ||
      (input.role === 'onfly' ? 'OnFly' : 'Client'),
    body,
  }
  return {
    added,
    messages: mergePortalChatMessages(existing, [added]),
  }
}

export function portalChatTripLabel(input: {
  code?: string | null
  ref?: number | null
  lane?: string | null
}): string {
  const code = (input.code ?? '').trim()
  const ref = input.ref != null && Number.isFinite(input.ref) ? `T-${input.ref}` : ''
  const who = code || ref || 'trip'
  const lane = (input.lane ?? '').trim()
  return lane ? `${who} · ${lane}` : who
}

export function deskPortalChatNotifySubject(input: {
  code?: string | null
  ref?: number | null
  lane?: string | null
}): string {
  return `[OnFly] New portal chat — ${portalChatTripLabel(input)}`
}

export function deskPortalChatNotifyText(input: {
  code?: string | null
  ref?: number | null
  lane?: string | null
  body: string
  fromLabel?: string | null
  deskUrl?: string | null
  portalUrl?: string | null
}): string {
  const who = (input.fromLabel ?? '').trim() || 'Client'
  const lines = [
    `${who} sent a new chat on the portal.`,
    '',
    portalChatTripLabel(input),
    '',
    clip(input.body, MAX_BODY),
  ]
  if (input.deskUrl?.trim()) {
    lines.push('', `Desk: ${input.deskUrl.trim()}`)
  }
  if (input.portalUrl?.trim()) {
    lines.push(`Portal: ${input.portalUrl.trim()}`)
  }
  return lines.join('\n')
}

export function clientPortalChatReplySubject(input: {
  code?: string | null
  ref?: number | null
  lane?: string | null
}): string {
  return `OnFly message — ${portalChatTripLabel(input)}`
}

export function clientPortalChatReplyText(input: {
  code?: string | null
  ref?: number | null
  lane?: string | null
  body: string
  portalUrl?: string | null
}): string {
  const lines = [
    'OnFly replied on your trip portal.',
    '',
    portalChatTripLabel(input),
    '',
    clip(input.body, MAX_BODY),
  ]
  if (input.portalUrl?.trim()) {
    lines.push('', `Open tracking: ${input.portalUrl.trim()}`)
  }
  return lines.join('\n')
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function renderDeskPortalChatNotifyHtml(input: {
  code?: string | null
  ref?: number | null
  lane?: string | null
  body: string
  fromLabel?: string | null
  deskUrl?: string | null
  portalUrl?: string | null
}): string {
  const who = escapeHtml((input.fromLabel ?? '').trim() || 'Client')
  const trip = escapeHtml(portalChatTripLabel(input))
  const body = escapeHtml(clip(input.body, MAX_BODY)).replace(/\n/g, '<br/>')
  const desk = input.deskUrl?.trim()
  const portal = input.portalUrl?.trim()
  return [
    `<p style="margin:0 0 12px;font-size:15px;line-height:1.5;color:#0c0c0e"><strong>${who}</strong> sent a new chat on the portal.</p>`,
    `<p style="margin:0 0 12px;font-size:13px;color:#6b6560">${trip}</p>`,
    `<p style="margin:0 0 16px;font-size:15px;line-height:1.55;color:#0c0c0e;white-space:pre-wrap">${body}</p>`,
    desk
      ? `<p style="margin:0 0 8px"><a href="${escapeHtml(desk)}" style="color:#c9a227">Open on the desk</a></p>`
      : '',
    portal
      ? `<p style="margin:0"><a href="${escapeHtml(portal)}" style="color:#c9a227">Client portal</a></p>`
      : '',
  ].join('')
}

export function renderClientPortalChatReplyHtml(input: {
  code?: string | null
  ref?: number | null
  lane?: string | null
  body: string
  portalUrl?: string | null
}): string {
  const trip = escapeHtml(portalChatTripLabel(input))
  const body = escapeHtml(clip(input.body, MAX_BODY)).replace(/\n/g, '<br/>')
  const portal = input.portalUrl?.trim()
  return [
    `<p style="margin:0 0 12px;font-size:15px;line-height:1.5;color:#0c0c0e">OnFly replied on your trip portal.</p>`,
    `<p style="margin:0 0 12px;font-size:13px;color:#6b6560">${trip}</p>`,
    `<p style="margin:0 0 16px;font-size:15px;line-height:1.55;color:#0c0c0e;white-space:pre-wrap">${body}</p>`,
    portal
      ? `<p style="margin:0"><a href="${escapeHtml(portal)}" style="background:#c9a227;color:#0c0c0e;text-decoration:none;padding:10px 16px;border-radius:6px;display:inline-block;font-weight:600">Open tracking</a></p>`
      : '',
  ].join('')
}
