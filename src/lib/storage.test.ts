import { describe, expect, it } from 'vitest'
import { sanitizeFileName } from '@/lib/storage'

describe('storage helpers', () => {
  it('sanitizes unsafe file names', () => {
    expect(sanitizeFileName('COI (Acme).pdf')).toBe('COI_(Acme).pdf')
    expect(sanitizeFileName('../../etc/passwd')).toBe('.._.._etc_passwd')
    expect(sanitizeFileName('a'.repeat(200)).length).toBe(120)
  })
})
