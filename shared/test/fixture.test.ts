import { describe, expect, it, vi } from 'vitest'
import raw from '../fixtures/arena-replay.json'
import { EVENT_ARG_NAMES, EVENT_NAMES } from '../src/events'
import { launchSeedState, quoteBuy, quoteSell, splitLoss } from '../src/curve'
import type { CurveReserves } from '../src/curve'
import { parseFixture, replayFixture } from '../src/fixture'
import type { FixtureMessage } from '../src/fixture'
import {
  FIXTURE_BASE_TIMESTAMP,
  FIXTURE_BLOCK_MS,
  generateFixture
} from '../src/fixtureBuilder'
import { ceilDiv } from '../src/math'
import { createArenaStore } from '../src/store'
import type { ArenaEventEnvelope, ArenaEventName, ArenaSnapshot } from '../src/types'

const messages = parseFixture(raw)

function snapshotOf(list: readonly FixtureMessage[]): ArenaSnapshot {
  const first = list[0]
  if (first === undefined || first.message.kind !== 'snapshot') throw new Error('the first message must be a snapshot')
  return first.message.data
}

function eventsOf(list: readonly FixtureMessage[]): ArenaEventEnvelope[] {
  const out: ArenaEventEnvelope[] = []
  for (const item of list) {
    if (item.message.kind === 'event') out.push(item.message.data)
  }
  return out
}

function retractedBlocks(list: readonly FixtureMessage[]): Set<string> {
  const out = new Set<string>()
  for (const item of list) {
    if (item.message.kind === 'retract') out.add(item.message.data.blockId)
  }
  return out
}

function big(e: ArenaEventEnvelope, key: string): bigint {
  const value = e.args[key]
  if (typeof value !== 'string' && typeof value !== 'number') throw new Error(`missing ${key} on ${e.name}`)
  return BigInt(value)
}

function numeric(e: ArenaEventEnvelope, key: string): number {
  const value = e.args[key]
  if (typeof value !== 'number') throw new Error(`missing ${key} on ${e.name}`)
  return value
}

