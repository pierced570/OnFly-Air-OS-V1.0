/**
 * Part 135 State Fleet Browser — pure filter/sort/roll-up logic.
 * Data pack keys: faa_cert (operator), tail (aircraft). Spec: State Fleet Browser.
 */

/** Fixed category order — use everywhere (§2.4). */
export const PART135_CATS = [
  'MEP',
  'MET',
  'SET',
  'Light Jet',
  'VLJ',
  'CARGO',
  'SEP',
] as const

export type Part135Category = (typeof PART135_CATS)[number]

export const PART135_CAT_LABELS: Record<Part135Category, string> = {
  MEP: 'ME piston',
  MET: 'ME turboprop',
  SET: 'SE turboprop',
  'Light Jet': 'Light jet',
  VLJ: 'VLJ',
  CARGO: 'Cargo spec.',
  SEP: 'SE piston',
}

/**
 * Workhorse type names — keep in one place so Pierce can extend (§2.5).
 * Matching is substring / starts-with on normalized aircraft_type.
 */
export const PART135_WORKHORSE_TYPES = [
  'Cessna 310',
  'Cessna 340',
  'Cessna 402',
  'Cessna 404',
  'Cessna 414',
  'Cessna 421',
  'Beechcraft Baron 58',
  'Baron 58',
  'King Air 90',
  'King Air C90',
  'King Air 100',
  'King Air 200',
  'Piper Navajo',
  'Piper Navajo Chieftain',
  'Piper Cheyenne',
  'Piper Aerostar',
  'Mitsubishi MU-2',
  'MU-2',
  'Cessna Caravan',
  'Pilatus PC-12',
  'Fairchild Metroliner',
  'Beechcraft 99',
  'Beechcraft 1900',
  'Beech 99',
  'Beech 1900',
  'Dassault Falcon 20',
  'Falcon 20',
  'Learjet 35',
  'Learjet 36',
] as const

export type Part135OnflyStatus =
  | 'approved'
  | 'prospect'
  | 'skip_jetcard_fractional'
  | 'skip_broker_nonop'
  | 'skip_defunct'
  | 'air_medical'
  | 'unclassified'

export type Part135StateSource =
  | 'onfly_approved_base'
  | 'operator_base_lookup'
  | 'fsdo_estimate'

export type Part135Aircraft = {
  tail: string
  aircraft_type: string
  faa_code: string
  category: Part135Category | string
  engines: number
  workhorse: boolean
  onfly_flown_type: boolean
  freight_history: boolean
  serial?: string
}

export type Part135Operator = {
  state: string
  state_source: Part135StateSource | string
  operator: string
  faa_cert: string
  cfr_part: string
  fsdo?: string
  fsdo_office?: string
  onfly_approved: boolean
  onfly_status: Part135OnflyStatus | string
  onfly_name: string
  onfly_base: string
  onfly_usefulness: string
  onfly_callout: string
  onfly_caps: string
  cert_note: string
  tails_total: number
  workhorse_tails: number
  freight_tails: number
  SEP: number
  MEP: number
  SET: number
  MET: number
  VLJ: number
  Light_Jet: number
  CARGO: number
  workhorse_types: string
  fleet_summary: string
  aircraft: Part135Aircraft[]
}

export type Part135FleetPack = {
  /** ISO date or datetime from the data pack. */
  generated?: string
  generated_at?: string
  source?: string
  categories?: Record<string, string>
  states: Record<string, Part135Operator[]>
}

export type Part135Filters = {
  state: string
  q: string
  approvedOnly: boolean
  workhorseOps: boolean
  freightTypes: boolean
  /** Hide skip_* statuses (never drops approved). Default true. */
  hideSkip: boolean
  /** Hide AK / HI / PR. Default true. */
  hideAkHiPr: boolean
  cats: Set<string>
  openAllStates: boolean
}

export type Part135CatCounts = Record<Part135Category, number>

export type Part135StateRollup = {
  state: string
  operators: Part135Operator[]
  operator_count: number
  tails_total: number
  workhorse_tails: number
  approved_count: number
  approved_names: string[]
  cats: Part135CatCounts
}

