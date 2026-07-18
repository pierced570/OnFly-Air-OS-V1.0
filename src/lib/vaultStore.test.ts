import { describe, expect, it } from 'vitest'
import {
  displayVaultLabel,
  parseVaultCsv,
  upsertVaultEntry,
} from './vaultStore'

describe('parseVaultCsv', () => {
  it('coalesces label from service_name when label empty', () => {
    const csv = `service_name,label,credential_type,username,password,api_key,url,notes,created_at
Supabase,,api_key,,,sbp_test,https://x.com,,2026-01-01T00:00:00Z
Resend,Resend API Key,api_key,,,re_test,,,2026-01-01T00:00:00Z`
    const rows = parseVaultCsv(csv)
    expect(rows).toHaveLength(2)
    expect(displayVaultLabel(rows[0])).toBe('Supabase')
    expect(rows[0].label).toBe('Supabase')
    expect(displayVaultLabel(rows[1])).toBe('Resend API Key')
  })

  it('parses multiline notes', () => {
    const csv2 = `service_name,label,credential_type,username,password,api_key,url,notes,created_at
Supabase,Access Token,api_key,,,sbp_test,https://x.com,"line1
line2",2026-01-01T00:00:00Z`
    const rows = parseVaultCsv(csv2)
    expect(rows[0].notes).toContain('line1')
    expect(rows[0].notes).toContain('line2')
  })
})

describe('upsertVaultEntry', () => {
  it('requires only label (no service_name)', () => {
    const e = upsertVaultEntry({
      label: 'Mapbox',
      credential_type: 'api_key',
      api_key: 'pk.test',
    })
    expect(e.label).toBe('Mapbox')
    expect(e.service_name).toBe('Mapbox')
  })
})
