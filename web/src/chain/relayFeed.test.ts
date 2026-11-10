import { describe, expect, it } from 'vitest'
import { createRelayFeed } from './relayFeed'
import type { EventSourceLike, RelayMessageEvent } from './relayFeed'

class FakeSource implements EventSourceLike {
  listeners = new Map<string, Array<(event: RelayMessageEvent) => void>>()
  closed = false
  addEventListener(type: string, listener: (event: RelayMessageEvent) => void): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener])
  }
  close(): void {
    this.closed = true
  }
  send(type: string, data: unknown): void {
    for (const listener of this.listeners.get(type) ?? []) listener({ data: JSON.stringify(data) })
  }
}

const SNAPSHOT = {
  config: { levelingEpochs: 1 },
  round: {
    roundId: 4, phase: 'Lobby', locked: false, epoch: 0, coinCount: 0, aliveCount: 0, cancelStreak: 0, winnerCoinId: 0,
    createdAt: 1, startedAt: 0, lockedAt: 0, lastEpochResolvedAt: 0, prizePot: '0', treasury: '0', redeemPool: '0',
    redeemSupply: '0', clashesPlayed: 0
  },
  coins: [],
  blockNumber: 10,
  blockId: '10',
  serverTime: 5
}

const EVENT = {
  id: '000000000011-000002',
  name: 'LevelUp',
  blockNumber: 11,
  blockId: '11',
  logIndex: 2,
  txHash: '',
  timestamp: 6,
  commitState: 'Voted',
  args: { roundId: 4, coinId: 0, level: 2 }
}

function harness(roundId = 4) {
  const source = new FakeSource()
  const timers: Array<() => void> = []
  const feed = createRelayFeed({
    baseUrl: 'https://keeper.example',
    roundId,
    createSource: (url) => {
      expect(url).toBe('https://keeper.example/stream')
      return source
    },
    schedule: (callback) => {
      timers.push(callback)
      return timers.length
    },
    cancel: () => undefined
  })
  const seen = { snapshots: 0, events: [] as string[], commits: [] as number[], statuses: [] as string[] }
  feed.onSnapshot(() => {
    seen.snapshots += 1
  })
  feed.onEnvelope((e) => seen.events.push(e.id))
  feed.onCommit((c) => seen.commits.push(c.blockNumber))
  feed.onStatus((s) => seen.statuses.push(s.upstream))
  return { source, timers, feed, seen }
}

describe('createRelayFeed', () => {
  it('resolves on the matching snapshot, then forwards events, commits and status', async () => {
    const h = harness()
    const started = h.feed.start()
    h.source.send('snapshot', SNAPSHOT)
    await started
    h.source.send('event', EVENT)
    h.source.send('commit', { blockId: '11', blockNumber: 11, commitState: 'Finalized' })
    h.source.send('status', { upstream: 'polling', headBlock: 12, lagSeconds: 1 })
    expect(h.seen).toEqual({ snapshots: 1, events: ['000000000011-000002'], commits: [11], statuses: ['polling'] })
  })

  it('ignores events of another round and malformed payloads', async () => {
    const h = harness()
    const started = h.feed.start()
    h.source.send('snapshot', SNAPSHOT)
    await started
    h.source.send('event', { ...EVENT, args: { roundId: 5, coinId: 0, level: 2 } })
    h.source.send('event', { nope: true })
    h.source.send('commit', { blockId: 3 })
    expect(h.seen.events).toEqual([])
    expect(h.seen.commits).toEqual([])
  })

  it('rejects when the relay is on another round so the caller can fall back', async () => {
    const h = harness(9)
    const started = h.feed.start()
    h.source.send('snapshot', SNAPSHOT)
    await expect(started).rejects.toThrow('relay is on round 4')
    expect(h.seen.snapshots).toBe(0)
  })

  it('rejects when the relay stays silent', async () => {
    const h = harness()
    const started = h.feed.start()
    h.timers[0]?.()
    await expect(started).rejects.toThrow('did not answer')
  })

  it('reports reconnecting after it was ready and closes the source on stop', async () => {
    const h = harness()
    const started = h.feed.start()
    h.source.send('snapshot', SNAPSHOT)
    await started
    h.source.send('error', {})
    expect(h.seen.statuses).toEqual(['reconnecting'])
    h.feed.stop()
    expect(h.source.closed).toBe(true)
  })
})
