import { describe, expect, it } from 'vitest'
import {
  enforceOwnerRules,
  findStaffByLogin,
  formatPhoneDisplay,
  hasSection,
  normalizePhone,
  OWNER_STAFF_ID,
  phoneDigitsInput,
  phonesMatch,
  sectionForPath,
  type StaffMember,
} from './staffAccess'

const pierce: StaffMember = {
  id: '1',
  name: 'Pierce Demetriades',
  phone: '6105092031',
  is_admin: true,
  sections: ['board'],
  active: true,
}

const chris: StaffMember = {
  id: '2',
  name: 'Chris Hewitt',
  phone: '5025550100',
  is_admin: false,
  sections: ['board', 'radar'],
  active: true,
}

describe('staffAccess', () => {
  it('normalizes US phones and strips formatting junk', () => {
    expect(normalizePhone('+1 (610) 509-2031')).toBe('6105092031')
    expect(normalizePhone('610-509-2031')).toBe('6105092031')
    expect(normalizePhone('6105092031')).toBe('6105092031')
    expect(phonesMatch('6105092031', '(610) 509-2031')).toBe(true)
  })

  it('formats display as (XXX) XXX-XXXX while typing', () => {
    expect(formatPhoneDisplay('')).toBe('')
    expect(formatPhoneDisplay('6')).toBe('(6')
    expect(formatPhoneDisplay('610')).toBe('(610')
    expect(formatPhoneDisplay('6105')).toBe('(610) 5')
    expect(formatPhoneDisplay('6105092031')).toBe('(610) 509-2031')
    expect(phoneDigitsInput('(610) 509-2031')).toBe('6105092031')
    expect(phoneDigitsInput('610-509-2031 xyz')).toBe('6105092031')
  })

  it('logs in by name + phone', () => {
    const hit = findStaffByLogin([pierce, chris], 'Pierce', '6105092031')
    expect(hit?.id).toBe('1')
    expect(findStaffByLogin([pierce], 'Nobody', '6105092031')).toBeNull()
    expect(
      findStaffByLogin([pierce], 'Pierce Demetriades', '(610) 509-2031')?.id,
    ).toBe('1')
  })

  it('admins bypass section list; others need explicit grant', () => {
    expect(hasSection(pierce, 'vault_keys')).toBe(true)
    expect(hasSection(chris, 'vault_keys')).toBe(false)
    expect(hasSection(chris, 'radar')).toBe(true)
  })

  it('staff_access is owner/admin only — never via section grant', () => {
    const granted: StaffMember = {
      ...chris,
      sections: [...chris.sections, 'staff_access'],
    }
    expect(hasSection(granted, 'staff_access')).toBe(false)
    expect(hasSection(pierce, 'staff_access')).toBe(true)
  })

  it('enforceOwnerRules keeps sole owner; demotes everyone else', () => {
    const owner = enforceOwnerRules({
      id: OWNER_STAFF_ID,
      name: 'Pierce',
      phone: '6105092031',
      is_admin: false,
      sections: ['board'],
      active: false,
    })
    expect(owner.is_admin).toBe(true)
    expect(owner.active).toBe(true)
    expect(owner.sections).toContain('staff_access')

    const other = enforceOwnerRules({
      id: 'staff-paige',
      name: 'Paige',
      phone: '',
      is_admin: true,
      sections: ['board', 'staff_access', 'vault_keys'],
      active: true,
    })
    expect(other.is_admin).toBe(false)
    expect(other.sections).not.toContain('staff_access')
    expect(other.sections).toContain('vault_keys')
  })

  it('maps admin subpaths before generic /admin', () => {
    expect(sectionForPath('/admin/keys')).toBe('vault_keys')
    expect(sectionForPath('/admin/staff')).toBe('staff_access')
    expect(sectionForPath('/admin/tasks')).toBe('tasks')
    expect(sectionForPath('/admin')).toBe('admin')
    expect(sectionForPath('/leads')).toBe('leads')
    expect(sectionForPath('/chat')).toBe('chat')
    expect(sectionForPath('/chat/abc')).toBe('chat')
    expect(sectionForPath('/board')).toBe('board')
    expect(sectionForPath('/dispatch')).toBe('board')
    expect(sectionForPath('/desk')).toBe('board')
    expect(sectionForPath('/network')).toBe('network')
    expect(sectionForPath('/radar')).toBe('network')
    expect(sectionForPath('/fbos')).toBe('network')
    expect(sectionForPath('/')).toBe(null)
  })
})
