/**
 * Build bundled airport catalog from OurAirports open data.
 *
 * Usage:
 *   npx tsx scripts/generate-airports.ts
 *   npx tsx scripts/generate-airports.ts /path/to/airports.csv
 *
 * Source: https://ourairports.com/data/ (airports.csv)
 */

import { createWriteStream, readFileSync, writeFileSync } from 'node:fs'
import { get } from 'node:https'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import { createReadStream } from 'node:fs'
import tzlookup from 'tz-lookup'

const OUT = join(process.cwd(), 'src/data/airports_catalog.json')
const SOURCE =
  'https://davidmegginson.github.io/ourairports-data/airports.csv'

const COUNTRIES = new Set([
  'US',
  'CA',
  'MX',
  'PR',
  'VI',
  'GU',
  'AS',
  'MP',
  'BS',
  'BM',
  'KY',
  'TC',
  'DO',
  'HT',
  'JM',
  'CU',
  'BZ',
  'CR',
  'PA',
  'GT',
  'HN',
  'NI',
  'SV',
])

const TYPES = new Set(['large_airport', 'medium_airport', 'small_airport'])

/** Compact row: icao, name, city, state, iata, lat, lon, tz */
export type CatalogRow = [
  string,
  string,
  string,
  string,
  string,
  number,
  number,
  string,
]

function download(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = createWriteStream(dest)
    get(url, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close()
        download(res.headers.location, dest).then(resolve, reject)
        return
      }
      if (res.statusCode !== 200) {
        reject(new Error(`Download failed: ${res.statusCode}`))
        return
      }
      res.pipe(file)
      file.on('finish', () => file.close(() => resolve()))
    }).on('error', reject)
  })
}

function parseCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let inQ = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQ) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"'
        i++
      } else if (ch === '"') {
        inQ = false
      } else {
        cur += ch
      }
    } else if (ch === '"') {
      inQ = true
    } else if (ch === ',') {
      out.push(cur)
      cur = ''
    } else {
      cur += ch
    }
  }
  out.push(cur)
  return out
}

function stateFromRegion(isoRegion: string, country: string): string {
  if (!isoRegion) return ''
  const parts = isoRegion.split('-')
  if (parts.length >= 2 && parts[0] === country) return parts[1]
  if (parts.length >= 2) return parts[parts.length - 1]
  return ''
}

function usableCode(row: Record<string, string>): string | null {
  const candidates = [
    row.icao_code,
    row.gps_code,
    row.ident,
    row.local_code,
  ]
  for (const raw of candidates) {
    const c = (raw || '').trim().toUpperCase()
    if (!c || c.includes('-')) continue
    if (!/^[A-Z0-9]{3,4}$/.test(c)) continue
    return c
  }
  return null
}

function roundCoord(n: number): number {
  return Math.round(n * 1e4) / 1e4
}

async function loadRows(csvPath: string): Promise<CatalogRow[]> {
  const rl = createInterface({ input: createReadStream(csvPath), crlfDelay: Infinity })
  let headers: string[] | null = null
  const byIcao = new Map<string, CatalogRow>()
  const iataClaim = new Map<string, string>() // iata -> icao

  for await (const line of rl) {
    if (!line.trim()) continue
    if (!headers) {
      headers = parseCsvLine(line)
      continue
    }
    const cols = parseCsvLine(line)
    const row: Record<string, string> = {}
    for (let i = 0; i < headers.length; i++) row[headers[i]] = cols[i] ?? ''

    if (!COUNTRIES.has(row.iso_country)) continue
    if (!TYPES.has(row.type)) continue

    const icao = usableCode(row)
    if (!icao) continue

    const lat = Number(row.latitude_deg)
    const lon = Number(row.longitude_deg)
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue

    const city = (row.municipality || '').trim()
    const name = (row.name || icao).trim()
    if (!name) continue

    // Prefer medium/large / IATA / true ICAO over obscure duplicates
    const iata = (row.iata_code || '').trim().toUpperCase()
    const state = stateFromRegion(row.iso_region || '', row.iso_country || '')
    let tz = 'UTC'
    try {
      tz = tzlookup(lat, lon) || 'UTC'
    } catch {
      tz = 'UTC'
    }

    const next: CatalogRow = [
      icao,
      name,
      city,
      state,
      iata.length === 3 ? iata : '',
      roundCoord(lat),
      roundCoord(lon),
      tz,
    ]

    const prev = byIcao.get(icao)
    if (!prev) {
      byIcao.set(icao, next)
    } else {
      // Prefer row that has IATA / better city / shorter official name
      const prevScore =
        (prev[4] ? 2 : 0) + (prev[2] ? 1 : 0) + (prev[1].length < 40 ? 1 : 0)
      const nextScore =
        (next[4] ? 2 : 0) + (next[2] ? 1 : 0) + (next[1].length < 40 ? 1 : 0)
      if (nextScore > prevScore) byIcao.set(icao, next)
    }

    if (iata.length === 3) {
      const claimed = iataClaim.get(iata)
      if (!claimed || row.type === 'large_airport' || row.type === 'medium_airport') {
        iataClaim.set(iata, icao)
      }
    }
  }

  // Ensure IATA points at the winning ICAO row
  for (const [iata, icao] of iataClaim) {
    const row = byIcao.get(icao)
    if (row && !row[4]) row[4] = iata
  }

  // Hand extras that may be missing / preferred labels
  const extras: CatalogRow[] = [
    [
      'M19',
      'Newport Municipal',
      'Newport',
      'TN',
      '',
      35.9642,
      -83.199,
      'America/New_York',
    ],
  ]
  for (const e of extras) {
    if (!byIcao.has(e[0])) byIcao.set(e[0], e)
  }

  return [...byIcao.values()].sort((a, b) => a[0].localeCompare(b[0]))
}

async function main() {
  const argPath = process.argv[2]
  let csvPath = argPath
  if (!csvPath) {
    csvPath = join(tmpdir(), 'ourairports-airports.csv')
    console.log('Downloading', SOURCE)
    await download(SOURCE, csvPath)
  }
  console.log('Parsing', csvPath)
  const rows = await loadRows(csvPath)
  writeFileSync(OUT, JSON.stringify(rows))
  const hpn = rows.find((r) => r[0] === 'KHPN' || r[4] === 'HPN')
  console.log(`Wrote ${rows.length} airports → ${OUT}`)
  console.log(
    'KHPN check:',
    hpn
      ? `${hpn[0]} · ${hpn[2]}, ${hpn[3]} · ${hpn[1]} (IATA ${hpn[4] || '—'})`
      : 'MISSING',
  )

  // Sanity: existing fleet fixtures still present
  for (const code of ['KCAK', 'KTEB', 'KJFK', 'KMEM']) {
    if (!rows.some((r) => r[0] === code)) {
      console.warn('WARN missing', code)
    }
  }

  // Touch read so tree-shake tooling sees file exists
  readFileSync(OUT)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
