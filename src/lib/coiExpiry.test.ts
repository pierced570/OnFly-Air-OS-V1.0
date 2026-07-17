import { beforeEach, describe, expect, it } from 'vitest'
import { getMockSentEmails } from '@/adapters/email'
import {
  ensureOperatorCompliance,
  setOperatorDocExpiry,
  setOperatorDocFile,
  markCoiReminderSent,
} from '@/lib/operatorComplianceStore'
import {
  operatorsNeedingCoiReminder,
  runCoiExpiryReminders,
} from '@/lib/coiExpiry'

function makePdf(name: string) {
  return new File(['%PDF'], name, { type: 'application/pdf' })
}

describe('COI expiry reminders', () => {
  beforeEach(() => {
    // fresh operator ids each test via unique names
  })

  it('queues reminder when COI expired and contact email set', async () => {
    const id = crypto.randomUUID()
    ensureOperatorCompliance({
      operator_id: id,
      operator_name: 'Test Air',
      contact_email: 'ops@testair.example',
    })
    setOperatorDocFile(id, 'coi', makePdf('coi.pdf'))
    setOperatorDocExpiry(id, 'coi', '2020-01-01')

    const due = operatorsNeedingCoiReminder(new Date('2026-07-17T12:00:00Z'))
    expect(due.some((d) => d.operator_id === id)).toBe(true)

    const before = getMockSentEmails().length
    const result = await runCoiExpiryReminders(new Date('2026-07-17T12:00:00Z'))
    expect(result.sentTo).toContain('ops@testair.example')
    expect(getMockSentEmails().length).toBeGreaterThan(before)

    // idempotent for same expiry
    const again = await runCoiExpiryReminders(new Date('2026-07-17T13:00:00Z'))
    expect(again.sentTo).not.toContain('ops@testair.example')
  })

  it('skips when already reminded for that expiry', () => {
    const id = crypto.randomUUID()
    ensureOperatorCompliance({
      operator_id: id,
      operator_name: 'Already Reminded LLC',
      contact_email: 'ops@already.example',
    })
    setOperatorDocFile(id, 'coi', makePdf('coi.pdf'))
    setOperatorDocExpiry(id, 'coi', '2021-06-01')
    markCoiReminderSent(id, '2021-06-01')

    const due = operatorsNeedingCoiReminder(new Date('2026-07-17T12:00:00Z'))
    expect(due.some((d) => d.operator_id === id)).toBe(false)
  })
})
