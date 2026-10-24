import { describe, expect, it } from 'vitest'
import type { ArenaEvents, ClashPlan, CoinSceneView } from '../arena/bridge'
import { createDirector } from './director'
import type {
  DirectorBridge,
  DirectorCoin,
  DirectorCommitState,
  DirectorEnvelope,
  DirectorState,
  DirectorStore,
  FeedRow
} from './director'

const WEI = 10n ** 18n

function mon(value: number): string {
  return (BigInt(Math.round(value * 1000)) * (WEI / 1000n)).toString()
}

function coin(coinId: number, rMon: number, overrides: Partial<DirectorCoin> = {}): DirectorCoin {
  return {
    roundId: 1,
    coinId,
    token: `0x${String(coinId).padStart(40, '0')}`,
    name: `Coin ${coinId}`,
    ticker: `C${coinId}`,
    monsterType: coinId % 5,
    skinId: 0,
    status: 'Alive',
    level: 1,
    xp: 0,
    wins: 0,
    rMon: mon(rMon),
    isHouse: false,
    ...overrides
  }
}

let counter = 0

function envelope(
  name: string,
  args: DirectorEnvelope['args'],
  commitState: DirectorCommitState,
  timestamp: number
): DirectorEnvelope {
  counter += 1
  return { id: `env-${counter}`, name, txHash: `0x${counter.toString(16).padStart(64, '0')}`, timestamp, commitState, args }
}

interface Harness {
  state: DirectorState
  emit: () => void
  store: DirectorStore
}

function createHarness(persisted: DirectorCoin[], now: number): Harness {
  const listeners = new Set<() => void>()
  const view = (coins: DirectorCoin[]) => ({
    round: { roundId: 1, phase: 'Knockout', locked: false, epoch: 4, coinCount: coins.length, aliveCount: coins.length, winnerCoinId: 0 },
    coins
  })
  const harness: Harness = {
    state: {
      hydrated: true,
      config: { epochSeconds: 20, maxCoins: 30 },
      persisted: view(persisted),
      optimistic: view(persisted),
      events: []
    },
    emit() {
      for (const listener of [...listeners]) listener()
    },
    store: {
      getState: () => harness.state,
      subscribe(cb) {
        listeners.add(cb)
        return () => listeners.delete(cb)
      }
    }
  }
  void now
  return harness
}

interface BridgeLog {
  hydrate: CoinSceneView[][]
  updates: CoinSceneView[][]
  trades: Array<{ id: string; isBuy: boolean }>
  clashes: ClashPlan[]
  eliminated: string[]
  spawned: Array<{ id: string; animate: boolean | undefined }>
  locked: number[]
  fits: number
}

function createFakeBridge(): { bridge: DirectorBridge; log: BridgeLog; emitDuel: (e: ArenaEvents['duel']) => void } {
  const log: BridgeLog = { hydrate: [], updates: [], trades: [], clashes: [], eliminated: [], spawned: [], locked: [], fits: 0 }
  const duelListeners = new Set<(e: ArenaEvents['duel']) => void>()
  const bridge: DirectorBridge = {
    hydrate: (coins) => void log.hydrate.push(coins),
    spawnCoin: (view, opts) => void log.spawned.push({ id: view.id, animate: opts?.animate }),
    updateCoins: (coins) => void log.updates.push(coins),
    onTrade: (e) => void log.trades.push({ id: e.id, isBuy: e.isBuy }),
    onEpochLocked: (e) => void log.locked.push(e.epoch),
    onSeedReady: () => undefined,
    onEpochResolved: () => undefined,
    onClashResolved: (plan) => {
      log.clashes.push(plan)
      return Promise.resolve()
    },
    onHuntResolved: () => Promise.resolve(),
    onLevelUp: () => undefined,
    onCoinEliminated: (e) => void log.eliminated.push(e.id),
    onBye: () => undefined,
    onEpochCancelled: () => undefined,
    onRoundSettled: () => Promise.resolve(),
    camera: { fit: () => void (log.fits += 1) },
    on(name, cb) {
      if (name !== 'duel') return () => undefined
      const listener = cb as (e: ArenaEvents['duel']) => void
      duelListeners.add(listener)
      return () => duelListeners.delete(listener)
    }
  }
  return { bridge, log, emitDuel: (e) => duelListeners.forEach((listener) => listener(e)) }
}

const NOW = 1_760_900_000

