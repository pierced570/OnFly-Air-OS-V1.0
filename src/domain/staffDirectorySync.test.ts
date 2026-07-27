import { describe, expect, it } from 'vitest'
import { OWNER_STAFF_ID } from '@/domain/staffAccess'
import {
  localHasPhoneRescue,
  mergeStaffFromDbAndLocal,
  staffMemberFromDbRow,
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
  })

  it('DB phone wins when already set', () => {
    const db = [
      staffMemberFromDbRow({
        id: 'staff-paige',
        name: 'Paige Miller',
        phone: '1112223333',
        sections: ['board'],
        active: true,
      }),
    ]
    const local = [
      staffMemberFromDbRow({
        id: 'staff-paige',
        name: 'Paige Miller',
        phone: '9998887777',
        sections: ['board', 'clients'],
        active: true,
      }),
    ]
    const merged = mergeStaffFromDbAndLocal(db, local)
    expect(merged.find((s) => s.id === 'staff-paige')?.phone).toBe('1112223333')
  })
})
