import { describe, expect, it } from 'vitest'
import type { ArenaSnapshot } from '@animal/shared'
import { createSwitchableRelay } from '../src/follow'
import { createRelayHub } from '../src/relay'
import { refreshOnce, runSnapshotRefresh } from '../src/snapshotRefresh'
import type { SnapshotRefreshOptions } from '../src/snapshotRefresh'
import { PollingFeed, event, snapshot } from './nearFeedFixtures'

function withPhase(base: ArenaSnapshot, phase: ArenaSnapshot['round']['phase'], height: number, roundId = 1): ArenaSnapshot {
  return { ...base, blockNumber: height, blockId: String(height), round: { ...base.round, phase, roundId } }
}

describe('relay rebase', () => {
  it('replaces the base snapshot, prunes covered events and does not push anything to live clients', () => {
    const feed = new PollingFeed()
    const hub = createRelayHub(feed)
    feed.snapshot(snapshot(9000))
    feed.envelope(event(9001, 0))
    feed.envelope(event(9005, 0))
    const seen: string[] = []
    hub.subscribe((message) => seen.push(message.kind))
    expect(hub.snapshot()?.round.phase).toBe('Leveling')
    expect(hub.rebase(withPhase(snapshot(9000), 'Knockout', 9003))).toBe(true)
    expect(hub.snapshot()?.round.phase).toBe('Knockout')
    expect(hub.eventsAfter(null).map((entry) => entry.blockNumber)).toEqual([9005])
    expect(seen).toEqual([])
  })

  it('ignores an older snapshot or one for another round', () => {
    const feed = new PollingFeed()
    const hub = createRelayHub(feed)
    feed.snapshot(snapshot(9000))
    expect(hub.rebase(withPhase(snapshot(9000), 'Lobby', 8999))).toBe(false)
    expect(hub.rebase(withPhase(snapshot(9000), 'Lobby', 9100, 2))).toBe(false)
    expect(hub.snapshot()?.blockNumber).toBe(9000)
  })

  it('keeps events already covered by the base out of the replay ring', () => {
    const feed = new PollingFeed()
    const hub = createRelayHub(feed)
    feed.snapshot(snapshot(9000))
    hub.rebase(withPhase(snapshot(9000), 'Knockout', 9010))
    feed.envelope(event(9008, 0))
    feed.envelope(event(9011, 0))
    expect(hub.eventsAfter(null).map((entry) => entry.blockNumber)).toEqual([9011])
  })

  it('gives a late joiner the refreshed snapshot as the first stream message', () => {
    const feed = new PollingFeed()
    const relay = createSwitchableRelay()
    relay.bind(feed)
    feed.snapshot({ ...snapshot(9000), round: { ...snapshot(9000).round, phase: 'Lobby' } })
    relay.rebase(withPhase(snapshot(9000), 'Knockout', 9020))
    expect(relay.snapshot()?.round.phase).toBe('Knockout')
    expect(relay.resume(null)).toEqual([])
  })
})

function options(overrides: Partial<SnapshotRefreshOptions> & { bound?: number | null } = {}) {
  const rebased: ArenaSnapshot[] = []
  const reads: number[] = []
  const value: SnapshotRefreshOptions = {
    boundRound: () => (overrides.bound === undefined ? 1 : overrides.bound),
    read: (roundId) => {
      reads.push(roundId)
      return Promise.resolve(withPhase(snapshot(9000), 'Knockout', 9050, roundId))
    },
    rebase: (next) => {
      rebased.push(next)
      return true
    },
    intervalMs: 4000,
    sleep: () => Promise.resolve(),
    shouldStop: () => false,
    ...overrides
  }
  return { value, rebased, reads }
}

describe('refreshOnce', () => {
  it('does nothing before a round is bound', async () => {
    const o = options({ bound: null })
    expect(await refreshOnce(o.value)).toBe(false)
    expect(o.reads).toEqual([])
  })

  it('reads the bound round and rebases the relay', async () => {
    const o = options()
    expect(await refreshOnce(o.value)).toBe(true)
    expect(o.reads).toEqual([1])
    expect(o.rebased[0]?.round.phase).toBe('Knockout')
  })

  it('drops a read that finished after the relay moved to another round', async () => {
    let bound = 1
    const o = options({
      boundRound: () => bound,
      read: (roundId) => {
        bound = 2
        return Promise.resolve(withPhase(snapshot(9000), 'Knockout', 9050, roundId))
      }
    })
    expect(await refreshOnce(o.value)).toBe(false)
    expect(o.rebased).toHaveLength(0)
  })
})

describe('runSnapshotRefresh', () => {
  it('refreshes on every cycle, survives a failing read and stops on request', async () => {
    let calls = 0
    const errors: string[] = []
    const sleeps: number[] = []
    const o = options({
      read: (roundId) => {
        calls += 1
        if (calls === 2) return Promise.reject(new Error('rpc down'))
        return Promise.resolve(withPhase(snapshot(9000), 'Knockout', 9000 + calls, roundId))
      },
      sleep: (ms) => {
        sleeps.push(ms)
        return Promise.resolve()
      },
      shouldStop: () => sleeps.length >= 4,
      onError: (error) => errors.push(error instanceof Error ? error.message : '')
    })
    await runSnapshotRefresh(o.value)
    expect(calls).toBe(4)
    expect(o.rebased).toHaveLength(3)
    expect(errors).toEqual(['rpc down'])
    expect(sleeps).toEqual([4000, 4000, 4000, 4000])
  })
})
