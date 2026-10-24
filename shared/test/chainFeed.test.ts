import { describe, expect, it, vi } from 'vitest'
import { createChainFeed } from '../src/chainFeed'
import { defaultSleep, createArenaStore } from '../src/store'
import type { ArenaEventEnvelope, ArenaSnapshot, CommitState, FeedStatus, Hex } from '../src/types'
import {
  ARENA,
  FakeRpc,
  FakeSocket,
  ManualTimers,
  MULTICALL,
  coinTuple,
  hex32,
  makeRawLog,
  roundTuple
} from './chainHelpers'
import type { ChainFixture } from './chainHelpers'

const WEI = 10n ** 18n

function baseFixture(block = 1000): ChainFixture {
  return {
    snapshotBlock: block,
    snapshotTimestamp: 1_760_000_000 + block,
    round: roundTuple(),
    coins: [coinTuple(0), coinTuple(1)]
  }
}

function tradeValues(rMon: bigint, coinId = 0): Record<string, unknown> {
  return {
    roundId: 1n,
    coinId,
    trader: '0x000000000000000000000000000000000000dEaD',
    isBuy: true,
    monAmount: WEI,
    tokenAmount: 10n,
    rMon,
    vMon: 20n * WEI + rMon,
    vTok: 799n * WEI
  }
}

function harness(head = 1000, fixture: ChainFixture = baseFixture(head), extra: { roundId?: number; deployBlock?: number } = {}) {
  const journal: string[] = []
  const sockets: FakeSocket[] = []
  const timers = new ManualTimers()
  const rpc = new FakeRpc(fixture, journal, head)
  const snapshots: ArenaSnapshot[] = []
  const envelopes: ArenaEventEnvelope[] = []
  const commits: Array<{ blockId: Hex; blockNumber: number; commitState: CommitState }> = []
  const retracts: Hex[] = []
  const statuses: FeedStatus[] = []
  const failCreate = { value: false }
  const feed = createChainFeed(
    { wsUrls: ['ws://one', 'ws://two'], httpUrls: ['http://rpc'], arena: ARENA, roundId: extra.roundId ?? 1, multicall3: MULTICALL, getLogsMaxRange: 100, ...(extra.deployBlock === undefined ? {} : { deployBlock: extra.deployBlock }) },
    {
      createWebSocket: (url) => {
        if (failCreate.value) throw new Error('refused')
        const socket = new FakeSocket(url, journal)
        sockets.push(socket)
        return socket
      },
      fetch: rpc.fetch,
      timers
    }
  )
  feed.onSnapshot((s) => snapshots.push(s))
  feed.onEnvelope((e) => envelopes.push(e))
  feed.onCommit((c) => commits.push(c))
  feed.onRetract((r) => retracts.push(r.blockId))
  feed.onStatus((s) => statuses.push(s))
  return { feed, journal, sockets, timers, rpc, snapshots, envelopes, commits, retracts, statuses, failCreate }
}

type Harness = ReturnType<typeof harness>

async function startLive(h: Harness): Promise<void> {
  const started = h.feed.start()
  const socket = h.sockets[0]
  if (socket === undefined) throw new Error('no socket was created')
  socket.open()
  socket.ackSubscriptions()
  await started
  await vi.waitFor(() => expect(h.statuses.some((s) => s.upstream === 'live')).toBe(true))
}

async function settle(): Promise<void> {
  await defaultSleep(25)
}

function liveSocket(h: Harness): FakeSocket {
  const socket = h.sockets[h.sockets.length - 1]
  if (socket === undefined) throw new Error('no socket')
  return socket
}

