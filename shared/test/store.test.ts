import { describe, expect, it, vi } from 'vitest'
import { rankCoins } from '../src/rank'
import { createArenaStore } from '../src/store'
import { hexOf, makeCoin, makeEnvelope, makeSnapshot, tradeArgs } from './helpers'

describe('rank derivation', () => {
  it('orders by rMon desc, then wins desc, then token address asc', () => {
    const coins = [
      makeCoin(0, { rMon: '100', wins: 1, token: hexOf(0xb, 40) }),
      makeCoin(1, { rMon: '100', wins: 1, token: hexOf(0xa, 40) }),
      makeCoin(2, { rMon: '100', wins: 2, token: hexOf(0xf, 40) }),
      makeCoin(3, { rMon: '9999999999999999999999', wins: 0, token: hexOf(0xc, 40) }),
      makeCoin(4, { rMon: '50', wins: 9, token: hexOf(0x1, 40) })
    ]
    const ranked = rankCoins(coins)
    expect(ranked.map((c) => c.coinId)).toEqual([3, 2, 1, 0, 4])
    expect(ranked.map((c) => c.rank)).toEqual([1, 2, 3, 4, 5])
  })

  it('compares addresses case-insensitively', () => {
    const upper = makeCoin(0, { rMon: '5', token: '0xAB00000000000000000000000000000000000000' })
    const lower = makeCoin(1, { rMon: '5', token: '0xaa00000000000000000000000000000000000000' })
    expect(rankCoins([upper, lower]).map((c) => c.coinId)).toEqual([1, 0])
  })

  it('exposes ranks through the store', () => {
    const store = createArenaStore()
    store.hydrate(makeSnapshot([makeCoin(0, { rMon: '5' }), makeCoin(1, { rMon: '9' })]))
    expect(store.getState().persisted.ranked.map((c) => [c.coinId, c.rank])).toEqual([
      [1, 1],
      [0, 2]
    ])
  })
})

describe('commit-state gating', () => {
  it('a Proposed event does not change persisted numbers, the same event after Finalized does', () => {
    const store = createArenaStore()
    store.hydrate(makeSnapshot([makeCoin(0), makeCoin(1, { rMon: '1200' })]))
    const trade = makeEnvelope('Trade', tradeArgs(0, '1500'), { block: 101, state: 'Proposed' })
    store.apply(trade)
    expect(store.getState().persisted.coins[0]?.rMon).toBe('1000')
    expect(store.getState().optimistic.coins[0]?.rMon).toBe('1500')
    expect(store.getState().persisted.ranked[0]?.coinId).toBe(1)
    expect(store.getState().optimistic.ranked[0]?.coinId).toBe(0)
    store.commit({ blockId: trade.blockId, blockNumber: 101, commitState: 'Voted' })
    expect(store.getState().persisted.coins[0]?.rMon).toBe('1000')
    expect(store.getState().events[0]?.commitState).toBe('Voted')
    store.commit({ blockId: trade.blockId, blockNumber: 101, commitState: 'Finalized' })
    expect(store.getState().persisted.coins[0]?.rMon).toBe('1500')
    expect(store.getState().persisted.ranked[0]?.coinId).toBe(0)
    expect(store.getState().finalizedBlock).toBe(101)
  })

  it('applies an event that arrives already Finalized', () => {
    const store = createArenaStore()
    store.hydrate(makeSnapshot([makeCoin(0)]))
    store.apply(makeEnvelope('Trade', tradeArgs(0, '2500'), { state: 'Finalized' }))
    expect(store.getState().persisted.coins[0]?.rMon).toBe('2500')
  })

  it('remembers a commit that arrives before its event', () => {
    const store = createArenaStore()
    store.hydrate(makeSnapshot([makeCoin(0)]))
    store.commit({ blockId: hexOf(101), blockNumber: 101, commitState: 'Finalized' })
    store.apply(makeEnvelope('Trade', tradeArgs(0, '3000'), { state: 'Proposed' }))
    expect(store.getState().persisted.coins[0]?.rMon).toBe('3000')
  })

  it('never downgrades a commit state', () => {
    const store = createArenaStore()
    store.hydrate(makeSnapshot([makeCoin(0)]))
    const trade = makeEnvelope('Trade', tradeArgs(0, '1500'), { state: 'Finalized' })
    store.apply(trade)
    store.commit({ blockId: trade.blockId, blockNumber: 101, commitState: 'Voted' })
    store.apply({ ...trade, commitState: 'Proposed' })
    expect(store.getState().events[0]?.commitState).toBe('Finalized')
  })
})

