/**
 * Sales / BD leads — who we talked to, at which company, next follow-up.
 * Pure TypeScript (no React / Supabase).
 */

export const LEAD_KINDS = ['operator', 'client', 'fbo', 'other'] as const
export type LeadKind = (typeof LEAD_KINDS)[number]

export const LEAD_STATUSES = [
  'open',
  'warming',
  'won',
  'lost',
  'closed',
] as const
export type LeadStatus = (typeof LEAD_STATUSES)[number]

export const LEAD_KIND_LABELS: Record<LeadKind, string> = {
  operator: 'Operator',
  client: 'Client',
  fbo: 'FBO',
  other: 'Other',
}

export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  open: 'Open',
  warming: 'Warming',
  won: 'Won',
  lost: 'Lost',
  closed: 'Closed',
}

export type Lead = {
  id: string
  company: string
  contact_name: string
  title: string
  email: string
  phone: string
  kind: LeadKind
  status: LeadStatus
  /** ISO timestamptz — last conversation */
  last_contacted_at: string | null
  /** ISO timestamptz — when to follow up next */
  next_follow_up_at: string | null
  notes: string
  /** Last touch summary (what was said / next ask) */
  last_touch_note: string
  /** Staff name who owns the lead */
  owner: string
  created_at: string
  updated_at: string
}

export type LeadDraft = {
  company: string
  contact_name: string
  title?: string
  email?: string
  phone?: string
  kind?: LeadKind
  status?: LeadStatus
  last_contacted_at?: string | null
  next_follow_up_at?: string | null
  notes?: string
  last_touch_note?: string
  owner?: string
}

export type LeadFollowUpState = 'overdue' | 'due_today' | 'upcoming' | 'none'

const DAY_MS = 24 * 3600_000

/** Calendar day key in UTC (YYYY-MM-DD). */
export function utcDayKey(isoOrMs: string | number): string {
  const d = typeof isoOrMs === 'number' ? new Date(isoOrMs) : new Date(isoOrMs)
  if (Number.isNaN(d.getTime())) return ''
  return d.toISOString().slice(0, 10)
}

export function followUpState(
  nextFollowUpAt: string | null | undefined,
  nowMs = Date.now(),
): LeadFollowUpState {
  if (!nextFollowUpAt) return 'none'
  const t = Date.parse(nextFollowUpAt)
  if (!Number.isFinite(t)) return 'none'
  const today = utcDayKey(nowMs)
  const day = utcDayKey(t)
  if (!day) return 'none'
  if (day < today) return 'overdue'
  if (day === today) return 'due_today'
  return 'upcoming'
}

export function validateLeadDraft(draft: LeadDraft): string | null {
  if (!draft.company?.trim()) return 'Company is required'
  if (!draft.contact_name?.trim()) return 'Contact name is required'
  const email = draft.email?.trim()
  if (email && !email.includes('@')) return 'Email looks invalid'
  return null
}

/** Default next follow-up: +N days from now at 15:00Z (desk-friendly). */
export function defaultFollowUpIso(daysAhead = 3, nowMs = Date.now()): string {
  const d = new Date(nowMs + daysAhead * DAY_MS)
  d.setUTCHours(15, 0, 0, 0)
  return d.toISOString()
}

export function buildLead(
  draft: LeadDraft,
  opts?: { id?: string; nowIso?: string },
): Lead {
  const err = validateLeadDraft(draft)
  if (err) throw new Error(err)
  const now = opts?.nowIso ?? new Date().toISOString()
  return {
    id: opts?.id ?? crypto.randomUUID(),
    company: draft.company.trim(),
    contact_name: draft.contact_name.trim(),
    title: (draft.title ?? '').trim(),
    email: (draft.email ?? '').trim().toLowerCase(),
    phone: (draft.phone ?? '').trim(),
    kind: draft.kind ?? 'other',
    status: draft.status ?? 'open',
    last_contacted_at: draft.last_contacted_at ?? now,
    next_follow_up_at: draft.next_follow_up_at ?? null,
    notes: (draft.notes ?? '').trim(),
    last_touch_note: (draft.last_touch_note ?? '').trim(),
    owner: (draft.owner ?? '').trim(),
    created_at: now,
    updated_at: now,
  }
}