describe('ChainFeed start', () => {
  it('subscribes to monadLogs before it reads the snapshot at the finalized tag', async () => {
    const h = harness()
    await startLive(h)
    const firstSubscribe = h.journal.indexOf('ws:eth_subscribe')
    const firstCall = h.journal.indexOf('rpc:eth_call')
    expect(firstSubscribe).toBeGreaterThanOrEqual(0)
    expect(firstCall).toBeGreaterThan(firstSubscribe)
    const first = JSON.parse(liveSocket(h).sent[0] ?? '{}')
    expect(first).toMatchObject({ method: 'eth_subscribe', params: ['monadLogs', { address: ARENA }] })
    const call = h.rpc.calls.find((c) => c.method === 'eth_call')
    expect(call?.params[1]).toBe('finalized')
    expect(h.snapshots).toHaveLength(1)
    expect(h.snapshots[0]?.blockNumber).toBe(1000)
    expect(h.snapshots[0]?.coins).toHaveLength(2)
    expect(h.rpc.calls.filter((c) => c.method === 'eth_call')).toHaveLength(1)
    h.feed.stop()
  })

  it('emits live envelopes, one commit per upgrade, and ignores other contracts', async () => {
    const h = harness()
    await startLive(h)
    const socket = liveSocket(h)
    const proposed = makeRawLog('Trade', tradeValues(6n * WEI), { block: 1005, commitState: 'Proposed' })
    socket.pushLog(proposed)
    socket.pushLog({ ...proposed, address: '0x0000000000000000000000000000000000000001' })
    socket.pushLog({ ...proposed, commitState: 'Voted' })
    socket.pushLog({ ...proposed, commitState: 'Voted' })
    socket.pushLog({ ...proposed, commitState: 'Finalized' })
    await vi.waitFor(() => expect(h.commits).toHaveLength(2))
    expect(h.envelopes).toHaveLength(1)
    expect(h.envelopes[0]).toMatchObject({ name: 'Trade', commitState: 'Proposed', blockNumber: 1005, timestamp: 1_760_001_005 })
    expect(h.commits.map((c) => c.commitState)).toEqual(['Voted', 'Finalized'])
    h.feed.stop()
  })

  it('treats a block that skips Voted correctly and de-duplicates by blockId and logIndex', async () => {
    const h = harness()
    await startLive(h)
    const socket = liveSocket(h)
    const log0 = makeRawLog('Trade', tradeValues(6n * WEI), { block: 1006, logIndex: 0 })
    const log1 = makeRawLog('Trade', tradeValues(7n * WEI), { block: 1006, logIndex: 1 })
    socket.pushLog(log0)
    socket.pushLog(log1)
    socket.pushLog({ ...log0, commitState: 'Finalized' })
    socket.pushLog({ ...log1, commitState: 'Finalized' })
    await vi.waitFor(() => expect(h.commits).toHaveLength(1))
    expect(h.envelopes.map((e) => e.logIndex)).toEqual([0, 1])
    expect(h.commits[0]).toMatchObject({ commitState: 'Finalized', blockNumber: 1006 })
    h.feed.stop()
  })

  it('retracts a block that loses to a finalized sibling and one reported removed', async () => {
    const h = harness()
    await startLive(h)
    const socket = liveSocket(h)
    const loser = makeRawLog('Trade', tradeValues(6n * WEI), { block: 1010, blockId: hex32(0xaaa) })
    const winner = makeRawLog('Trade', tradeValues(9n * WEI), { block: 1010, blockId: hex32(0xbbb) })
    socket.pushLog(loser)
    socket.pushLog({ ...loser, commitState: 'Voted' })
    socket.pushLog(winner)
    socket.pushLog({ ...winner, commitState: 'Finalized' })
    await vi.waitFor(() => expect(h.retracts).toEqual([hex32(0xaaa)]))
    expect(h.envelopes.map((e) => e.blockId)).toEqual([hex32(0xaaa), hex32(0xbbb)])
    socket.pushLog({ ...loser, commitState: 'Finalized' })
    await settle()
    expect(h.envelopes).toHaveLength(2)
    const removed = makeRawLog('Trade', tradeValues(3n * WEI), { block: 1011, blockId: hex32(0xccc) })
    socket.pushLog(removed)
    socket.pushLog({ ...removed, removed: true })
    await vi.waitFor(() => expect(h.retracts).toEqual([hex32(0xaaa), hex32(0xccc)]))
    h.feed.stop()
  })

  it('retracts the seen sibling when a finalized head names a different blockId', async () => {
    const h = harness()
    await startLive(h)
    const socket = liveSocket(h)
    socket.pushLog(makeRawLog('Trade', tradeValues(6n * WEI), { block: 1020, blockId: hex32(0x111) }))
    await vi.waitFor(() => expect(h.envelopes).toHaveLength(1))
    socket.pushHead({ number: '0x3fc', blockId: hex32(0x222), commitState: 'Finalized', timestamp: '0x6a0b8f00' })
    await vi.waitFor(() => expect(h.retracts).toEqual([hex32(0x111)]))
    h.feed.stop()
  })
})

