/**
 * Network hub — vertical tabs consolidating operators, matrix, radar, FBOs, couriers.
 * Pure TypeScript.
 */

export const NETWORK_HUB_TABS = [
  {
    id: 'operators',
    label: 'Operators',
    blurb: 'Search, board, sheet, and operator info',
  },
  {
    id: 'matrix',
    label: 'Recommend',
    blurb: 'Mission → scored operator matrix',
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
  if (NETWORK_HUB_TABS.some((t) => t.id === id)) {
    return id as NetworkHubTabId
  }
  return 'operators'
}
