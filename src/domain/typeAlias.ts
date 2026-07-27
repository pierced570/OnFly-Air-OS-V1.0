/**
 * Unify free-text aircraft type entry (Baron / Barron / BE-58, KA90 / C90 / King Air 90).
 * Pure TypeScript — pass an optional catalog (type_specs + fleet) for fuzzy resolution.
 */

export type AircraftTypeMatchKind =
  | 'exact'
  | 'alias'
  | 'compact'
  | 'fuzzy'
  | 'unknown'

export type AircraftTypeMatch = {
  /** Canonical display label */
  canonical: string
  /** What the dispatcher typed (trimmed) */
  raw: string
  kind: AircraftTypeMatchKind
  score: number
  /** Catalog hit when resolved against known types */
  catalog?: string
}

/** Preferred display names — aliases collapse here. */
export const CANONICAL_AIRCRAFT_TYPES = [
  'Aerostar',
  'Baron 58',
  'Beech 99',
  'Beech 1900',
  'Bonanza',
  'Cessna 172',
  'Cessna 182',
  'Cessna 206',
  'Cessna 208B Grand Caravan',
  'Cessna 310',
  'Cessna 340',
  'Cessna 401',
  'Cessna 402',
  'Cessna 404',
  'Cessna Caravan',
  'Challenger 300',
  'Challenger 600',
  'Cheyenne',
  'Cirrus Vision SF50',
  'Citation 550',
  'Citation Bravo',
  'Citation CJ1',
  'Citation CJ2',
  'Citation CJ3',
  'Citation Ultra',
  'Citation XL',
  'Citation XLS',
  'Diamond DA-42',
  'Embraer Brasilia',
  'Embraer Legacy',
  'Falcon 10',
  'Falcon 20',
  'Falcon 50',
  'Gulfstream G200',
  'Gulfstream GIV',
  'Hawker 800',
  'HondaJet',
  'Islander',
  'King Air 90',
  'King Air 200',
  'King Air 300',
  'King Air 350',
  'Kodiak 100',
  'Learjet 31',
  'Learjet 35',
  'Learjet 45',
  'Learjet 55',
  'Learjet 60',
  'Metroliner',
  'Phenom 100',
  'Pilatus PC-12',
  'Piper Navajo',
  'Piper Seneca',
  'SAAB 340',
  'Saratoga',
  'SR22',
  'TBM 700',
  'TBM 850',
  'TBM 900',
  'Turbo Commander',
] as const

/**
 * Keys are uppercased, compact-ish (spaces allowed). Values are canonical labels.
 * Keep keys specific enough that "90" alone does not steal "King Air 200".
 */
