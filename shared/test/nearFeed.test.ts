import { describe, expect, it } from 'vitest'
import { EVENT_ARG_NAMES, EVENT_NAMES } from '../src/events'
import { toEnvelope } from '../src/nearDecode'
import { createNearFeed } from '../src/nearFeed'
import { createArenaStore } from '../src/store'
import type { ArenaEventEnvelope, ArenaSnapshot, FeedStatus } from '../src/types'
import { ARENA, FakeChain, flush, manualTimers, sampleArgs } from './nearFake'

function launchArgs(coinId: number): Record<string, unknown> {
  return {
    coinId,
    token: `1:${coinId}`,
    creator: coinId === 1 ? 'h1.fera-seeder.testnet' : `player${coinId}.testnet`,
    name: `Coin ${coinId}`,
    ticker: `C${coinId}`,
    monsterType: 0,
    skinId: 0,
    seedMon: '100000000000000000000000',
    vMon: '20100000000000000000000000',
    vTok: '990000000000000000000000000',
    supply: '10000000000000000000000000'
  }
}

function harness(chain = new FakeChain()) {
  const timers = manualTimers()
  const feed = createNearFeed({ rpcUrls: ['unused'], arena: ARENA, roundId: 1, rpc: chain, timers, houseTokens: new Set() })
  const snapshots: ArenaSnapshot[] = []
  const envelopes: ArenaEventEnvelope[] = []
  const commits: Array<{ blockId: string; blockNumber: number; commitState: string }> = []
  const statuses: FeedStatus[] = []
  feed.onSnapshot((s) => snapshots.push(s))
  feed.onEnvelope((e) => envelopes.push(e))
  feed.onCommit((c) => commits.push(c))
  feed.onStatus((s) => statuses.push(s))
  async function start(): Promise<void> {
    await feed.start()
    await flush()
  }
  return { chain, timers, feed, snapshots, envelopes, commits, statuses, start }
}