describe('fixture structure', () => {
  it('validates against the shared types', () => {
    expect(messages.length).toBeGreaterThan(100)
    expect(() => parseFixture({})).toThrow(TypeError)
    expect(() => parseFixture([{ atMs: 0, message: { kind: 'event', data: {} } }])).toThrow(TypeError)
  })

  it('starts with a 12-coin Lobby snapshot', () => {
    const snapshot = snapshotOf(messages)
    expect(messages[0]?.atMs).toBe(0)
    expect(snapshot.round.phase).toBe('Lobby')
    expect(snapshot.coins).toHaveLength(12)
    expect(snapshot.coins.every((c) => c.isHouse && c.status === 'Alive')).toBe(true)
    expect(new Set(snapshot.coins.map((c) => c.ticker)).size).toBe(12)
    expect(snapshot.coins.every((c) => /^[A-Z0-9]{2,7}$/.test(c.ticker))).toBe(true)
  })

  it('uses exactly the parameter names of every event', () => {
    for (const e of eventsOf(messages)) {
      expect(Object.keys(e.args).sort()).toEqual([...EVENT_ARG_NAMES[e.name]].sort())
    }
  })

  it('gives exactly two launched coins an image, emitted right after their CoinLaunched', () => {
    const events = eventsOf(messages)
    const images = events.filter((e) => e.name === 'CoinImage')
    expect(images).toHaveLength(2)
    for (const image of images) {
      expect(String(image.args['imageUri'])).toMatch(/^data:image\/png;base64,/)
      const launched = events.find((e) => e.name === 'CoinLaunched' && e.args['coinId'] === image.args['coinId'])
      expect(launched?.blockId).toBe(image.blockId)
      expect(image.logIndex).toBe((launched?.logIndex ?? -2) + 1)
    }
  })

  it('covers the required event kinds and phases', () => {
    const events = eventsOf(messages)
    const count = (name: ArenaEventName): number => events.filter((e) => e.name === name).length
    expect(count('CoinLaunched')).toBe(3)
    expect(count('CoinImage')).toBe(2)
    expect(count('RoundStarted')).toBe(1)
    expect(count('EpochCancelled')).toBe(1)
    expect(count('RoundSettled')).toBe(1)
    expect(count('ConsolationClaimed')).toBeGreaterThanOrEqual(1)
    for (const name of [
      'Trade',
      'EpochLocked',
      'SeedReady',
      'HuntResolved',
      'LevelUp',
      'EpochResolved',
      'ClashResolved',
      'Boosted',
      'CoinEliminated',
      'ByeGranted'
    ] as const) {
      expect(count(name)).toBeGreaterThan(0)
    }
    const resolved = events.filter((e) => e.name === 'EpochResolved').map((e) => numeric(e, 'epoch'))
    expect(resolved.filter((epoch) => epoch <= 3)).toEqual([1, 2, 3])
    expect(resolved.filter((epoch) => epoch > 3).length).toBeGreaterThanOrEqual(4)
    expect(events[events.length - 1]?.name).toBe('RoundSettled')
    const kinds = new Set(messages.map((m) => m.message.kind))
    expect([...kinds].sort()).toEqual(['commit', 'event', 'retract', 'snapshot', 'status'])
    const missing = new Set(EVENT_NAMES.filter((name) => count(name) === 0))
    expect(missing).toEqual(new Set(['RoundCreated', 'Redeemed', 'RefundClaimed', 'RoundAborted', 'SeedClaimed', 'TreasuryFunded', 'CoinRefundRate']))
  })

  it('orders messages and ids consistently with 300 ms blocks', () => {
    const snapshot = snapshotOf(messages)
    let previousAt = -1
    for (const item of messages) {
      expect(item.atMs).toBeGreaterThanOrEqual(previousAt)
      previousAt = item.atMs
    }
    let previousId = ''
    for (const e of eventsOf(messages)) {
      expect(e.id >= previousId).toBe(true)
      previousId = e.id
      expect(e.id).toMatch(/^\d{12}-\d{6}$/)
      expect(e.commitState).toBe('Proposed')
      expect(e.timestamp).toBe(
        FIXTURE_BASE_TIMESTAMP + Math.floor(((e.blockNumber - snapshot.blockNumber) * FIXTURE_BLOCK_MS) / 1000)
      )
    }
    for (const item of messages) {
      if (item.message.kind !== 'event') continue
      const offset = item.atMs - (item.message.data.blockNumber - snapshot.blockNumber) * FIXTURE_BLOCK_MS
      expect(offset).toBeGreaterThanOrEqual(0)
      expect(offset).toBeLessThan(FIXTURE_BLOCK_MS)
    }
  })

  it('commits every canonical block, Voted then Finalized, and retracts only forks', () => {
    const forks = retractedBlocks(messages)
    expect(forks.size).toBe(1)
    const eventAt = new Map<string, number>()
    const votedAt = new Map<string, number>()
    const finalizedAt = new Map<string, number>()
    for (const item of messages) {
      const { message } = item
      if (message.kind === 'event' && !eventAt.has(message.data.blockId)) eventAt.set(message.data.blockId, item.atMs)
      if (message.kind === 'commit' && message.data.commitState === 'Voted') votedAt.set(message.data.blockId, item.atMs)
      if (message.kind === 'commit' && message.data.commitState === 'Finalized') finalizedAt.set(message.data.blockId, item.atMs)
    }
    for (const [blockId, at] of eventAt) {
      if (forks.has(blockId)) {
        expect(votedAt.has(blockId)).toBe(false)
        continue
      }
      const voted = votedAt.get(blockId)
      const finalized = finalizedAt.get(blockId)
      expect(voted).toBeGreaterThan(at)
      expect(finalized).toBeGreaterThan(voted ?? Infinity)
    }
  })
})