export const US_STATE_NAMES_FLEET: Record<string, string> = {
  AL: 'Alabama',
  AK: 'Alaska',
  AZ: 'Arizona',
  AR: 'Arkansas',
  CA: 'California',
  CO: 'Colorado',
  CT: 'Connecticut',
  DC: 'District of Columbia',
  DE: 'Delaware',
  FL: 'Florida',
  GA: 'Georgia',
  HI: 'Hawaii',
  ID: 'Idaho',
  IL: 'Illinois',
  IN: 'Indiana',
  IA: 'Iowa',
  KS: 'Kansas',
  KY: 'Kentucky',
  LA: 'Louisiana',
  ME: 'Maine',
  MD: 'Maryland',
  MA: 'Massachusetts',
  MI: 'Michigan',
  MN: 'Minnesota',
  MS: 'Mississippi',
  MO: 'Missouri',
  MT: 'Montana',
  NE: 'Nebraska',
  NV: 'Nevada',
  NH: 'New Hampshire',
  NJ: 'New Jersey',
  NM: 'New Mexico',
  NY: 'New York',
  NC: 'North Carolina',
  ND: 'North Dakota',
  OH: 'Ohio',
  OK: 'Oklahoma',
  OR: 'Oregon',
  PA: 'Pennsylvania',
  PR: 'Puerto Rico',
  RI: 'Rhode Island',
  SC: 'South Carolina',
  SD: 'South Dakota',
  TN: 'Tennessee',
  TX: 'Texas',
  UT: 'Utah',
  VT: 'Vermont',
  VA: 'Virginia',
  WA: 'Washington',
  WV: 'West Virginia',
  WI: 'Wisconsin',
  WY: 'Wyoming',
}

export function defaultPart135Filters(): Part135Filters {
  return {
    state: '',
    q: '',
    approvedOnly: false,
    workhorseOps: false,
    freightTypes: false,
    hideSkip: true,
    hideAkHiPr: true,
    cats: new Set(PART135_CATS),
    openAllStates: false,
  }
}

export function emptyCatCounts(): Part135CatCounts {
  return {
    MEP: 0,
    MET: 0,
    SET: 0,
    'Light Jet': 0,
    VLJ: 0,
    CARGO: 0,
    SEP: 0,
  }
}

/** Map operator row Light_Jet field → category code. */
export function operatorCatCount(
  op: Part135Operator,
  cat: Part135Category,
): number {
  switch (cat) {
    case 'MEP':
      return op.MEP || 0
    case 'MET':
      return op.MET || 0
    case 'SET':
      return op.SET || 0
    case 'Light Jet':
      return op.Light_Jet || 0
    case 'VLJ':
      return op.VLJ || 0
    case 'CARGO':
      return op.CARGO || 0
    case 'SEP':
      return op.SEP || 0
  }
}

export function normalizeCategory(raw: string): Part135Category | string {
  const s = raw.trim()
  if ((PART135_CATS as readonly string[]).includes(s)) return s
  if (s === 'Light_Jet' || s === 'Light jet') return 'Light Jet'
  if (s === 'Cargo spec.' || s === 'Cargo') return 'CARGO'
  return s
}

export function categorySortIndex(cat: string): number {
  const n = normalizeCategory(cat)
  const i = PART135_CATS.indexOf(n as Part135Category)
  return i >= 0 ? i : 99
}

/** Status pill label + tone (§3.4). */
export function part135StatusPill(status: string): {
  label: string
  tone: 'gold' | 'neutral' | 'bad' | 'warn'
} {
  switch (status) {
    case 'approved':
      return { label: 'Approved', tone: 'gold' }
    case 'prospect':
      return { label: 'Prospect', tone: 'neutral' }
    case 'skip_jetcard_fractional':
      return { label: 'Jet card / fractional', tone: 'bad' }
    case 'skip_broker_nonop':
      return { label: 'Broker / non-op', tone: 'bad' }
    case 'skip_defunct':
      return { label: 'Defunct', tone: 'bad' }
    case 'air_medical':
      return { label: 'Air medical', tone: 'warn' }
    case 'unclassified':
      return { label: 'Unclassified', tone: 'neutral' }
    default:
      return { label: status || 'Unclassified', tone: 'neutral' }
  }
}

/**
 * Operator passes sticky filters (AND). Mirrors prototype `pass()`.
 */
export function part135OperatorPasses(
  op: Part135Operator,
  f: Part135Filters,
): boolean {
  if (f.state && op.state !== f.state) return false
  if (f.hideAkHiPr && (op.state === 'AK' || op.state === 'HI' || op.state === 'PR')) {
    return false
  }
  if (f.approvedOnly && !op.onfly_approved) return false
  if (f.workhorseOps && op.workhorse_tails === 0) return false
  if (f.freightTypes && op.freight_tails === 0) return false
  if (
    f.hideSkip &&
    !op.onfly_approved &&
    /^skip/i.test(String(op.onfly_status ?? ''))
  ) {
    return false
  }
  const hasCat = PART135_CATS.some(
    (c) => f.cats.has(c) && operatorCatCount(op, c) > 0,
  )
  if (!hasCat) return false

  const q = f.q.trim().toLowerCase()
  if (q) {
    const cert = String(op.faa_cert ?? '').toLowerCase()
    const hit =
      String(op.operator ?? '')
        .toLowerCase()
        .includes(q) ||
      String(op.onfly_name ?? '')
        .toLowerCase()
        .includes(q) ||
      String(op.fleet_summary ?? '')
        .toLowerCase()
        .includes(q) ||
      cert === q
    if (!hit) return false
  }
  return true
}

