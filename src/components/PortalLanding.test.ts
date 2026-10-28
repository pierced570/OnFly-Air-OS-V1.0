import { describe, expect, it } from 'vitest'
import { portalAppTabFromPath, portalAppTabPath } from '@/domain/portalClientApp'

describe('portal guest-first UX routes', () => {
  it('keeps book and quote on the request path (no login wall)', () => {
    expect(portalAppTabPath('book')).toBe('/portal/request')
    expect(portalAppTabFromPath('/portal/request')).toBe('book')
    expect(portalAppTabFromPath('/portal/login')).toBeNull()
  })
})
