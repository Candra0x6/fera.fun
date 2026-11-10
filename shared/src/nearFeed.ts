import { houseTokenSet } from './houseCoins'
import { decodeEventPage, decodeSnapshot, eventRoundId, toEnvelope } from './nearDecode'
import { createNearRpc } from './nearRpc'
import type { NearFetch, NearRpc } from './nearRpc'
import type { ArenaEventEnvelope, ArenaSnapshot, BlockId, ChainFeed, CommitState, FeedStatus } from './types'

export interface NearFeedTimers {
  setTimeout(callback: () => void, ms: number): unknown
  clearTimeout(handle: unknown): void
  now(): number
}

export interface NearFeedOptions {
  rpcUrls: string[]
  arena: string
  roundId: number
  pollMs?: number
  fetchImpl?: NearFetch
  rpc?: NearRpc
  timers?: NearFeedTimers
  houseTokens?: ReadonlySet<string>
  logger?: (message: string, detail?: Record<string, unknown>) => void
}

const PAGE_LIMIT = 100
const MAX_PAGES_PER_TICK = 8
const DEFAULT_POLL_MS = 1000

function defaultTimers(): NearFeedTimers {
  return {
    setTimeout: (callback, ms) => setTimeout(callback, ms),
    clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
    now: () => Date.now()
  }
}

export function createNearFeed(options: NearFeedOptions): ChainFeed {
  const timers = options.timers ?? defaultTimers()
  const rpc = options.rpc ?? createNearRpc({ urls: options.rpcUrls, ...(options.fetchImpl === undefined ? {} : { fetchImpl: options.fetchImpl }) })
  const pollMs = options.pollMs ?? DEFAULT_POLL_MS
  const houseTokens = options.houseTokens ?? houseTokenSet()
  const log = options.logger ?? (() => undefined)

  const snapshotListeners = new Set<(s: ArenaSnapshot) => void>()
  const envelopeListeners = new Set<(e: ArenaEventEnvelope) => void>()
  const commitListeners = new Set<(c: { blockId: BlockId; blockNumber: number; commitState: CommitState }) => void>()
  const retractListeners = new Set<(r: { blockId: BlockId }) => void>()
  const statusListeners = new Set<(s: FeedStatus) => void>()

  const votedHeights = new Set<number>()
  let stopped = true
  let timer: unknown = null
  let baseHeight = -1
  let cursor: number | null = null
  let hasSnapshot = false
  let upstream: FeedStatus['upstream'] = 'reconnecting'
  let headBlock = 0
  let headTimestampMs = 0
  let finalHeight = 0
  let startResolve: (() => void) | null = null

  function emitStatus(): void {
    const lag = headTimestampMs > 0 ? Math.max(0, (timers.now() - headTimestampMs) / 1000) : 0
    const status: FeedStatus = { upstream, headBlock, lagSeconds: Math.round(lag * 1000) / 1000 }
    for (const cb of [...statusListeners]) cb(status)
  }

  function setUpstream(next: FeedStatus['upstream']): void {
    upstream = next
    emitStatus()
  }

  async function adoptSnapshot(): Promise<void> {
    const view = await rpc.callView(options.arena, 'get_arena_snapshot', { round_id: options.roundId })
    const snapshot = decodeSnapshot(view.value, houseTokens)
    baseHeight = snapshot.blockNumber
    if (baseHeight > headBlock) headBlock = baseHeight
    for (const height of [...votedHeights]) {
      if (height <= baseHeight) votedHeights.delete(height)
    }
    hasSnapshot = true
    for (const cb of [...snapshotListeners]) cb(snapshot)
    if (startResolve !== null) {
      startResolve()
      startResolve = null
    }
  }

  function promoteFinalized(): void {
    for (const height of [...votedHeights].sort((a, b) => a - b)) {
      if (height > finalHeight) break
      votedHeights.delete(height)
      const commit = { blockId: String(height), blockNumber: height, commitState: 'Finalized' as const }
      for (const cb of [...commitListeners]) cb(commit)
    }
  }

  function deliver(page: ReturnType<typeof decodeEventPage>): void {
    for (const event of page.events) {
      if (cursor !== null && event.seq <= cursor) continue
      cursor = event.seq
      if (event.height <= baseHeight) continue
      const roundId = eventRoundId(event)
      if (roundId !== null && roundId !== options.roundId) continue
      const state: CommitState = event.height <= finalHeight ? 'Finalized' : 'Voted'
      const envelope = toEnvelope(event, state)
      if (envelope === null) {
        log('undecodable event skipped', { seq: event.seq, name: event.name })
        continue
      }
      if (state === 'Voted') votedHeights.add(event.height)
      for (const cb of [...envelopeListeners]) cb(envelope)
    }
  }

  async function readEvents(): Promise<void> {
    for (let pages = 0; pages < MAX_PAGES_PER_TICK; pages += 1) {
      const view = await rpc.callView(options.arena, 'events_since', { from_seq: cursor ?? 0, limit: PAGE_LIMIT })
      if (view.blockHeight > headBlock) headBlock = view.blockHeight
      const page = decodeEventPage(view.value)
      if (cursor !== null && cursor + 1 < page.oldestSeq) {
        log('event ring overran the cursor, re-snapshotting', { cursor, oldestSeq: page.oldestSeq })
        cursor = Math.max(0, page.oldestSeq - 1)
        await adoptSnapshot()
        continue
      }
      deliver(page)
      if (page.events.length < PAGE_LIMIT) return
    }
  }

  async function tick(): Promise<void> {
    const final = await rpc.blockHeader('final')
    if (final.height > finalHeight) finalHeight = final.height
    if (!hasSnapshot) await adoptSnapshot()
    await readEvents()
    promoteFinalized()
    const head = await rpc.blockHeader('optimistic').catch(() => null)
    if (head !== null) {
      if (head.height > headBlock) headBlock = head.height
      headTimestampMs = head.timestampMs
    }
    if (upstream !== 'polling') setUpstream('polling')
    else emitStatus()
  }

  function schedule(): void {
    if (stopped) return
    timer = timers.setTimeout(() => {
      timer = null
      void run()
    }, pollMs)
  }

  async function run(): Promise<void> {
    if (stopped) return
    try {
      await tick()
    } catch (error) {
      log('poll failed', { error: String(error) })
      setUpstream('reconnecting')
    }
    schedule()
  }

  return {
    async start() {
      if (!stopped) return
      stopped = false
      const ready = new Promise<void>((resolve) => {
        startResolve = resolve
      })
      void run()
      await ready
    },
    stop() {
      stopped = true
      if (timer !== null) timers.clearTimeout(timer)
      timer = null
      if (startResolve !== null) {
        startResolve()
        startResolve = null
      }
    },
    onSnapshot(cb) {
      snapshotListeners.add(cb)
      return () => {
        snapshotListeners.delete(cb)
      }
    },
    onEnvelope(cb) {
      envelopeListeners.add(cb)
      return () => {
        envelopeListeners.delete(cb)
      }
    },
    onCommit(cb) {
      commitListeners.add(cb)
      return () => {
        commitListeners.delete(cb)
      }
    },
    onRetract(cb) {
      retractListeners.add(cb)
      return () => {
        retractListeners.delete(cb)
      }
    },
    onStatus(cb) {
      statusListeners.add(cb)
      return () => {
        statusListeners.delete(cb)
      }
    }
  }
}