export function sortPart135Operators(
  ops: readonly Part135Operator[],
): Part135Operator[] {
  return [...ops].sort((a, b) => {
    const ap = a.onfly_approved ? 1 : 0
    const bp = b.onfly_approved ? 1 : 0
    if (bp !== ap) return bp - ap
    if (b.workhorse_tails !== a.workhorse_tails) {
      return b.workhorse_tails - a.workhorse_tails
    }
    if (b.tails_total !== a.tails_total) return b.tails_total - a.tails_total
    const an = (a.onfly_name || a.operator).toLowerCase()
    const bn = (b.onfly_name || b.operator).toLowerCase()
    return an.localeCompare(bn)
  })
}

export function sortPart135Aircraft(
  tails: readonly Part135Aircraft[],
): Part135Aircraft[] {
  return [...tails].sort((a, b) => {
    const ca = categorySortIndex(a.category)
    const cb = categorySortIndex(b.category)
    if (ca !== cb) return ca - cb
    const ta = a.aircraft_type.localeCompare(b.aircraft_type)
    if (ta !== 0) return ta
    return a.tail.localeCompare(b.tail)
  })
}

/** Tails visible under current category chips. */
export function filteredPart135Aircraft(
  op: Part135Operator,
  cats: Set<string>,
): Part135Aircraft[] {
  const list = (op.aircraft ?? []).filter((a) => {
    const c = normalizeCategory(String(a.category ?? ''))
    return cats.has(c)
  })
  return sortPart135Aircraft(list)
}

export function workhorseTypeNames(op: Part135Operator): Set<string> {
  const set = new Set<string>()
  const raw = String(op.workhorse_types ?? '')
  // "Cessna 310 (4), Cessna 404 Titan (2)"
  for (const part of raw.split(',')) {
    const name = part.replace(/\(\d+\)\s*$/, '').trim()
    if (name) set.add(name.toLowerCase())
  }
  return set
}

export function isWorkhorseTypeInSummary(
  typeName: string,
  workhorseTypes: Set<string>,
): boolean {
  const n = typeName.trim().toLowerCase()
  if (!n) return false
  if (workhorseTypes.has(n)) return true
  for (const w of workhorseTypes) {
    if (n.startsWith(w) || w.startsWith(n)) return true
  }
  return false
}

/** Parse fleet_summary into { type, count, workhorse } segments. */
export function parseFleetSummarySegments(
  fleetSummary: string,
  workhorseTypes: Set<string>,
): Array<{ type: string; count: number | null; workhorse: boolean }> {
  const out: Array<{ type: string; count: number | null; workhorse: boolean }> =
    []
  for (const part of String(fleetSummary ?? '').split(',')) {
    const trimmed = part.trim()
    if (!trimmed) continue
    const m = trimmed.match(/^(.*?)(?:\s*\((\d+)\))?$/)
    const type = (m?.[1] ?? trimmed).trim()
    const count = m?.[2] ? Number(m[2]) : null
    out.push({
      type,
      count: Number.isFinite(count) ? count : null,
      workhorse: isWorkhorseTypeInSummary(type, workhorseTypes),
    })
  }
  return out
}

export function rollupState(
  state: string,
  operators: readonly Part135Operator[],
): Part135StateRollup {
  const cats = emptyCatCounts()
  let tails_total = 0
  let workhorse_tails = 0
  const approved_names: string[] = []
  for (const op of operators) {
    tails_total += op.tails_total || 0
    workhorse_tails += op.workhorse_tails || 0
    for (const c of PART135_CATS) {
      cats[c] += operatorCatCount(op, c)
    }
    if (op.onfly_approved) {
      approved_names.push(op.onfly_name?.trim() || op.operator)
    }
  }
  return {
    state,
    operators: [...operators],
    operator_count: operators.length,
    tails_total,
    workhorse_tails,
    approved_count: approved_names.length,
    approved_names,
    cats,
  }
}

/**
 * Apply filters, group by state, sort states + operators.
 * State order: approved count desc → workhorse desc → state code.
 */
