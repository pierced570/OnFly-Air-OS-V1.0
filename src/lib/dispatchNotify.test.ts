import { afterEach, describe, expect, it } from 'vitest'
import { getMockCommsLog } from '@/adapters/comms'
import { getMockSentEmails } from '@/adapters/email'
import {
  emptyTripRequestDraft,
  forkliftFromDraft,
} from '@/domain/tripRequest'
import { BRAND_PHONE_E164 } from '@/domain/brand'
import {
  DESK_ALERT_PHONE_E164,
  dispatchAlertEmail,
  formatCostInquiryEmail,
  formatHardQuoteEmail,
  formatPortalRequestSms,
  notifyCostInquiry,
  notifyHardQuoteRequest,
  notifyPortalRequest,
  resolveDispatchPhone,
  FALLBACK_DISPATCH_PHONE,
} from '@/lib/dispatchNotify'
import { listExceptions } from '@/lib/exceptionStore'
import { endShift, startShift } from '@/lib/shiftStore'
import { requestHardQuote, submitTripRequest } from '@/lib/requestStore'

describe('dispatchNotify', () => {
  afterEach(() => {
    endShift()
  })

  it('defaults desk alert email to info@onflyair.com', () => {
    expect(dispatchAlertEmail()).toBe('info@onflyair.com')
  })

  it('formats a portal SMS with request deep link', () => {
    const body = formatPortalRequestSms({
      id: 'abc',
      ref: 9001,
      lane: 'KCAK→KMDW',
      summary: '3 skids · ASAP',
      email: 'ops@client.com',
      urgent_phone: '',
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

  it('portal request SMS + RingOut hits hard-coded desk 858, not on-shift cell', async () => {
    startShift('Pierce', '+16105092031')
    expect(DESK_ALERT_PHONE_E164).toBe(BRAND_PHONE_E164)
    expect(DESK_ALERT_PHONE_E164).toBe('+18585297860')
    const beforeSms = getMockCommsLog().length
    const beforeMail = getMockSentEmails().length
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
    expect(result.phone).toBe(BRAND_PHONE_E164)
    expect(result.phone).not.toBe('+16105092031')
    expect(result.sms_id).toBeTruthy()
    expect(result.email_id).toBeTruthy()
    expect(result.exception_id).toBeTruthy()
    expect(result.ring_id).toBeTruthy()
    // SMS + RingOut voice
    expect(getMockCommsLog().length).toBe(beforeSms + 2)
    const voice = getMockCommsLog().filter((m) => m.channel === 'voice')
    expect(voice.at(-1)?.to).toBe(BRAND_PHONE_E164)
    expect(getMockCommsLog().some((m) => m.channel === 'sms')).toBe(true)
    expect(getMockSentEmails().length).toBe(beforeMail + 1)
    expect(getMockSentEmails().at(-1)?.to).toBe('info@onflyair.com')
    expect(listExceptions().some((e) => e.title === 'Portal request')).toBe(
      true,
    )
  })

  it('soft portal submitTripRequest does not page or ring the desk', async () => {
    startShift('Desk', '+15555550100')
    const beforeSms = getMockCommsLog().length
    // Soft estimate path: cost_inquiry (email) — never notifyPortalRequest / SMS / ring
    submitTripRequest(
      {
        ...emptyTripRequestDraft(),
        email: 'portal@client.com',
        cargo_notes: '1 skid 48x40x48 @ 400',
        cargo_weight_lbs: 400,
      },
      'portal',
      { alert: 'cost_inquiry' },
    )
    await new Promise((r) => setTimeout(r, 20))
    expect(getMockCommsLog().length).toBe(beforeSms)
  })

  it('requestHardQuote rings 858 + emails (no SMS)', async () => {
    startShift('Desk', '+15555550100')
    const beforeComms = getMockCommsLog().length
    const beforeMail = getMockSentEmails().length
    const row = submitTripRequest(
      {
        ...emptyTripRequestDraft(),
        email: 'portal@client.com',
        cargo_notes: '1 skid 48x40x48 @ 400',
        cargo_weight_lbs: 400,
      },
      'portal',
      { alert: 'none' },
    )
    await requestHardQuote(row.id)
    const added = getMockCommsLog().slice(beforeComms)
    expect(added.some((m) => m.channel === 'sms')).toBe(false)
    expect(added.some((m) => m.channel === 'voice')).toBe(true)
    expect(added.find((m) => m.channel === 'voice')?.to).toBe(
      BRAND_PHONE_E164,
    )
    expect(getMockSentEmails().length).toBe(beforeMail + 1)
    expect(getMockSentEmails().at(-1)?.to).toBe('info@onflyair.com')
    expect(getMockSentEmails().at(-1)?.subject).toMatch(/hard quote/i)
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

  it('cost inquiry emails info@ only — no SMS / no ring', async () => {
    startShift('Pierce', '+16105092031')
    const beforeSms = getMockCommsLog().length
    const beforeMail = getMockSentEmails().length
    const draft = emptyTripRequestDraft()
    const row = {
      ...draft,
      id: crypto.randomUUID(),
      ref: 9444,
      source: 'portal' as const,
      status: 'submitted' as const,
      created_at: new Date().toISOString(),
      ready_at: new Date().toISOString(),
      lane: 'KGSP→KCVG',
      summary: '1 pax · ASAP',
      email: 'ops@client.com',
      client_name: 'Acme',
      hard_quote_requested_at: null,
      forklift: forkliftFromDraft(draft),
    }
    const formatted = formatCostInquiryEmail(row)
    expect(formatted.text).toContain('A cost inquiry has been made.')
    expect(formatted.subject).toMatch(/cost inquiry/i)

    const result = await notifyCostInquiry(row)
    expect(result.sms_id).toBeNull()
    expect(result.ring_id).toBeNull()
    expect(result.email_id).toBeTruthy()
    expect(getMockCommsLog().length).toBe(beforeSms)
    expect(getMockSentEmails().length).toBe(beforeMail + 1)
    expect(getMockSentEmails().at(-1)?.to).toBe('info@onflyair.com')
    expect(getMockSentEmails().at(-1)?.subject).toMatch(/cost inquiry/i)
    expect(getMockSentEmails().at(-1)?.text).toContain(
      'A cost inquiry has been made.',
    )
  })

  it('notifyHardQuoteRequest rings desk and emails', async () => {
    const beforeComms = getMockCommsLog().length
    const beforeMail = getMockSentEmails().length
    const draft = emptyTripRequestDraft()
    const row = {
      ...draft,
      id: crypto.randomUUID(),
      ref: 9555,
      source: 'portal' as const,
      status: 'submitted' as const,
      created_at: new Date().toISOString(),
      ready_at: new Date().toISOString(),
      lane: 'KTEB→KBED',
      summary: '2 skids · ASAP',
      email: 'aog@client.com',
      client_name: 'Acme',
      hard_quote_requested_at: new Date().toISOString(),
      forklift: forkliftFromDraft(draft),
    }
    const formatted = formatHardQuoteEmail(row)
    expect(formatted.subject).toMatch(/hard quote/i)
    expect(formatted.text).toContain('desk line is being rung')
    expect(formatted.text).toContain('aog@client.com')
    expect(formatted.text).toContain('Outbound:')
    const hq = await notifyHardQuoteRequest(row)
    expect(hq.sms_id).toBeNull()
    expect(hq.ring_id).toBeTruthy()
    expect(hq.email_id).toBeTruthy()
    expect(getMockCommsLog().length).toBe(beforeComms + 1)
    expect(getMockCommsLog().at(-1)?.channel).toBe('voice')
    expect(getMockCommsLog().at(-1)?.to).toBe(BRAND_PHONE_E164)
    expect(getMockSentEmails().length).toBe(beforeMail + 1)
    expect(getMockSentEmails().at(-1)?.to).toBe('info@onflyair.com')
    expect(getMockSentEmails().at(-1)?.reply_to).toBe('aog@client.com')
    expect(getMockSentEmails().at(-1)?.text).toContain('2 skids · ASAP')
    expect(listExceptions().some((e) => e.title === 'Hard quote requested')).toBe(
      true,
    )
  })

  it('portal soft-quote submit uses cost inquiry (no SMS / no ring)', async () => {
    const beforeSms = getMockCommsLog().length
    const beforeMail = getMockSentEmails().length
    submitTripRequest(
      {
        ...emptyTripRequestDraft(),
        email: 'soft@client.com',
        cargo_notes: '1 box 12x12x12 @ 75',
        cargo_weight_lbs: 75,
      },
      'portal',
      { alert: 'cost_inquiry' },
    )
    await new Promise((r) => setTimeout(r, 20))
    expect(getMockCommsLog().length).toBe(beforeSms)
    expect(getMockSentEmails().length).toBe(beforeMail + 1)
    expect(getMockSentEmails().at(-1)?.to).toBe('info@onflyair.com')
    expect(getMockSentEmails().at(-1)?.text).toContain(
      'A cost inquiry has been made.',
    )
  })
})
