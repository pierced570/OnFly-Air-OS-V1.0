/**
 * Session FBO directory (schema: fbos + airports).
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
  notes: string
  last_verified: string
  needs_info: string[]
}

const fbos = new Map<string, FboRow>()
const listeners = new Set<() => void>()
let snapshot: FboRow[] = []

function rebuild() {
  snapshot = [...fbos.values()].sort((a, b) =>
    a.airport_icao.localeCompare(b.airport_icao) || a.name.localeCompare(b.name),
  )
}

function bump() {
  rebuild()
  for (const l of listeners) l()
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
  },
): FboRow {
  const id = crypto.randomUUID()
  const row: FboRow = {
    ...input,
    id,
    last_verified: new Date().toISOString().slice(0, 10),
    needs_info: input.needs_info ?? [],
  }
  fbos.set(id, row)
  bump()
  return row
}

export function updateFbo(
  id: string,
  patch: Partial<Omit<FboRow, 'id'>>,
): FboRow | undefined {
  const row = fbos.get(id)
  if (!row) return undefined
  Object.assign(row, patch)
  bump()
  return row
}

/** Prefer 24hr + forklift + insured for cargo airport choice. */
export function rankFbosForCargo(icao: string): FboRow[] {
  return snapshot
    .filter((f) => f.airport_icao.toUpperCase() === icao.toUpperCase())
    .sort((a, b) => score(b) - score(a))
}

function score(f: FboRow): number {
  let s = 0
  if (f.is_24hr) s += 3
  if (f.forklift) s += 3
  if (f.gl_insurance) s += 2
  if (f.fees_waived_with_fuel) s += 1
  return s
}
