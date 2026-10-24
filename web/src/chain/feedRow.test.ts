import { describe, expect, it } from 'vitest'
import type { FeedRow } from './director'
import { feedSegments } from './feedRow'

const row: FeedRow = {
  clashId: '1:4:1',
  winner: { id: '1:5', ticker: 'VOLT', monsterType: 3 },
  loser: { id: '1:4', ticker: 'SHADE', monsterType: 4 },
  boost: 8,
  consolation: 4.8,
  toPot: 2.4,
  toTreasury: 0.8,
  txHash: '0xabc',
  timestampMs: 1_000
}

describe('feedSegments', () => {
  it('splits the merge into the four settlement shares that add up to 100 percent', () => {
    const segments = feedSegments(row)
    expect(segments.map((segment) => segment.key)).toEqual(['boost', 'consolation', 'pot', 'treasury'])
    expect(segments.map((segment) => Math.round(segment.percent))).toEqual([50, 30, 15, 5])
    expect(segments.reduce((sum, segment) => sum + segment.percent, 0)).toBeCloseTo(100)
    expect(segments[0]?.amountText).toBe('8.00')
  })

  it('falls back to equal shares when every amount is zero', () => {
    const segments = feedSegments({ ...row, boost: 0, consolation: 0, toPot: 0, toTreasury: 0 })
    expect(segments.map((segment) => segment.percent)).toEqual([25, 25, 25, 25])
  })
})
