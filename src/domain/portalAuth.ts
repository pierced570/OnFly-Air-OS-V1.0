/**
 * Portal auth helpers — work-email / domain session + client scoping.
 * Pure session logic; Supabase / storage live in portalAuth.ts lib.
 */

export type PortalSession = {
  userId: string
  email: string
  clientId: string | null
}

export function portalEmailFromUser(user: {
  email?: string | null
  user_metadata?: Record<string, unknown>
}): string {
  const meta = user.user_metadata?.email
  const raw = user.email || (typeof meta === 'string' ? meta : '') || ''
  return raw.trim().toLowerCase()
}

/** Safe trip fields for portal list cards — never cost/margin/operator. */
export type PortalTripCard = {
  id: string
  ref: number
  state: string
  lane: string
  ready_label: string
  payload_summary: string
  updated_at?: string | null
  /** Client PO / reference when present on the trip. */
  po_number?: string | null
  code?: string | null
}

export function mapPortalTripRow(r: Record<string, unknown>): PortalTripCard {
  const po =
    typeof r.po_number === 'string' && r.po_number.trim()
      ? r.po_number.trim()
      : null
  const code =
    typeof r.code === 'string' && r.code.trim() ? r.code.trim() : null
  return {
    id: String(r.id),
    ref: Number(r.ref ?? 0),
    state: String(r.state ?? ''),
    lane: String(r.lane_label ?? r.lane ?? ''),
    ready_label: String(r.ready_label ?? ''),
    payload_summary: String(r.payload_summary ?? ''),
    updated_at: r.updated_at ? String(r.updated_at) : null,
    po_number: po,
    code,
  }
}