describe('fixture numbers', () => {
  it('satisfies conservation, the 50/30/15/5 split and the curve rules after every state change', () => {
    const snapshot = snapshotOf(messages)
    const forks = retractedBlocks(messages)
    const tradeFee = BigInt(Number(snapshot.config['tradeFeeBps']))
    const vMon0 = BigInt(String(snapshot.config['vMon0']))
    const vTok0 = BigInt(String(snapshot.config['vTok0']))
    const reserves = new Map<number, CurveReserves & { supply: bigint }>()
    for (const coin of snapshot.coins) {
      reserves.set(coin.coinId, {
        vMon: BigInt(coin.vMon),
        vTok: BigInt(coin.vTok),
        rMon: BigInt(coin.rMon),
        supply: BigInt(coin.supply)
      })
    }
    const take = (coinId: number): CurveReserves & { supply: bigint } => {
      const found = reserves.get(coinId)
      if (found === undefined) throw new Error(`coin ${coinId} unknown`)
      return found
    }
    let pendingClash: { boost: bigint; consolation: bigint; coinId: number; reserve: bigint } | null = null
    let boosts = 0
    let trades = 0
    let sells = 0
    let clashes = 0
    for (const e of eventsOf(messages)) {
      if (forks.has(e.blockId)) continue
      switch (e.name) {
        case 'CoinLaunched': {
          const seeded = launchSeedState(vMon0, vTok0, big(e, 'seedMon'))
          reserves.set(numeric(e, 'coinId'), seeded)
          break
        }
        case 'Trade': {
          const coin = take(numeric(e, 'coinId'))
          const isBuy = e.args['isBuy'] === true
          trades += 1
          if (isBuy) {
            const quote = quoteBuy(coin, big(e, 'monAmount'), tradeFee)
            expect(quote.tokensOut).toBe(big(e, 'tokenAmount'))
            coin.supply += quote.tokensOut
            Object.assign(coin, quote.next)
          } else {
            sells += 1
            const quote = quoteSell(coin, big(e, 'tokenAmount'), tradeFee)
            expect(quote.monOut).toBe(big(e, 'monAmount'))
            coin.supply -= big(e, 'tokenAmount')
            Object.assign(coin, quote.next)
          }
          expect([coin.rMon, coin.vMon, coin.vTok]).toEqual([big(e, 'rMon'), big(e, 'vMon'), big(e, 'vTok')])
          break
        }
        case 'ClashResolved': {
          clashes += 1
          const loser = take(numeric(e, 'loser'))
          const total = big(e, 'boost') + big(e, 'consolation') + big(e, 'toPot') + big(e, 'toTreasury')
          expect(total).toBe(loser.rMon)
          const split = splitLoss(loser.rMon)
          expect(big(e, 'boost')).toBe(split.boost)
          expect(big(e, 'consolation')).toBe(split.consolation)
          expect(big(e, 'toPot')).toBe(split.toPot)
          expect(big(e, 'toTreasury')).toBe(split.toTreasury)
          expect(numeric(e, 'winProbBps')).toBeGreaterThanOrEqual(1500)
          expect(numeric(e, 'winProbBps')).toBeLessThanOrEqual(8500)
          expect(numeric(e, 'roll')).toBeLessThan(10000)
          pendingClash = {
            boost: big(e, 'boost'),
            consolation: big(e, 'consolation'),
            coinId: numeric(e, 'winner'),
            reserve: loser.rMon
          }
          break
        }
        case 'Boosted': {
          boosts += 1
          if (pendingClash === null) throw new Error('Boosted without a clash')
          expect(numeric(e, 'coinId')).toBe(pendingClash.coinId)
          expect(big(e, 'boostMon')).toBe(pendingClash.boost)
          const coin = take(numeric(e, 'coinId'))
          const k = coin.vMon * coin.vTok
          const vMon = coin.vMon + big(e, 'boostMon')
          expect(big(e, 'vMon')).toBe(vMon)
          expect(big(e, 'vTok')).toBe(ceilDiv(k, vMon))
          expect(big(e, 'rMon')).toBe(coin.rMon + big(e, 'boostMon'))
          coin.vMon = big(e, 'vMon')
          coin.vTok = big(e, 'vTok')
          coin.rMon = big(e, 'rMon')
          break
        }
        case 'CoinEliminated': {
          if (pendingClash === null) throw new Error('CoinEliminated without a clash')
          const coin = take(numeric(e, 'coinId'))
          expect(big(e, 'consolationPool')).toBe(pendingClash.consolation)
          expect(big(e, 'consolationSupply')).toBe(coin.supply)
          coin.rMon = 0n
          pendingClash = null
          break
        }
        case 'ConsolationClaimed': {
          const coin = take(numeric(e, 'coinId'))
          coin.supply -= big(e, 'tokens')
          break
        }
        default:
          break
      }
    }
    expect(boosts).toBe(clashes)
    expect(clashes).toBe(14)
    expect(trades).toBeGreaterThan(15)
    expect(sells).toBeGreaterThan(0)
  })

  it('pays a consolation claim at the fixed rate', () => {
    const forks = retractedBlocks(messages)
    const events = eventsOf(messages).filter((e) => !forks.has(e.blockId))
    const claim = events.find((e) => e.name === 'ConsolationClaimed')
    expect(claim).toBeDefined()
    if (claim === undefined) return
    const eliminated = events.find((e) => e.name === 'CoinEliminated' && e.args['coinId'] === claim.args['coinId'])
    expect(eliminated).toBeDefined()
    if (eliminated === undefined) return
    expect(big(claim, 'monPaid')).toBe((big(claim, 'tokens') * big(eliminated, 'consolationPool')) / big(eliminated, 'consolationSupply'))
    expect(claim.args['holder']).toBe('0x70997970c51812dc3a010c7d01b50e0d17dc79c8')
  })

  it('publishes a redeem rate equal to the champion reserve plus the pot', () => {
    const store = createArenaStore()
    return replayFixture(store, messages, { sleep: () => Promise.resolve() }).then(() => {
      const { round, coins } = store.getState().persisted
      expect(round?.phase).toBe('Settled')
      const champion = coins.find((c) => c.coinId === round?.winnerCoinId)
      expect(champion?.status).toBe('Champion')
      expect([champion?.rMon, round?.prizePot]).toEqual(['0', '0'])
      const settledEvent = eventsOf(messages).find((e) => e.name === 'RoundSettled')
      expect(round?.redeemPool).toBe(String(settledEvent?.args['redeemPool']))
      expect(BigInt(round?.redeemPool ?? '0') > 0n).toBe(true)
      expect(BigInt(round?.redeemSupply ?? '0')).toBe(BigInt(champion?.supply ?? '0'))
      expect(round?.aliveCount).toBe(1)
      expect(coins.filter((c) => c.status === 'Eliminated')).toHaveLength(14)
    })
  })
})