export function buildPart135FleetView(
  pack: Part135FleetPack,
  filters: Part135Filters,
): {
  states: Part135StateRollup[]
  total_operators: number
  empty: boolean
} {
  const byState = new Map<string, Part135Operator[]>()

  for (const [st, list] of Object.entries(pack.states ?? {})) {
    for (const op of list) {
      const row: Part135Operator = {
        ...op,
        state: op.state || st,
      }
      if (!part135OperatorPasses(row, filters)) continue
      const key = row.state
      const bucket = byState.get(key)
      if (bucket) bucket.push(row)
      else byState.set(key, [row])
    }
  }

  const states = [...byState.entries()]
    .map(([state, ops]) => rollupState(state, sortPart135Operators(ops)))
    .sort(
      (a, b) =>
        b.approved_count - a.approved_count ||
        b.workhorse_tails - a.workhorse_tails ||
        a.state.localeCompare(b.state),
    )

  const total_operators = states.reduce((n, s) => n + s.operator_count, 0)
  return {
    states,
    total_operators,
    empty: total_operators === 0,
  }
}

export function listPart135StateOptions(
  pack: Part135FleetPack,
): Array<{ code: string; label: string }> {
  const codes = Object.keys(pack.states ?? {}).sort()
  return codes.map((code) => ({
    code,
    label: US_STATE_NAMES_FLEET[code] ?? code,
  }))
}

/** Split approved vs everyone else for band separators. */
export function splitApprovedBands(ops: readonly Part135Operator[]): {
  approved: Part135Operator[]
  rest: Part135Operator[]
} {
  const approved: Part135Operator[] = []
  const rest: Part135Operator[] = []
  for (const op of ops) {
    if (op.onfly_approved) approved.push(op)
    else rest.push(op)
  }
  return { approved, rest }
}

/** Unfiltered pack totals for the header stats band. */
export type Part135PackStats = {
  states: number
  operators: number
  tails: number
  approvedOperators: number
  approvedTails: number
}

export function buildPart135PackStats(pack: Part135FleetPack): Part135PackStats {
  let operators = 0
  let tails = 0
  let approvedOperators = 0
  let approvedTails = 0
  for (const list of Object.values(pack.states ?? {})) {
    for (const op of list) {
      operators += 1
      tails += op.tails_total || 0
      if (op.onfly_approved) {
        approvedOperators += 1
        approvedTails += op.tails_total || 0
      }
    }
  }
  return {
    states: Object.keys(pack.states ?? {}).length,
    operators,
    tails,
    approvedOperators,
    approvedTails,
  }
}

/** One row from the OnFly approved-operators CSV export. */
export type Part135ApprovedCsvRow = {
  state: string
  operator: string
  company_as_listed: string
  base: string
  verified_address: string
  address_state: string
  state_conflict: string
  faa_cert: string
  in_faa_135_list: boolean
  cert_note: string
  usefulness: string
  callout: string
  pax: boolean
  cargo: boolean
  hazmat: boolean
  medivac: boolean
  ops_24hr: boolean
  tails_listed: number
  fleet_summary: string
  workhorse_tails_on_faa_cert: number
  notes: string
}

/** Display row for “Your network by state”. */
export type Part135ApprovedNetworkRow = {
  state: string
  name: string
  faa_name: string
  base: string
  faa_cert: string
  in_faa_135_list: boolean
  cert_note: string
  usefulness: string
  callout: string
  caps: string
  tails: number
  workhorse_tails: number
  fleet_summary: string
  notes: string
  state_conflict: boolean
  /** True when the CSV row has no matching FAA-pack operator. */
  csv_only: boolean
}

export function formatApprovedCaps(row: {
  pax?: boolean
  cargo?: boolean
  hazmat?: boolean
  medivac?: boolean
  ops_24hr?: boolean
}): string {
  const parts: string[] = []
  if (row.pax) parts.push('Pax')
  if (row.cargo) parts.push('Cargo')
  if (row.hazmat) parts.push('Hazmat')
  if (row.medivac) parts.push('Medivac')
  if (row.ops_24hr) parts.push('24hr')
  return parts.join(' · ')
}

function indexApprovedByCert(
  pack: Part135FleetPack,
): Map<string, Part135Operator> {
  const byCert = new Map<string, Part135Operator>()
  for (const [st, list] of Object.entries(pack.states ?? {})) {
    for (const op of list) {
      if (!op.onfly_approved) continue
      const cert = (op.faa_cert || '').trim().toUpperCase()
      if (!cert) continue
      byCert.set(cert, { ...op, state: op.state || st })
    }
  }
  return byCert
}

