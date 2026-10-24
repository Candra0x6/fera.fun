import type { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import type { ArenaEventEnvelope, ArenaSnapshot, ChainFeed, CommitState, FeedStatus, Hex } from '@animal/shared'

export type RelayMessage =
  | { kind: 'snapshot'; data: ArenaSnapshot }
  | { kind: 'event'; data: ArenaEventEnvelope }
  | { kind: 'commit'; data: { blockId: Hex; blockNumber: number; commitState: CommitState } }
  | { kind: 'retract'; data: { blockId: Hex } }
  | { kind: 'status'; data: FeedStatus }

export interface RelayHub {
  snapshot(): ArenaSnapshot | null
  eventsAfter(after: string | null): ArenaEventEnvelope[]
  resume(after: string | null): RelayMessage[]
  subscribe(cb: (message: RelayMessage) => void): () => void
  lastStatus(): FeedStatus | null
}

const RANK: Readonly<Record<CommitState, number>> = { Proposed: 0, Voted: 1, Finalized: 2, Verified: 3 }

export function createRelayHub(feed: ChainFeed, capacity = 400): RelayHub {
  let base: ArenaSnapshot | null = null
  let status: FeedStatus | null = null
  const ring: ArenaEventEnvelope[] = []
  const retractLog: Array<{ blockId: Hex; afterId: string }> = []
  const listeners = new Set<(message: RelayMessage) => void>()

  function publish(message: RelayMessage): void {
    for (const cb of [...listeners]) cb(message)
  }

  feed.onSnapshot((snapshot) => {
    base = snapshot
    for (let i = ring.length - 1; i >= 0; i -= 1) {
      const entry = ring[i]
      if (entry !== undefined && entry.blockNumber <= snapshot.blockNumber) ring.splice(i, 1)
    }
    publish({ kind: 'snapshot', data: snapshot })
  })
  feed.onEnvelope((envelope) => {
    ring.push(envelope)
    if (ring.length > capacity) ring.shift()
    publish({ kind: 'event', data: envelope })
  })
  feed.onCommit((commit) => {
    for (let i = 0; i < ring.length; i += 1) {
      const entry = ring[i]
      if (entry !== undefined && entry.blockId === commit.blockId && RANK[commit.commitState] > RANK[entry.commitState]) {
        ring[i] = { ...entry, commitState: commit.commitState }
      }
    }
    publish({ kind: 'commit', data: commit })
  })
  feed.onRetract((retract) => {
    const last = ring[ring.length - 1]
    for (let i = ring.length - 1; i >= 0; i -= 1) {
      if (ring[i]?.blockId === retract.blockId) ring.splice(i, 1)
    }
    retractLog.push({ blockId: retract.blockId, afterId: last?.id ?? '' })
    if (retractLog.length > capacity) retractLog.shift()
    publish({ kind: 'retract', data: retract })
  })
  feed.onStatus((next) => {
    status = next
    publish({ kind: 'status', data: next })
  })

  function eventsAfter(after: string | null): ArenaEventEnvelope[] {
    return ring.filter((entry) => after === null || entry.id > after)
  }

  return {
    snapshot: () => base,
    eventsAfter,
    lastStatus: () => status,
    resume(after) {
      const out: RelayMessage[] = []
      const pending = eventsAfter(after)
      for (const lost of retractLog) {
        if (after !== null && lost.afterId >= after) out.push({ kind: 'retract', data: { blockId: lost.blockId } })
      }
      for (const entry of pending) out.push({ kind: 'event', data: entry })
      if (after !== null) {
        const seen = new Set<Hex>()
        for (const entry of ring) {
          if (entry.id <= after && RANK[entry.commitState] > RANK.Proposed && !seen.has(entry.blockId)) {
            seen.add(entry.blockId)
            out.push({
              kind: 'commit',
              data: { blockId: entry.blockId, blockNumber: entry.blockNumber, commitState: entry.commitState }
            })
          }
        }
      }
      return out
    },
    subscribe(cb) {
      listeners.add(cb)
      return () => {
        listeners.delete(cb)
      }
    }
  }
}

export interface RelayMountOptions {
  sleep?: (ms: number) => Promise<void>
  pingMs?: number
}

export function mountRelay(app: Hono, hub: RelayHub, options: RelayMountOptions = {}): void {
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => void setTimeout(resolve, ms)))
  const pingMs = options.pingMs ?? 15_000

  app.get('/snapshot', (c) => {
    const snapshot = hub.snapshot()
    if (snapshot === null) return c.json({ error: 'not_ready' }, 503)
    return c.json(snapshot)
  })

  app.get('/events', (c) => {
    const after = c.req.query('after') ?? null
    return c.json(hub.eventsAfter(after))
  })

  app.get('/stream', (c) => {
    const lastId = c.req.header('last-event-id') ?? c.req.query('after') ?? null
    return streamSSE(c, async (stream) => {
      let open = true
      stream.onAbort(() => {
        open = false
      })
      const send = async (message: RelayMessage): Promise<void> => {
        const body = JSON.stringify(message.data)
        if (message.kind === 'event') {
          await stream.writeSSE({ event: message.kind, data: body, id: message.data.id })
        } else {
          await stream.writeSSE({ event: message.kind, data: body })
        }
      }
      const queue: RelayMessage[] = []
      const off = hub.subscribe((message) => {
        queue.push(message)
      })
      const snapshot = hub.snapshot()
      if (snapshot !== null) await send({ kind: 'snapshot', data: snapshot })
      const status = hub.lastStatus()
      if (status !== null) await send({ kind: 'status', data: status })
      for (const message of hub.resume(lastId)) await send(message)
      try {
        let idle = 0
        while (open) {
          const next = queue.shift()
          if (next !== undefined) {
            await send(next)
            idle = 0
            continue
          }
          await sleep(25)
          idle += 25
          if (idle >= pingMs) {
            await stream.writeSSE({ event: 'ping', data: '{}' })
            idle = 0
          }
        }
      } finally {
        off()
      }
    })
  })
}
