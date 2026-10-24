import { createArenaStore, parseFixture, replayFixture } from '@animal/shared'
import { describe, expect, it } from 'vitest'
import rawFixture from '@animal/shared/fixtures/arena-replay.json'
import type { ArenaEvents } from '../arena/bridge'
import { createDirector } from './director'
import type { DirectorBridge, FeedRow } from './director'

describe('director over the shared fixture replay', () => {
  it('plays every fixture clash with the winner named in the fixture', async () => {
    const messages = parseFixture(rawFixture)
    const first = messages[0]
    if (first === undefined || first.message.kind !== 'snapshot') throw new Error('fixture must start with a snapshot')
    let clockSeconds = first.message.data.serverTime
    const duelListeners = new Set<(e: ArenaEvents['duel']) => void>()
    const clashes: Array<{ winnerId: string; loserId: string }> = []
    const hunts: string[] = []
    const levelUps: string[] = []
    const eliminated = new Set<string>()
    const settled: string[] = []
    const locks: number[] = []
    const resolves: number[] = []
    const cancels: number[] = []
    const rows: FeedRow[] = []
    let hydrations = 0
    const bridge: DirectorBridge = {
      hydrate: () => void (hydrations += 1),
      spawnCoin: () => undefined,
      updateCoins: () => undefined,
      onTrade: () => undefined,
      onEpochLocked: (e) => void locks.push(e.epoch),
      onSeedReady: () => undefined,
      onEpochResolved: (e) => void resolves.push(e.epoch),
      onClashResolved: (plan) => {
        clashes.push({ winnerId: plan.winnerId, loserId: plan.loserId })
        duelListeners.forEach((listener) =>
          listener({ clashId: plan.clashId, phase: 'merged', winnerId: plan.winnerId, loserId: plan.loserId })
        )
        return Promise.resolve()
      },
      onHuntResolved: (e) => {
        hunts.push(e.id)
        return Promise.resolve()
      },
      onLevelUp: (e) => void levelUps.push(e.id),
      onCoinEliminated: (e) => void eliminated.add(e.id),
      onBye: () => undefined,
      onEpochCancelled: (e) => void cancels.push(e.epoch),
      onRoundSettled: (e) => {
        settled.push(e.winnerId)
        return Promise.resolve()
      },
      camera: { fit: () => undefined },
      on(name, cb) {
        if (name !== 'duel') return () => undefined
        const listener = cb as (e: ArenaEvents['duel']) => void
        duelListeners.add(listener)
        return () => duelListeners.delete(listener)
      }
    }
    const store = createArenaStore({ sleep: () => Promise.resolve() })
    createDirector({ store, bridge, nowSeconds: () => clockSeconds, onFeedRow: (row) => rows.push(row) })
    await replayFixture(store, messages, {
      sleep: (ms) => {
        clockSeconds += ms / 1000
        return Promise.resolve()
      }
    })
    const fixtureClashes = messages.flatMap((item) =>
      item.message.kind === 'event' && item.message.data.name === 'ClashResolved' ? [item.message.data] : []
    )
    expect(hydrations).toBe(1)
    expect(fixtureClashes.length).toBeGreaterThan(0)
    expect(clashes).toHaveLength(fixtureClashes.length)
    expect(clashes.map((clash) => clash.winnerId)).toEqual(
      fixtureClashes.map((e) => `${String(e.args['roundId'])}:${String(e.args['winner'])}`)
    )
    expect(rows).toHaveLength(fixtureClashes.length)
    expect(hunts.length).toBeGreaterThan(0)
    expect(levelUps.length).toBeGreaterThan(0)
    expect(locks.length).toBeGreaterThan(0)
    expect(resolves.length).toBeGreaterThan(0)
    expect(cancels).toHaveLength(1)
    expect(settled).toHaveLength(1)
  })
})
