import { describe, expect, it } from 'vitest'
import {
  findStaffByLogin,
  hasSection,
  normalizePhone,
  phonesMatch,
  sectionForPath,
  type StaffMember,
} from './staffAccess'

const pierce: StaffMember = {
  id: '1',
  name: 'Pierce Demetriades',
  phone: '858-529-7860',
  is_admin: true,
  sections: ['board'],
  active: true,
}

const chris: StaffMember = {
  id: '2',
  name: 'Chris Hewitt',
  phone: '(502) 555-0100',
  is_admin: false,
  sections: ['board', 'radar'],
  active: true,
}

describe('staffAccess', () => {
  it('normalizes US phones', () => {
    expect(normalizePhone('+1 (858) 529-7860')).toBe('8585297860')
    expect(phonesMatch('8585297860', '858-529-7860')).toBe(true)
  })

  it('logs in by name + phone', () => {
    const hit = findStaffByLogin([pierce, chris], 'Pierce', '8585297860')
    expect(hit?.id).toBe('1')
    expect(findStaffByLogin([pierce], 'Nobody', '8585297860')).toBeNull()
  })

  it('admins bypass section list; others need explicit grant', () => {
    expect(hasSection(pierce, 'vault_keys')).toBe(true)
    expect(hasSection(chris, 'vault_keys')).toBe(false)
    expect(hasSection(chris, 'radar')).toBe(true)
  })

  it('maps admin subpaths before generic /admin', () => {
    expect(sectionForPath('/admin/keys')).toBe('vault_keys')
    expect(sectionForPath('/admin/staff')).toBe('staff_access')
    expect(sectionForPath('/admin/tasks')).toBe('tasks')
    expect(sectionForPath('/admin')).toBe('admin')
    expect(sectionForPath('/')).toBe('board')
  })
})