const ALIASES: Record<string, string> = {
  // Baron
  BARRON: 'Baron 58',
  'BARRON 58': 'Baron 58',
  BARON: 'Baron 58',
  'BARON 58': 'Baron 58',
  B58: 'Baron 58',
  'BE 58': 'Baron 58',
  'BE-58': 'Baron 58',
  BE58: 'Baron 58',
  'BEECH BARON': 'Baron 58',
  'BEECHCRAFT BARON': 'Baron 58',
  'BEECHCRAFT BARON 58': 'Baron 58',

  // King Air 90 / C90
  'KING AIR 90': 'King Air 90',
  'KINGAIR 90': 'King Air 90',
  'KING AIR C90': 'King Air 90',
  'KING AIR C90A': 'King Air 90',
  'BEECHCRAFT KING AIR C90A': 'King Air 90',
  'BEECHCRAFT KING AIR 90': 'King Air 90',
  'BEECH KING AIR 90': 'King Air 90',
  KA90: 'King Air 90',
  'KA 90': 'King Air 90',
  'KA-90': 'King Air 90',
  C90: 'King Air 90',
  'C-90': 'King Air 90',
  'C 90': 'King Air 90',
  C90A: 'King Air 90',
  'C90 A': 'King Air 90',
  'BE-9L': 'King Air 90',
  BE9L: 'King Air 90',

  // King Air 200 / B200
  'KING AIR 200': 'King Air 200',
  'KINGAIR 200': 'King Air 200',
  'KING AIR B200': 'King Air 200',
  KA200: 'King Air 200',
  'KA 200': 'King Air 200',
  'KA-200': 'King Air 200',
  B200: 'King Air 200',
  'B-200': 'King Air 200',
  'BE-20': 'King Air 200',
  BE20: 'King Air 200',
  'BEECH 200': 'King Air 200',

  // King Air 300 / 350
  'KING AIR 300': 'King Air 300',
  KA300: 'King Air 300',
  'KA 300': 'King Air 300',
  B300: 'King Air 300',
  'KING AIR 350': 'King Air 350',
  KA350: 'King Air 350',
  'KA 350': 'King Air 350',
  B350: 'King Air 350',

  // Cessna singles / twins
  C172: 'Cessna 172',
  'C-172': 'Cessna 172',
  'CESSNA 172': 'Cessna 172',
  C182: 'Cessna 182',
  'C-182': 'Cessna 182',
  C206: 'Cessna 206',
  'C-206': 'Cessna 206',
  C310: 'Cessna 310',
  'C-310': 'Cessna 310',
  'CESSNA 310': 'Cessna 310',
  C340: 'Cessna 340',
  'C-340': 'Cessna 340',
  C401: 'Cessna 401',
  C402: 'Cessna 402',
  'C402B': 'Cessna 402',
  'CESSNA 402B': 'Cessna 402',
  'CESSNA 402': 'Cessna 402',
  C404: 'Cessna 404',

  // Caravan
  CARAVAN: 'Cessna Caravan',
  'CESSNA CARAVAN': 'Cessna Caravan',
  C208: 'Cessna Caravan',
  'C-208': 'Cessna Caravan',
  'C 208': 'Cessna Caravan',
  'GRAND CARAVAN': 'Cessna 208B Grand Caravan',
  'CESSNA 208B': 'Cessna 208B Grand Caravan',
  'CESSNA 208B GRAND CARAVAN': 'Cessna 208B Grand Caravan',
  '208B': 'Cessna 208B Grand Caravan',

  // Citation / CJ
  CJ: 'Citation CJ1',
  CJ1: 'Citation CJ1',
  'CITATION CJ': 'Citation CJ1',
  'CITATION CJ1': 'Citation CJ1',
  CJ2: 'Citation CJ2',
  'CITATION CJ2': 'Citation CJ2',
  CJ3: 'Citation CJ3',
  'CITATION CJ3': 'Citation CJ3',
  'CITATION 525': 'Citation CJ1',
  'CITATION 550': 'Citation 550',
  BRAVO: 'Citation Bravo',
  'CITATION BRAVO': 'Citation Bravo',
  ULTRA: 'Citation Ultra',
  'CITATION ULTRA': 'Citation Ultra',
  XL: 'Citation XL',
  'CITATION XL': 'Citation XL',
  XLS: 'Citation XLS',
  'CITATION XLS': 'Citation XLS',
  'CESSNA CITATION': 'Citation CJ3',

  // Pilatus
  'PC-12': 'Pilatus PC-12',
  PC12: 'Pilatus PC-12',
  'PC 12': 'Pilatus PC-12',
  'PILATUS PC-12': 'Pilatus PC-12',
  'PILATUS PC12': 'Pilatus PC-12',
  PILATUS: 'Pilatus PC-12',

  // Lear
  'LEAR 31': 'Learjet 31',
  LEAR31: 'Learjet 31',
  'LEARJET 31': 'Learjet 31',
  'LEAR 35': 'Learjet 35',
  'LEAR 35A': 'Learjet 35',
  LEAR35: 'Learjet 35',
  'LEARJET 35': 'Learjet 35',
  'LEAR 45': 'Learjet 45',
  LEAR45: 'Learjet 45',
  'LEARJET 45': 'Learjet 45',
  'LEAR 55': 'Learjet 55',
  'LEARJET 55': 'Learjet 55',
  'LEAR 60': 'Learjet 60',
  'LEARJET 60': 'Learjet 60',

  // Falcon
  'FALCON 10': 'Falcon 10',
  'FALCON 20': 'Falcon 20',
  'AMD FALCON 20': 'Falcon 20',
  'FALCON 50': 'Falcon 50',

  // Misc
  'HONDA JET': 'HondaJet',
  HONDAJET: 'HondaJet',
  HAWKER: 'Hawker 800',
  'HAWKER 800': 'Hawker 800',
  'HAWKER 800XP': 'Hawker 800',
  METRO: 'Metroliner',
  METROLINER: 'Metroliner',
  NAVAJO: 'Piper Navajo',
  'PIPER NAVAJO': 'Piper Navajo',
  'NAVAJO C/R': 'Piper Navajo',
  'PIPER NAVAJO C/R': 'Piper Navajo',
  SENECA: 'Piper Seneca',
  'PIPER SENECA': 'Piper Seneca',
  CHEYENNE: 'Cheyenne',
  'PIPER CHEYENNE': 'Cheyenne',
  TBM: 'TBM 700',
  'TBM 700': 'TBM 700',
  'TBM700': 'TBM 700',
  'TBM 850': 'TBM 850',
  'TBM 900': 'TBM 900',
  SR22: 'SR22',
  'SR-22': 'SR22',
  'CIRRUS SR22': 'SR22',
  'SF50': 'Cirrus Vision SF50',
  'VISION JET': 'Cirrus Vision SF50',
  'CIRRUS VISION': 'Cirrus Vision SF50',
  'CIRRUS VISION SF50': 'Cirrus Vision SF50',
  KODIAK: 'Kodiak 100',
  'KODIAK 100': 'Kodiak 100',
  'SAAB 340': 'SAAB 340',
  'EMB BRASILIA': 'Embraer Brasilia',
  'EMB. BRASILIA': 'Embraer Brasilia',
  BRASILIA: 'Embraer Brasilia',
  'EMBRARER BRASILIA': 'Embraer Brasilia',
  'EMBRAER BRASILIA': 'Embraer Brasilia',
  'EMBRARER LEGACY': 'Embraer Legacy',
  'EMBRAER LEGACY': 'Embraer Legacy',
  'EMBRARER BANDIT': 'Embraer Legacy',
  DA42: 'Diamond DA-42',
  'DA-42': 'Diamond DA-42',
  'DIAMOND DA-42': 'Diamond DA-42',
  'GULFSTREAM G200': 'Gulfstream G200',
  G200: 'Gulfstream G200',
  'GULFSTREAM GIV': 'Gulfstream GIV',
  GIV: 'Gulfstream GIV',
  'CHALLENGER 300': 'Challenger 300',
  'CHALLENGER 600': 'Challenger 600',
  'BEACH 1900': 'Beech 1900',
  'BEECH 1900': 'Beech 1900',
  '1900D': 'Beech 1900',
  'BEACH 99': 'Beech 99',
  'BEECH 99': 'Beech 99',
  BONANZA: 'Bonanza',
  AEROSTAR: 'Aerostar',
  ISLANDER: 'Islander',
  'TURBO COMMANDER': 'Turbo Commander',
  COMMANDER: 'Turbo Commander',
  SARATOGA: 'Saratoga',
  PHENOM: 'Phenom 100',
  'PHENOM 100': 'Phenom 100',
}

