import { describe, expect, it } from 'vitest'
import { recommendForIntake } from './intakeRecommend'
import type { IntakeDraft } from './intakeStore'

describe('recommendForIntake', () => {
  it('resolves Akron→Chicago and returns ranked candidates', async () => {
    const draft: IntakeDraft = {
      id: 't1',
      channel: 'email',
      from: 'ops@client.com',
      subject: 'Need a plane',
      body: 'Need 3 skids from Akron to Chicago ready at 9am.',
      created_at: new Date().toISOString(),
      status: 'pending_review',
      extracted: {
        origin_text: 'Akron, OH',
        destination_text: 'Chicago, IL',
        pieces_text: '3 skids 48x40x60 @ 800ea',
      },
    }
    const r = await recommendForIntake(draft)
    expect(r.origin?.icao).toBe('KCAK')
    expect(['KORD', 'KMDW']).toContain(r.destination?.icao)
    expect(r.error).toBeUndefined()
    expect(r.candidates.length).toBeGreaterThan(0)
    expect(r.candidates[0]?.operator_name).toBeTruthy()
    expect(r.candidates.every((c) => c.tail)).toBe(true)
  }, 30_000)
})
