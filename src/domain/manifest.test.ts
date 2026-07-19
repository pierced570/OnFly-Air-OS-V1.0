import { describe, expect, it } from 'vitest'
import { buildManifestModel, renderManifestHtml } from '@/domain/manifest'

describe('manifest', () => {
  it('builds payload check and HTML', () => {
    const model = buildManifestModel({
      tripRef: 2101,
      lane: 'KTEB → KORD',
      operatorName: 'Demo Air',
      tail: 'N123AB',
      typeName: 'King Air 200',
      maxPayloadLbs: 2000,
      pieces: [
        {
          count: 2,
          length_in: 40,
          width_in: 30,
          height_in: 20,
          weight_lbs: 100,
        },
      ],
      etaSummary: [{ label: 'Air', est_end: '2026-07-19T18:00:00.000Z' }],
    })
    expect(model.totalWeightLbs).toBe(200)
    expect(model.payloadOk).toBe(true)
    const html = renderManifestHtml(model)
    expect(html).toContain('Load manifest')
    expect(html).toContain('N123AB')
    expect(html).toContain('@media print')
  })
})
