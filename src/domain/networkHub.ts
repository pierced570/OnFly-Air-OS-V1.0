/**
 * Network hub — vertical tabs consolidating operators, recommend, radar, FBOs, couriers.
 * Pure TypeScript.
 */

export const NETWORK_HUB_TABS = [
  {
    id: 'invite',
    label: 'Add operator',
    blurb: 'Short email → docs, tails, banking',
  },
  {
    id: 'operators',
    label: 'Operators',
    blurb: 'Search, board, sheet, and docs',
  },
  {
    id: 'recommend',
    label: 'Recommend',
    blurb: 'Priority calls by client + base',
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
] as const

export type NetworkHubTabId = (typeof NETWORK_HUB_TABS)[number]['id']

export function parseNetworkHubTab(
  raw: string | null | undefined,
): NetworkHubTabId {
  const id = (raw ?? '').trim().toLowerCase()
  // Legacy bookmark: ?tab=matrix → recommend
  if (id === 'matrix') return 'recommend'
  if (NETWORK_HUB_TABS.some((t) => t.id === id)) {
    return id as NetworkHubTabId
  }
  return 'invite'
}
