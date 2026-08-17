import { describe, expect, it } from 'vitest'
import { listAdapterDoorStatus } from '@/lib/adapterStatus'

describe('listAdapterDoorStatus', () => {
  it('lists wired adapter doors without the NOTAM dead-end stub', () => {
    const doors = listAdapterDoorStatus()
    const ids = doors.map((d) => d.id)
    expect(ids).toContain('supabase')
    expect(ids).toContain('wx')
    expect(ids).not.toContain('notam')
    expect(doors.every((d) => d.state !== 'blocked' || d.id !== 'notam')).toBe(
      true,
    )
  })
})
