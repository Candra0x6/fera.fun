import { decodeArenaLog, encodeSnapshotCall, decodeSnapshotResult, parseCommitState, toInt } from './decode'
import type { RawLog } from './decode'
import { isHex } from './args'
import { toEventSelector } from 'viem'
import { arenaAbi } from './abi'
import { houseTokenSet } from './houseCoins'
import type {
  ArenaEventEnvelope,
  ArenaSnapshot,
  ChainFeed,
  ChainFeedOptions,
  CommitState,
  FeedStatus,
  Hex
} from './types'

export interface WsEventLike {
  data?: unknown
}

export interface WebSocketLike {
  send(data: string): void
  close(): void
  addEventListener(type: 'open' | 'message' | 'close' | 'error', listener: (event: WsEventLike) => void): void
}

export interface FetchResponseLike {
  ok: boolean
  status: number
  json(): Promise<unknown>
}

export type FetchLike = (
  url: string,
  init: { method: 'POST'; headers: Record<string, string>; body: string }
) => Promise<FetchResponseLike>

export interface TimerApi {
  setTimeout(callback: () => void, ms: number): unknown
  clearTimeout(handle: unknown): void
  now(): number
}

export interface ChainFeedDeps {
  createWebSocket: (url: string) => WebSocketLike
  fetch: FetchLike
  timers?: TimerApi
  houseTokens?: ReadonlySet<string>
  backoffBaseMs?: number
  backoffMaxMs?: number
  pollIntervalMs?: number
  maxConcurrentLogRequests?: number
  logger?: (message: string, detail?: Record<string, unknown>) => void
}

export class RpcError extends Error {
  readonly code: number

  constructor(code: number, message: string) {
    super(message)
    this.name = 'RpcError'
    this.code = code
  }
}

const COMMIT_RANK: Readonly<Record<CommitState, number>> = { Proposed: 0, Voted: 1, Finalized: 2, Verified: 3 }
const BLOCK_CACHE_LIMIT = 4096
const IMAGE_SCAN_BLOCKS_PER_SECOND = 4
const IMAGE_SCAN_MARGIN_BLOCKS = 200

const COIN_IMAGE_TOPIC: Hex | null = (() => {
  const item = arenaAbi.find((entry) => entry.type === 'event' && entry.name === 'CoinImage')
  return item === undefined || item.type !== 'event' ? null : toEventSelector(item)
})()

function topicOfUint(value: number): string {
  return `0x${value.toString(16).padStart(64, '0')}`
}

function defaultTimers(): TimerApi {
  const host = globalThis as {
    setTimeout?: (callback: () => void, ms: number) => unknown
    clearTimeout?: (handle: unknown) => void
  }
  return {
    setTimeout: (callback, ms) => {
      if (host.setTimeout === undefined) throw new Error('no timer implementation available')
      return host.setTimeout(callback, ms)
    },
    clearTimeout: (handle) => host.clearTimeout?.(handle),
    now: () => Date.now()
  }
}

function hexQuantity(value: number): string {
  return `0x${value.toString(16)}`
}

function isFinalState(state: CommitState): boolean {
  return COMMIT_RANK[state] >= COMMIT_RANK.Finalized
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  return Object.fromEntries(Object.entries(value))
}

function asRawLog(value: unknown): RawLog | null {
  const r = asRecord(value)
  if (r === null) return null
  const { address, topics, data, blockNumber, logIndex, transactionHash } = r
  if (typeof address !== 'string' || !Array.isArray(topics) || typeof data !== 'string') return null
  if ((typeof blockNumber !== 'string' && typeof blockNumber !== 'number') || (typeof logIndex !== 'string' && typeof logIndex !== 'number')) {
    return null
  }
  if (typeof transactionHash !== 'string' || !topics.every((t: unknown) => typeof t === 'string')) return null
  const optionalText = (key: string): string | null => {
    const v = r[key]
    return typeof v === 'string' ? v : null
  }
  const stamp = r['blockTimestamp']
  return {
    address,
    topics: topics.filter((t: unknown): t is string => typeof t === 'string'),
    data,
    blockNumber,
    logIndex,
    transactionHash,
    blockHash: optionalText('blockHash'),
    blockId: optionalText('blockId'),
    commitState: optionalText('commitState'),
    blockTimestamp: typeof stamp === 'string' || typeof stamp === 'number' ? stamp : null,
    removed: r['removed'] === true
  }
}

