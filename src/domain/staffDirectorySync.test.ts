import { describe, expect, it } from 'vitest'
import { OWNER_STAFF_ID } from '@/domain/staffAccess'
import {
  localHasPhoneRescue,
  mergeStaffFromDbAndLocal,
  staffMemberFromDbRow,
  staffRowsNeedingFlush,
} from './staffDirectorySync'

describe('staffDirectorySync', () => {
  it('rescues local phones when DB phones are empty', () => {
    const db = [
      staffMemberFromDbRow({
        id: OWNER_STAFF_ID,
        name: 'Pierce Demetriades',
        phone: '6105092031',
        is_admin: true,
        sections: ['board', 'staff_access'],
        active: true,
      }),
      staffMemberFromDbRow({
        id: 'staff-paige',
        name: 'Paige Miller',
        phone: '',
        sections: ['board', 'clients'],
        active: true,
      }),
    ]
    const localFixed = [
      db[0]!,
      staffMemberFromDbRow({
        id: 'staff-paige',
        name: 'Paige Miller',
        phone: '5551234567',
        sections: ['board', 'clients', 'financials'],
        active: true,
      }),
    ]
    expect(localHasPhoneRescue(db, localFixed)).toBe(true)
    const merged = mergeStaffFromDbAndLocal(db, localFixed)
    const paige = merged.find((s) => s.id === 'staff-paige')
    expect(paige?.phone).toBe('5551234567')
    // Phone rescue keeps local grants (not seed DB sections alone).
    expect(paige?.sections).toEqual(
      expect.arrayContaining(['board', 'clients', 'financials']),
    )
  })

  it('DB phone wins when already set and local is not newer', () => {
    const db = [
      staffMemberFromDbRow({
        id: 'staff-paige',
        name: 'Paige Miller',
        phone: '1112223333',
        sections: ['board'],
        active: true,
        updated_at: '2026-01-01T00:00:00.000Z',
      }),
    ]
    const local = [
      staffMemberFromDbRow({
        id: 'staff-paige',
        name: 'Paige Miller',
        phone: '9998887777',
        sections: ['board', 'clients'],
        active: true,
        updated_at: '2025-01-01T00:00:00.000Z',
      }),
    ]
    const merged = mergeStaffFromDbAndLocal(db, local)
    expect(merged.find((s) => s.id === 'staff-paige')?.phone).toBe('1112223333')
  })

  it('local newer updated_at wins phone and grants over DB', () => {
    const db = [
      staffMemberFromDbRow({
        id: 'staff-austin',
        name: 'Austin Ouellette',
        phone: '',
        sections: ['board', 'clients'],
        active: true,
        updated_at: '2026-01-01T00:00:00.000Z',
      }),
    ]
    const local = [
      staffMemberFromDbRow({
        id: 'staff-austin',
        name: 'Austin Ouellette',
        phone: '8585551212',
        sections: ['board', 'trips', 'quotes'],
        active: true,
        updated_at: '2026-06-01T00:00:00.000Z',
      }),
    ]
    const merged = mergeStaffFromDbAndLocal(db, local)
    const austin = merged.find((s) => s.id === 'staff-austin')
    expect(austin?.phone).toBe('8585551212')
    expect(austin?.sections).toEqual(['board', 'trips', 'quotes'])
  })

  it('staffRowsNeedingFlush only returns changed rows', () => {
    const db = [
      staffMemberFromDbRow({
        id: 'staff-paige',
        name: 'Paige Miller',
        phone: '',
        sections: ['board'],
        active: true,
      }),
      staffMemberFromDbRow({
        id: 'staff-ben',
        name: 'Ben Miller',
        phone: '1111111111',
        sections: ['board', 'clients'],
        active: true,
      }),
    ]
    const merged = [
      staffMemberFromDbRow({
        id: 'staff-paige',
        name: 'Paige Miller',
        phone: '5551234567',
        sections: ['board', 'financials'],
        active: true,
      }),
      db[1]!,
    ]
    const flush = staffRowsNeedingFlush(db, merged)
    expect(flush).toHaveLength(1)
    expect(flush[0]?.id).toBe('staff-paige')
  })
})
