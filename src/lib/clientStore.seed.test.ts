import { describe, expect, it } from 'vitest'
import { ensureClientsSeeded, listClients } from '@/lib/clientStore'

describe('clientStore fixture seed', () => {
  it('restores unique clients from financials when empty', async () => {
    const n = await ensureClientsSeeded()
    expect(n).toBeGreaterThan(5)
    const names = listClients().map((c) => c.name)
    expect(names).toContain('PSA Airlines')
    expect(names).toContain('Piedmont Airlines')
    expect(names).toContain('Trans North')
    expect(names.map((x) => x.toLowerCase())).not.toContain('po enter in error')
    // Idempotent
    expect(await ensureClientsSeeded()).toBe(n)
  })
})
