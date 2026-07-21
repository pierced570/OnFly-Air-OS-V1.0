import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { buildTypeSpecs, parseFleetCsv } from '../src/domain/fleetParser'
import { buildNetworkFixture, runImport } from './import'
import { lookupTz } from '../src/domain/airports'

const __dirname = dirname(fileURLToPath(import.meta.url))
const CSV = readFileSync(resolve(__dirname, '../data/OnFly_Aircraft_Master_Flat.csv'), 'utf8')

describe('fleet importer', () => {
  it('parses 47 operators and 420 aircraft', () => {
    const parsed = parseFleetCsv(CSV)
    expect(parsed.operators).toHaveLength(47)
    expect(parsed.aircraft).toHaveLength(420)
  })

  it('is idempotent — two runs yield identical counts and unique (operator,tail)', () => {
    const a = buildNetworkFixture(parseFleetCsv(CSV))
    const b = buildNetworkFixture(parseFleetCsv(CSV))
    expect(a.counts).toEqual(b.counts)
    expect(a.aircraft.length).toBe(420)
    expect(a.operators.length).toBe(47)

    const keysA = a.aircraft.map((x) => `${x.operator_name}|${x.tail}`).sort()
    const keysB = b.aircraft.map((x) => `${x.operator_name}|${x.tail}`).sort()
    expect(keysA).toEqual(keysB)
    expect(new Set(keysA).size).toBe(keysA.length)

    // Deterministic ids across runs
    expect(a.aircraft.map((x) => x.id).sort()).toEqual(b.aircraft.map((x) => x.id).sort())
  })

  it('flags TBD tails and blanks as NEEDS-INFO without dropping rows', () => {
    const parsed = parseFleetCsv(CSV)
    const tbds = parsed.aircraft.filter((a) => a.tail.startsWith('TBD'))
    expect(tbds.length).toBeGreaterThan(0)
    for (const t of tbds) {
      expect(t.needs_info.some((n) => n.field === 'tail')).toBe(true)
    }
    expect(parsed.aircraft.length).toBe(420)
  })

  it('recomputes FET from MTOW', () => {
    const parsed = parseFleetCsv(CSV)
    const withMtow = parsed.aircraft.filter((a) => a.mtow_lbs != null)
    expect(withMtow.length).toBeGreaterThan(100)
    for (const a of withMtow) {
      expect(a.fet_applies).toBe(a.mtow_lbs! > 6000)
    }
  })

  it('builds type_specs from distinct types', () => {
    const parsed = parseFleetCsv(CSV)
    const specs = buildTypeSpecs(parsed.aircraft)
    expect(specs.length).toBe(parsed.typeNames.length)
    expect(specs.length).toBeGreaterThan(10)
  })

  it('runImport returns stable fixture counts', () => {
    const { fixture } = runImport(CSV)
    expect(fixture.counts.operators).toBe(47)
    expect(fixture.counts.aircraft).toBe(420)
  })

  it('carries per-tail history / assumed $/NM into the fixture', () => {
    const fixture = buildNetworkFixture(parseFleetCsv(CSV))
    const withRate = fixture.aircraft.filter(
      (a) => a.avg_op_per_nm_circuit != null || a.med_assumed_op_per_nm != null,
    )
    expect(withRate.length).toBeGreaterThan(100)
    const n15 = fixture.aircraft.find((a) => a.tail === 'N15TV')
    expect(n15?.avg_op_per_nm_circuit).toBe(9.06)
    expect(n15?.door_w_in).toBe(26)
    expect(n15?.cargo_pax).toBeNull()
  })
})

describe('airport tz lookup', () => {
  it('returns IANA zone for KCAK', () => {
    expect(lookupTz('KCAK')).toBe('America/New_York')
  })
})