export type LogTouchInput = {
  note?: string
  /** Days until next follow-up; null clears the reminder */
  followUpInDays?: number | null
  status?: LeadStatus
  nowIso?: string
}

/** Apply a logged conversation to a lead. */
export function applyLogTouch(lead: Lead, input: LogTouchInput): Lead {
  const now = input.nowIso ?? new Date().toISOString()
  const nowMs = Date.parse(now)
  let next = lead.next_follow_up_at
  if (input.followUpInDays === null) next = null
  else if (typeof input.followUpInDays === 'number') {
    next = defaultFollowUpIso(input.followUpInDays, nowMs)
  }
  return {
    ...lead,
    last_contacted_at: now,
    last_touch_note: (input.note ?? lead.last_touch_note).trim(),
    next_follow_up_at: next,
    status: input.status ?? lead.status,
    updated_at: now,
  }
}

export type LeadSortMode = 'follow_up' | 'recent' | 'company'

/**
 * Sort for the desk: overdue → due today → upcoming → no date,
 * then by follow-up time / last contact / company.
 */
export function sortLeads(
  leads: Lead[],
  mode: LeadSortMode = 'follow_up',
  nowMs = Date.now(),
): Lead[] {
  const rank: Record<LeadFollowUpState, number> = {
    overdue: 0,
    due_today: 1,
    upcoming: 2,
    none: 3,
  }
  return [...leads].sort((a, b) => {
    if (mode === 'company') {
      return (
        a.company.localeCompare(b.company) ||
        a.contact_name.localeCompare(b.contact_name)
      )
    }
    if (mode === 'recent') {
      const at = a.last_contacted_at ? Date.parse(a.last_contacted_at) : 0
      const bt = b.last_contacted_at ? Date.parse(b.last_contacted_at) : 0
      return bt - at
    }
    const sa = followUpState(a.next_follow_up_at, nowMs)
    const sb = followUpState(b.next_follow_up_at, nowMs)
    if (rank[sa] !== rank[sb]) return rank[sa] - rank[sb]
    const at = a.next_follow_up_at ? Date.parse(a.next_follow_up_at) : Infinity
    const bt = b.next_follow_up_at ? Date.parse(b.next_follow_up_at) : Infinity
    if (at !== bt) return at - bt
    return a.company.localeCompare(b.company)
  })
}

export function filterLeads(
  leads: Lead[],
  opts: {
    q?: string
    kind?: LeadKind | 'all'
    status?: LeadStatus | 'all' | 'active'
    followUp?: LeadFollowUpState | 'all' | 'needs_touch'
    nowMs?: number
  },
): Lead[] {
  const now = opts.nowMs ?? Date.now()
  const needle = (opts.q ?? '').trim().toLowerCase()
  return leads.filter((l) => {
    if (opts.kind && opts.kind !== 'all' && l.kind !== opts.kind) return false
    if (opts.status === 'active') {
      if (l.status === 'won' || l.status === 'lost' || l.status === 'closed') {
        return false
      }
    } else if (opts.status && opts.status !== 'all' && l.status !== opts.status) {
      return false
    }
    const fu = followUpState(l.next_follow_up_at, now)
    if (opts.followUp === 'needs_touch') {
      if (fu !== 'overdue' && fu !== 'due_today') return false
    } else if (opts.followUp && opts.followUp !== 'all' && fu !== opts.followUp) {
      return false
    }
    if (!needle) return true
    const blob = [
      l.company,
      l.contact_name,
      l.title,
      l.email,
      l.phone,
      l.notes,
      l.last_touch_note,
      l.owner,
    ]
      .join(' ')
      .toLowerCase()
    return blob.includes(needle)
  })
}

/** Short mailto body for a follow-up. */
export function followUpMailto(lead: Lead): string | null {
  if (!lead.email.includes('@')) return null
  const subject = encodeURIComponent(`Following up — ${lead.company}`)
  const body = encodeURIComponent(
    `Hi ${lead.contact_name.split(' ')[0] || lead.contact_name},\n\n` +
      `Wanted to follow up from our last conversation` +
      (lead.last_touch_note ? ` (${lead.last_touch_note})` : '') +
      `.\n\nBest,\n`,
  )
  return `mailto:${lead.email}?subject=${subject}&body=${body}`
}
