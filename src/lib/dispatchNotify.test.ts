import { afterEach, describe, expect, it } from 'vitest'
import { getMockCommsLog } from '@/adapters/comms'
import {
  emptyTripRequestDraft,
  forkliftFromDraft,
} from '@/domain/tripRequest'
import {
  formatPortalRequestSms,
  notifyPortalRequest,
  resolveDispatchPhone,
  FALLBACK_DISPATCH_PHONE,
} from '@/lib/dispatchNotify'
import { listExceptions } from '@/lib/exceptionStore'
import { endShift, startShift } from '@/lib/shiftStore'
import { submitTripRequest } from '@/lib/requestStore'

describe('dispatchNotify', () => {
  afterEach(() => {
    endShift()
  })

  it('formats a portal SMS with request deep link', () => {
    const body = formatPortalRequestSms({
      id: 'abc',
      ref: 9001,
      lane: 'KCAK→KMDW',
      summary: '3 skids · ASAP',
      email: 'ops@client.com',
    })
    expect(body).toContain('R-9001')
    expect(body).toContain('KCAK→KMDW')
    expect(body).toContain('/trips/new?request=abc')
    expect(body).toContain('ops@client.com')
  })

  it('resolves on-shift phone when a shift is open', () => {
    expect(resolveDispatchPhone()).toBe(FALLBACK_DISPATCH_PHONE)
    startShift('Pierce', '+16105092031')
    expect(resolveDispatchPhone()).toBe('+16105092031')
  })

  it('SMS + Board exception on portal request notify', async () => {
    startShift('Pierce', '+16105092031')
    const before = getMockCommsLog().length
    const draft = emptyTripRequestDraft()
    const row = {
      ...draft,
      id: crypto.randomUUID(),
      ref: 9123,
      source: 'portal' as const,
      status: 'submitted' as const,
      created_at: new Date().toISOString(),
      ready_at: new Date().toISOString(),
      lane: 'KHPN→KTEB',
      summary: '1 skid · ASAP',
      email: 'aog@client.com',
      hard_quote_requested_at: null,
      forklift: forkliftFromDraft(draft),
    }
    const result = await notifyPortalRequest(row)
    expect(result.phone).toBe('+16105092031')
    expect(result.sms_id).toBeTruthy()
    expect(result.exception_id).toBeTruthy()
    expect(getMockCommsLog().length).toBe(before + 1)
    expect(getMockCommsLog().at(-1)?.to).toBe('+16105092031')
    expect(listExceptions().some((e) => e.title === 'Portal request')).toBe(
      true,
    )
  })

  it('submitTripRequest portal source pages the desk', async () => {
    startShift('Desk', '+15555550100')
    const before = getMockCommsLog().length
    submitTripRequest(
      {
        ...emptyTripRequestDraft(),
        email: 'portal@client.com',
        cargo_notes: '1 skid 48x40x48 @ 400',
        cargo_weight_lbs: 400,
      },
      'portal',
    )
    // notify is fire-and-forget
    await new Promise((r) => setTimeout(r, 20))
    expect(getMockCommsLog().length).toBeGreaterThan(before)
    expect(getMockCommsLog().at(-1)?.body).toMatch(/portal request/i)
  })

  it('dispatch-sourced requests do not page the desk', async () => {
    startShift('Desk', '+15555550100')
    const before = getMockCommsLog().length
    submitTripRequest(
      {
        ...emptyTripRequestDraft(),
        email: 'desk@onflyair.com',
        client_name: 'Internal',
        cargo_weight_lbs: 50,
      },
      'dispatch',
    )
    await new Promise((r) => setTimeout(r, 20))
    expect(getMockCommsLog().length).toBe(before)
  })
})
