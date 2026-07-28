import { beforeEach, describe, expect, it } from 'vitest'
import {
  __resetDeskAddedOperatorsForTests,
  addDeskOperator,
  listDeskOperators,
} from '@/lib/deskOperatorSearch'

describe('desk operator names for Quick Dispatch', () => {
  beforeEach(() => {
    __resetDeskAddedOperatorsForTests()
  })

  it('addDeskOperator stores a canonical name for the dropdown', () => {
    const hit = addDeskOperator({ name: '  Axio Aviation  ' })
    expect(hit.name).toBe('Axio Aviation')
    const names = listDeskOperators().map((o) => o.name)
    expect(names).toContain('Axio Aviation')
  })

  it('re-picking the same spelling reunifies instead of duplicating', () => {
    addDeskOperator({ name: 'Patriot Air' })
    const again = listDeskOperators().find(
      (o) => o.name.toLowerCase() === 'patriot air',
    )
    expect(again?.name).toBe('Patriot Air')
  })
})