/** Normalize for map lookup: upper, collapse spaces/punctuation. */
export function aircraftTypeLookupKey(raw: string): string {
  return raw
    .trim()
    .toUpperCase()
    .replace(/[_./\\]+/g, ' ')
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function aircraftTypeCompact(raw: string): string {
  return aircraftTypeLookupKey(raw).replace(/\s+/g, '')
}

function titleCaseFallback(raw: string): string {
  return raw
    .trim()
    .replace(/\s+/g, ' ')
    .split(' ')
    .map((w) => {
      if (/^[A-Z0-9-]{2,}$/i.test(w) && /\d/.test(w)) return w.toUpperCase()
      // Short all-letter tokens: keep title case (Air, Jet) — not ALL CAPS
      if (w.length <= 2 && /^[A-Z]+$/i.test(w)) return w.toUpperCase()
      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
    })
    .join(' ')
}

/** True when `label` looks like a more-specific model of an under-specified query. */
function underSpecifiedModel(queryKey: string, labelKey: string): boolean {
  const qc = queryKey.replace(/\s+/g, '')
  const nc = labelKey.replace(/\s+/g, '')
  if (!qc || !nc || qc === nc) return false
  if (nc.startsWith(qc)) {
    const rest = nc.slice(qc.length)
    // "kingair" + "90" / "kingair" + "c90" / "citation" + "cj3"
    if (/^\d/.test(rest) || /^[A-Z]*\d/.test(rest)) return true
  }
  if (labelKey.startsWith(queryKey + ' ')) {
    const rest = labelKey.slice(queryKey.length).trim()
    if (/^\d/.test(rest) || /^[A-Z]*\d/i.test(rest.replace(/\s/g, ''))) return true
  }
  return false
}

function aliasHit(raw: string): string | null {
  const key = aircraftTypeLookupKey(raw)
  if (!key) return null
  if (ALIASES[key]) return ALIASES[key]!
  const compact = aircraftTypeCompact(raw)
  for (const [a, v] of Object.entries(ALIASES)) {
    if (aircraftTypeCompact(a) === compact) return v
  }
  // Prefer longer alias keys so "KING AIR 200" wins over bare includes.
  const sorted = Object.entries(ALIASES).sort(
    (a, b) => b[0].length - a[0].length,
  )
  for (const [a, v] of sorted) {
    const ac = aircraftTypeCompact(a)
    // Require substantial alias length for substring hits (avoid "CJ" stealing "CJ3")
    if (a.length < 4 && ac.length < 4) continue
    if (key === a || compact === ac) return v
    // Query contains full alias as a token/phrase (e.g. "BEECHCRAFT BARON 58")
    if (key.includes(a) || (ac.length >= 4 && compact.includes(ac))) {
      if (!underSpecifiedModel(a, key) && !underSpecifiedModel(key, a)) {
        return v
      }
      // Longer alias inside query is fine ("… KING AIR C90A …")
      if (key.includes(a) && a.length >= 8) return v
      if (compact.includes(ac) && ac.length >= 6) return v
    }
  }
  return null
}

function scoreAgainstCatalog(
  raw: string,
  catalog: string[],
): { label: string; score: number; kind: AircraftTypeMatchKind } | null {
  const q = aircraftTypeLookupKey(raw)
  const qc = aircraftTypeCompact(raw)
  if (!q) return null

  let best: { label: string; score: number; kind: AircraftTypeMatchKind } | null =
    null

  for (const label of catalog) {
    const n = aircraftTypeLookupKey(label)
    const nc = aircraftTypeCompact(label)
    if (!n) continue

    let score = -1
    let kind: AircraftTypeMatchKind = 'fuzzy'

    if (n === q || nc === qc) {
      score = 100
      kind = 'exact'
    } else if (nc === qc || n.replace(/\s/g, '') === q.replace(/\s/g, '')) {
      score = 95
      kind = 'compact'
    } else if (underSpecifiedModel(q, n) || underSpecifiedModel(n, q)) {
      // Bare "King Air" must not collapse to King Air 90 / 200 / …
      score = -1
    } else if (n.startsWith(q) || nc.startsWith(qc) || q.startsWith(n)) {
      score = 80
      kind = 'fuzzy'
    } else if (
      (n.includes(q) || q.includes(n) || nc.includes(qc) || qc.includes(nc)) &&
      Math.min(q.length, n.length) >= 4
    ) {
      score = 65
      kind = 'fuzzy'
    } else {
      const qTokens = q.split(' ').filter(Boolean)
      const nTokens = new Set(n.split(' '))
      const overlap = qTokens.filter((t) => nTokens.has(t) || t.length >= 3 && [...nTokens].some((nt) => nt.includes(t) || t.includes(nt))).length
      if (overlap > 0) {
        score = 40 + overlap * 12
        kind = 'fuzzy'
      }
    }

    // Typo distance for short single-token misses (Barron vs Baron)
    // Skip when one label is clearly a more-specific model of the other.
    if (
      score < 0 &&
      qc.length >= 4 &&
      nc.length >= 4 &&
      !underSpecifiedModel(q, n) &&
      !underSpecifiedModel(n, q)
    ) {
      const d = levenshtein(qc, nc)
      if (d === 1 && Math.abs(qc.length - nc.length) <= 1) {
        score = 70
        kind = 'fuzzy'
      } else if (d === 2 && qc.length >= 6 && Math.abs(qc.length - nc.length) <= 2) {
        score = 55
        kind = 'fuzzy'
      }
    }

    if (score >= 0 && (!best || score > best.score)) {
      best = { label, score, kind }
    }
  }

  return best
}

function levenshtein(a: string, b: string): number {
  const m = a.length
  const n = b.length
  const dp = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0))
  for (let i = 0; i <= m; i++) dp[i]![0] = i
  for (let j = 0; j <= n; j++) dp[0]![j] = j
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      dp[i]![j] = Math.min(
        dp[i - 1]![j]! + 1,
        dp[i]![j - 1]! + 1,
        dp[i - 1]![j - 1]! + cost,
      )
    }
  }
  return dp[m]![n]!
}

