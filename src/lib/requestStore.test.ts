import { describe, expect, it } from 'vitest'
import { emptyTripRequestDraft } from '@/domain/tripRequest'
import {
  deleteRequest,
  getRequest,
  listRequests,
  submitTripRequest,
} from './requestStore'

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
