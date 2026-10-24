import { describe, expect, it } from 'vitest'
import type { ArenaEventEnvelope, ArenaSnapshot, ChainFeed, CommitState, FeedStatus, Hex } from '@animal/shared'
import { createApi } from '../src/api'
import { createRelayHub } from '../src/relay'

function hex(value: number): Hex {
  return `0x${value.toString(16).padStart(64, '0')}`
}

class FakeFeed implements ChainFeed {
  private readonly snapshots = new Set<(s: ArenaSnapshot) => void>()
  private readonly envelopes = new Set<(e: ArenaEventEnvelope) => void>()
  private readonly commits = new Set<(c: { blockId: Hex; blockNumber: number; commitState: CommitState }) => void>()
  private readonly retracts = new Set<(r: { blockId: Hex }) => void>()
  private readonly statuses = new Set<(s: FeedStatus) => void>()
  start(): Promise<void> {
    return Promise.resolve()
  }
  stop(): void {}
  onSnapshot(cb: (s: ArenaSnapshot) => void): () => void {
    this.snapshots.add(cb)
    return () => void this.snapshots.delete(cb)
  }
  onEnvelope(cb: (e: ArenaEventEnvelope) => void): () => void {
    this.envelopes.add(cb)
    return () => void this.envelopes.delete(cb)
  }
  onCommit(cb: (c: { blockId: Hex; blockNumber: number; commitState: CommitState }) => void): () => void {
    this.commits.add(cb)
    return () => void this.commits.delete(cb)
  }
  onRetract(cb: (r: { blockId: Hex }) => void): () => void {
    this.retracts.add(cb)
    return () => void this.retracts.delete(cb)
  }
  onStatus(cb: (s: FeedStatus) => void): () => void {
    this.statuses.add(cb)
    return () => void this.statuses.delete(cb)
  }
  snapshot(s: ArenaSnapshot): void {
    for (const cb of this.snapshots) cb(s)
  }
  envelope(e: ArenaEventEnvelope): void {
    for (const cb of this.envelopes) cb(e)
  }
  commit(c: { blockId: Hex; blockNumber: number; commitState: CommitState }): void {
    for (const cb of this.commits) cb(c)
  }
  retract(r: { blockId: Hex }): void {
    for (const cb of this.retracts) cb(r)
  }
  status(s: FeedStatus): void {
    for (const cb of this.statuses) cb(s)
  }
}

function snapshot(block: number): ArenaSnapshot {
  return {
    config: { maxCoins: 30 },
    round: {
      roundId: 1, phase: 'Leveling', locked: false, epoch: 1, coinCount: 0, aliveCount: 0, cancelStreak: 0,
      winnerCoinId: 0, createdAt: 1, startedAt: 2, lockedAt: 0, lastEpochResolvedAt: 0, prizePot: '0', treasury: '0',
      redeemPool: '0', redeemSupply: '0', clashesPlayed: 0
    },
    coins: [],
    blockNumber: block,
    blockId: hex(block),
    serverTime: 1_760_000_000
  }
}

function envelope(block: number, logIndex = 0, state: CommitState = 'Proposed', blockId = hex(block * 10)): ArenaEventEnvelope {
  return {
    id: `${String(block).padStart(12, '0')}-${String(logIndex).padStart(6, '0')}`,
    name: 'LevelUp',
    blockNumber: block,
    blockId,
    logIndex,
    txHash: hex(block + 1),
    timestamp: 1_760_000_000 + block,
    commitState: state,
    args: { roundId: 1, coinId: 2, level: 3 }
  }
}

interface Frame {
  event: string
  data: string
  id: string | null
}

function parseFrames(text: string): Frame[] {
  return text
    .split('\n\n')
    .filter((chunk) => chunk.trim().length > 0)
    .map((chunk) => {
      const frame: Frame = { event: 'message', data: '', id: null }
      for (const line of chunk.split('\n')) {
        if (line.startsWith('event:')) frame.event = line.slice(6).trim()
        if (line.startsWith('data:')) frame.data += line.slice(5).trim()
        if (line.startsWith('id:')) frame.id = line.slice(3).trim()
      }
      return frame
    })
}

function frameReader(reader: ReadableStreamDefaultReader<Uint8Array>) {
  const decoder = new TextDecoder()
  let text = ''
  return async (until: (frames: Frame[]) => boolean): Promise<Frame[]> => {
    const deadline = Date.now() + 3000
    while (Date.now() < deadline) {
      const frames = parseFrames(text.endsWith('\n\n') ? text : text.slice(0, text.lastIndexOf('\n\n') + 2))
      if (until(frames)) return frames
      const { value, done } = await reader.read()
      if (done) break
      text += decoder.decode(value, { stream: true })
    }
    throw new Error(`stream did not deliver the expected frames: ${text}`)
  }
}

function rows(body: unknown): Array<[number, string]> {
  if (!Array.isArray(body)) throw new Error('expected an array')
  return body.map((entry: unknown) => {
    if (typeof entry !== 'object' || entry === null) throw new Error('expected an object')
    const item = Object.fromEntries(Object.entries(entry))
    return [Number(item['blockNumber']), String(item['commitState'])]
  })
}