function defaultCatalog(): string[] {
  return [...CANONICAL_AIRCRAFT_TYPES]
}

/**
 * Resolve a free-text aircraft type to a unified canonical label.
 * Pass fleet/`type_specs` names as `catalog` when available.
 */
export function matchAircraftType(
  raw: string,
  catalog?: string[] | null,
): AircraftTypeMatch {
  const trimmed = (raw ?? '').trim()
  if (!trimmed) {
    return { canonical: '', raw: '', kind: 'unknown', score: 0 }
  }

  const cat = [
    ...new Set(
      [...(catalog ?? []), ...defaultCatalog()]
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  ]

  const aliased = aliasHit(trimmed)
  if (aliased) {
    // Prefer catalog spelling when alias target exists under another label
    const catHit = scoreAgainstCatalog(aliased, cat)
    if (catHit && catHit.score >= 80) {
      return {
        canonical: catHit.label,
        raw: trimmed,
        kind: 'alias',
        score: 100,
        catalog: catHit.label,
      }
    }
    return {
      canonical: aliased,
      raw: trimmed,
      kind: 'alias',
      score: 100,
      catalog: aliased,
    }
  }

  const hit = scoreAgainstCatalog(trimmed, cat)
  if (hit && hit.score >= 55) {
    return {
      canonical: hit.label,
      raw: trimmed,
      kind: hit.kind,
      score: hit.score,
      catalog: hit.label,
    }
  }

  return {
    canonical: titleCaseFallback(trimmed),
    raw: trimmed,
    kind: 'unknown',
    score: 0,
  }
}

/** Convenience: always returns a display string (may be title-cased unknown). */
export function normalizeAircraftType(
  raw: string,
  catalog?: string[] | null,
): string {
  return matchAircraftType(raw, catalog).canonical
}

/** @deprecated Prefer normalizeAircraftType — kept for older imports. */
export function normalizeTypeName(raw: string): string {
  return normalizeAircraftType(raw)
}