function clashArgs(winner: number, loser: number, clashId = 1): DirectorEnvelope['args'] {
  return {
    roundId: 1,
    epoch: 4,
    clashId,
    winner,
    loser,
    winProbBps: 5600,
    roll: 7000,
    boost: mon(8),
    consolation: mon(4.8),
    toPot: mon(2.4),
    toTreasury: mon(0.8)
  }
}

describe('director', () => {
  it('hydrates the scene from the snapshot with ranks from reserves', () => {
    const harness = createHarness([coin(0, 5), coin(1, 20), coin(2, 12, { status: 'Eliminated' })], NOW)
    const { bridge, log } = createFakeBridge()
    createDirector({ store: harness.store, bridge, nowSeconds: () => NOW })
    expect(log.hydrate).toHaveLength(1)
    expect(log.hydrate[0]?.map((view) => [view.id, view.rank])).toEqual([
      ['1:1', 1],
      ['1:0', 2]
    ])
  })

  it('keeps the leaderboard order for a Proposed Trade and changes it once Finalized', () => {
    const harness = createHarness([coin(0, 5), coin(1, 20)], NOW)
    const { bridge, log } = createFakeBridge()
    createDirector({ store: harness.store, bridge, nowSeconds: () => NOW })
    const trade = envelope(
      'Trade',
      { roundId: 1, coinId: 0, trader: '0xabc', isBuy: true, monAmount: mon(30), tokenAmount: '1', rMon: mon(35), vMon: '1', vTok: '1' },
      'Proposed',
      NOW
    )
    harness.state = {
      ...harness.state,
      optimistic: { ...harness.state.optimistic, coins: [coin(0, 35), coin(1, 20)] },
      events: [trade]
    }
    harness.emit()
    expect(log.trades).toEqual([{ id: '1:0', isBuy: true }])
    expect(log.updates).toHaveLength(0)
    harness.state = {
      ...harness.state,
      persisted: { ...harness.state.persisted, coins: [coin(0, 35), coin(1, 20)] },
      events: [{ ...trade, commitState: 'Finalized' }]
    }
    harness.emit()
    expect(log.trades).toHaveLength(1)
    expect(log.updates).toHaveLength(1)
    expect(log.updates[0]?.map((view) => view.id)).toEqual(['1:0', '1:1'])
  })

  it('pushes an update when a coin image arrives after the coin is already on stage', () => {
    const harness = createHarness([coin(0, 5), coin(1, 20)], NOW)
    const { bridge, log } = createFakeBridge()
    createDirector({ store: harness.store, bridge, nowSeconds: () => NOW })
    const image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
    harness.state = {
      ...harness.state,
      persisted: { ...harness.state.persisted, coins: [coin(0, 5, { imageUri: image }), coin(1, 20)] }
    }
    harness.emit()
    expect(log.updates).toHaveLength(1)
    expect(log.updates[0]?.find((view) => view.id === '1:0')?.imageUri).toBe(image)
    expect(log.updates[0]?.find((view) => view.id === '1:1')?.imageUri).toBeUndefined()
  })

  it('waits for Voted before playing an animation event', () => {
    const harness = createHarness([coin(0, 5), coin(1, 20)], NOW)
    const { bridge, log } = createFakeBridge()
    createDirector({ store: harness.store, bridge, nowSeconds: () => NOW })
    const clash = envelope('ClashResolved', clashArgs(1, 0), 'Proposed', NOW)
    harness.state = { ...harness.state, events: [clash] }
    harness.emit()
    expect(log.clashes).toHaveLength(0)
    harness.state = { ...harness.state, events: [{ ...clash, commitState: 'Voted' }] }
    harness.emit()
    expect(log.clashes).toHaveLength(1)
    expect(log.clashes[0]).toMatchObject({ winnerId: '1:1', loserId: '1:0', boost: 8, consolation: 4.8 })
  })

  it('keeps later animation events behind an unvoted earlier one', () => {
    const harness = createHarness([coin(0, 5), coin(1, 20), coin(2, 7), coin(3, 9)], NOW)
    const { bridge, log } = createFakeBridge()
    createDirector({ store: harness.store, bridge, nowSeconds: () => NOW })
    const first = envelope('ClashResolved', clashArgs(1, 0, 1), 'Proposed', NOW)
    const second = envelope('ClashResolved', clashArgs(3, 2, 2), 'Voted', NOW)
    harness.state = { ...harness.state, events: [first, second] }
    harness.emit()
    expect(log.clashes).toHaveLength(0)
    harness.state = { ...harness.state, events: [{ ...first, commitState: 'Voted' }, second] }
    harness.emit()
    expect(log.clashes.map((plan) => plan.winnerId)).toEqual(['1:1', '1:3'])
  })

  it('fast-forwards an event older than 15 seconds', () => {
    const harness = createHarness([coin(0, 5), coin(1, 20)], NOW)
    const { bridge, log } = createFakeBridge()
    createDirector({ store: harness.store, bridge, nowSeconds: () => NOW })
    const clash = envelope('ClashResolved', clashArgs(1, 0), 'Voted', NOW - 40)
    harness.state = { ...harness.state, events: [clash] }
    harness.emit()
    expect(log.clashes).toHaveLength(0)
    expect(log.eliminated).toEqual(['1:0'])
  })

  it('ignores a duplicate envelope id', () => {
    const harness = createHarness([coin(0, 5), coin(1, 20)], NOW)
    const { bridge, log } = createFakeBridge()
    createDirector({ store: harness.store, bridge, nowSeconds: () => NOW })
    const clash = envelope('ClashResolved', clashArgs(1, 0), 'Voted', NOW)
    harness.state = { ...harness.state, events: [clash] }
    harness.emit()
    harness.state = { ...harness.state, events: [clash, { ...clash }] }
    harness.emit()
    harness.emit()
    expect(log.clashes).toHaveLength(1)
  })

  it('drops a clash whose loser was already removed', () => {
    const harness = createHarness([coin(0, 5), coin(1, 20), coin(2, 9)], NOW)
    const { bridge, log } = createFakeBridge()
    createDirector({ store: harness.store, bridge, nowSeconds: () => NOW })
    const eliminated = envelope(
      'CoinEliminated',
      { roundId: 1, coinId: 0, consolationPool: '0', consolationSupply: '0' },
      'Voted',
      NOW
    )
    const late = envelope('ClashResolved', clashArgs(2, 0, 3), 'Voted', NOW)
    harness.state = { ...harness.state, events: [eliminated, late] }
    harness.emit()
    expect(log.clashes).toHaveLength(0)
    expect(log.eliminated).toEqual(['1:0'])
  })

  it('holds persisted numbers for the clash coins until the merge beat', () => {
    const harness = createHarness([coin(0, 5), coin(1, 20)], NOW)
    const { bridge, log, emitDuel } = createFakeBridge()
    createDirector({ store: harness.store, bridge, nowSeconds: () => NOW })
    const clash = envelope('ClashResolved', clashArgs(0, 1), 'Voted', NOW)
    harness.state = { ...harness.state, events: [clash] }
    harness.emit()
    harness.state = {
      ...harness.state,
      persisted: {
        ...harness.state.persisted,
        coins: [coin(0, 28, { wins: 1 }), coin(1, 0, { status: 'Eliminated' })]
      },
      events: [{ ...clash, commitState: 'Finalized' }]
    }
    harness.emit()
    expect(log.updates).toHaveLength(0)
    emitDuel({ clashId: '1:4:1', phase: 'merged', winnerId: '1:0', loserId: '1:1' })
    expect(log.updates).toHaveLength(1)
    expect(log.updates[0]?.map((view) => [view.id, view.wins])).toEqual([['1:0', 1]])
  })

  it('emits the feed row at the merge beat only once the clash is Finalized', () => {
    const harness = createHarness([coin(0, 5), coin(1, 20)], NOW)
    const { bridge, emitDuel } = createFakeBridge()
    const rows: FeedRow[] = []
    createDirector({ store: harness.store, bridge, nowSeconds: () => NOW, onFeedRow: (row) => rows.push(row) })
    const clash = envelope('ClashResolved', clashArgs(1, 0), 'Voted', NOW)
    harness.state = { ...harness.state, events: [clash] }
    harness.emit()
    emitDuel({ clashId: '1:4:1', phase: 'merged', winnerId: '1:1', loserId: '1:0' })
    expect(rows).toHaveLength(0)
    harness.state = { ...harness.state, events: [{ ...clash, commitState: 'Finalized' }] }
    harness.emit()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ boost: 8, consolation: 4.8, toPot: 2.4, toTreasury: 0.8 })
    expect(rows[0]?.winner.ticker).toBe('C1')
    harness.emit()
    expect(rows).toHaveLength(1)
  })

  it('does not replay history after the store is hydrated again', () => {
    const harness = createHarness([coin(0, 5), coin(1, 20)], NOW)
    const { bridge, log } = createFakeBridge()
    createDirector({ store: harness.store, bridge, nowSeconds: () => NOW })
    const clash = envelope('ClashResolved', clashArgs(1, 0), 'Voted', NOW)
    harness.state = { ...harness.state, events: [clash] }
    harness.emit()
    expect(log.clashes).toHaveLength(1)
    harness.state = { ...harness.state, config: { epochSeconds: 20, maxCoins: 30 }, events: [clash] }
    harness.emit()
    expect(log.hydrate).toHaveLength(2)
    expect(log.clashes).toHaveLength(1)
  })

  it('spawns a launched coin with the pop animation and skips it when stale', () => {
    const harness = createHarness([coin(0, 5)], NOW)
    const { bridge, log } = createFakeBridge()
    createDirector({ store: harness.store, bridge, nowSeconds: () => NOW })
    const launched = envelope(
      'CoinLaunched',
      { roundId: 1, coinId: 7, token: '0x07', creator: '0x01', name: 'Seven', ticker: 'SEVEN', monsterType: 2, skinId: 1, seedMon: mon(5) },
      'Voted',
      NOW
    )
    harness.state = { ...harness.state, events: [launched] }
    harness.emit()
    expect(log.spawned).toEqual([{ id: '1:7', animate: true }])
    const stale = envelope(
      'CoinLaunched',
      { roundId: 1, coinId: 8, token: '0x08', creator: '0x01', name: 'Eight', ticker: 'EIGHT', monsterType: 1, skinId: 0, seedMon: mon(5) },
      'Voted',
      NOW - 60
    )
    harness.state = { ...harness.state, events: [launched, stale] }
    harness.emit()
    expect(log.spawned[1]).toEqual({ id: '1:8', animate: false })
  })

  it('plays the crown finale only after every queued clash has finished', async () => {
    const harness = createHarness([coin(0, 5), coin(1, 20)], NOW)
    const { bridge, log } = createFakeBridge()
    const finished: Array<() => void> = []
    const settled: string[] = []
    const wrapped: DirectorBridge = {
      ...bridge,
      onClashResolved: (plan) => {
        log.clashes.push(plan)
        return new Promise<void>((resolve) => finished.push(resolve))
      },
      onRoundSettled: (e) => {
        settled.push(e.winnerId)
        return Promise.resolve()
      }
    }
    createDirector({ store: harness.store, bridge: wrapped, nowSeconds: () => NOW })
    const clash = envelope('ClashResolved', clashArgs(1, 0), 'Voted', NOW)
    const settledEvent = envelope(
      'RoundSettled',
      { roundId: 1, winnerCoinId: 1, redeemPool: mon(30), redeemSupply: '1' },
      'Voted',
      NOW
    )
    harness.state = { ...harness.state, events: [clash, settledEvent] }
    harness.emit()
    await Promise.resolve()
    expect(log.clashes).toHaveLength(1)
    expect(settled).toHaveLength(0)
    finished.forEach((resolve) => resolve())
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(settled).toEqual(['1:1'])
  })

  it('fits the camera when the round starts', () => {
    const harness = createHarness([coin(0, 5)], NOW)
    const { bridge, log } = createFakeBridge()
    createDirector({ store: harness.store, bridge, nowSeconds: () => NOW })
    const started = envelope('RoundStarted', { roundId: 1, startedAt: NOW, coins: 12 }, 'Voted', NOW)
    harness.state = { ...harness.state, events: [started] }
    harness.emit()
    expect(log.fits).toBe(1)
  })
  it('clears the scene when the store resets and rehydrates the next round', () => {
    const harness = createHarness([coin(0, 5), coin(1, 6)], NOW)
    const { bridge, log } = createFakeBridge()
    createDirector({ store: harness.store, bridge, nowSeconds: () => NOW })
    expect(log.hydrate).toHaveLength(1)
    const previous = harness.state
    harness.state = { ...previous, hydrated: false, config: null, persisted: { round: null, coins: [] }, optimistic: { round: null, coins: [] }, events: [] }
    harness.emit()
    expect(log.hydrate).toHaveLength(2)
    expect(log.hydrate[1]).toEqual([])
    harness.state = { ...previous, hydrated: true, config: { epochSeconds: 20, maxCoins: 30 }, persisted: { round: previous.persisted.round, coins: [coin(0, 9, { roundId: 2 })] } }
    harness.emit()
    expect(log.hydrate).toHaveLength(3)
    expect(log.hydrate[2]?.map((view) => view.id)).toEqual(['2:0'])
  })
})
