import { describe, expect, it } from 'vitest'
import { NETWORK_HUB_TABS, parseNetworkHubTab } from './networkHub'

describe('networkHub', () => {
  it('lists hub tabs with Add operator last', () => {
    expect(NETWORK_HUB_TABS.map((t) => t.id)).toEqual([
      'operators',
      'recommend',
      'radar',
      'fbos',
      'couriers',
      'invite',
    ])
    expect(NETWORK_HUB_TABS.at(-1)?.label).toBe('Add operator')
  })

  it('parses tab query with operators default', () => {
    expect(parseNetworkHubTab('recommend')).toBe('recommend')
    expect(parseNetworkHubTab('matrix')).toBe('recommend')
    expect(parseNetworkHubTab('RADAR')).toBe('radar')
    expect(parseNetworkHubTab('invite')).toBe('invite')
    expect(parseNetworkHubTab('nope')).toBe('operators')
    expect(parseNetworkHubTab(null)).toBe('operators')
  })
})
