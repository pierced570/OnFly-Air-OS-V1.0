import { describe, expect, it } from 'vitest'
import {
  clearVault,
  hasLocalVaultSeed,
  listVaultEntries,
  restoreVaultFromLocalSeed,
  upsertVaultEntry,
  vaultSnapshotIsStable,
} from './vaultStore'
import { getSession, sessionSnapshotIsStable } from './staffStore'

describe('vaultStore snapshots', () => {
  it('listVaultEntries returns a stable reference between bumps', () => {
    const a = listVaultEntries()
    const b = listVaultEntries()
    expect(a).toBe(b)
    expect(vaultSnapshotIsStable()).toBe(true)
  })

  it('updates the snapshot only after a write', () => {
    const before = listVaultEntries()
    upsertVaultEntry({
      label: `Test Vault ${Date.now()}`,
      credential_type: 'api_key',
      api_key: 'test',
    })
    const after = listVaultEntries()
    expect(after).not.toBe(before)
    expect(listVaultEntries()).toBe(after)
  })

  it('restoreVaultFromLocalSeed re-fills after clear when seed is bundled', () => {
    if (!hasLocalVaultSeed()) return
    clearVault()
    expect(listVaultEntries()).toHaveLength(0)
    const n = restoreVaultFromLocalSeed()
    expect(n).toBeGreaterThan(0)
    expect(listVaultEntries().length).toBe(n)
  })
})

describe('staffStore session snapshots', () => {
  it('getSession is referentially stable (React #185)', () => {
    expect(sessionSnapshotIsStable()).toBe(true)
    expect(getSession()).toBe(getSession())
  })
})
