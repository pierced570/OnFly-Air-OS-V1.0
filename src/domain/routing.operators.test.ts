import { describe, expect, it } from 'vitest'
import { bestCandidatePerOperator, type Candidate } from './routing'

function stub(
  op: string,
  aircraft: string,
  price: number,
  etaHours: number,
): Candidate {
  return {
    operator_id: op,
    operator_name: op,
    aircraft_id: aircraft,
    tail: aircraft,
    type_name: 'Type',
    mtow_lbs: 20000,
    cost: price * 0.7,
    price,
    chain: [],
    confidence: 0.9,
    needsInfo: [],
    bookingGated: false,
    reasoning: [],
    eta_end: new Date(Date.UTC(2026, 6, 26, etaHours)).toISOString(),
    circuit_nm: 500,
    rate_per_nm: 8,
    rate_source: 'assumption',
  }
}

describe('bestCandidatePerOperator', () => {
  it('keeps one best-ranked tail per operator', () => {
    const cands = [
      stub('Apex Jet', 'N1', 9000, 10),
      stub('Apex Jet', 'N2', 5000, 12),
      stub('Apex Jet', 'N3', 7000, 8),
      stub('Other Air', 'N9', 6000, 9),
    ]
    // Lower rank wins — prefer cheaper
    const out = bestCandidatePerOperator(cands, (c) => c.price)
    expect(out).toHaveLength(2)
    const apex = out.find((c) => c.operator_id === 'Apex Jet')
    expect(apex?.aircraft_id).toBe('N2')
    expect(out.some((c) => c.operator_id === 'Other Air')).toBe(true)
  })

  it('never returns duplicate operators', () => {
    const cands = Array.from({ length: 6 }, (_, i) =>
      stub('Apex Jet', `N${i}`, 4000 + i * 100, 10 + i),
    )
    const out = bestCandidatePerOperator(cands, (c) => c.price)
    expect(out).toHaveLength(1)
    expect(out[0]?.operator_id).toBe('Apex Jet')
  })
})
