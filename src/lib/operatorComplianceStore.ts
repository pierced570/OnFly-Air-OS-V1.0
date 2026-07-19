/**
 * Operator compliance docs — charter cert, D085, COI.
 * Files upload to Supabase Storage (operator-docs) when configured;
 * always keep a local preview for the session.
 */

import {
  canUseStorage,
  uploadOperatorDocToStorage,
} from '@/lib/storage'

export const OPERATOR_DOC_KINDS = ['charter_cert', 'd085', 'coi'] as const
export type OperatorDocKind = (typeof OPERATOR_DOC_KINDS)[number]

export const OPERATOR_DOC_LABELS: Record<OperatorDocKind, string> = {
  charter_cert: 'Charter certificate',
  d085: 'D085',
  coi: 'Certificate of insurance',
}

export type OperatorDocSlot = {
  kind: OperatorDocKind
  fileName: string | null
  mimeType: string | null
  sizeBytes: number | null
  uploadedAt: string | null
  /** YYYY-MM-DD */
  expiresOn: string | null
  /** Local object URL and/or Storage signed URL */
  previewUrl: string | null
  /** Path inside operator-docs bucket */
  storagePath: string | null
  storageError: string | null
}

export type OperatorCompliance = {
  operator_id: string
  operator_name: string
  contact_email: string
  docs: Record<OperatorDocKind, OperatorDocSlot>
  /** OnFly listed as named insured on their COI */
  named_insurer: boolean
  coi_reminder_sent_at: string | null
  /** Expiry date the last reminder referred to */
  coi_reminder_for_expiry: string | null
  updated_at: string
}

function emptyDoc(kind: OperatorDocKind): OperatorDocSlot {
  return {
    kind,
    fileName: null,
    mimeType: null,
    sizeBytes: null,
    uploadedAt: null,
    expiresOn: null,
    previewUrl: null,
    storagePath: null,
    storageError: null,
  }
}

export function emptyDocs(): Record<OperatorDocKind, OperatorDocSlot> {
  return {
    charter_cert: emptyDoc('charter_cert'),
    d085: emptyDoc('d085'),
    coi: emptyDoc('coi'),
  }
}

const byId = new Map<string, OperatorCompliance>()
const listeners = new Set<() => void>()
let snapshot: OperatorCompliance[] = []

function rebuild() {
  snapshot = [...byId.values()].sort((a, b) =>
    a.operator_name.localeCompare(b.operator_name),
  )
}

function bump() {
  rebuild()
  for (const l of listeners) l()
}

