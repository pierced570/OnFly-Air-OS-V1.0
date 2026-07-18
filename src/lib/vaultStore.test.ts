import { describe, expect, it } from 'vitest'
import { parseVaultCsv } from './vaultStore'

describe('parseVaultCsv', () => {
  it('parses header + multiline notes', () => {
    const csv = [
      'service_name,label,credential_type,username,password,api_key,url,notes,created_at',
      'Resend,Resend API Key,api_key,,,re_test,,,note,2026-01-01T00:00:00Z',
      'Supabase,Access Token (CLI/deploy),api_key,,,sbp_test,https://example.com,"line1\nline2",2026-01-01T00:00:00Z',
    ].join('\n')
    // Proper multiline quoted field
    const csv2 = `service_name,label,credential_type,username,password,api_key,url,notes,created_at
Resend,Resend API Key,api_key,,,re_test,,,note,2026-01-01T00:00:00Z
Supabase,Access Token,api_key,,,sbp_test,https://x.com,"line1
line2",2026-01-01T00:00:00Z`
    const rows = parseVaultCsv(csv2)
    expect(rows.length).toBe(2)
    expect(rows[0].api_key).toBe('re_test')
    expect(rows[1].notes).toContain('line1')
    expect(rows[1].notes).toContain('line2')
    void csv
  })
})