describe('createNearFeed', () => {
  it('hydrates from the snapshot and delivers only events newer than it, ordered by seq', async () => {
    const chain = new FakeChain()
    chain.emit('RoundCreated', { config: { levelingEpochs: 1 } })
    chain.height = 100
    const h = harness(chain)
    chain.height = 101
    chain.emit('CoinLaunched', launchArgs(0))
    chain.height = 102
    chain.emit('CoinLaunched', launchArgs(1))
    await h.start()
    expect(h.snapshots).toHaveLength(1)
    expect(h.snapshots[0]?.blockNumber).toBe(102)
    expect(h.snapshots[0]?.blockId).toBe('102')
    expect(h.envelopes).toHaveLength(0)
    chain.emit('Trade', { coinId: 0, trader: 'a.testnet', isBuy: true, monAmount: '1', tokenAmount: '2', rMon: '3', vMon: '4', vTok: '5' }, 1, 2)
    chain.emit('EpochLocked', { epoch: 1, lockHeight: 104, aliveMask: 3, lockedAt: 1_760_000_100 }, 1, 1)
    await h.timers.step()
    expect(h.envelopes.map((e) => e.name)).toEqual(['Trade', 'EpochLocked'])
    expect(h.envelopes.map((e) => e.logIndex)).toEqual([...h.envelopes.map((e) => e.logIndex)].sort((a, b) => a - b))
    expect(h.envelopes[0]?.blockId).toBe('104')
    expect(h.envelopes[0]?.txHash).toBe('')
    expect(h.envelopes[0]?.commitState).toBe('Voted')
    h.feed.stop()
  })

  it('marks events Voted on the optimistic read and commits Finalized when the final head passes', async () => {
    const chain = new FakeChain()
    const h = harness(chain)
    await h.start()
    chain.emit('RoundCreated', { config: { levelingEpochs: 1 } }, 1, 3)
    chain.emit('CoinLaunched', launchArgs(0), 1, 1)
    await h.timers.step()
    expect(h.envelopes.map((e) => e.commitState)).toEqual(['Voted', 'Voted'])
    expect(h.commits).toHaveLength(0)
    chain.finalHeight = 103
    await h.timers.step()
    expect(h.commits).toEqual([{ blockId: '103', blockNumber: 103, commitState: 'Finalized' }])
    chain.finalHeight = 110
    await h.timers.step()
    expect(h.commits.map((c) => c.blockNumber)).toEqual([103, 104])
    await h.timers.step()
    expect(h.commits).toHaveLength(2)
    h.feed.stop()
  })

  it('delivers events already below the final head as Finalized', async () => {
    const chain = new FakeChain()
    const h = harness(chain)
    await h.start()
    chain.height = 120
    chain.finalHeight = 125
    chain.emit('RoundCreated', { config: { levelingEpochs: 1 } })
    await h.timers.step()
    expect(h.envelopes[0]?.commitState).toBe('Finalized')
    expect(h.commits).toHaveLength(0)
    h.feed.stop()
  })

  it('pages through a full ring in one tick', async () => {
    const chain = new FakeChain()
    const h = harness(chain)
    await h.start()
    for (let i = 0; i < 250; i += 1) chain.emit('LevelUp', { coinId: 0, level: 2 }, 1, 1)
    await h.timers.step()
    expect(h.envelopes).toHaveLength(250)
    expect(new Set(h.envelopes.map((e) => e.id)).size).toBe(250)
    expect(chain.calls.filter((c) => c === 'events_since')).toHaveLength(4)
    h.feed.stop()
  })

  it('re-snapshots when the ring overran the cursor and drops nothing newer than the new snapshot', async () => {
    const chain = new FakeChain()
    const h = harness(chain)
    await h.start()
    chain.emit('LevelUp', { coinId: 0, level: 2 }, 1, 1)
    await h.timers.step()
    expect(h.envelopes).toHaveLength(1)
    expect(chain.snapshotReads).toBe(1)
    for (let i = 0; i < 400; i += 1) chain.emit('LevelUp', { coinId: 1, level: 2 }, 1, 1)
    const lastHeight = chain.height
    chain.emit('HuntResolved', { coinId: 1, epoch: 1, success: true, xpGained: 1, xp: 1, level: 1 }, 1, 1)
    await h.timers.step()
    expect(chain.snapshotReads).toBe(2)
    expect(h.snapshots).toHaveLength(2)
    expect(h.snapshots[1]?.blockNumber).toBe(lastHeight + 1)
    const seqs = h.envelopes.map((e) => e.logIndex)
    expect(new Set(seqs).size).toBe(seqs.length)
    expect(seqs).toEqual([...seqs].sort((a, b) => a - b))
    chain.emit('LevelUp', { coinId: 2, level: 2 }, 1, 1)
    await h.timers.step()
    expect(h.envelopes[h.envelopes.length - 1]?.args['coinId']).toBe(2)
    h.feed.stop()
  })

  it('produces envelope ids that sort lexicographically in delivery order', async () => {
    const chain = new FakeChain()
    chain.height = 9
    const h = harness(chain)
    await h.start()
    chain.emit('LevelUp', { coinId: 0, level: 2 }, 1, 1)
    chain.emit('LevelUp', { coinId: 0, level: 3 }, 1, 0)
    chain.emit('LevelUp', { coinId: 0, level: 4 }, 1, 90)
    chain.emit('LevelUp', { coinId: 0, level: 5 }, 1, 900)
    chain.emit('LevelUp', { coinId: 0, level: 6 }, 1, 90000)
    await h.timers.step()
    const ids = h.envelopes.map((e) => e.id)
    expect(ids).toHaveLength(5)
    expect([...ids].sort()).toEqual(ids)
    expect(ids[0]).toMatch(/^\d{12}-\d{6}$/)
    h.feed.stop()
  })

  it('ignores events of other rounds and undecodable events', async () => {
    const chain = new FakeChain()
    const h = harness(chain)
    await h.start()
    chain.emit('LevelUp', { coinId: 0, level: 2 }, 2, 1)
    chain.emit('Redeemed', { holder: 'a.testnet' }, 1, 1)
    chain.emit('LevelUp', { coinId: 0, level: 3 }, 1, 1)
    await h.timers.step()
    expect(h.envelopes.map((e) => e.args['level'])).toEqual([3])
    h.feed.stop()
  })

  it('keeps retrying until the round exists, reporting reconnecting, then polling', async () => {
    const chain = new FakeChain()
    chain.roundExists = false
    const h = harness(chain)
    const started = h.feed.start()
    await flush()
    expect(h.statuses[h.statuses.length - 1]?.upstream).toBe('reconnecting')
    chain.roundExists = true
    await h.timers.step()
    await started
    expect(h.snapshots).toHaveLength(1)
    expect(h.statuses[h.statuses.length - 1]?.upstream).toBe('polling')
    expect(h.statuses[h.statuses.length - 1]?.headBlock).toBe(100)
    h.feed.stop()
  })

  it('survives a transient rpc failure without losing or repeating events', async () => {
    const chain = new FakeChain()
    const h = harness(chain)
    await h.start()
    chain.emit('LevelUp', { coinId: 0, level: 2 }, 1, 1)
    chain.failures = 2
    await h.timers.step()
    expect(h.envelopes).toHaveLength(0)
    expect(h.statuses[h.statuses.length - 1]?.upstream).toBe('reconnecting')
    await h.timers.step()
    await h.timers.step()
    expect(h.envelopes).toHaveLength(1)
    expect(h.statuses[h.statuses.length - 1]?.upstream).toBe('polling')
    h.feed.stop()
  })

  it('stops polling after stop()', async () => {
    const chain = new FakeChain()
    const h = harness(chain)
    await h.start()
    h.feed.stop()
    const before = chain.calls.length
    await h.timers.step()
    expect(chain.calls.length).toBe(before)
  })

  it('drives the store through a lobby, lock and settle without reducer changes', async () => {
    const chain = new FakeChain()
    const h = harness(chain)
    const store = createArenaStore({ houseTokens: new Set() })
    h.feed.onSnapshot((s) => store.hydrate(s))
    h.feed.onEnvelope((e) => store.apply(e))
    h.feed.onCommit((c) => store.commit(c))
    await h.start()
    chain.emit('RoundCreated', { config: { levelingEpochs: 1, launchFee: '100000000000000000000000', vMon0: '20000000000000000000000000' } }, 1, 1)
    chain.emit('CoinLaunched', launchArgs(0), 1, 1)
    chain.emit('CoinLaunched', launchArgs(1), 1, 1)
    chain.emit('RoundStarted', { startedAt: 1_760_000_050, coins: 2 }, 1, 1)
    chain.emit('EpochLocked', { epoch: 1, lockHeight: 110, aliveMask: 3, lockedAt: 1_760_000_060 }, 1, 8)
    await h.timers.step()
    let state = store.getState()
    expect(state.optimistic.coins.map((c) => c.token)).toEqual(['1:0', '1:1'])
    expect(state.optimistic.coins[0]?.creator).toBe('player0.testnet')
    expect(state.optimistic.coins.map((c) => c.isHouse)).toEqual([false, true])
    expect(state.optimistic.round?.locked).toBe(true)
    expect(state.optimistic.round?.lockHeight).toBe(110)
    expect(state.persisted.coins).toHaveLength(0)
    chain.finalHeight = chain.height
    await h.timers.step()
    state = store.getState()
    expect(state.persisted.coins).toHaveLength(2)
    expect(state.persisted.round?.phase).toBe('Leveling')
    chain.emit('CoinEliminated', { coinId: 1, consolationPool: '5', consolationSupply: '6' }, 1, 1)
    chain.emit('RoundSettled', { winnerCoinId: 0, redeemPool: '7', redeemSupply: '8' }, 1, 0)
    chain.finalHeight = chain.height
    await h.timers.step()
    await h.timers.step()
    state = store.getState()
    expect(state.persisted.round?.phase).toBe('Settled')
    expect(state.persisted.coins[0]?.status).toBe('Champion')
    expect(state.persisted.coins[1]?.status).toBe('Eliminated')
    h.feed.stop()
  })
})

