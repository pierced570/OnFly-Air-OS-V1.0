/**
 * Desk operator search / quick-add — pull specific folks above recommend.
 */

import {
  DEFAULT_QUOTE_LINK_CHANNEL,
  normalizeQuoteLinkChannel,
  type QuoteLinkChannel,
} from '@/domain/quoteLinkChannel'
import type { Candidate } from '@/domain/routing'
import {
  getCachedNetwork,
  loadNetwork,
  upsertCachedOperator,
} from '@/lib/networkData'
import type { AircraftRow, OperatorRow } from '@/lib/types'

const DESK_OPS_KEY = 'onfly.deskAddedOperators.v1'

/** In-memory fallback when localStorage is unavailable (tests / SSR). */
let memoryDeskAdded: OperatorRow[] = []

function storageAvailable(): boolean {
  try {
    return typeof localStorage !== 'undefined'
  } catch {
    return false
  }
}

export type DeskOperatorHit = {
  operator_id: string
  name: string
  base_icao: string | null
  contact_email: string
  contact_cell: string
  quote_link_channel: QuoteLinkChannel
  /** Best / first active tail for pinging when not from recommend. */
  aircraft_id: string | null
  tail: string | null
  type_name: string | null
}

export type DeskContactOverride = {
  contact_email: string
  contact_cell: string
  quote_link_channel: QuoteLinkChannel
}

function readDeskAdded(): OperatorRow[] {
  if (!storageAvailable()) return memoryDeskAdded
  try {
    const raw = localStorage.getItem(DESK_OPS_KEY)
    if (!raw) return memoryDeskAdded
    const parsed = JSON.parse(raw) as OperatorRow[]
    return Array.isArray(parsed) ? parsed : memoryDeskAdded
  } catch {
    return memoryDeskAdded
  }
}

function writeDeskAdded(rows: OperatorRow[]): void {
  memoryDeskAdded = rows
  if (!storageAvailable()) return
  try {
    localStorage.setItem(DESK_OPS_KEY, JSON.stringify(rows))
  } catch {
    /* ignore quota */
  }
}

export function listDeskOperators(): OperatorRow[] {
  const net = getCachedNetwork()
  const fromNet = net?.operators ?? []
  const added = readDeskAdded()
  const seen = new Set(fromNet.map((o) => o.id))
  const merged = [...fromNet]
  for (const o of added) {
    if (seen.has(o.id)) continue
    merged.push(o)
    seen.add(o.id)
  }
  return merged
}

export async function ensureDeskOperatorsLoaded(): Promise<OperatorRow[]> {
  if (!getCachedNetwork()) await loadNetwork()
  const added = readDeskAdded()
  for (const o of added) upsertCachedOperator(o)
  return listDeskOperators()
}

function aircraftForOperator(operatorId: string): AircraftRow | undefined {
  const net = getCachedNetwork()
  if (!net) return undefined
  return (
    net.aircraft.find((a) => a.operator_id === operatorId && a.active) ??
    net.aircraft.find((a) => a.operator_id === operatorId)
  )
}

export function toDeskOperatorHit(op: OperatorRow): DeskOperatorHit {
  const ac = aircraftForOperator(op.id)
  return {
    operator_id: op.id,
    name: op.name,
    base_icao: op.base_icao,
    contact_email: (op.contact_email || op.ops_email || '').trim(),
    contact_cell: (op.contact_cell || '').trim(),
    quote_link_channel: normalizeQuoteLinkChannel(op.quote_link_channel),
    aircraft_id: ac?.id ?? null,
    tail: ac?.tail ?? null,
    type_name: ac?.type_name ?? null,
  }
}

export function searchDeskOperators(
  query: string,
  limit = 8,
): DeskOperatorHit[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const hits: DeskOperatorHit[] = []
  for (const op of listDeskOperators()) {
    const hay = [
      op.name,
      op.base_icao,
      op.contact_name,
      op.contact_cell,
      op.contact_email,
      op.ops_email,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
    if (!hay.includes(q)) continue
    hits.push(toDeskOperatorHit(op))
    if (hits.length >= limit) break
  }
  return hits
}

export function addDeskOperator(input: {
  name: string
  base_icao?: string
  contact_email?: string
  contact_cell?: string
  quote_link_channel?: QuoteLinkChannel
}): DeskOperatorHit {
  const name = input.name.trim()
  if (!name) throw new Error('Operator name required')
  const row: OperatorRow = {
    id: crypto.randomUUID(),
    name,
    base_icao: input.base_icao?.trim().toUpperCase() || null,
    needs_info: [],
    aircraft_count: 0,
    contact_name: null,
    contact_cell: input.contact_cell?.trim() || null,
    contact_email: input.contact_email?.trim() || null,
    ops_email: input.contact_email?.trim() || null,
    notes: 'Added from desk',
    quote_link_channel:
      input.quote_link_channel ?? DEFAULT_QUOTE_LINK_CHANNEL,
  }
  const added = readDeskAdded().filter((o) => o.id !== row.id)
  added.unshift(row)
  writeDeskAdded(added)
  upsertCachedOperator(row)
  return toDeskOperatorHit(row)
}

export function contactOverrideFromHit(
  hit: DeskOperatorHit,
): DeskContactOverride {
  return {
    contact_email: hit.contact_email,
    contact_cell: hit.contact_cell,
    quote_link_channel: hit.quote_link_channel,
  }
}

/** Minimal candidate so desk search picks can spool offers. */
export function candidateFromDeskHit(hit: DeskOperatorHit): Candidate {
  return {
    operator_id: hit.operator_id,
    operator_name: hit.name,
    aircraft_id: hit.aircraft_id ?? `desk-${hit.operator_id}`,
    tail: hit.tail ?? 'TBD',
    type_name: hit.type_name,
    mtow_lbs: null,
    cost: 0,
    price: 0,
    chain: [],
    confidence: hit.aircraft_id ? 0.55 : 0.35,
    needsInfo: hit.aircraft_id ? [] : ['Confirm aircraft / tail'],
    bookingGated: false,
    reasoning: ['Added from desk operator search'],
    eta_end: new Date().toISOString(),
    circuit_nm: 0,
    rate_per_nm: 0,
    rate_source: 'assumption',
  }
}

export function __resetDeskAddedOperatorsForTests(): void {
  memoryDeskAdded = []
  if (!storageAvailable()) return
  try {
    localStorage.removeItem(DESK_OPS_KEY)
  } catch {
    /* ignore */
  }
}
