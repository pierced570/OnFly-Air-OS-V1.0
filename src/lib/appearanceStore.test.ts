import { beforeEach, describe, expect, it, vi } from 'vitest'

const store = new Map<string, string>()

vi.stubGlobal('localStorage', {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => {
    store.set(k, v)
  },
  removeItem: (k: string) => {
    store.delete(k)
  },
  clear: () => store.clear(),
})

vi.stubGlobal('document', {
  documentElement: {
    dataset: {} as Record<string, string>,
  },
})

describe('appearanceStore', () => {
  beforeEach(async () => {
    store.clear()
    ;(document.documentElement.dataset as Record<string, string>).appearance =
      ''
    vi.resetModules()
    const mod = await import('./appearanceStore')
    mod.initAppearance()
  })

  it('defaults to dark and persists light', async () => {
    const { getAppearance, setAppearance } = await import('./appearanceStore')
    expect(getAppearance()).toBe('dark')
    setAppearance('light')
    expect(getAppearance()).toBe('light')
    expect(store.get('onfly-appearance')).toBe('light')
    expect(document.documentElement.dataset.appearance).toBe('light')
  })

  it('toggles dark ↔ light', async () => {
    const { setAppearance, toggleAppearance } = await import(
      './appearanceStore'
    )
    setAppearance('dark')
    expect(toggleAppearance()).toBe('light')
    expect(toggleAppearance()).toBe('dark')
  })
})