function build() {
  const feed = new FakeFeed()
  const hub = createRelayHub(feed, 50)
  const api = createApi({
    health: () => ({ ok: true, headBlock: 1, lagSeconds: 0, keeperAddress: '0x0', roundId: null, round: null }),
    drip: null,
    allowedOrigin: null,
    relay: hub,
    pingMs: 100
  })
  return { feed, hub, api }
}

describe('relay HTTP endpoints', () => {
  it('serves 503 until a snapshot exists, then the base snapshot', async () => {
    const { feed, api } = build()
    expect((await api.request('/snapshot')).status).toBe(503)
    feed.snapshot(snapshot(100))
    const response = await api.request('/snapshot')
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ blockNumber: 100, round: { phase: 'Leveling' } })
  })

  it('lists envelopes after an id with their latest commit state and without retracted blocks', async () => {
    const { feed, api } = build()
    feed.snapshot(snapshot(100))
    feed.envelope(envelope(101))
    feed.envelope(envelope(102, 0, 'Proposed', hex(1020)))
    feed.envelope(envelope(103, 0, 'Proposed', hex(1030)))
    feed.commit({ blockId: hex(1010), blockNumber: 101, commitState: 'Finalized' })
    feed.retract({ blockId: hex(1020) })
    expect(rows(await (await api.request('/events')).json())).toEqual([
      [101, 'Finalized'],
      [103, 'Proposed']
    ])
    expect(rows(await (await api.request(`/events?after=${envelope(101).id}`)).json())).toEqual([[103, 'Proposed']])
  })

  it('drops ring entries at or below a new base snapshot', async () => {
    const { feed, api } = build()
    feed.snapshot(snapshot(100))
    feed.envelope(envelope(101))
    feed.envelope(envelope(105))
    feed.snapshot(snapshot(103))
    expect(rows(await (await api.request('/events')).json())).toEqual([[105, 'Proposed']])
  })
})

describe('GET /stream', () => {
  it('sends the snapshot first, replays the ring, then streams every message kind with envelope ids', async () => {
    const { feed, api } = build()
    feed.snapshot(snapshot(100))
    feed.status({ upstream: 'live', headBlock: 100, lagSeconds: 0.3 })
    feed.envelope(envelope(101))
    const response = await api.request('/stream')
    expect(response.headers.get('content-type')).toContain('text/event-stream')
    const reader = response.body?.getReader()
    if (reader === undefined) throw new Error('no body')
    const read = frameReader(reader)
    const first = await read((frames) => frames.length >= 3)
    expect(first.map((f) => f.event)).toEqual(['snapshot', 'status', 'event'])
    expect(JSON.parse(first[0]?.data ?? '{}')).toMatchObject({ blockNumber: 100 })
    expect(first[2]?.id).toBe(envelope(101).id)

    feed.envelope(envelope(102, 0, 'Proposed', hex(1020)))
    feed.commit({ blockId: hex(1020), blockNumber: 102, commitState: 'Voted' })
    feed.retract({ blockId: hex(1020) })
    feed.status({ upstream: 'polling', headBlock: 103, lagSeconds: 2 })
    const live = await read((frames) => frames.length >= 7)
    expect(live.slice(3).map((f) => f.event)).toEqual(['event', 'commit', 'retract', 'status'])
    expect(live[3]?.id).toBe(envelope(102).id)
    expect(live[4]?.id).toBeNull()
    expect(JSON.parse(live[4]?.data ?? '{}')).toEqual({ blockId: hex(1020), blockNumber: 102, commitState: 'Voted' })
    const ping = await read((frames) => frames.some((f) => f.event === 'ping'))
    expect(ping.some((f) => f.event === 'ping')).toBe(true)
    await reader.cancel()
  })

  it('resumes from Last-Event-ID with newer envelopes, upgraded commit states and retractions', async () => {
    const { feed, api } = build()
    feed.snapshot(snapshot(100))
    feed.envelope(envelope(101))
    feed.envelope(envelope(102, 0, 'Proposed', hex(1020)))
    feed.envelope(envelope(103, 0, 'Proposed', hex(1030)))
    feed.commit({ blockId: hex(1010), blockNumber: 101, commitState: 'Voted' })
    feed.envelope(envelope(104, 0, 'Proposed', hex(1040)))
    feed.retract({ blockId: hex(1030) })
    const response = await api.request('/stream', { headers: { 'last-event-id': envelope(102).id } })
    const reader = response.body?.getReader()
    if (reader === undefined) throw new Error('no body')
    const frames = await frameReader(reader)((all) => all.length >= 5)
    const kinds = frames.map((f) => f.event)
    expect(kinds.slice(0, 1)).toEqual(['snapshot'])
    expect(kinds).toContain('retract')
    expect(kinds).toContain('commit')
    const events = frames.filter((f) => f.event === 'event')
    expect(events.map((f) => f.id)).toEqual([envelope(104).id])
    const retract = frames.find((f) => f.event === 'retract')
    expect(JSON.parse(retract?.data ?? '{}')).toEqual({ blockId: hex(1030) })
    await reader.cancel()
  })
})
