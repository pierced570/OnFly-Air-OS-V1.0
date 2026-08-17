/**
 * Live-trip desk contacts — click-to-call lines for client + charter operator.
 * Pure: no React / Supabase. Group SMS threads are not part of this model.
 */

import {
  formatPhoneDisplay,
  normalizePhone,
} from '@/domain/staffAccess'

export type TripContactKind = 'client' | 'operator' | 'crew'

export type TripContactLine = {
  id: string
  kind: TripContactKind
  /** Short desk label — Inbound desk, Ops callback, name, etc. */
  label: string
  company: string
  roleLabel: string
  phoneDisplay: string
  telHref: string
}

export type TripContactSource = {
  clientName?: string | null
  client?: {
    name: string
    profile?: {
      front_desk_phone?: string | null
      ops_callback_phone?: string | null
      emergency?: { name?: string; phone?: string } | null
    } | null
    contacts?: Array<{
      id?: string
      name?: string
      cell?: string
      role?: string
      title?: string
    }>
  } | null
  participants?: Array<{
    id: string
    name: string
    company?: string | null
    role: string
    cell?: string | null
    released_at?: string | null
  }>
  /** Selected / booked operator offer lines. */
  operatorOffers?: Array<{
    id: string
    operator_name: string
    contact_cell?: string | null
    contact_cell_is_mock?: boolean
  }>
  /** Extra resolved operator phones (network / onboard). */
  operatorExtras?: Array<{
    id: string
    name: string
    company: string
    phone: string
    roleLabel?: string
  }>
}

function roleLabel(role: string): string {
  switch (role) {
    case 'dispatcher':
      return 'Dispatch'
    case 'pilot':
      return 'Pilot'
    case 'operator_ops':
      return 'Operator ops'
    case 'fbo':
      return 'FBO'
    case 'driver':
      return 'Driver'
    case 'client':
      return 'Client'
    case 'client_ap':
      return 'Client AP'
    case 'client_supply':
      return 'Client ops'
    case 'requester':
      return 'Requester'
    case 'other':
      return 'Other'
    default:
      return role.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
  }
}

/** tel: href for click-to-call (E.164 when 10-digit US). */
export function telHrefFromPhone(phone: string): string | null {
  const raw = phone.trim()
  if (!raw) return null
  const digits = raw.replace(/\D/g, '')
  if (!digits) return null
  if (digits.length === 10) return `tel:+1${digits}`
  if (digits.length === 11 && digits.startsWith('1')) return `tel:+${digits}`
  if (raw.startsWith('+') && digits.length >= 10) return `tel:+${digits}`
  if (digits.length >= 10) return `tel:+${digits}`
  return `tel:${digits}`
}

function pushPhone(
  out: TripContactLine[],
  seen: Set<string>,
  opts: {
    id: string
    kind: TripContactKind
    label: string
    company: string
    roleLabel: string
    phone: string | null | undefined
  },
): void {
  const phone = (opts.phone ?? '').trim()
  if (!phone) return
  const href = telHrefFromPhone(phone)
  if (!href) return
  const key = normalizePhone(phone) || phone.replace(/\D/g, '')
  if (!key || seen.has(`${opts.kind}:${key}`)) return
  seen.add(`${opts.kind}:${key}`)
  out.push({
    id: opts.id,
    kind: opts.kind,
    label: opts.label.trim() || 'Contact',
    company: opts.company.trim() || '—',
    roleLabel: opts.roleLabel,
    phoneDisplay: formatPhoneDisplay(phone) || phone,
    telHref: href,
  })
}

/**
 * Build deduped click-to-call lines for a live trip.
 * Client inbound / contacts first, then charter operator, then crew/ground.
 */
export function buildTripContactLines(
  source: TripContactSource,
): TripContactLine[] {
  const out: TripContactLine[] = []
  const seen = new Set<string>()
  const clientName =
    source.client?.name?.trim() || source.clientName?.trim() || 'Client'

  const profile = source.client?.profile
  pushPhone(out, seen, {
    id: 'client-inbound',
    kind: 'client',
    label: 'Inbound desk',
    company: clientName,
    roleLabel: 'Client inbound',
    phone: profile?.front_desk_phone,
  })
  pushPhone(out, seen, {
    id: 'client-callback',
    kind: 'client',
    label: 'Ops callback',
    company: clientName,
    roleLabel: 'Client callback',
    phone: profile?.ops_callback_phone,
  })
  if (profile?.emergency?.phone) {
    pushPhone(out, seen, {
      id: 'client-emergency',
      kind: 'client',
      label: profile.emergency.name?.trim() || 'Emergency',
      company: clientName,
      roleLabel: 'Client emergency',
      phone: profile.emergency.phone,
    })
  }

  for (const c of source.client?.contacts ?? []) {
    const name = (c.name ?? '').trim() || 'Contact'
    const title = (c.title ?? '').trim()
    pushPhone(out, seen, {
      id: `client-contact-${c.id ?? name}`,
      kind: 'client',
      label: title ? `${name} · ${title}` : name,
      company: clientName,
      roleLabel: roleLabel(c.role ?? 'client'),
      phone: c.cell,
    })
  }

  for (const p of source.participants ?? []) {
    if (p.released_at) continue
    const role = p.role
    if (role !== 'client' && role !== 'client_ap' && role !== 'client_supply') {
      continue
    }
    pushPhone(out, seen, {
      id: `part-client-${p.id}`,
      kind: 'client',
      label: p.name.trim() || 'Client',
      company: (p.company ?? '').trim() || clientName,
      roleLabel: roleLabel(role),
      phone: p.cell,
    })
  }

  for (const o of source.operatorOffers ?? []) {
    if (o.contact_cell_is_mock) continue
    pushPhone(out, seen, {
      id: `offer-${o.id}`,
      kind: 'operator',
      label: o.operator_name.trim() || 'Charter operator',
      company: o.operator_name.trim() || 'Operator',
      roleLabel: 'Charter operator',
      phone: o.contact_cell,
    })
  }

  for (const x of source.operatorExtras ?? []) {
    pushPhone(out, seen, {
      id: x.id,
      kind: 'operator',
      label: x.name.trim() || 'Operator',
      company: x.company.trim() || 'Operator',
      roleLabel: x.roleLabel?.trim() || 'Charter operator',
      phone: x.phone,
    })
  }

  for (const p of source.participants ?? []) {
    if (p.released_at) continue
    const role = p.role
    if (
      role !== 'operator_ops' &&
      role !== 'pilot' &&
      role !== 'driver' &&
      role !== 'fbo'
    ) {
      continue
    }
    const kind: TripContactKind =
      role === 'operator_ops' ? 'operator' : 'crew'
    pushPhone(out, seen, {
      id: `part-${p.id}`,
      kind,
      label: p.name.trim() || roleLabel(role),
      company: (p.company ?? '').trim() || '—',
      roleLabel: roleLabel(role),
      phone: p.cell,
    })
  }

  return out
}

export function groupTripContactLines(lines: TripContactLine[]): {
  client: TripContactLine[]
  operator: TripContactLine[]
  crew: TripContactLine[]
} {
  return {
    client: lines.filter((l) => l.kind === 'client'),
    operator: lines.filter((l) => l.kind === 'operator'),
    crew: lines.filter((l) => l.kind === 'crew'),
  }
}
