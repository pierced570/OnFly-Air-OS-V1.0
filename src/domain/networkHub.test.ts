import { describe, expect, it } from 'vitest'
import { NETWORK_HUB_TABS, parseNetworkHubTab } from './networkHub'

describe('networkHub', () => {
  it('lists five hub tabs', () => {
    expect(NETWORK_HUB_TABS.map((t) => t.id)).toEqual([
      'operators',
      'matrix',
      'radar',
      'fbos',
      'couriers',
    ])
  })

  it('parses tab query with operators default', () => {
    expect(parseNetworkHubTab('matrix')).toBe('matrix')
    expect(parseNetworkHubTab('RADAR')).toBe('radar')
    expect(parseNetworkHubTab('nope')).toBe('operators')
    expect(parseNetworkHubTab(null)).toBe('operators')
  })
})