export function subscribeOperatorCompliance(fn: () => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

export function listOperatorCompliance(): OperatorCompliance[] {
  return snapshot
}

export function getOperatorCompliance(
  operatorId: string,
): OperatorCompliance | undefined {
  return byId.get(operatorId)
}

export function ensureOperatorCompliance(opts: {
  operator_id: string
  operator_name: string
  contact_email?: string
}): OperatorCompliance {
  const existing = byId.get(opts.operator_id)
  if (existing) {
    if (opts.contact_email && !existing.contact_email) {
      existing.contact_email = opts.contact_email
      existing.updated_at = new Date().toISOString()
      bump()
    }
    return existing
  }
  const row: OperatorCompliance = {
    operator_id: opts.operator_id,
    operator_name: opts.operator_name,
    contact_email: opts.contact_email ?? '',
    docs: emptyDocs(),
    named_insurer: false,
    coi_reminder_sent_at: null,
    coi_reminder_for_expiry: null,
    updated_at: new Date().toISOString(),
  }
  byId.set(row.operator_id, row)
  bump()
  return row
}

export function upsertOperatorCompliance(
  partial: Omit<OperatorCompliance, 'updated_at' | 'docs'> & {
    docs?: Partial<Record<OperatorDocKind, Partial<OperatorDocSlot>>>
  },
): OperatorCompliance {
  const existing = byId.get(partial.operator_id)
  const docs = emptyDocs()
  if (existing) {
    for (const k of OPERATOR_DOC_KINDS) {
      docs[k] = { ...existing.docs[k] }
    }
  }
  if (partial.docs) {
    for (const k of OPERATOR_DOC_KINDS) {
      const p = partial.docs[k]
      if (p) docs[k] = { ...docs[k], ...p, kind: k }
    }
  }
  const row: OperatorCompliance = {
    operator_id: partial.operator_id,
    operator_name: partial.operator_name,
    contact_email: partial.contact_email,
    docs,
    named_insurer: partial.named_insurer,
    coi_reminder_sent_at: partial.coi_reminder_sent_at,
    coi_reminder_for_expiry: partial.coi_reminder_for_expiry,
    updated_at: new Date().toISOString(),
  }
  byId.set(row.operator_id, row)
  bump()
  return row
}

export async function setOperatorDocFile(
  operatorId: string,
  kind: OperatorDocKind,
  file: File,
): Promise<OperatorDocSlot> {
  const row = byId.get(operatorId)
  if (!row) throw new Error('operator compliance not found')
  const prev = row.docs[kind]
  if (prev.previewUrl?.startsWith('blob:')) URL.revokeObjectURL(prev.previewUrl)

  const localUrl = URL.createObjectURL(file)
  let storagePath: string | null = null
  let storageError: string | null = null
  let previewUrl = localUrl

  if (canUseStorage()) {
    try {
      const uploaded = await uploadOperatorDocToStorage({
        operatorId,
        kind,
        file,
      })
      storagePath = uploaded.path
      if (uploaded.signedUrl) previewUrl = uploaded.signedUrl
    } catch (e) {
      storageError = e instanceof Error ? e.message : String(e)
      console.warn('[operator-docs] storage upload failed — kept local preview', storageError)
    }
  }

  const slot: OperatorDocSlot = {
    kind,
    fileName: file.name,
    mimeType: file.type || null,
    sizeBytes: file.size,
    uploadedAt: new Date().toISOString(),
    expiresOn: prev.expiresOn,
    previewUrl,
    storagePath,
    storageError,
  }
  row.docs[kind] = slot
  // New COI upload clears prior expiry reminder so a future expiry can notify again
  if (kind === 'coi') {
    row.coi_reminder_sent_at = null
    row.coi_reminder_for_expiry = null
  }
  row.updated_at = new Date().toISOString()
  bump()
  void import('@/lib/db/persistOperator').then((m) =>
    m.persistOperatorComplianceDoc({
      operatorId,
      kind,
      storagePath,
      expiresOn: slot.expiresOn,
      fileName: slot.fileName,
    }),
  )
  return slot
}

export function setOperatorDocExpiry(
  operatorId: string,
  kind: OperatorDocKind,
  expiresOn: string | null,
): void {
  const row = byId.get(operatorId)
  if (!row) return
  row.docs[kind] = {
    ...row.docs[kind],
    expiresOn: expiresOn?.trim() || null,
  }
  if (kind === 'coi' && expiresOn && expiresOn !== row.coi_reminder_for_expiry) {
    // Expiry changed — allow a new reminder when that date passes
    row.coi_reminder_sent_at = null
    row.coi_reminder_for_expiry = null
  }
  row.updated_at = new Date().toISOString()
  bump()
}

export function setOperatorContactEmail(operatorId: string, email: string): void {
  const row = byId.get(operatorId)
  if (!row) return
  row.contact_email = email.trim()
  row.updated_at = new Date().toISOString()
  bump()
}

export function setNamedInsurer(operatorId: string, value: boolean): void {
  const row = byId.get(operatorId)
  if (!row) return
  row.named_insurer = value
  row.updated_at = new Date().toISOString()
  bump()
  void import('@/lib/db/persistOperator').then((m) =>
    m.persistNamedInsurer(operatorId, value),
  )
}

export function markCoiReminderSent(
  operatorId: string,
  expiresOn: string,
): void {
  const row = byId.get(operatorId)
  if (!row) return
  row.coi_reminder_sent_at = new Date().toISOString()
  row.coi_reminder_for_expiry = expiresOn
  row.updated_at = new Date().toISOString()
  bump()
}

export function isDocExpired(
  expiresOn: string | null,
  now = new Date(),
): boolean {
  if (!expiresOn) return false
  const end = new Date(`${expiresOn}T23:59:59.999Z`)
  return end.getTime() < now.getTime()
}

export function docStatus(
  slot: OperatorDocSlot,
  now = new Date(),
): 'missing' | 'ok' | 'expired' | 'no_expiry' {
  if (!slot.fileName) return 'missing'
  if (!slot.expiresOn) return 'no_expiry'
  if (isDocExpired(slot.expiresOn, now)) return 'expired'
  return 'ok'
}
