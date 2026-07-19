import { describe, expect, it } from 'vitest'
import {
  applyLogTouch,
  buildLead,
  defaultFollowUpIso,
  filterLeads,
  followUpMailto,
  followUpState,
  sortLeads,
  validateLeadDraft,
} from '@/domain/leads'

const now = Date.parse('2026-07-19T12:00:00Z')

describe('leads domain', () => {
  it('requires company + contact', () => {
    expect(validateLeadDraft({ company: '', contact_name: 'A' })).toMatch(
      /Company/,
    )
    expect(validateLeadDraft({ company: 'Acme', contact_name: '' })).toMatch(
      /Contact/,
    )
    expect(validateLeadDraft({ company: 'Acme', contact_name: 'Pat' })).toBeNull()
  })

  it('classifies follow-up state', () => {
    expect(followUpState(null, now)).toBe('none')
    expect(followUpState('2026-07-18T15:00:00Z', now)).toBe('overdue')
    expect(followUpState('2026-07-19T18:00:00Z', now)).toBe('due_today')
    expect(followUpState('2026-07-22T15:00:00Z', now)).toBe('upcoming')
  })

  it('logs a touch and schedules next follow-up', () => {
    const lead = buildLead(
      { company: 'Sky Co', contact_name: 'Alex', email: 'alex@sky.co' },
      { nowIso: '2026-07-10T12:00:00Z' },
    )
    const next = applyLogTouch(lead, {
      note: 'Discussed Part 135 capacity',
      followUpInDays: 3,
      nowIso: '2026-07-19T12:00:00Z',
    })
    expect(next.last_touch_note).toMatch(/Part 135/)
    expect(next.last_contacted_at).toBe('2026-07-19T12:00:00Z')
    expect(followUpState(next.next_follow_up_at, now)).toBe('upcoming')
    expect(defaultFollowUpIso(3, now).startsWith('2026-07-22')).toBe(true)
  })

  it('sorts overdue first', () => {
    const a = buildLead(
      {
        company: 'B Co',
        contact_name: 'B',
        next_follow_up_at: '2026-07-22T15:00:00Z',
      },
      { id: '1', nowIso: '2026-07-01T00:00:00Z' },
    )
    const b = buildLead(
      {
        company: 'A Co',
        contact_name: 'A',
        next_follow_up_at: '2026-07-18T15:00:00Z',
      },
      { id: '2', nowIso: '2026-07-01T00:00:00Z' },
    )
    const sorted = sortLeads([a, b], 'follow_up', now)
    expect(sorted[0].company).toBe('A Co')
  })

  it('filters needs_touch and builds mailto', () => {
    const overdue = buildLead(
      {
        company: 'Ops Air',
        contact_name: 'Sam Lee',
        email: 'sam@ops.example',
        next_follow_up_at: '2026-07-17T12:00:00Z',
        last_touch_note: 'rate sheet',
      },
      { nowIso: '2026-07-01T00:00:00Z' },
    )
    const later = buildLead(
      {
        company: 'Quiet Co',
        contact_name: 'Jo',
        next_follow_up_at: '2026-07-25T12:00:00Z',
      },
      { nowIso: '2026-07-01T00:00:00Z' },
    )
    const hits = filterLeads([overdue, later], {
      followUp: 'needs_touch',
      nowMs: now,
    })
    expect(hits).toHaveLength(1)
    expect(hits[0].company).toBe('Ops Air')
    const mail = followUpMailto(overdue)
    expect(mail).toMatch(/^mailto:sam@ops\.example/)
    expect(mail).toMatch(/Following%20up/)
  })
})