describe('ChainFeed reconnect', () => {
  it('subscribes before the snapshot, buffers, and loses and duplicates no event', async () => {
    const h = harness(1000)
    await startLive(h)
    const first = liveSocket(h)
    const e1 = makeRawLog('Trade', tradeValues(6n * WEI), { block: 1005, commitState: 'Finalized' })
    first.pushLog(e1)
    await vi.waitFor(() => expect(h.envelopes).toHaveLength(1))

    h.rpc.state.fixture = baseFixture(1010)
    h.rpc.state.finalizedHead = 1012
    const e2 = makeRawLog('Trade', tradeValues(7n * WEI), { block: 1011, commitState: 'Finalized' })
    const e3 = makeRawLog('Trade', tradeValues(8n * WEI), { block: 1013, commitState: 'Proposed' })
    h.rpc.state.logs = [e2]

    first.close()
    expect(h.statuses[h.statuses.length - 1]?.upstream).toBe('reconnecting')
    const callsBefore = h.journal.filter((entry) => entry === 'rpc:eth_call').length
    h.timers.advance(500)
    const second = liveSocket(h)
    expect(second).not.toBe(first)
    expect(second.url).toBe('ws://two')
    second.open()
    second.ackSubscriptions('0xlogs2', '0xheads2')
    second.pushLog(e2, '0xlogs2')
    second.pushLog(e3, '0xlogs2')
    second.pushLog(e3, '0xlogs2')
    await vi.waitFor(() => expect(h.snapshots).toHaveLength(2))
    await vi.waitFor(() => expect(h.envelopes).toHaveLength(3))
    await settle()

    const subscribeIndexes = h.journal.map((entry, index) => (entry === 'ws:eth_subscribe' ? index : -1)).filter((i) => i >= 0)
    const callIndexes = h.journal.map((entry, index) => (entry === 'rpc:eth_call' ? index : -1)).filter((i) => i >= 0)
    expect(callIndexes).toHaveLength(callsBefore + 1)
    const secondCall = callIndexes[callIndexes.length - 1] ?? -1
    const secondSubscribe = subscribeIndexes[subscribeIndexes.length - 2] ?? -1
    expect(secondSubscribe).toBeGreaterThan(callIndexes[0] ?? Infinity)
    expect(secondSubscribe).toBeLessThan(secondCall)
    expect(h.envelopes.map((e) => [e.blockNumber, e.commitState])).toEqual([
      [1005, 'Finalized'],
      [1011, 'Finalized'],
      [1013, 'Proposed']
    ])
    expect(h.snapshots[1]?.blockNumber).toBe(1010)
    expect(h.statuses[h.statuses.length - 1]?.upstream).toBe('live')
    h.feed.stop()
  })

  it('backs off exponentially between failed connections', async () => {
    const h = harness()
    await startLive(h)
    h.failCreate.value = true
    liveSocket(h).close()
    const created = h.sockets.length
    h.timers.advance(499)
    expect(h.sockets.length).toBe(created)
    h.timers.advance(2)
    h.timers.advance(1000)
    h.timers.advance(2000)
    expect(h.sockets.length).toBe(created)
    h.failCreate.value = false
    h.timers.advance(4000)
    expect(h.sockets.length).toBe(created + 1)
    h.feed.stop()
  })

  it('falls back to polling finalized logs every second and returns to the socket', async () => {
    const h = harness(1000)
    h.failCreate.value = true
    const started = h.feed.start()
    await started
    expect(h.snapshots).toHaveLength(1)
    await vi.waitFor(() => expect(h.statuses.some((s) => s.upstream === 'polling')).toBe(true))
    h.rpc.state.finalizedHead = 1010
    h.rpc.state.logs = [makeRawLog('Trade', tradeValues(6n * WEI), { block: 1005, commitState: 'Finalized' })]
    h.timers.advance(1000)
    await vi.waitFor(() => expect(h.envelopes).toHaveLength(1))
    expect(h.envelopes[0]).toMatchObject({ blockNumber: 1005, commitState: 'Finalized' })
    h.timers.advance(1000)
    await settle()
    expect(h.envelopes).toHaveLength(1)

    h.failCreate.value = false
    h.timers.advance(5000)
    const socket = liveSocket(h)
    socket.open()
    socket.ackSubscriptions()
    await vi.waitFor(() => expect(h.statuses[h.statuses.length - 1]?.upstream).toBe('live'))
    h.feed.stop()
  })
})