describe('retraction', () => {
  const fork = hexOf(0xf0f0)
  const canonical = hexOf(0xc0c0)

  it('drops a replaced block when the sibling finalizes and ignores late fork events', () => {
    const store = createArenaStore()
    store.hydrate(makeSnapshot([makeCoin(0)]))
    store.apply(makeEnvelope('Trade', tradeArgs(0, '1700'), { block: 101, blockId: fork }))
    store.commit({ blockId: fork, blockNumber: 101, commitState: 'Voted' })
    store.apply(makeEnvelope('Trade', tradeArgs(0, '1600'), { block: 101, blockId: canonical }))
    expect(store.getState().events).toHaveLength(2)
    store.commit({ blockId: canonical, blockNumber: 101, commitState: 'Finalized' })
    expect(store.getState().events.map((e) => e.blockId)).toEqual([canonical])
    expect(store.getState().persisted.coins[0]?.rMon).toBe('1600')
    expect(store.getState().optimistic.coins[0]?.rMon).toBe('1600')
    store.apply(makeEnvelope('Trade', tradeArgs(0, '1700'), { block: 101, blockId: fork }))
    expect(store.getState().events).toHaveLength(1)
  })

  it('removes the events of an explicitly retracted block', () => {
    const store = createArenaStore()
    store.hydrate(makeSnapshot([makeCoin(0)]))
    store.apply(makeEnvelope('Trade', tradeArgs(0, '1700'), { block: 101, blockId: fork }))
    expect(store.getState().optimistic.coins[0]?.rMon).toBe('1700')
    store.retract({ blockId: fork })
    expect(store.getState().events).toHaveLength(0)
    expect(store.getState().optimistic.coins[0]?.rMon).toBe('1000')
    const listener = vi.fn()
    store.subscribe(listener)
    store.retract({ blockId: fork })
    expect(listener).not.toHaveBeenCalled()
  })

  it('treats two logs of the same height and index in different blocks as distinct until finality', () => {
    const store = createArenaStore()
    store.hydrate(makeSnapshot([makeCoin(0)]))
    store.apply(makeEnvelope('Trade', tradeArgs(0, '1700'), { block: 101, blockId: fork, logIndex: 0 }))
    store.apply(makeEnvelope('Trade', tradeArgs(0, '1600'), { block: 101, blockId: canonical, logIndex: 0 }))
    expect(store.getState().events).toHaveLength(2)
  })
})

