import { describe, expect, it } from 'vitest'
import {
  channelIncludesEmail,
  channelIncludesSms,
  normalizeQuoteLinkChannel,
} from './quoteLinkChannel'

describe('quoteLinkChannel', () => {
  it('defaults to both', () => {
    expect(normalizeQuoteLinkChannel(undefined)).toBe('both')
    expect(normalizeQuoteLinkChannel('')).toBe('both')
    expect(normalizeQuoteLinkChannel('voice')).toBe('both')
  })

  it('accepts sms / email / both', () => {
    expect(normalizeQuoteLinkChannel('SMS')).toBe('sms')
    expect(normalizeQuoteLinkChannel('email')).toBe('email')
    expect(normalizeQuoteLinkChannel('both')).toBe('both')
  })

  it('channel helpers', () => {
    expect(channelIncludesSms('both')).toBe(true)
    expect(channelIncludesEmail('both')).toBe(true)
    expect(channelIncludesSms('email')).toBe(false)
    expect(channelIncludesEmail('sms')).toBe(false)
  })
})