describe('ChainFeed backfill paging', () => {
  it('never asks for more than 100 blocks and keeps at most 5 requests in flight', async () => {
    const h = harness(1000)
    h.rpc.state.finalizedHead = 1750
    h.rpc.state.logs = [1005, 1100, 1101, 1399, 1750].map((block) =>
      makeRawLog('Trade', tradeValues(BigInt(block) * WEI), { block, commitState: 'Finalized' })
    )
    await startLive(h)
    await vi.waitFor(() => expect(h.envelopes).toHaveLength(5))
    expect(h.rpc.logRanges).toHaveLength(8)
    for (const [from, to] of h.rpc.logRanges) {
      expect(to - from + 1).toBeLessThanOrEqual(100)
      expect(from).toBeGreaterThan(1000)
    }
    const sorted = [...h.rpc.logRanges].sort((a, b) => a[0] - b[0])
    expect(sorted[0]?.[0]).toBe(1001)
    expect(sorted[sorted.length - 1]?.[1]).toBe(1750)
    sorted.slice(1).forEach((range, index) => expect(range[0]).toBe((sorted[index]?.[1] ?? 0) + 1))
    expect(h.rpc.maxInFlightLogs).toBeLessThanOrEqual(5)
    expect(h.rpc.maxInFlightLogs).toBeGreaterThan(1)
    expect(h.envelopes.map((e) => e.blockNumber)).toEqual([1005, 1100, 1101, 1399, 1750])
    h.feed.stop()
  })
})

describe('ChainFeed status', () => {
  it('reports the head and the lag from monadNewHeads', async () => {
    const h = harness()
    await startLive(h)
    const stamp = Math.floor(h.timers.now() / 1000) - 3
    liveSocket(h).pushHead({ number: '0x4d2', blockId: hex32(5), commitState: 'Proposed', timestamp: `0x${stamp.toString(16)}` })
    h.timers.advance(1000)
    const last = h.statuses[h.statuses.length - 1]
    expect(last?.upstream).toBe('live')
    expect(last?.headBlock).toBe(1234)
    expect(last?.lagSeconds).toBeGreaterThanOrEqual(3)
    expect(last?.lagSeconds).toBeLessThan(5)
    h.feed.stop()
  })

  it('stops cleanly and cancels its timers', async () => {
    const h = harness()
    await startLive(h)
    h.feed.stop()
    expect(h.timers.size).toBe(0)
    expect(liveSocket(h).closed).toBe(true)
  })
})

describe('ChainFeed with ArenaStore', () => {
  it('reaches the same final store state live as from replay of the same events', async () => {
    const h = harness()
    const live = createArenaStore()
    h.feed.onSnapshot((s) => live.hydrate(s))
    h.feed.onEnvelope((e) => live.apply(e))
    h.feed.onCommit((c) => live.commit(c))
    h.feed.onRetract((r) => live.retract(r))
    await startLive(h)
    const socket = liveSocket(h)

    const a = makeRawLog('Trade', tradeValues(6n * WEI), { block: 1005, blockId: hex32(0xa1) })
    const fork = makeRawLog('Trade', tradeValues(99n * WEI), { block: 1006, blockId: hex32(0xf0) })
    const winner = makeRawLog('Trade', tradeValues(7n * WEI, 1), { block: 1006, blockId: hex32(0xf1) })
    socket.pushLog(a)
    socket.pushLog(fork)
    socket.pushLog({ ...a, commitState: 'Voted' })
    socket.pushLog(winner)
    socket.pushLog({ ...a, commitState: 'Finalized' })
    socket.pushLog({ ...winner, commitState: 'Voted' })
    socket.pushLog({ ...winner, commitState: 'Finalized' })
    await vi.waitFor(() => expect(live.getState().finalizedBlock).toBe(1006))
    await settle()
    expect(h.retracts).toEqual([hex32(0xf0)])

    const replayed = createArenaStore()
    const snapshot = h.snapshots[0]
    if (snapshot === undefined) throw new Error('no snapshot')
    replayed.hydrate(snapshot)
    await replayed.replay(
      h.envelopes.filter((e) => e.blockId !== hex32(0xf0)).map((e) => ({ ...e, commitState: 'Finalized' as const }))
    )
    expect(live.getState().persisted).toEqual(replayed.getState().persisted)
    expect(live.getState().persisted.coins[0]?.rMon).toBe((6n * WEI).toString())
    expect(live.getState().persisted.coins[1]?.rMon).toBe((7n * WEI).toString())
    h.feed.stop()
  })
})