describe('hydrate, dedupe and subscriptions', () => {
  it('skips events at or below the snapshot block', () => {
    const store = createArenaStore()
    store.apply(makeEnvelope('Trade', tradeArgs(0, '7777'), { block: 100, state: 'Finalized' }))
    store.apply(makeEnvelope('Trade', tradeArgs(0, '1500'), { block: 101, state: 'Finalized' }))
    store.hydrate(makeSnapshot([makeCoin(0)], 100))
    expect(store.getState().persisted.coins[0]?.rMon).toBe('1500')
    expect(store.getState().hydrated).toBe(true)
    expect(store.getState().events).toHaveLength(2)
  })

  it('is idempotent for a repeated event and notifies once', () => {
    const store = createArenaStore()
    store.hydrate(makeSnapshot([makeCoin(0)]))
    const listener = vi.fn()
    const off = store.subscribe(listener)
    const trade = makeEnvelope('Trade', tradeArgs(0, '1500'))
    store.apply(trade)
    store.apply(trade)
    expect(listener).toHaveBeenCalledTimes(1)
    expect(store.getState().events).toHaveLength(1)
    off()
    store.apply(makeEnvelope('Trade', tradeArgs(0, '1600'), { block: 102 }))
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('returns a stable state object until something changes', () => {
    const store = createArenaStore()
    store.hydrate(makeSnapshot([makeCoin(0)]))
    const first = store.getState()
    expect(store.getState()).toBe(first)
    store.apply(makeEnvelope('Trade', tradeArgs(0, '1500')))
    expect(store.getState()).not.toBe(first)
  })

  it('orders events by block then log index', () => {
    const store = createArenaStore()
    store.hydrate(makeSnapshot([makeCoin(0)]))
    store.apply(makeEnvelope('Trade', tradeArgs(0, '1900'), { block: 103 }))
    store.apply(makeEnvelope('Trade', tradeArgs(0, '1800'), { block: 102, logIndex: 4 }))
    store.apply(makeEnvelope('Trade', tradeArgs(0, '1700'), { block: 102, logIndex: 1 }))
    expect(store.getState().events.map((e) => e.id)).toEqual([
      '000000000102-000001',
      '000000000102-000004',
      '000000000103-000000'
    ])
    expect(store.getState().optimistic.coins[0]?.rMon).toBe('1900')
  })

  it('skips a malformed event instead of breaking the state', () => {
    const store = createArenaStore()
    store.hydrate(makeSnapshot([makeCoin(0)]))
    store.apply(makeEnvelope('Trade', { coinId: 0, isBuy: true }, { block: 101 }))
    store.apply(makeEnvelope('Trade', tradeArgs(0, '1500'), { block: 102 }))
    expect(store.getState().optimistic.coins[0]?.rMon).toBe('1500')
  })
})

describe('event reducers', () => {
  it('derives a launched coin from the round config and the seed', () => {
    const store = createArenaStore({ houseTokens: new Set([hexOf(0xaa, 40)]) })
    store.hydrate(
      makeSnapshot([], 100, { vMon0: '20000000000000000000', vTok0: '1000000000000000000000000000', levelingEpochs: 3, launchFee: '1000' }, {
        phase: 'Lobby'
      })
    )
    store.apply(
      makeEnvelope(
        'CoinLaunched',
        {
          coinId: 0,
          token: hexOf(0xaa, 40),
          creator: hexOf(0xbb, 40),
          name: 'Alpha',
          ticker: 'ALPHA',
          monsterType: 2,
          skinId: 1,
          seedMon: '5000000000000000000',
          vMon: '25000000000000000000',
          vTok: '800000000000000000000000000',
          supply: '200000000000000000000000000'
        },
        { state: 'Finalized' }
      )
    )
    const state = store.getState().persisted
    const coin = state.coins[0]
    expect(coin?.vMon).toBe('25000000000000000000')
    expect(coin?.rMon).toBe('5000000000000000000')
    expect(coin?.isHouse).toBe(true)
    expect(coin?.status).toBe('Alive')
    expect(coin?.vTok).toBe('800000000000000000000000000')
    expect(coin?.supply).toBe('200000000000000000000000000')
    expect(state.round?.coinCount).toBe(1)
    expect(state.round?.treasury).toBe('1000')
  })

  it('walks the epoch lifecycle and the phase change after the last leveling epoch', () => {
    const store = createArenaStore()
    store.hydrate(makeSnapshot([makeCoin(0), makeCoin(1), makeCoin(2)], 100, { levelingEpochs: 2 }, { phase: 'Lobby' }))
    let logs = 0
    const finalized = (name: Parameters<typeof makeEnvelope>[0], args: Parameters<typeof makeEnvelope>[1], block: number) => {
      logs += 1
      store.apply(makeEnvelope(name, args, { block, logIndex: logs, state: 'Finalized' }))
    }
    finalized('RoundStarted', { startedAt: 1_760_000_100, coins: 3 }, 101)
    expect(store.getState().persisted.round?.phase).toBe('Leveling')
    finalized('EpochLocked', { epoch: 1, entropySeq: 5, aliveMask: 0b101, lockedAt: 1_760_000_120 }, 102)
    let round = store.getState().persisted.round
    expect(round?.locked).toBe(true)
    expect(store.getState().persisted.coins.map((c) => c.rMonAtLock)).toEqual(['1000', '0', '1000'])
    finalized('HuntResolved', { epoch: 1, coinId: 0, success: true, xpGained: 30, xp: 30, level: 1 }, 103)
    finalized('LevelUp', { coinId: 0, level: 2 }, 103)
    finalized('EpochResolved', { epoch: 1, aliveCount: 3 }, 104)
    round = store.getState().persisted.round
    expect(round?.locked).toBe(false)
    expect(round?.phase).toBe('Leveling')
    expect(store.getState().persisted.coins[0]).toMatchObject({ xp: 30, level: 2 })
    finalized('HuntResolved', { epoch: 1, coinId: 2, success: true, xpGained: 30, xp: 90, level: 3 }, 104)
    expect(store.getState().persisted.coins[2]).toMatchObject({ xp: 90, level: 3 })
    finalized('EpochLocked', { epoch: 2, entropySeq: 6, aliveMask: 7, lockedAt: 1_760_000_150 }, 105)
    finalized('EpochCancelled', { epoch: 2 }, 106)
    expect(store.getState().persisted.round).toMatchObject({ locked: false, cancelStreak: 1 })
    finalized('EpochLocked', { epoch: 2, entropySeq: 7, aliveMask: 7, lockedAt: 1_760_000_160 }, 107)
    finalized('EpochResolved', { epoch: 2, aliveCount: 3 }, 108)
    expect(store.getState().persisted.round).toMatchObject({ phase: 'Knockout', cancelStreak: 0, epoch: 2 })
  })

  it('applies clash, boost, elimination, settlement, claims and redeems', () => {
    const store = createArenaStore()
    store.hydrate(
      makeSnapshot([makeCoin(0, { rMon: '1000', supply: '5000' }), makeCoin(1, { rMon: '400', supply: '2000' })], 100, {
        levelingEpochs: 0
      })
    )
    let logs = 0
    const finalized = (name: Parameters<typeof makeEnvelope>[0], args: Parameters<typeof makeEnvelope>[1], block: number) => {
      logs += 1
      store.apply(makeEnvelope(name, args, { block, logIndex: logs, state: 'Finalized' }))
    }
    finalized('ClashResolved', { epoch: 1, clashId: 1, winner: 0, loser: 1, winProbBps: 7000, roll: 10, boost: '200', consolation: '120', toPot: '60', toTreasury: '20' }, 101)
    finalized('Boosted', { epoch: 1, clashId: 1, coinId: 0, boostMon: '200', rMon: '1200', vMon: '30', vTok: '40', wins: 1, level: 1, xpGained: 40, xp: 40 }, 101)
    finalized('CoinEliminated', { coinId: 1, consolationPool: '120', consolationSupply: '2000' }, 101)
    finalized('FeesSwept', { epoch: 1, toPot: '9', toTreasury: '3', prizePotAfter: '69', treasuryAfter: '23' }, 101)
    finalized('TreasurySpent', { kind: 1, amount: '5', treasuryAfter: '18' }, 101)
    finalized('EpochResolved', { epoch: 1, aliveCount: 1 }, 101)
    finalized('RoundSettled', { winnerCoinId: 0, redeemPool: '1260', redeemSupply: '5000' }, 101)
    let state = store.getState().persisted
    expect(state.coins[1]).toMatchObject({ status: 'Eliminated', rMon: '0', consolationPool: '120', consolationSupply: '2000' })
    expect(state.coins[0]).toMatchObject({ status: 'Champion', rMon: '0', wins: 1, vMon: '30', vTok: '40', xp: 40 })
    expect(state.round).toMatchObject({ phase: 'Settled', aliveCount: 1, winnerCoinId: 0, prizePot: '0', treasury: '18', clashesPlayed: 1 })
    finalized('ConsolationClaimed', { coinId: 1, holder: hexOf(9, 40), tokens: '500', monPaid: '30' }, 102)
    finalized('Redeemed', { holder: hexOf(9, 40), tokens: '1000', monPaid: '252' }, 103)
    finalized('TreasuryFunded', { funder: hexOf(9, 40), amount: '80' }, 104)
    state = store.getState().persisted
    expect(state.coins[1]?.supply).toBe('1500')
    expect(state.coins[0]?.supply).toBe('4000')
    expect(state.round).toMatchObject({ redeemPool: '1008', redeemSupply: '4000', treasury: '98' })
  })

  it('creates a round from RoundCreated, aborts it and ignores other rounds', () => {
    const store = createArenaStore()
    store.apply(
      makeEnvelope('RoundCreated', { config: JSON.stringify({ levelingEpochs: 3, vMon0: '20' }) }, { block: 10, state: 'Finalized', timestamp: 1_760_000_010 })
    )
    store.commit({ blockId: hexOf(10), blockNumber: 10, commitState: 'Finalized' })
    expect(store.getState().persisted.round).toMatchObject({ roundId: 1, phase: 'Lobby', createdAt: 1_760_000_010, epoch: 0 })
    expect(store.getState().config).toEqual({ levelingEpochs: 3, vMon0: '20' })
    store.apply(makeEnvelope('RoundAborted', { reason: 2 }, { block: 11, state: 'Finalized' }))
    expect(store.getState().persisted.round?.phase).toBe('Aborted')
    store.apply({ ...makeEnvelope('TreasuryFunded', { funder: hexOf(1, 40), amount: '5' }, { block: 12, state: 'Finalized' }), args: { roundId: 2, funder: hexOf(1, 40), amount: '5' } })
    expect(store.getState().persisted.round?.treasury).toBe('0')
  })
})

describe('replay', () => {
  it('applies envelopes in order and paces by block time when asked', async () => {
    const sleep = vi.fn(() => Promise.resolve())
    const store = createArenaStore({ sleep, blockTimeMs: 300 })
    store.hydrate(makeSnapshot([makeCoin(0)]))
    const batch = [
      makeEnvelope('Trade', tradeArgs(0, '1100'), { block: 110, state: 'Finalized' }),
      makeEnvelope('Trade', tradeArgs(0, '1200'), { block: 112, state: 'Finalized' }),
      makeEnvelope('Trade', tradeArgs(0, '1300'), { block: 112, logIndex: 1, state: 'Finalized' })
    ]
    await store.replay(batch, { atMs: true })
    expect(sleep).toHaveBeenCalledTimes(1)
    expect(sleep).toHaveBeenCalledWith(600)
    expect(store.getState().persisted.coins[0]?.rMon).toBe('1300')
    const plain = vi.fn(() => Promise.resolve())
    const second = createArenaStore({ sleep: plain })
    second.hydrate(makeSnapshot([makeCoin(0)]))
    await second.replay(batch)
    expect(plain).not.toHaveBeenCalled()
    expect(second.getState().persisted).toEqual(store.getState().persisted)
  })
})

describe('refunds and aborts', () => {
  it('mirrors a lobby refund, an abort refund rate and a seed claim', () => {
    const store = createArenaStore()
    store.hydrate(makeSnapshot([makeCoin(0, { supply: '900' }), makeCoin(1, { supply: '700' })], 100, {}, { prizePot: '50' }))
    let logs = 0
    const finalized = (name: Parameters<typeof makeEnvelope>[0], args: Parameters<typeof makeEnvelope>[1]) => {
      logs += 1
      store.apply(makeEnvelope(name, args, { block: 101, logIndex: logs, state: 'Finalized' }))
    }
    finalized('RefundClaimed', { coinId: 0, holder: hexOf(9, 40), tokens: '900', monPaid: '10' })
    finalized('CoinRefundRate', { coinId: 1, refundPool: '800', refundSupply: '700' })
    finalized('RoundAborted', { reason: 2 })
    finalized('SeedClaimed', { coinId: 1, creator: hexOf(9, 40), tokens: '200', monPaid: '40' })
    const state = store.getState().persisted
    expect(state.coins[0]).toMatchObject({ status: 'Refunded', rMon: '0', supply: '0' })
    expect(state.coins[1]).toMatchObject({ status: 'Refunded', rMon: '0', consolationPool: '800', consolationSupply: '700', supply: '500' })
    expect(state.round).toMatchObject({ phase: 'Aborted', aliveCount: 0, prizePot: '0' })
  })
})

describe('CoinImage', () => {
  const fork = hexOf(0xf0f0)
  const uri = 'data:image/png;base64,AAAA'
  const launchArgs = {
    coinId: 3,
    token: hexOf(0xaa, 40),
    creator: hexOf(0xbb, 40),
    name: 'Img',
    ticker: 'IMG',
    monsterType: 1,
    skinId: 0,
    seedMon: '5000000000000000000',
    vMon: '25000000000000000000',
    vTok: '800000000000000000000000000',
    supply: '200000000000000000000000000'
  }

  it('sets imageUri on an existing coin and leaves plain coins undefined', () => {
    const store = createArenaStore()
    store.hydrate(makeSnapshot([makeCoin(0), makeCoin(1)]))
    store.apply(makeEnvelope('CoinImage', { coinId: 1, imageUri: uri }, { state: 'Finalized' }))
    expect(store.getState().persisted.coins[1]?.imageUri).toBe(uri)
    expect(store.getState().persisted.coins[0]?.imageUri).toBeUndefined()
  })

  it('buffers an image that sorts before its CoinLaunched', () => {
    const store = createArenaStore()
    store.hydrate(makeSnapshot([makeCoin(0)]))
    store.apply(makeEnvelope('CoinImage', { coinId: 3, imageUri: uri }, { block: 101, logIndex: 0, state: 'Finalized' }))
    expect(store.getState().persisted.coins).toHaveLength(1)
    store.apply(makeEnvelope('CoinLaunched', launchArgs, { block: 101, logIndex: 1, state: 'Finalized' }))
    expect(store.getState().persisted.coins.find((c) => c.coinId === 3)?.imageUri).toBe(uri)
  })

  it('applies an image that follows CoinLaunched in the same block', () => {
    const store = createArenaStore()
    store.hydrate(makeSnapshot([makeCoin(0)]))
    store.apply(makeEnvelope('CoinLaunched', launchArgs, { block: 101, logIndex: 0 }))
    store.apply(makeEnvelope('CoinImage', { coinId: 3, imageUri: uri }, { block: 101, logIndex: 1 }))
    expect(store.getState().optimistic.coins.find((c) => c.coinId === 3)?.imageUri).toBe(uri)
  })

  it('leaves no stale image when the block is retracted or loses a fork', () => {
    const store = createArenaStore()
    store.hydrate(makeSnapshot([makeCoin(0)]))
    store.apply(makeEnvelope('CoinImage', { coinId: 0, imageUri: uri }, { block: 101, blockId: fork }))
    expect(store.getState().optimistic.coins[0]?.imageUri).toBe(uri)
    store.retract({ blockId: fork })
    expect(store.getState().optimistic.coins[0]?.imageUri).toBeUndefined()
    store.apply(makeEnvelope('CoinImage', { coinId: 0, imageUri: uri }, { block: 102, blockId: fork }))
    store.apply(makeEnvelope('Trade', tradeArgs(0, '1600'), { block: 102, blockId: hexOf(0xc0c0), state: 'Finalized' }))
    expect(store.getState().optimistic.coins[0]?.imageUri).toBeUndefined()
  })
})
