import { describe, expect, it } from 'vitest'
import {
  canonicalClientName,
  matchOperators,
  parseExtraContacts,
} from './basePriority'
import { listsFromBasePriorityCsv } from './basePriorityImport'
import fixture from '@/fixtures/network.json'

// Minimal CSV sample for unit tests when full file unavailable via ?raw
const SAMPLE = `Type,Base ICAO,Base Label,Base Notes,Call Order,Company,Operator Base,Region,24hr Phone,Backup Phone,Company Number,Additional Phones,Extra Contacts,Primary Contact,Contact Phone,Contact Email,General Email,Billing Email,Website,Pax,Cargo,Hazmat,Medivac,24hr Ops,Call-Out Time,Argus,Wyvern,Usefulness,Approval Tier,Aircraft Locations (tails @ base),Fleet Types,Priority Notes,Operator Notes
BASE,KCAK,PSA - Akron-Canton,,,,,,,,,,,,,,,,,,,,,,,,,,,,,
  call,KCAK,PSA - Akron-Canton,,1,Castle Aviation,KCAK,,(800) 325-4703 Ext 1,,(800) 325-4703 Ext 1,,24/7: (800) 325-4703 Ext 1,,,,fltops@castleair.com,,,yes,yes,yes,yes,yes,2Hrs,,,8,approved,N49MG Aerostar @ KCAK,Aerostar | Cessna Caravan,,"NEED PAX Weight"
  call,----,Floating Fleet,,1,Ameriflight,,,,,,,,,ops@ameriflight.com,,,yes,yes,yes,no,yes,,,,approved,,Cargo,,,
`

describe('basePriority', () => {
  it('renames Floating Fleet and parses client from label', () => {
    expect(canonicalClientName('Floating Fleet')).toEqual({
      client_name: 'Heavy Cargo Carriers',
      base_label: 'Heavy Cargo Carriers',
    })
    expect(canonicalClientName('PSA - Akron-Canton').client_name).toBe('PSA')
  })

  it('parses Extra Contacts into call lines', () => {
    const lines = parseExtraContacts(
      '24/7 Dispatch: (260) 766-4548 | Text Number: (260) 726-5029 | Owner - Hal: (260) 729-1577',
    )
    expect(lines.length).toBeGreaterThanOrEqual(3)
    expect(lines[0]?.phone).toMatch(/766/)
  })

  it('fuzzy-matches operators without auto-confirm', () => {
    const ops = [
      { id: '1', name: 'Castle Aviation' },
      { id: '2', name: 'Sonrise Aviation, LLC' },
    ]
    const hits = matchOperators('Castle Aviation LLC', ops)
    expect(hits[0]?.id).toBe('1')
    expect(hits[0]?.score).toBeGreaterThanOrEqual(72)
  })

  it('imports sample CSV with suggested matches from network fixture', () => {
    const operators = (fixture as { operators: Array<{ id: string; name: string }> })
      .operators
    const lists = listsFromBasePriorityCsv(SAMPLE, operators)
    const psa = lists.find((l) => l.client_name === 'PSA' && l.base_icao === 'KCAK')
    expect(psa?.entries[0]?.company_name).toBe('Castle Aviation')
    expect(psa?.entries[0]?.operator_id).toBeNull()
    expect(['suggested', 'unmatched']).toContain(psa?.entries[0]?.match_status)

    const heavy = lists.find((l) => l.client_name === 'Heavy Cargo Carriers')
    expect(heavy?.base_icao).toBeNull()
    expect(heavy?.entries.some((e) => e.company_name === 'Ameriflight')).toBe(true)
  })
})
