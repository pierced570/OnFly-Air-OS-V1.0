/**
 * Network hub — vertical tabs consolidating operators, radar, FBOs, couriers.
 * Pure TypeScript. Recommend is retired from the hub for now.
 */

export const NETWORK_HUB_TABS = [
  {
    id: 'operators',
    label: 'Operators',
    blurb: 'All, bases, state, aircraft type',
  },
  {
    id: 'radar',
    label: 'Radar',
    blurb: 'Fleet ADS-B watch list',
  },
  {
    id: 'fbos',
    label: 'FBOs',
    blurb: 'Airport handlers & cargo rank',
  },
  {
    id: 'couriers',
    label: 'Ground couriers',
    blurb: 'Hotshot / trucking directory',
  },
  {
    id: 'invite',
    label: 'Add operator',
    blurb: 'Short email → docs, tails, banking',
  },
] as const

export type NetworkHubTabId = (typeof NETWORK_HUB_TABS)[number]['id']

export function parseNetworkHubTab(
  raw: string | null | undefined,
): NetworkHubTabId {
  const id = (raw ?? '').trim().toLowerCase()
  // Legacy bookmarks: recommend / matrix → operators (Recommend retired)
  if (id === 'matrix' || id === 'recommend') return 'operators'
  if (NETWORK_HUB_TABS.some((t) => t.id === id)) {
    return id as NetworkHubTabId
  }
  return 'operators'
}
