/**
 * Contiguous US state / DC adjacency (shared land border).
 * Pure TypeScript — used by Network → Operators → By state.
 */

/** Two-letter USPS codes for the 48 contiguous states + DC. */
export const CONTIGUOUS_US_STATE_CODES = [
  'AL',
  'AR',
  'AZ',
  'CA',
  'CO',
  'CT',
  'DC',
  'DE',
  'FL',
  'GA',
  'IA',
  'ID',
  'IL',
  'IN',
  'KS',
  'KY',
  'LA',
  'MA',
  'MD',
  'ME',
  'MI',
  'MN',
  'MO',
  'MS',
  'MT',
  'NC',
  'ND',
  'NE',
  'NH',
  'NJ',
  'NM',
  'NV',
  'NY',
  'OH',
  'OK',
  'OR',
  'PA',
  'RI',
  'SC',
  'SD',
  'TN',
  'TX',
  'UT',
  'VA',
  'VT',
  'WA',
  'WI',
  'WV',
  'WY',
] as const

export type ContiguousUsStateCode =
  (typeof CONTIGUOUS_US_STATE_CODES)[number]

/** Display names for USPS codes (incl. AK/HI for labels). */
export const US_STATE_NAMES: Record<string, string> = {
  AL: 'Alabama',
  AK: 'Alaska',
  AZ: 'Arizona',
  AR: 'Arkansas',
  CA: 'California',
  CO: 'Colorado',
  CT: 'Connecticut',
  DC: 'District of Columbia',
  DE: 'Delaware',
  FL: 'Florida',
  GA: 'Georgia',
  HI: 'Hawaii',
  ID: 'Idaho',
  IL: 'Illinois',
  IN: 'Indiana',
  IA: 'Iowa',
  KS: 'Kansas',
  KY: 'Kentucky',
  LA: 'Louisiana',
  ME: 'Maine',
  MD: 'Maryland',
  MA: 'Massachusetts',
  MI: 'Michigan',
  MN: 'Minnesota',
  MS: 'Mississippi',
  MO: 'Missouri',
  MT: 'Montana',
  NE: 'Nebraska',
  NV: 'Nevada',
  NH: 'New Hampshire',
  NJ: 'New Jersey',
  NM: 'New Mexico',
  NY: 'New York',
  NC: 'North Carolina',
  ND: 'North Dakota',
  OH: 'Ohio',
  OK: 'Oklahoma',
  OR: 'Oregon',
  PA: 'Pennsylvania',
  RI: 'Rhode Island',
  SC: 'South Carolina',
  SD: 'South Dakota',
  TN: 'Tennessee',
  TX: 'Texas',
  UT: 'Utah',
  VT: 'Vermont',
  VA: 'Virginia',
  WA: 'Washington',
  WV: 'West Virginia',
  WI: 'Wisconsin',
  WY: 'Wyoming',
}

/**
 * Shared land borders for the contiguous US + DC.
 * AK / HI have no contiguous neighbors in this map.
 */
const RAW_NEIGHBORS: Record<string, readonly string[]> = {
  AL: ['FL', 'GA', 'MS', 'TN'],
  AR: ['LA', 'MO', 'MS', 'OK', 'TN', 'TX'],
  AZ: ['CA', 'CO', 'NM', 'NV', 'UT'],
  CA: ['AZ', 'NV', 'OR'],
  CO: ['AZ', 'KS', 'NE', 'NM', 'OK', 'UT', 'WY'],
  CT: ['MA', 'NY', 'RI'],
  DC: ['MD', 'VA'],
  DE: ['MD', 'NJ', 'PA'],
  FL: ['AL', 'GA'],
  GA: ['AL', 'FL', 'NC', 'SC', 'TN'],
  IA: ['IL', 'MN', 'MO', 'NE', 'SD', 'WI'],
  ID: ['MT', 'NV', 'OR', 'UT', 'WA', 'WY'],
  IL: ['IA', 'IN', 'KY', 'MO', 'WI'],
  IN: ['IL', 'KY', 'MI', 'OH'],
  KS: ['CO', 'MO', 'NE', 'OK'],
  KY: ['IL', 'IN', 'MO', 'OH', 'TN', 'VA', 'WV'],
  LA: ['AR', 'MS', 'TX'],
  MA: ['CT', 'NH', 'NY', 'RI', 'VT'],
  MD: ['DC', 'DE', 'PA', 'VA', 'WV'],
  ME: ['NH'],
  MI: ['IN', 'OH', 'WI'],
  MN: ['IA', 'ND', 'SD', 'WI'],
  MO: ['AR', 'IA', 'IL', 'KS', 'KY', 'NE', 'OK', 'TN'],
  MS: ['AL', 'AR', 'LA', 'TN'],
  MT: ['ID', 'ND', 'SD', 'WY'],
  NC: ['GA', 'SC', 'TN', 'VA'],
  ND: ['MN', 'MT', 'SD'],
  NE: ['CO', 'IA', 'KS', 'MO', 'SD', 'WY'],
  NH: ['MA', 'ME', 'VT'],
  NJ: ['DE', 'NY', 'PA'],
  NM: ['AZ', 'CO', 'OK', 'TX', 'UT'],
  NV: ['AZ', 'CA', 'ID', 'OR', 'UT'],
  NY: ['CT', 'MA', 'NJ', 'PA', 'VT'],
  OH: ['IN', 'KY', 'MI', 'PA', 'WV'],
  OK: ['AR', 'CO', 'KS', 'MO', 'NM', 'TX'],
  OR: ['CA', 'ID', 'NV', 'WA'],
  PA: ['DE', 'MD', 'NJ', 'NY', 'OH', 'WV'],
  RI: ['CT', 'MA'],
  SC: ['GA', 'NC'],
  SD: ['IA', 'MN', 'MT', 'ND', 'NE', 'WY'],
  TN: ['AL', 'AR', 'GA', 'KY', 'MO', 'MS', 'NC', 'VA'],
  TX: ['AR', 'LA', 'NM', 'OK'],
  UT: ['AZ', 'CO', 'ID', 'NM', 'NV', 'WY'],
  VA: ['DC', 'KY', 'MD', 'NC', 'TN', 'WV'],
  VT: ['MA', 'NH', 'NY'],
  WA: ['ID', 'OR'],
  WI: ['IA', 'IL', 'MI', 'MN'],
  WV: ['KY', 'MD', 'OH', 'PA', 'VA'],
  WY: ['CO', 'ID', 'MT', 'NE', 'SD', 'UT'],
}

export function normalizeUsStateCode(
  raw: string | null | undefined,
): string {
  return String(raw ?? '')
    .trim()
    .toUpperCase()
}

export function usStateDisplayName(code: string | null | undefined): string {
  const c = normalizeUsStateCode(code)
  if (!c) return 'Unknown'
  return US_STATE_NAMES[c] ?? c
}

/** States that share a land border with `code` (sorted A→Z). */
export function neighboringStates(
  code: string | null | undefined,
): string[] {
  const c = normalizeUsStateCode(code)
  const list = RAW_NEIGHBORS[c]
  if (!list) return []
  return [...list].sort((a, b) => a.localeCompare(b))
}