describe('ChainFeed CoinImage backfill before the snapshot base', () => {
  const uri = 'data:image/png;base64,AAAA'
  const imageLog = (block: number, coinId: number, roundId = 1n, logIndex = 0) =>
    makeRawLog('CoinImage', { roundId, coinId, imageUri: uri }, { block, logIndex, commitState: 'Finalized' })

  it('applies an image older than the base through the store without delaying the snapshot', async () => {
    const h = harness(1000, baseFixture(1000), { deployBlock: 900 })
    h.rpc.state.logs = [imageLog(950, 1), imageLog(960, 0, 2n)]
    const store = createArenaStore()
    h.feed.onSnapshot((s) => store.hydrate(s))
    h.feed.onEnvelope((e) => store.apply(e))
    await startLive(h)
    expect(h.snapshots).toHaveLength(1)
    await vi.waitFor(() => expect(store.getState().persisted.coins.find((c) => c.coinId === 1)?.imageUri).toBe(uri))
    expect(store.getState().persisted.coins.find((c) => c.coinId === 0)?.imageUri).toBeUndefined()
    expect(h.envelopes.filter((e) => e.name === 'CoinImage')).toHaveLength(1)
    expect(h.envelopes[0]?.commitState).toBe('Finalized')
    h.feed.stop()
  })

  it('starts at the estimated block, never before deployBlock, and pages at 100 blocks', async () => {
    const h = harness(1000, baseFixture(1000), { deployBlock: 700 })
    await startLive(h)
    await vi.waitFor(() => expect(h.rpc.imageRanges.length).toBeGreaterThan(0))
    const sorted = [...h.rpc.imageRanges].sort((a, b) => a[0] - b[0])
    expect(sorted[0]?.[0]).toBe(700)
    expect(sorted[sorted.length - 1]?.[1]).toBe(1000)
    expect(sorted).toHaveLength(4)
    for (const [from, to] of sorted) expect(to - from + 1).toBeLessThanOrEqual(100)
    sorted.slice(1).forEach((range, index) => expect(range[0]).toBe((sorted[index]?.[1] ?? 0) + 1))
    expect(h.rpc.maxInFlightLogs).toBeLessThanOrEqual(5)
    h.feed.stop()
  })

  it('uses createdAt and serverTime for the start estimate', async () => {
    const fixture = baseFixture(5000)
    fixture.round = roundTuple({ createdAt: 1_760_005_000 - 10 })
    const h = harness(5000, fixture, { deployBlock: 0 })
    await startLive(h)
    await vi.waitFor(() => expect(h.rpc.imageRanges.length).toBeGreaterThan(0))
    const first = [...h.rpc.imageRanges].sort((a, b) => a[0] - b[0])[0]
    expect(first?.[0]).toBe(5000 - (10 * 4 + 200))
    h.feed.stop()
  })

  it('dedupes against a repeated scan and the normal backfill', async () => {
    const h = harness(1000, baseFixture(1000), { deployBlock: 900 })
    h.rpc.state.logs = [imageLog(950, 1), imageLog(1050, 0)]
    h.rpc.state.finalizedHead = 1100
    await startLive(h)
    await vi.waitFor(() => expect(h.envelopes.filter((e) => e.name === 'CoinImage')).toHaveLength(2))
    h.sockets[0]?.close()
    await settle()
    h.timers.advance(20_000)
    await settle()
    expect(h.envelopes.filter((e) => e.name === 'CoinImage')).toHaveLength(2)
    h.feed.stop()
  })

  it('is non-fatal when the image scan fails', async () => {
    const h = harness(1000, baseFixture(1000), { deployBlock: 900 })
    h.rpc.state.logs = [imageLog(950, 1), makeRawLog('Trade', tradeValues(5n * WEI), { block: 1005, commitState: 'Finalized' })]
    h.rpc.state.finalizedHead = 1010
    h.rpc.state.failImageLogs = true
    await startLive(h)
    expect(h.snapshots).toHaveLength(1)
    await vi.waitFor(() => expect(h.envelopes.filter((e) => e.name === 'Trade')).toHaveLength(1))
    await vi.waitFor(() => expect(h.statuses.some((s) => s.upstream === 'live')).toBe(true))
    expect(h.envelopes.filter((e) => e.name === 'CoinImage')).toHaveLength(0)
    h.feed.stop()
  })

  it('scans again for a feed bound to a new round with that round topic', async () => {
    const h = harness(1000, baseFixture(1000), { deployBlock: 900, roundId: 2 })
    h.rpc.state.logs = [imageLog(950, 1, 1n), imageLog(955, 1, 2n)]
    await startLive(h)
    await vi.waitFor(() => expect(h.envelopes.filter((e) => e.name === 'CoinImage')).toHaveLength(1))
    expect(h.envelopes[0]?.args['roundId']).toBe(2)
    expect(h.rpc.imageRanges.length).toBeGreaterThan(0)
    h.feed.stop()
  })
})
