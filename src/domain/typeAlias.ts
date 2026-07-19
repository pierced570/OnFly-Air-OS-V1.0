/**
 * Type alias map for D085 / CSV model normalization.
 */
const ALIASES: Record<string, string> = {
  'BE-58': 'Baron 58',
  B58: 'Baron 58',
  BARON: 'Baron 58',
  'BE-20': 'King Air 200',
  B200: 'King Air 200',
  'C-310': 'Cessna 310',
  C310: 'Cessna 310',
  TBM: 'TBM',
  CARAVAN: 'Cessna Caravan',
  'C-208': 'Cessna Caravan',
}

export function normalizeTypeName(raw: string): string {
  const key = raw.trim().toUpperCase().replace(/\s+/g, ' ')
  if (ALIASES[key]) return ALIASES[key]!
  for (const [a, v] of Object.entries(ALIASES)) {
    if (key.includes(a)) return v
  }
  return raw.trim()
}