export function createChainFeed(options: ChainFeedOptions, deps: ChainFeedDeps): ChainFeed {
  const timers = deps.timers ?? defaultTimers()
  const houseTokens = deps.houseTokens ?? houseTokenSet()
  const backoffBase = deps.backoffBaseMs ?? 500
  const backoffMax = deps.backoffMaxMs ?? 10_000
  const pollInterval = deps.pollIntervalMs ?? 1000
  const maxConcurrent = deps.maxConcurrentLogRequests ?? 5
  const arena = options.arena.toLowerCase()
  const log = deps.logger ?? (() => undefined)

  const snapshotListeners = new Set<(s: ArenaSnapshot) => void>()
  const envelopeListeners = new Set<(e: ArenaEventEnvelope) => void>()
  const commitListeners = new Set<(c: { blockId: Hex; blockNumber: number; commitState: CommitState }) => void>()
  const retractListeners = new Set<(r: { blockId: Hex }) => void>()
  const statusListeners = new Set<(s: FeedStatus) => void>()

  const seen = new Map<string, ArenaEventEnvelope>()
  const blockState = new Map<Hex, CommitState>()
  const blocksAtHeight = new Map<number, Set<Hex>>()
  const finalizedAt = new Map<number, Hex>()
  const finalizedKeys = new Set<string>()
  const timestamps = new Map<number, number>()

  let stopped = true
  let ws: WebSocketLike | null = null
  let connectionId = 0
  let logsSubscription: string | null = null
  let headsSubscription: string | null = null
  let upstream: FeedStatus['upstream'] = 'reconnecting'
  let live = false
  let buffer: RawLog[] = []
  let baseBlock = -1
  let lastFinalized = -1
  let headBlock = 0
  let headTimestamp = 0
  let attempt = 0
  let urlCursor = 0
  let httpCursor = 0
  let reconnectTimer: unknown = null
  let pollTimer: unknown = null
  let statusTimer: unknown = null
  let hasSnapshot = false
  let lastFinalizedIngested = -1
  let startResolve: (() => void) | null = null
  let queue: Promise<void> = Promise.resolve()
  const imageKeys = new Set<string>()
  let imageScanRound = -1
  let imageScannedTo = -1
  let imageScanId = 0

  function emitStatus(): void {
    const now = timers.now() / 1000
    const lagSeconds = headTimestamp > 0 ? Math.max(0, now - headTimestamp) : 0
    const status: FeedStatus = { upstream, headBlock, lagSeconds: Math.round(lagSeconds * 1000) / 1000 }
    for (const cb of [...statusListeners]) cb(status)
  }

  function setUpstream(next: FeedStatus['upstream']): void {
    upstream = next
    emitStatus()
  }

  function enqueue(task: () => Promise<void>): void {
    queue = queue.then(task).catch((error: unknown) => {
      log('feed task failed', { error: String(error) })
    })
  }

  async function rpc(method: string, params: unknown[]): Promise<unknown> {
    const urls = options.httpUrls
    if (urls.length === 0) throw new Error('no http endpoints configured')
    let lastError: unknown = new Error('no endpoint answered')
    for (let i = 0; i < urls.length; i += 1) {
      const index = (httpCursor + i) % urls.length
      const url = urls[index]
      if (url === undefined) continue
      try {
        const response = await deps.fetch(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params })
        })
        if (!response.ok) throw new Error(`http ${response.status} from ${url}`)
        const body = asRecord(await response.json())
        if (body === null) throw new Error('malformed json-rpc response')
        const error = asRecord(body['error'])
        if (error !== null) {
          const code = typeof error['code'] === 'number' ? error['code'] : -1
          const message = typeof error['message'] === 'string' ? error['message'] : 'rpc error'
          throw new RpcError(code, message)
        }
        httpCursor = index
        return body['result']
      } catch (error) {
        lastError = error
        if (error instanceof RpcError) throw error
      }
    }
    throw lastError
  }

  async function timestampOf(blockNumber: number, raw: string | number | null | undefined): Promise<number> {
    const inline = toInt(raw)
    if (inline !== null) {
      timestamps.set(blockNumber, inline)
      return inline
    }
    const cached = timestamps.get(blockNumber)
    if (cached !== undefined) return cached
    try {
      const block = asRecord(await rpc('eth_getBlockByNumber', [hexQuantity(blockNumber), false]))
      const found = block === null ? null : toInt(typeof block['timestamp'] === 'string' ? block['timestamp'] : null)
      if (found !== null) {
        timestamps.set(blockNumber, found)
        if (timestamps.size > BLOCK_CACHE_LIMIT) {
          const oldest = timestamps.keys().next()
          if (!oldest.done) timestamps.delete(oldest.value)
        }
        return found
      }
    } catch (error) {
      log('block timestamp lookup failed', { blockNumber, error: String(error) })
    }
    return Math.floor(timers.now() / 1000)
  }

  function emitRetract(blockId: Hex): void {
    let touched = false
    for (const [key, e] of [...seen]) {
      if (e.blockId === blockId) {
        seen.delete(key)
        touched = true
      }
    }
    const state = blockState.get(blockId)
    blockState.delete(blockId)
    for (const set of blocksAtHeight.values()) set.delete(blockId)
    if (touched || state !== undefined) {
      for (const cb of [...retractListeners]) cb({ blockId })
    }
  }

  function markFinalized(height: number, blockId: Hex): void {
    if (height > lastFinalized) lastFinalized = height
    if (finalizedAt.has(height)) return
    finalizedAt.set(height, blockId)
    const siblings = blocksAtHeight.get(height)
    if (siblings === undefined) return
    for (const other of [...siblings]) {
      if (other !== blockId) emitRetract(other)
    }
  }

  function noteBlock(blockId: Hex, height: number, state: CommitState, emitCommit: boolean): void {
    const set = blocksAtHeight.get(height) ?? new Set<Hex>()
    set.add(blockId)
    blocksAtHeight.set(height, set)
    if (height > headBlock) headBlock = height
    const known = blockState.get(blockId)
    if (known === undefined || COMMIT_RANK[state] > COMMIT_RANK[known]) {
      blockState.set(blockId, state)
      if (known !== undefined && emitCommit) {
        for (const cb of [...commitListeners]) cb({ blockId, blockNumber: height, commitState: state })
      }
    }
    if (isFinalState(state)) markFinalized(height, blockId)
  }

  async function ingest(raw: RawLog, authoritative: boolean): Promise<void> {
    if (raw.address.toLowerCase() !== arena) return
    const height = toInt(raw.blockNumber)
    const logIndex = toInt(raw.logIndex)
    const blockIdText = raw.blockId ?? raw.blockHash
    if (height === null || logIndex === null || !isHex(blockIdText)) return
    if (height <= baseBlock) return
    const blockId: Hex = blockIdText
    if (raw.removed === true) {
      emitRetract(blockId)
      return
    }
    const state: CommitState = authoritative ? 'Finalized' : parseCommitState(raw.commitState)
    const finalKey = `${height}:${logIndex}`
    if (authoritative) {
      if (finalizedKeys.has(finalKey)) return
    } else {
      const winner = finalizedAt.get(height)
      if (winner !== undefined && winner !== blockId) return
      if (height <= lastFinalized && winner === undefined) return
      if (finalizedKeys.has(finalKey) && !seen.has(`${blockId}:${logIndex}`)) return
    }
    const key = `${blockId}:${logIndex}`
    if (!seen.has(key)) {
      const timestamp = await timestampOf(height, raw.blockTimestamp)
      const envelope = decodeArenaLog(raw, { timestamp, commitState: state })
      if (envelope === null) {
        log('undecodable log skipped', { height, logIndex })
        return
      }
      const known = blockState.get(blockId)
      const effective = known !== undefined && COMMIT_RANK[known] > COMMIT_RANK[state] ? known : state
      const delivered: ArenaEventEnvelope = { ...envelope, commitState: effective }
      seen.set(key, delivered)
      noteBlock(blockId, height, effective, false)
      if (isFinalState(effective)) finalizedKeys.add(finalKey)
      for (const cb of [...envelopeListeners]) cb(delivered)
      return
    }
    noteBlock(blockId, height, state, true)
    if (isFinalState(state)) finalizedKeys.add(finalKey)
  }

  function compareRaw(a: RawLog, b: RawLog): number {
    const heightA = toInt(a.blockNumber) ?? 0
    const heightB = toInt(b.blockNumber) ?? 0
    if (heightA !== heightB) return heightA - heightB
    return (toInt(a.logIndex) ?? 0) - (toInt(b.logIndex) ?? 0)
  }

  async function readSnapshot(): Promise<ArenaSnapshot> {
    const data = encodeSnapshotCall(options.arena, options.multicall3, options.roundId)
    const returned = await rpc('eth_call', [{ to: options.multicall3, data }, 'finalized'])
    if (!isHex(returned)) throw new Error('eth_call returned no data')
    const { snapshot } = decodeSnapshotResult(returned, options.roundId, houseTokens)
    let blockId: Hex = `0x${'0'.repeat(64)}`
    try {
      const block = asRecord(await rpc('eth_getBlockByNumber', [hexQuantity(snapshot.blockNumber), false]))
      const candidate = block === null ? null : (block['blockId'] ?? block['hash'])
      if (isHex(candidate)) blockId = candidate
    } catch (error) {
      log('snapshot block lookup failed', { error: String(error) })
    }
    return { ...snapshot, blockId }
  }

  let logSlots = 0
  const logWaiters: Array<() => void> = []

  async function acquireLogSlot(): Promise<void> {
    if (logSlots < maxConcurrent) {
      logSlots += 1
      return
    }
    await new Promise<void>((resolve) => logWaiters.push(resolve))
  }

  function releaseLogSlot(): void {
    const next = logWaiters.shift()
    if (next === undefined) logSlots -= 1
    else next()
  }

  async function fetchLogPages(from: number, to: number, topics?: Array<string | null>): Promise<RawLog[]> {
    const ranges: Array<[number, number]> = []
    for (let start = from; start <= to; start += options.getLogsMaxRange) {
      ranges.push([start, Math.min(to, start + options.getLogsMaxRange - 1)])
    }
    const pages: RawLog[][] = new Array<RawLog[]>(ranges.length).fill([])
    let next = 0
    async function worker(): Promise<void> {
      while (next < ranges.length) {
        const index = next
        next += 1
        const range = ranges[index]
        if (range === undefined) continue
        await acquireLogSlot()
        let result: unknown
        try {
          result = await rpc('eth_getLogs', [
            {
              address: options.arena,
              fromBlock: hexQuantity(range[0]),
              toBlock: hexQuantity(range[1]),
              ...(topics === undefined ? {} : { topics })
            }
          ])
        } finally {
          releaseLogSlot()
        }
        if (!Array.isArray(result)) throw new Error('eth_getLogs returned no list')
        pages[index] = result.map(asRawLog).filter((item): item is RawLog => item !== null)
      }
    }
    const workers = Array.from({ length: Math.min(maxConcurrent, ranges.length) }, () => worker())
    await Promise.all(workers)
    return pages.flat().sort(compareRaw)
  }

  async function ingestOldImage(raw: RawLog): Promise<void> {
    if (raw.address.toLowerCase() !== arena || raw.removed === true) return
    const height = toInt(raw.blockNumber)
    const logIndex = toInt(raw.logIndex)
    const blockIdText = raw.blockId ?? raw.blockHash
    if (height === null || logIndex === null || !isHex(blockIdText)) return
    const key = `${blockIdText}:${logIndex}`
    if (imageKeys.has(key)) return
    const timestamp = await timestampOf(height, raw.blockTimestamp)
    const envelope = decodeArenaLog(raw, { timestamp, commitState: 'Finalized' })
    if (envelope === null || envelope.name !== 'CoinImage') return
    imageKeys.add(key)
    const delivered: ArenaEventEnvelope = { ...envelope, commitState: 'Finalized' }
    for (const cb of [...envelopeListeners]) cb(delivered)
  }

  async function backfillImages(snapshot: ArenaSnapshot): Promise<void> {
    const scan = imageScanId + 1
    imageScanId = scan
    try {
      if (COIN_IMAGE_TOPIC === null) return
      const roundId = options.roundId
      if (imageScanRound !== roundId) {
        imageScanRound = roundId
        imageScannedTo = -1
        imageKeys.clear()
      }
      const base = snapshot.blockNumber
      const createdAt = snapshot.round.createdAt
      const deployBlock = options.deployBlock ?? 0
      let from: number
      if (imageScannedTo >= 0) {
        from = imageScannedTo + 1
      } else {
        if (!(createdAt > 0) || snapshot.serverTime < createdAt) {
          log('image backfill skipped: round createdAt unknown', { createdAt })
          return
        }
        const span = Math.ceil((snapshot.serverTime - createdAt) * IMAGE_SCAN_BLOCKS_PER_SECOND) + IMAGE_SCAN_MARGIN_BLOCKS
        from = Math.max(deployBlock, base - span)
      }
      if (from > base) return
      const logs = await fetchLogPages(from, base, [COIN_IMAGE_TOPIC, topicOfUint(roundId)])
      if (stopped || scan !== imageScanId || options.roundId !== imageScanRound) return
      for (const raw of logs) await ingestOldImage(raw)
      imageScannedTo = base
    } catch (error) {
      log('image backfill failed', { error: String(error) })
    }
  }

  async function finalizedHead(): Promise<{ number: number; blockId: Hex | null; timestamp: number }> {
    const block = asRecord(await rpc('eth_getBlockByNumber', ['finalized', false]))
    if (block === null) throw new Error('no finalized block')
    const number = toInt(typeof block['number'] === 'string' ? block['number'] : null)
    if (number === null) throw new Error('finalized block has no number')
    const id = block['blockId'] ?? block['hash']
    const stamp = toInt(typeof block['timestamp'] === 'string' ? block['timestamp'] : null)
    return { number, blockId: isHex(id) ? id : null, timestamp: stamp ?? 0 }
  }

  async function adoptSnapshot(): Promise<void> {
    const snapshot = await readSnapshot()
    baseBlock = snapshot.blockNumber
    if (baseBlock > lastFinalized) lastFinalized = baseBlock
    if (baseBlock > headBlock) headBlock = baseBlock
    if (snapshot.serverTime > headTimestamp) headTimestamp = snapshot.serverTime
    for (const [key, e] of [...seen]) {
      if (e.blockNumber <= baseBlock) seen.delete(key)
    }
    hasSnapshot = true
    for (const cb of [...snapshotListeners]) cb(snapshot)
    void backfillImages(snapshot)
    if (startResolve !== null) {
      startResolve()
      startResolve = null
    }
  }

  async function backfillFinalized(): Promise<void> {
    const head = await finalizedHead()
    if (head.timestamp > headTimestamp) headTimestamp = head.timestamp
    if (head.number > headBlock) headBlock = head.number
    const from = Math.max(baseBlock, lastFinalizedIngested) + 1
    if (head.number >= from) {
      const logs = await fetchLogPages(from, head.number)
      for (const raw of logs) await ingest(raw, true)
      lastFinalizedIngested = head.number
    }
    if (head.number > lastFinalized) lastFinalized = head.number
  }

  async function runSync(id: number): Promise<void> {
    try {
      await adoptSnapshot()
      if (id !== connectionId || stopped) return
      lastFinalizedIngested = Math.max(lastFinalizedIngested, baseBlock)
      await backfillFinalized()
      if (id !== connectionId || stopped) return
      const pending = buffer.sort(compareRaw)
      buffer = []
      for (const raw of pending) await ingest(raw, false)
      live = true
      attempt = 0
      stopPolling()
      setUpstream('live')
    } catch (error) {
      log('sync failed', { error: String(error) })
      if (id === connectionId && !stopped) {
        ws?.close()
        handleDisconnect(id)
      }
    }
  }

  function stopPolling(): void {
    if (pollTimer !== null) {
      timers.clearTimeout(pollTimer)
      pollTimer = null
    }
  }

  function schedulePoll(): void {
    stopPolling()
    pollTimer = timers.setTimeout(() => {
      pollTimer = null
      enqueue(async () => {
        if (stopped || live) return
        await pollOnce()
        if (!stopped && !live) schedulePoll()
      })
    }, pollInterval)
  }

  async function pollOnce(): Promise<void> {
    try {
      if (!hasSnapshot) {
        await adoptSnapshot()
        lastFinalizedIngested = Math.max(lastFinalizedIngested, baseBlock)
      }
      await backfillFinalized()
      if (upstream !== 'polling') setUpstream('polling')
    } catch (error) {
      log('poll failed', { error: String(error) })
    }
  }

  function startPolling(): void {
    if (pollTimer !== null || stopped || live) return
    enqueue(async () => {
      if (stopped || live) return
      await pollOnce()
      if (!stopped && !live) schedulePoll()
    })
  }

  function handleDisconnect(id: number): void {
    if (id !== connectionId || stopped) return
    connectionId += 1
    ws = null
    logsSubscription = null
    headsSubscription = null
    live = false
    if (upstream === 'live') setUpstream('reconnecting')
    startPolling()
    const delay = Math.min(backoffMax, backoffBase * 2 ** attempt)
    attempt += 1
    if (reconnectTimer !== null) timers.clearTimeout(reconnectTimer)
    reconnectTimer = timers.setTimeout(() => {
      reconnectTimer = null
      connect()
    }, delay)
  }

  function handleHead(result: Record<string, unknown>): void {
    const number = toInt(typeof result['number'] === 'string' ? result['number'] : null)
    if (number === null) return
    const stamp = toInt(typeof result['timestamp'] === 'string' ? result['timestamp'] : null)
    if (stamp !== null) {
      timestamps.set(number, stamp)
      if (number >= headBlock) headTimestamp = stamp
    }
    if (number > headBlock) headBlock = number
    const id = result['blockId'] ?? result['hash']
    if (isHex(id) && isFinalState(parseCommitState(result['commitState']))) {
      markFinalized(number, id)
    }
  }

  function handleMessage(id: number, text: string): void {
    if (id !== connectionId) return
    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    } catch {
      return
    }
    const message = asRecord(parsed)
    if (message === null) return
    if (message['id'] === 1) {
      if (typeof message['result'] === 'string') {
        logsSubscription = message['result']
        live = false
        buffer = []
        enqueue(() => runSync(id))
      } else {
        log('log subscription rejected', { error: JSON.stringify(message['error']) })
        ws?.close()
        handleDisconnect(id)
      }
      return
    }
    if (message['id'] === 2) {
      if (typeof message['result'] === 'string') headsSubscription = message['result']
      return
    }
    if (message['method'] !== 'eth_subscription') return
    const params = asRecord(message['params'])
    if (params === null) return
    const subscription = params['subscription']
    if (subscription === headsSubscription) {
      const head = asRecord(params['result'])
      if (head !== null) handleHead(head)
      return
    }
    if (subscription !== logsSubscription) return
    const raw = asRawLog(params['result'])
    if (raw === null) return
    if (!live) {
      buffer.push(raw)
      return
    }
    enqueue(() => ingest(raw, false))
  }

  function connect(): void {
    if (stopped) return
    const urls = options.wsUrls
    const url = urls[urlCursor % Math.max(1, urls.length)]
    urlCursor += 1
    if (url === undefined) {
      startPolling()
      return
    }
    connectionId += 1
    const id = connectionId
    let socket: WebSocketLike
    try {
      socket = deps.createWebSocket(url)
    } catch (error) {
      log('websocket creation failed', { error: String(error) })
      handleDisconnect(id)
      return
    }
    ws = socket
    socket.addEventListener('open', () => {
      if (id !== connectionId) return
      socket.send(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_subscribe', params: ['monadLogs', { address: options.arena }] }))
      socket.send(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'eth_subscribe', params: ['monadNewHeads'] }))
    })
    socket.addEventListener('message', (event) => {
      if (typeof event.data === 'string') handleMessage(id, event.data)
    })
    const closed = (): void => handleDisconnect(id)
    socket.addEventListener('close', closed)
    socket.addEventListener('error', closed)
  }

  function statusLoop(): void {
    if (stopped) return
    emitStatus()
    statusTimer = timers.setTimeout(statusLoop, 1000)
  }

  return {
    async start() {
      if (!stopped) return
      stopped = false
      const ready = new Promise<void>((resolve) => {
        startResolve = resolve
      })
      connect()
      statusLoop()
      await ready
    },
    stop() {
      stopped = true
      connectionId += 1
      ws?.close()
      ws = null
      if (reconnectTimer !== null) timers.clearTimeout(reconnectTimer)
      if (statusTimer !== null) timers.clearTimeout(statusTimer)
      stopPolling()
      reconnectTimer = null
      statusTimer = null
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
