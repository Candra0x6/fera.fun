import { parseEnvelope, parseSnapshot } from '@animal/shared'
import type { ArenaEventEnvelope, ArenaSnapshot, BlockId, ChainFeed, CommitState, FeedStatus } from '@animal/shared'

export interface RelayMessageEvent {
  data: string
}

export interface EventSourceLike {
  addEventListener(type: string, listener: (event: RelayMessageEvent) => void): void
  close(): void
}

export interface RelayFeedOptions {
  baseUrl: string
  roundId: number
  readyTimeoutMs?: number
  createSource?: (url: string) => EventSourceLike
  schedule?: (callback: () => void, ms: number) => unknown
  cancel?: (handle: unknown) => void
}

const DEFAULT_READY_TIMEOUT_MS = 6000
const COMMIT_STATES: readonly CommitState[] = ['Proposed', 'Voted', 'Finalized', 'Verified']
const UPSTREAMS: readonly FeedStatus['upstream'][] = ['live', 'reconnecting', 'polling']

function record(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  return Object.fromEntries(Object.entries(value))
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

function parseCommit(value: unknown): { blockId: BlockId; blockNumber: number; commitState: CommitState } | null {
  const body = record(value)
  if (body === null) return null
  const state = COMMIT_STATES.find((candidate) => candidate === body['commitState'])
  if (typeof body['blockId'] !== 'string' || typeof body['blockNumber'] !== 'number' || state === undefined) return null
  return { blockId: body['blockId'], blockNumber: body['blockNumber'], commitState: state }
}

function parseStatus(value: unknown): FeedStatus | null {
  const body = record(value)
  if (body === null) return null
  const upstream = UPSTREAMS.find((candidate) => candidate === body['upstream'])
  if (upstream === undefined || typeof body['headBlock'] !== 'number' || typeof body['lagSeconds'] !== 'number') return null
  return { upstream, headBlock: body['headBlock'], lagSeconds: body['lagSeconds'] }
}

function snapshotOrNull(value: unknown): ArenaSnapshot | null {
  try {
    return parseSnapshot(value, 'snapshot')
  } catch {
    return null
  }
}

function envelopeOrNull(value: unknown): ArenaEventEnvelope | null {
  try {
    return parseEnvelope(value, 'event')
  } catch {
    return null
  }
}

export function createRelayFeed(options: RelayFeedOptions): ChainFeed {
  const createSource = options.createSource ?? ((url: string) => new EventSource(url))
  const schedule = options.schedule ?? ((callback, ms) => setTimeout(callback, ms))
  const cancel = options.cancel ?? ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>))
  const readyTimeoutMs = options.readyTimeoutMs ?? DEFAULT_READY_TIMEOUT_MS

  const snapshotListeners = new Set<(s: ArenaSnapshot) => void>()
  const envelopeListeners = new Set<(e: ArenaEventEnvelope) => void>()
  const commitListeners = new Set<(c: { blockId: BlockId; blockNumber: number; commitState: CommitState }) => void>()
  const retractListeners = new Set<(r: { blockId: BlockId }) => void>()
  const statusListeners = new Set<(s: FeedStatus) => void>()

  let source: EventSourceLike | null = null
  let timer: unknown = null
  let ready = false
  let settle: { resolve: () => void; reject: (error: Error) => void } | null = null

  function finish(error: Error | null): void {
    if (timer !== null) cancel(timer)
    timer = null
    const pending = settle
    settle = null
    if (pending === null) return
    if (error === null) pending.resolve()
    else pending.reject(error)
  }

  function emitStatus(status: FeedStatus): void {
    for (const cb of [...statusListeners]) cb(status)
  }

  function onSnapshot(raw: string): void {
    const snapshot = snapshotOrNull(parseJson(raw))
    if (snapshot === null) return
    if (snapshot.round.roundId !== options.roundId) {
      finish(new Error(`relay is on round ${snapshot.round.roundId}, expected ${options.roundId}`))
      return
    }
    ready = true
    for (const cb of [...snapshotListeners]) cb(snapshot)
    finish(null)
  }

  function onEvent(raw: string): void {
    if (!ready) return
    const envelope = envelopeOrNull(parseJson(raw))
    if (envelope === null) return
    const roundId = envelope.args['roundId']
    if (typeof roundId === 'number' && roundId !== options.roundId) return
    for (const cb of [...envelopeListeners]) cb(envelope)
  }

  return {
    start() {
      if (source !== null) return Promise.resolve()
      return new Promise<void>((resolve, reject) => {
        settle = { resolve, reject }
        timer = schedule(() => finish(new Error('relay did not answer in time')), readyTimeoutMs)
        const next = createSource(`${options.baseUrl}/stream`)
        source = next
        next.addEventListener('snapshot', (event) => onSnapshot(event.data))
        next.addEventListener('event', (event) => onEvent(event.data))
        next.addEventListener('commit', (event) => {
          const commit = parseCommit(parseJson(event.data))
          if (commit !== null && ready) for (const cb of [...commitListeners]) cb(commit)
        })
        next.addEventListener('retract', (event) => {
          const body = record(parseJson(event.data))
          const blockId = body?.['blockId']
          if (typeof blockId === 'string' && ready) for (const cb of [...retractListeners]) cb({ blockId })
        })
        next.addEventListener('status', (event) => {
          const status = parseStatus(parseJson(event.data))
          if (status !== null && ready) emitStatus(status)
        })
        next.addEventListener('error', () => {
          if (ready) emitStatus({ upstream: 'reconnecting', headBlock: 0, lagSeconds: 0 })
        })
      })
    },
    stop() {
      source?.close()
      source = null
      finish(new Error('relay feed stopped'))
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