function networkRowFromPackOp(op: Part135Operator): Part135ApprovedNetworkRow {
  return {
    state: op.state,
    name: op.onfly_name?.trim() || op.operator,
    faa_name: op.operator,
    base: op.onfly_base || '',
    faa_cert: (op.faa_cert || '').trim().toUpperCase(),
    in_faa_135_list: true,
    cert_note: op.cert_note || '',
    usefulness: op.onfly_usefulness || '',
    callout: op.onfly_callout || '',
    caps: op.onfly_caps || '',
    tails: op.tails_total || 0,
    workhorse_tails: op.workhorse_tails || 0,
    fleet_summary: op.fleet_summary || '',
    notes: '',
    state_conflict: false,
    csv_only: false,
  }
}

/**
 * Build the approved-network table. When `csvExtras` is provided (the OnFly
 * approved-operators CSV), merge it so ~5 non-FAA approved ops still appear.
 * Without CSV, fall back to pack `onfly_approved` rows only.
 */
export function listApprovedNetworkRows(
  pack: Part135FleetPack,
  csvExtras?: readonly Part135ApprovedCsvRow[],
): Part135ApprovedNetworkRow[] {
  const byCert = indexApprovedByCert(pack)

  if (!csvExtras?.length) {
    return [...byCert.values()]
      .map(networkRowFromPackOp)
      .sort(
        (a, b) =>
          a.state.localeCompare(b.state) ||
          a.name.localeCompare(b.name) ||
          a.faa_cert.localeCompare(b.faa_cert),
      )
  }

  const rows: Part135ApprovedNetworkRow[] = []
  const seenCerts = new Set<string>()

  for (const csv of csvExtras) {
    const cert = (csv.faa_cert || '').trim().toUpperCase()
    const packOp = cert ? byCert.get(cert) : undefined
    if (cert) seenCerts.add(cert)
    const caps =
      formatApprovedCaps(csv) || (packOp?.onfly_caps?.trim() ?? '')
    rows.push({
      state: csv.state || packOp?.state || '',
      name: csv.operator || packOp?.onfly_name || packOp?.operator || '',
      faa_name:
        packOp?.operator || csv.company_as_listed || csv.operator || '',
      base: csv.base || packOp?.onfly_base || '',
      faa_cert: cert || packOp?.faa_cert || '',
      in_faa_135_list: Boolean(csv.in_faa_135_list) || Boolean(packOp),
      cert_note: csv.cert_note || packOp?.cert_note || '',
      usefulness: csv.usefulness || packOp?.onfly_usefulness || '',
      callout: csv.callout || packOp?.onfly_callout || '',
      caps,
      tails: packOp?.tails_total ?? csv.tails_listed ?? 0,
      workhorse_tails:
        packOp?.workhorse_tails ?? csv.workhorse_tails_on_faa_cert ?? 0,
      fleet_summary: packOp?.fleet_summary || csv.fleet_summary || '',
      notes: csv.notes || '',
      state_conflict: String(csv.state_conflict || '')
        .toUpperCase()
        .includes('CHECK'),
      csv_only: !packOp,
    })
  }

  // Pack-approved certs missing from the CSV still show (flag, don't exclude).
  for (const [cert, op] of byCert) {
    if (seenCerts.has(cert)) continue
    rows.push(networkRowFromPackOp(op))
  }

  return rows.sort(
    (a, b) =>
      a.state.localeCompare(b.state) ||
      a.name.localeCompare(b.name) ||
      a.faa_cert.localeCompare(b.faa_cert),
  )
}

/** Unfiltered per-state rollup for the “State rollup” table. */
export function listPart135StateRollupRows(
  pack: Part135FleetPack,
): Part135StateRollup[] {
  return Object.entries(pack.states ?? {})
    .map(([state, ops]) =>
      rollupState(
        state,
        ops.map((op) => ({ ...op, state: op.state || state })),
      ),
    )
    .sort(
      (a, b) =>
        b.approved_count - a.approved_count ||
        b.workhorse_tails - a.workhorse_tails ||
        a.state.localeCompare(b.state),
    )
}

export const PART135_FLEET_CAVEATS = [
  'FSDO multi-state offices can misplace an operator’s state — confirm address before relying on FSDO estimate rows.',
  'Four approved operators are not on the FAA Part 135 holder list as named (45 North, Daniel LaMontagne, Jet Nexa, Zanesville); ENG Aviation (T4BA) flies on Thunderbird Airways’ cert and is also absent from the FAA list as ENG.',
  'Rows marked state conflict CHECK have a verified address in a different state than the network base — confirm before pinging.',
  'Aircraft categories come from make / model / series mapping in the data pack, not operator config.',
] as const
