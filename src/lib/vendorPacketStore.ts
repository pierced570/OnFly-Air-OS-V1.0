/**
 * Public W-9 / vendor packet submissions (session until DB persist).
 * Dispatcher reviews before any AP / 1099 use — approve, don't auto-enter.
 */

import {
  digitsOnly,
  formatTinDisplay,
  validateVendorPacket,
  type VendorPacketDraft,
} from '@/domain/vendorPacket'
import { addNeedsInfoTask } from '@/lib/needsInfoStore'

export type VendorPacketSubmission = {
  id: string
  created_at: string
  status: 'pending_review' | 'accepted'
  draft: VendorPacketDraft
  /** Safe display TIN (masked / formatted) for admin lists */
  tin_display: string
}

const rows = new Map<string, VendorPacketSubmission>()
const listeners = new Set<() => void>()
let snapshot: VendorPacketSubmission[] = []

function rebuild() {
  snapshot = [...rows.values()].sort((a, b) =>
    b.created_at.localeCompare(a.created_at),
  )
}

function bump() {
  rebuild()
  for (const l of listeners) l()
}

rebuild()

export function subscribeVendorPackets(fn: () => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

export function listVendorPackets(): VendorPacketSubmission[] {
  return snapshot
}

export function listPendingVendorPackets(): VendorPacketSubmission[] {
  return snapshot.filter((r) => r.status === 'pending_review')
}

export function submitVendorPacket(
  draft: VendorPacketDraft,
): VendorPacketSubmission {
  const v = validateVendorPacket(draft)
  if (!v.ok) {
    throw new Error(v.errors.join('; ') || 'Invalid vendor packet')
  }

  const normalized: VendorPacketDraft = {
    ...draft,
    legal_name: draft.legal_name.trim(),
    dba: draft.dba.trim(),
    other_classification: draft.other_classification.trim(),
    tin: digitsOnly(draft.tin),
    bank_routing: digitsOnly(draft.bank_routing),
    bank_account: digitsOnly(draft.bank_account),
    ap_email: draft.ap_email.trim().toLowerCase(),
    ap_name: draft.ap_name.trim(),
    ap_phone: draft.ap_phone.trim(),
    bank_name: draft.bank_name.trim(),
    signer_name: draft.signer_name.trim(),
    signer_title: draft.signer_title.trim(),
    notes: draft.notes.trim(),
    w9_file_name: draft.w9_file_name.trim(),
  }

  const row: VendorPacketSubmission = {
    id: crypto.randomUUID(),
    created_at: new Date().toISOString(),
    status: 'pending_review',
    draft: normalized,
    tin_display: formatTinDisplay(normalized.tin, normalized.tin_type),
  }
  rows.set(row.id, row)
  bump()

  const label = normalized.dba || normalized.legal_name
  addNeedsInfoTask({
    entity_type: 'vendor',
    entity_id: row.id,
    entity_label: label,
    field: 'vendor_packet_review',
    note: `W-9 / vendor packet submitted — verify TIN (${row.tin_display}), banking, and certification before paying.`,
    wizard: null,
  })

  if (v.flags.includes('w9_file')) {
    addNeedsInfoTask({
      entity_type: 'vendor',
      entity_id: row.id,
      entity_label: label,
      field: 'w9_file',
      note: 'No signed W-9 PDF attached — request upload or mail.',
      wizard: null,
    })
  }
  if (v.flags.includes('ap_phone')) {
    addNeedsInfoTask({
      entity_type: 'vendor',
      entity_id: row.id,
      entity_label: label,
      field: 'ap_phone',
      note: 'AP phone missing on vendor packet.',
      wizard: null,
    })
  }
  if (v.flags.includes('bank_name')) {
    addNeedsInfoTask({
      entity_type: 'vendor',
      entity_id: row.id,
      entity_label: label,
      field: 'bank_name',
      note: 'Bank name missing on vendor packet.',
      wizard: null,
    })
  }

  return row
}

export function acceptVendorPacket(id: string): void {
  const row = rows.get(id)
  if (!row) return
  row.status = 'accepted'
  bump()
}
