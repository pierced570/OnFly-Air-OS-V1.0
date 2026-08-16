import { describe, expect, it } from 'vitest'
import { NETWORK_HUB_TABS, parseNetworkHubTab } from './networkHub'

describe('networkHub', () => {
  it('lists hub tabs', () => {
    expect(NETWORK_HUB_TABS.map((t) => t.id)).toEqual([
      'invite',
      'operators',
      'recommend',
      'radar',
      'fbos',
      'couriers',
    ])
  })

  it('parses tab query with invite default', () => {
    expect(parseNetworkHubTab('recommend')).toBe('recommend')
    expect(parseNetworkHubTab('matrix')).toBe('recommend')
    expect(parseNetworkHubTab('RADAR')).toBe('radar')
    expect(parseNetworkHubTab('nope')).toBe('invite')
    expect(parseNetworkHubTab(null)).toBe('invite')
  })
})
