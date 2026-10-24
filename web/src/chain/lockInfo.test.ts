import { describe, expect, it } from 'vitest'
import { lockInfo } from './lockInfo'

describe('lockInfo', () => {
  it('is null before the first lock', () => {
    expect(lockInfo([])).toBeNull()
  })
  it('tracks the seed for the latest lock only', () => {
    const locked = { name: 'EpochLocked' as const, args: { epoch: 2 } }
    const seed = { name: 'SeedReady' as const, args: { epoch: 2 } }
    expect(lockInfo([locked])).toEqual({ epoch: 2, seedReady: false })
    expect(lockInfo([locked, seed])).toEqual({ epoch: 2, seedReady: true })
    expect(lockInfo([locked, seed, { name: 'EpochLocked' as const, args: { epoch: 3 } }])).toEqual({
      epoch: 3,
      seedReady: false
    })
  })
})
