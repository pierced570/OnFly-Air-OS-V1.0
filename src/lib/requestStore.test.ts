import { describe, expect, it } from 'vitest'
import { emptyTripRequestDraft } from '@/domain/tripRequest'
import {
  deleteRequest,
  getRequest,
  listRequests,
  pushScratchPadToTripRequest,
  submitTripRequest,
} from './requestStore'
import { getScratchPad, setScratchPadBody } from './scratchPadStore'

describe('requestStore delete', () => {
  it('removes an incoming request from the board list', () => {
    const row = submitTripRequest(
      {
        ...emptyTripRequestDraft(),
        email: 'ops@client.com',
        client_name: 'Test',
        cargo_notes: '1 skid 48x40x48 @ 400',
      },
      'portal',
    )
    expect(getRequest(row.id)).toBeTruthy()
    expect(listRequests().some((r) => r.id === row.id)).toBe(true)
    expect(deleteRequest(row.id)).toBe(true)
    expect(getRequest(row.id)).toBeUndefined()
    expect(listRequests().some((r) => r.id === row.id)).toBe(false)
  })
})

describe('pushScratchPadToTripRequest', () => {
  it('creates a Call pad request and clears the scratch pad', () => {
    setScratchPadBody('PSA\nCKB — DFW\n2 Techs + Tools\nASAP')
    const row = pushScratchPadToTripRequest()
    expect(row.source).toBe('call_pad')
    expect(row.client_name).toBe('PSA')
    expect(row.notes).toContain('CKB')
    expect(getScratchPad().body).toBe('')
    expect(listRequests().some((r) => r.id === row.id)).toBe(true)
  })
})
