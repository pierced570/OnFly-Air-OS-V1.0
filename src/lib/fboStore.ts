/**
 * Session FBO directory (schema: fbos + airports) — syncs to Supabase when configured.
 */

export type FboRow = {
  id: string
  name: string
  airport_icao: string
  phone: string
  after_hours_phone: string
  is_24hr: boolean
  forklift: boolean
  forklift_capacity_lbs: number | null
  gl_insurance: boolean
  gl_coverage: number | null
  fee_handling: number | null
  fee_ramp: number | null
  fee_overnight: number | null
  fee_callout: number | null
  fees_waived_with_fuel: boolean
  street: string
  city: string
  state: string
  zip: string
  lat: number | null
  lon: number | null
  notes: string
  last_verified: string
  needs_info: string[]
}

const fbos = new Map<string, FboRow>()
const listeners = new Set<() => void>()
let snapshot: FboRow[] = []

function rebuild() {
  snapshot = [...fbos.values()].sort(
    (a, b) =>
      a.airport_icao.localeCompare(b.airport_icao) ||
      a.name.localeCompare(b.name),
  )
}

function bump(persistId?: string) {
  rebuild()
  for (const l of listeners) l()
  if (persistId) {
    const row = fbos.get(persistId)
    if (row) void import('@/lib/db/persist').then((m) => m.persistFbo(row))
  }
}

function seed() {
  if (fbos.size) return
  const today = new Date().toISOString().slice(0, 10)
  const seeds: Omit<FboRow, 'id'>[] = [
    {
      name: 'Signature Flight Support',
      airport_icao: 'KTEB',
      phone: '+12015550101',
      after_hours_phone: '+12015550102',
      is_24hr: true,
      forklift: true,
      forklift_capacity_lbs: 5000,
      gl_insurance: true,
      gl_coverage: 5_000_000,
      fee_handling: 85,
      fee_ramp: 40,
      fee_overnight: 120,
      fee_callout: 150,
      fees_waived_with_fuel: true,
      street: '100 Industrial Ave',
      city: 'Teterboro',
      state: 'NJ',
      zip: '07608',
      lat: 40.85,
      lon: -74.061,
      notes: 'Preferred for night cargo',
      last_verified: today,
      needs_info: [],
    },
    {
      name: 'Atlantic Aviation',
      airport_icao: 'KPDK',
      phone: '+14045550101',
      after_hours_phone: '',
      is_24hr: false,
      forklift: true,
      forklift_capacity_lbs: 3000,
      gl_insurance: true,
      gl_coverage: 2_000_000,
      fee_handling: 65,
      fee_ramp: 35,
      fee_overnight: 90,
      fee_callout: 200,
      fees_waived_with_fuel: false,
      street: '2000 Airport Rd',
      city: 'Atlanta',
      state: 'GA',
      zip: '30341',
      lat: 33.875,
      lon: -84.302,
      notes: '',
      last_verified: today,
      needs_info: ['after_hours_phone'],
    },
    {
      name: 'Wilson Air Center',
      airport_icao: 'KMEM',
      phone: '+19015550101',
      after_hours_phone: '+19015550199',
      is_24hr: true,
      forklift: true,
      forklift_capacity_lbs: 8000,
      gl_insurance: true,
      gl_coverage: 10_000_000,
      fee_handling: 70,
      fee_ramp: 30,
      fee_overnight: 80,
      fee_callout: 100,
      fees_waived_with_fuel: true,
      street: '2488 Winchester Rd',
      city: 'Memphis',
      state: 'TN',
      zip: '38116',
      lat: 35.042,
      lon: -89.979,
      notes: 'Strong cargo desk',
      last_verified: today,
      needs_info: [],
    },
  ]
  for (const s of seeds) {
    const id = crypto.randomUUID()
    fbos.set(id, { ...s, id })
  }
  rebuild()
}

seed()