describe('event decoding', () => {
  it('produces exactly the documented argument names for every event', () => {
    for (const name of EVENT_NAMES) {
      const envelope = toEnvelope({ seq: 1, height: 5, tsMs: 5000, name, args: sampleArgs(name) }, 'Voted')
      expect(envelope, name).not.toBeNull()
      expect(Object.keys(envelope?.args ?? {}).sort(), name).toEqual([...EVENT_ARG_NAMES[name]].sort())
    }
  })

  it('flattens the nested config into a JSON string and drops events missing an argument', () => {
    const created = toEnvelope({ seq: 1, height: 5, tsMs: 5000, name: 'RoundCreated', args: sampleArgs('RoundCreated') }, 'Voted')
    expect(typeof created?.args['config']).toBe('string')
    const args = sampleArgs('Trade')
    delete args['trader']
    expect(toEnvelope({ seq: 2, height: 5, tsMs: 5000, name: 'Trade', args }, 'Voted')).toBeNull()
    expect(toEnvelope({ seq: 3, height: 5, tsMs: 5000, name: 'Nope', args: {} }, 'Voted')).toBeNull()
  })

  it('uses lockHeight instead of entropySeq on EpochLocked', () => {
    const envelope = toEnvelope({ seq: 1, height: 5, tsMs: 5000, name: 'EpochLocked', args: sampleArgs('EpochLocked') }, 'Voted')
    expect(Object.keys(envelope?.args ?? {})).toContain('lockHeight')
    expect(Object.keys(envelope?.args ?? {})).not.toContain('entropySeq')
  })
})
