import { describe, expect, it } from 'vitest'
import {
  buildTripContactLines,
  groupTripContactLines,
  telHrefFromPhone,
} from './tripContacts'

describe('tripContacts', () => {
  it('builds tel: hrefs for US numbers', () => {
    expect(telHrefFromPhone('(858) 529-7860')).toBe('tel:+18585297860')
    expect(telHrefFromPhone('+1 330-555-0199')).toBe('tel:+13305550199')
    expect(telHrefFromPhone('')).toBeNull()
  })

  it('lists client inbound + operator offer phones for click-to-call', () => {
    const lines = buildTripContactLines({
      clientName: 'Tester',
      client: {
        name: 'Tester',
        profile: {
          front_desk_phone: '330-555-0100',
          ops_callback_phone: '330-555-0101',
        },
        contacts: [
          {
            id: 'c1',
            name: 'Sam Ops',
            cell: '330-555-0102',
            role: 'requester',
            title: 'MX Desk',
          },
        ],
      },
      operatorOffers: [
        {
          id: 'o1',
          operator_name: 'Sky Charter',
          contact_cell: '+15551234567',
        },
      ],
      participants: [
        {
          id: 'p1',
          name: 'Capt Lee',
          company: 'Sky Charter',
          role: 'pilot',
          cell: '555-111-2222',
        },
      ],
    })

    const groups = groupTripContactLines(lines)
    expect(groups.client.map((l) => l.label)).toEqual([
      'Inbound desk',
      'Ops callback',
      'Sam Ops · MX Desk',
    ])
    expect(groups.client[0]!.telHref).toBe('tel:+13305550100')
    expect(groups.operator.some((l) => l.company === 'Sky Charter')).toBe(true)
    expect(groups.crew).toHaveLength(1)
    expect(groups.crew[0]!.telHref).toBe('tel:+15551112222')
  })

  it('skips mock operator cells and empty phones', () => {
    const lines = buildTripContactLines({
      operatorOffers: [
        {
          id: 'mock',
          operator_name: 'Fake Air',
          contact_cell: '+15550001111',
          contact_cell_is_mock: true,
        },
      ],
      participants: [
        {
          id: 'empty',
          name: 'On-shift',
          company: 'OnFly Air',
          role: 'dispatcher',
          cell: '',
        },
      ],
    })
    expect(lines).toEqual([])
  })
})
