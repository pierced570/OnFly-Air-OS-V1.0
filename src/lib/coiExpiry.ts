/**
 * When a COI expires, email the operator for an updated copy.
 */

import { createEmailAdapter } from '@/adapters/email'
import {
  isDocExpired,
  listOperatorCompliance,
  markCoiReminderSent,
  type OperatorCompliance,
} from '@/lib/operatorComplianceStore'

export type CoiReminderResult = {
  sentTo: string[]
  skipped: Array<{ operator_id: string; reason: string }>
}

function todayYmd(now = new Date()): string {
  return now.toISOString().slice(0, 10)
}

export function operatorsNeedingCoiReminder(
  now = new Date(),
): OperatorCompliance[] {
  return listOperatorCompliance().filter((row) => {
    const coi = row.docs.coi
    if (!coi.expiresOn || !isDocExpired(coi.expiresOn, now)) return false
    if (!row.contact_email?.includes('@')) return false
    // Already reminded for this same expiry date
    if (
      row.coi_reminder_sent_at &&
      row.coi_reminder_for_expiry === coi.expiresOn
    ) {
      return false
    }
    return true
  })
}

export async function runCoiExpiryReminders(
  now = new Date(),
): Promise<CoiReminderResult> {
  const due = operatorsNeedingCoiReminder(now)
  const sentTo: string[] = []
  const skipped: CoiReminderResult['skipped'] = []
  const email = createEmailAdapter()

  for (const row of due) {
    const expiresOn = row.docs.coi.expiresOn!
    const to = row.contact_email.trim().toLowerCase()
    try {
      await email.send({
        to,
        subject: `OnFly Air — COI expired for ${row.operator_name}`,
        text: [
          `Hello ${row.operator_name},`,
          '',
          `Our records show your Certificate of Insurance expired on ${expiresOn}.`,
          'Please reply with an updated COI copy so we can keep you active on the OnFly network.',
          '',
          `Checked ${todayYmd(now)}`,
          '— OnFly Air ops',
        ].join('\n'),
        html: `
          <div style="font-family:system-ui,sans-serif;color:#111">
            <p>Hello <b>${row.operator_name}</b>,</p>
            <p>Our records show your <b>Certificate of Insurance</b> expired on
              <b>${expiresOn}</b>.</p>
            <p>Please reply with an updated COI copy so we can keep you active
              on the OnFly network.</p>
            <p style="color:#6b7280;font-size:12px">OnFly Air ops · ${todayYmd(now)}</p>
          </div>
        `,
      })
      markCoiReminderSent(row.operator_id, expiresOn)
      sentTo.push(to)
    } catch (e) {
      skipped.push({
        operator_id: row.operator_id,
        reason: e instanceof Error ? e.message : String(e),
      })
    }
  }

  return { sentTo, skipped }
}
