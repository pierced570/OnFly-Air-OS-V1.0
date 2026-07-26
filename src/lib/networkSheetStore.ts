/**
 * Editable overlays for the Network spreadsheet view.
 * Patches sit on top of loadNetwork() — localStorage first; best-effort DB when live.
 */

import {
  buildNetworkSheetRows,
  type NetworkSheetAircraftPatch,
  type NetworkSheetOperatorPatch,
  type NetworkSheetRow,
} from '@/domain/networkSheet'
import {
  getCachedNetwork,
  loadNetwork,
  patchCachedAircraft,
  patchCachedOperator,
  type LoadedNetwork,
} from '@/lib/networkData'
import { isSupabaseConfigured, supabase } from '@/lib/supabase'

const STORAGE_KEY = 'onfly.network.sheet.overrides.v1'

type Overlay = {
  aircraft: Record<string, NetworkSheetAircraftPatch>
  operators: Record<string, NetworkSheetOperatorPatch>
}

const overlay: Overlay = { aircraft: {}, operators: {} }
const listeners = new Set<() => void>()
let snapshot: NetworkSheetRow[] = []
let net: LoadedNetwork | null = null
let ready = false

function rebuild() {
  if (!net) {
    snapshot = []
    return
  }
  snapshot = buildNetworkSheetRows({
    operators: net.operators,
    aircraft: net.aircraft,
    type_specs: net.type_specs ?? [],
    aircraftPatches: overlay.aircraft,
    operatorPatches: overlay.operators,
  })
}

function bump() {
  rebuild()
  persist()
  for (const l of listeners) l()
}

function persist() {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(overlay))
  } catch {
    /* quota */
  }
}

function loadOverlay() {
  if (typeof localStorage === 'undefined') return
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return
    const parsed = JSON.parse(raw) as Overlay
    if (parsed?.aircraft && typeof parsed.aircraft === 'object') {
      Object.assign(overlay.aircraft, parsed.aircraft)
    }
    if (parsed?.operators && typeof parsed.operators === 'object') {
      Object.assign(overlay.operators, parsed.operators)
    }
  } catch {
    /* ignore */
  }
}

loadOverlay()

function applyOverlayToCache() {
  for (const [id, patch] of Object.entries(overlay.aircraft)) {
    patchCachedAircraft(id, patch as Partial<import('@/lib/types').AircraftRow>)
  }
  for (const [id, patch] of Object.entries(overlay.operators)) {
    patchCachedOperator(id, patch as Partial<import('@/lib/types').OperatorRow>)
  }
}

export function subscribeNetworkSheet(fn: () => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

export function listNetworkSheetRows(): NetworkSheetRow[] {
  return snapshot
}

export function networkSheetReady(): boolean {
  return ready
}

export async function ensureNetworkSheetLoaded(): Promise<NetworkSheetRow[]> {
  net = getCachedNetwork() ?? (await loadNetwork())
  applyOverlayToCache()
  net = getCachedNetwork() ?? net
  ready = true
  rebuild()
  for (const l of listeners) l()
  return snapshot
}

export function updateSheetAircraftField(
  aircraftId: string,
  field: keyof NetworkSheetAircraftPatch,
  value: string | number | boolean | null,
): void {
  const prev = overlay.aircraft[aircraftId] ?? {}
  const next: NetworkSheetAircraftPatch = { ...prev, [field]: value }
  overlay.aircraft[aircraftId] = next
  patchCachedAircraft(aircraftId, {
    [field]: value,
  } as Partial<import('@/lib/types').AircraftRow>)
  bump()
  void persistAircraftToDb(aircraftId, next)
}

export function updateSheetOperatorField(
  operatorId: string,
  field: keyof NetworkSheetOperatorPatch,
  value: string | null,
): void {
  const prev = overlay.operators[operatorId] ?? {}
  const next: NetworkSheetOperatorPatch = { ...prev, [field]: value }
  overlay.operators[operatorId] = next
  patchCachedOperator(operatorId, {
    [field]: value,
  } as Partial<import('@/lib/types').OperatorRow>)
  if (field === 'contact_email' && value) {
    const name =
      net?.operators.find((o) => o.id === operatorId)?.name ?? operatorId
    void import('@/lib/operatorComplianceStore').then((m) => {
      m.ensureOperatorCompliance({
        operator_id: operatorId,
        operator_name: name,
        contact_email: value,
      })
      m.setOperatorContactEmail(operatorId, value)
    })
  }
  bump()
  void persistOperatorToDb(operatorId, next)
}

async function persistAircraftToDb(
  aircraftId: string,
  patch: NetworkSheetAircraftPatch,
): Promise<void> {
  if (!isSupabaseConfigured || !supabase) return
  const body: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(patch)) {
    if (v !== undefined) body[k] = v
  }
  if (!Object.keys(body).length) return
  const { error } = await supabase.from('aircraft').update(body).eq('id', aircraftId)
  if (error) console.warn('[network-sheet] aircraft update failed', error.message)
}

async function persistOperatorToDb(
  operatorId: string,
  patch: NetworkSheetOperatorPatch,
): Promise<void> {
  if (!isSupabaseConfigured || !supabase) return
  const opBody: Record<string, unknown> = {}
  if (patch.name !== undefined) opBody.name = patch.name
  if (patch.ops_email !== undefined) opBody.ops_email = patch.ops_email
  if (patch.base_icao !== undefined) opBody.base_icao = patch.base_icao
  if (patch.notes !== undefined) opBody.notes = patch.notes
  if (patch.quote_link_channel !== undefined) {
    opBody.quote_link_channel = patch.quote_link_channel
  }
  if (Object.keys(opBody).length) {
    const { error } = await supabase
      .from('operators')
      .update(opBody)
      .eq('id', operatorId)
    if (error) console.warn('[network-sheet] operator update failed', error.message)
  }

  if (
    patch.contact_name !== undefined ||
    patch.contact_cell !== undefined ||
    patch.contact_email !== undefined
  ) {
    const { data: existing } = await supabase
      .from('operator_contacts')
      .select('id')
      .eq('operator_id', operatorId)
      .limit(1)
      .maybeSingle()
    const contactBody = {
      operator_id: operatorId,
      name: patch.contact_name ?? null,
      cell: patch.contact_cell ?? null,
      email: patch.contact_email ?? null,
      role: 'ops',
    }
    if (existing?.id) {
      const { error } = await supabase
        .from('operator_contacts')
        .update(contactBody)
        .eq('id', existing.id)
      if (error)
        console.warn('[network-sheet] contact update failed', error.message)
    } else {
      const { error } = await supabase
        .from('operator_contacts')
        .insert(contactBody)
      if (error)
        console.warn('[network-sheet] contact insert failed', error.message)
    }
  }
}

export function __resetNetworkSheetForTests(): void {
  overlay.aircraft = {}
  overlay.operators = {}
  snapshot = []
  net = null
  ready = false
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {
      /* ignore */
    }
  }
}
