import { describe, expect, it } from 'vitest'
import { NETWORK_HUB_TABS, parseNetworkHubTab } from './networkHub'

describe('networkHub', () => {
  it('lists hub tabs without Recommend; Add operator last', () => {
    expect(NETWORK_HUB_TABS.map((t) => t.id)).toEqual([
      'operators',
      'radar',
      'fbos',
      'couriers',
      'invite',
    ])
    expect(NETWORK_HUB_TABS.at(-1)?.label).toBe('Add operator')
  })

  it('parses tab query; retired recommend → operators', () => {
    expect(parseNetworkHubTab('radar')).toBe('radar')
    expect(parseNetworkHubTab('matrix')).toBe('operators')
    expect(parseNetworkHubTab('recommend')).toBe('operators')
    expect(parseNetworkHubTab('invite')).toBe('invite')
    expect(parseNetworkHubTab('nope')).toBe('operators')
    expect(parseNetworkHubTab(null)).toBe('operators')
  })
})