describe('fixture mirror rules', () => {
  const snapshot = snapshotOf(messages)
  const forks = retractedBlocks(messages)
  const events = eventsOf(messages).filter((e) => !forks.has(e.blockId))
  const vMon0 = BigInt(String(snapshot.config['vMon0']))
  const vTok0 = BigInt(String(snapshot.config['vTok0']))

  it('keeps rMon == vMon - vMon0 after every launch, trade and boost', () => {
    let checked = 0
    for (const e of events) {
      if (e.name === 'CoinLaunched') {
        const seeded = launchSeedState(vMon0, vTok0, big(e, 'seedMon'))
        expect([big(e, 'vMon'), big(e, 'vTok'), big(e, 'supply')]).toEqual([seeded.vMon, seeded.vTok, seeded.supply])
        expect(seeded.rMon).toBe(big(e, 'vMon') - vMon0)
        checked += 1
      }
      if (e.name === 'Trade' || e.name === 'Boosted') {
        expect(big(e, 'rMon')).toBe(big(e, 'vMon') - vMon0)
        checked += 1
      }
    }
    expect(checked).toBeGreaterThan(40)
    for (const coin of snapshot.coins) expect(BigInt(coin.rMon)).toBe(BigInt(coin.vMon) - vMon0)
  })

  it('tracks xp and level from the events and never lowers them', () => {
    const xp = new Map<number, number>(snapshot.coins.map((c) => [c.coinId, c.xp]))
    const level = new Map<number, number>(snapshot.coins.map((c) => [c.coinId, c.level]))
    for (const e of events) {
      if (e.name === 'CoinLaunched') {
        xp.set(numeric(e, 'coinId'), 0)
        level.set(numeric(e, 'coinId'), 1)
      }
      if (e.name === 'HuntResolved' || e.name === 'Boosted') {
        const id = numeric(e, 'coinId')
        expect(numeric(e, 'xp')).toBe((xp.get(id) ?? 0) + numeric(e, 'xpGained'))
        expect(numeric(e, 'level')).toBeGreaterThanOrEqual(level.get(id) ?? 1)
        xp.set(id, numeric(e, 'xp'))
        level.set(id, numeric(e, 'level'))
      }
      if (e.name === 'LevelUp') {
        expect(numeric(e, 'level')).toBe(level.get(numeric(e, 'coinId')))
      }
    }
  })

  it('moves the treasury and the pot only through the documented events and checkpoints', () => {
    let treasury = BigInt(snapshot.round.treasury)
    let pot = BigInt(snapshot.round.prizePot)
    const launchFee = BigInt(String(snapshot.config['launchFee']))
    let checkpoints = 0
    for (const e of events) {
      if (e.name === 'CoinLaunched') treasury += launchFee
      if (e.name === 'ClashResolved') {
        treasury += big(e, 'toTreasury')
        pot += big(e, 'toPot')
      }
      if (e.name === 'FeesSwept') {
        treasury += big(e, 'toTreasury')
        pot += big(e, 'toPot')
        expect(treasury).toBe(big(e, 'treasuryAfter'))
        expect(pot).toBe(big(e, 'prizePotAfter'))
        checkpoints += 1
      }
      if (e.name === 'TreasurySpent') {
        treasury -= big(e, 'amount')
        expect(treasury).toBe(big(e, 'treasuryAfter'))
        expect(numeric(e, 'kind')).toBeLessThanOrEqual(2)
        checkpoints += 1
      }
    }
    expect(checkpoints).toBeGreaterThan(10)
    const settled = events.find((e) => e.name === 'RoundSettled')
    expect(settled).toBeDefined()
    const store = createArenaStore()
    store.hydrate(snapshot)
    for (const e of events) store.apply({ ...e, commitState: 'Finalized' })
    expect(store.getState().persisted.round?.treasury).toBe(treasury.toString())
    expect(pot > 0n).toBe(true)
    expect(store.getState().persisted.round?.prizePot).toBe('0')
  })

  it('numbers epochs from 1, re-locks the same epoch after a cancel and orders the resolve tail', () => {
    const locks = events.filter((e) => e.name === 'EpochLocked')
    expect(numeric(locks[0] as ArenaEventEnvelope, 'epoch')).toBe(1)
    expect(snapshot.round.epoch).toBe(0)
    const cancelIndex = events.findIndex((e) => e.name === 'EpochCancelled')
    const cancelled = events[cancelIndex]
    const relock = events.slice(cancelIndex + 1).find((e) => e.name === 'EpochLocked')
    expect(relock && cancelled && numeric(relock, 'epoch') === numeric(cancelled, 'epoch')).toBe(true)
    expect(relock?.txHash).not.toBe(events.slice(0, cancelIndex).reverse().find((e) => e.name === 'EpochLocked')?.txHash)
    const resolveIndex = events.findIndex((e) => e.name === 'EpochResolved')
    const tail = events.slice(resolveIndex - 2, resolveIndex + 1).map((e) => e.name)
    expect(tail).toEqual(['FeesSwept', 'TreasurySpent', 'EpochResolved'])
  })

  it('starts the round inside the lobby window implied by createdAt', () => {
    const started = events.find((e) => e.name === 'RoundStarted')
    expect(snapshot.round.createdAt).toBeGreaterThan(0)
    expect(numeric(started as ArenaEventEnvelope, 'startedAt') - snapshot.round.createdAt).toBe(Number(snapshot.config['lobbySeconds']))
  })
})