export function replaceFbosFromDb(rows: FboRow[]): void {
  if (!rows.length) return
  fbos.clear()
  for (const r of rows) fbos.set(r.id, r)
  rebuild()
  for (const l of listeners) l()
}

export function subscribeFbos(fn: () => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

export function listFbos(): FboRow[] {
  return snapshot
}

export function getFbo(id: string): FboRow | undefined {
  return fbos.get(id)
}

export function addFbo(
  input: Omit<FboRow, 'id' | 'last_verified' | 'needs_info'> & {
    needs_info?: string[]
    last_verified?: string
  },
): FboRow {
  const id = crypto.randomUUID()
  const row: FboRow = {
    ...input,
    id,
    street: input.street ?? '',
    city: input.city ?? '',
    state: input.state ?? '',
    zip: input.zip ?? '',
    lat: input.lat ?? null,
    lon: input.lon ?? null,
    last_verified:
      input.last_verified ?? new Date().toISOString().slice(0, 10),
    needs_info: input.needs_info ?? [],
  }
  fbos.set(id, row)
  bump(id)
  return row
}

export function updateFbo(
  id: string,
  patch: Partial<Omit<FboRow, 'id'>>,
): FboRow | undefined {
  const row = fbos.get(id)
  if (!row) return undefined
  Object.assign(row, patch)
  bump(id)
  return row
}

export function deleteFbo(id: string): boolean {
  if (!fbos.has(id)) return false
  fbos.delete(id)
  rebuild()
  for (const l of listeners) l()
  void import('@/lib/db/persist').then((m) => m.deleteFboFromDb(id))
  return true
}

/** Flag common gaps so the board surfaces NEEDS-INFO. */
export function fboNeedsInfoFrom(row: Pick<
  FboRow,
  | 'phone'
  | 'after_hours_phone'
  | 'is_24hr'
  | 'forklift'
  | 'forklift_capacity_lbs'
  | 'gl_insurance'
  | 'fee_handling'
  | 'street'
>): string[] {
  const needs: string[] = []
  if (!row.phone.trim()) needs.push('phone')
  if (!row.is_24hr && !row.after_hours_phone.trim()) {
    needs.push('after_hours_phone')
  }
  if (row.forklift && row.forklift_capacity_lbs == null) {
    needs.push('forklift_capacity_lbs')
  }
  if (row.fee_handling == null) needs.push('fee_handling')
  if (!row.street.trim()) needs.push('street')
  return needs
}

/** Prefer 24hr + forklift + insured for cargo airport choice. */
export function rankFbosForCargo(icao: string): FboRow[] {
  return snapshot
    .filter((f) => f.airport_icao.toUpperCase() === icao.toUpperCase())
    .sort((a, b) => score(b) - score(a))
}

export function bestFboForAirport(icao: string): FboRow | undefined {
  return rankFbosForCargo(icao)[0]
}

/** Handling + optional after-hours callout for quote costing. */
export function fboFeesForAirport(
  icao: string,
  afterHours = false,
): { fee: number; fbo: FboRow | null; reasoning: string[] } {
  const fbo = bestFboForAirport(icao) ?? null
  if (!fbo) return { fee: 0, fbo: null, reasoning: [] }
  let fee = fbo.fee_handling ?? 0
  const reasoning = [`FBO ${fbo.name} @ ${icao}`]
  if (afterHours && fbo.fee_callout) {
    fee += fbo.fee_callout
    reasoning.push(`+ callout $${fbo.fee_callout}`)
  }
  if (fbo.fee_handling != null) reasoning.push(`handling $${fbo.fee_handling}`)
  return { fee, fbo, reasoning }
}

function score(f: FboRow): number {
  let s = 0
  if (f.is_24hr) s += 3
  if (f.forklift) s += 3
  if (f.gl_insurance) s += 2
  if (f.fees_waived_with_fuel) s += 1
  if (f.street) s += 1
  return s
}