describe('fixture replay equivalence', () => {
  it('reaches the same final store state through the message stream as through replay of the events', async () => {
    const streamed = createArenaStore()
    await replayFixture(streamed, messages, { sleep: () => Promise.resolve() })
    expect(streamed.getState().persisted).toEqual(streamed.getState().optimistic)
    const forks = retractedBlocks(messages)
    const finalized = eventsOf(messages)
      .filter((e) => !forks.has(e.blockId))
      .map((e) => ({ ...e, commitState: 'Finalized' as const }))
    const replayed = createArenaStore()
    replayed.hydrate(snapshotOf(messages))
    await replayed.replay(finalized)
    expect(replayed.getState().persisted).toEqual(streamed.getState().persisted)
    expect(replayed.getState().persisted.round?.phase).toBe('Settled')
  })

  it('shows the fork as optimistic only until it is retracted', async () => {
    const store = createArenaStore()
    const forks = retractedBlocks(messages)
    const forkIndex = messages.findIndex((m) => m.message.kind === 'event' && forks.has(m.message.data.blockId))
    const retractIndex = messages.findIndex((m) => m.message.kind === 'retract')
    expect(forkIndex).toBeGreaterThan(0)
    expect(retractIndex).toBeGreaterThan(forkIndex)
    const idle = (): Promise<void> => Promise.resolve()
    await replayFixture(store, messages.slice(0, forkIndex + 1), { sleep: idle })
    expect(store.getState().events.some((e) => forks.has(e.blockId))).toBe(true)
    await replayFixture(store, messages.slice(forkIndex + 1), { sleep: idle })
    expect(store.getState().events.some((e) => forks.has(e.blockId))).toBe(false)
  })

  it('paces by atMs and speed and honours a stop request', async () => {
    const sleep = vi.fn((ms: number) => Promise.resolve(ms).then(() => undefined))
    const store = createArenaStore()
    await replayFixture(store, messages, { sleep, speed: 4 })
    const last = messages[messages.length - 1]?.atMs ?? 0
    const total = sleep.mock.calls.reduce((sum, call) => sum + call[0], 0)
    expect(Math.round(total)).toBe(Math.round(last / 4))
    const stopped = createArenaStore()
    let budget = 3
    await replayFixture(stopped, messages, {
      sleep: () => Promise.resolve(),
      shouldStop: () => {
        budget -= 1
        return budget < 0
      }
    })
    expect(stopped.getState().events.length).toBeLessThan(5)
  })

  it('matches the committed file when regenerated', () => {
    expect(JSON.parse(JSON.stringify(generateFixture()))).toEqual(raw)
  })
})
