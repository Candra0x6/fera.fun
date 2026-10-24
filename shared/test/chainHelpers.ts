import { encodeAbiParameters, encodeEventTopics, encodeFunctionResult } from 'viem'
import type { AbiParameter } from 'viem'
import { arenaAbi } from '../src/abi'
import { multicall3Abi } from '../src/decode'
import { defaultSleep } from '../src/store'
import type { RawLog } from '../src/decode'
import type { FetchLike, TimerApi, WebSocketLike, WsEventLike } from '../src/chainFeed'
import type { ArenaEventName, CommitState, Hex } from '../src/types'

export const ARENA: Hex = '0x5fbdb2315678afecb367f032d93f642f64180aa3'
export const MULTICALL: Hex = '0xcA11bde05977b3631167028862bE2a173976CA11'
const WEI = 10n ** 18n

export function hex32(value: number): Hex {
  return `0x${value.toString(16).padStart(64, '0')}`
}

export function addr(value: number): Hex {
  return `0x${value.toString(16).padStart(40, '0')}`
}

export function configTuple(): Record<string, bigint | number> {
  return {
    maxCoins: 30,
    minCoins: 8,
    lobbySeconds: 120,
    levelingEpochs: 3,
    epochSeconds: 20,
    clashesPerEpoch: 6,
    seedTimeoutSeconds: 60,
    maxRoundSeconds: 3600,
    launchFee: WEI,
    minSeed: 2n * WEI,
    maxSeed: 50n * WEI,
    tradeFeeBps: 100,
    boostBps: 5000,
    consolationBps: 3000,
    potBps: 1500,
    treasuryBps: 500,
    consolationMode: 0,
    gammaBps: 8500,
    poolFactorMinBps: 1000,
    poolFactorMaxBps: 100000,
    levelBonusBps: 400,
    elementUpBps: 11500,
    elementDownBps: 8700,
    winProbMinBps: 1500,
    winProbMaxBps: 8500,
    huntWinPct: 50,
    keeperBounty: WEI / 5n,
    maxEntropyFee: WEI,
    vMon0: 20n * WEI,
    vTok0: 1_000_000_000n * WEI
  }
}

export function roundTuple(patch: Record<string, bigint | number | boolean | string> = {}): Record<string, unknown> {
  return {
    phase: 2,
    locked: false,
    epoch: 1,
    coinCount: 2,
    aliveCount: 2,
    cancelStreak: 0,
    winnerCoinId: 0,
    createdAt: 1_760_000_000,
    startedAt: 1_760_000_100,
    lockedAt: 0,
    lastEpochResolvedAt: 1_760_000_120,
    entropySeq: 4n,
    seed: hex32(0),
    prizePot: 5n * WEI,
    treasury: 40n * WEI,
    redeemPool: 0n,
    redeemSupply: 0n,
    clashesPlayed: 0,
    ...patch
  }
}

export function coinTuple(index: number, patch: Record<string, bigint | number | string> = {}): Record<string, unknown> {
  return {
    token: addr(0xa0 + index),
    creator: addr(0xb0 + index),
    monsterType: index % 5,
    skinId: index % 5,
    status: 1,
    level: 1,
    xp: 0,
    wins: 0,
    vMon: 25n * WEI,
    vTok: 800_000_000n * WEI,
    rMon: 5n * WEI,
    rMonAtLock: 0n,
    seedMon: 5n * WEI,
    consolationPool: 0n,
    consolationSupply: 0n,
    supply: 200_000_000n * WEI,
    name: `Coin ${index}`,
    ticker: `C${index}`,
    ...patch
  }
}

export interface ChainFixture {
  snapshotBlock: number
  snapshotTimestamp: number
  round: Record<string, unknown>
  coins: Array<Record<string, unknown>>
}

export function encodeSnapshotReturn(fixture: ChainFixture): Hex {
  const blockNumber = encodeFunctionResult({ abi: multicall3Abi, functionName: 'getBlockNumber', result: BigInt(fixture.snapshotBlock) })
  const stamp = encodeFunctionResult({ abi: multicall3Abi, functionName: 'getCurrentBlockTimestamp', result: BigInt(fixture.snapshotTimestamp) })
  const config = encodeFunctionResult({ abi: arenaAbi, functionName: 'getConfig', result: configTuple() })
  const snapshot = encodeFunctionResult({ abi: arenaAbi, functionName: 'getArenaSnapshot', result: [fixture.round, fixture.coins] })
  return encodeFunctionResult({
    abi: multicall3Abi,
    functionName: 'aggregate3',
    result: [blockNumber, stamp, config, snapshot].map((returnData) => ({ success: true, returnData }))
  })
}

function sample(param: AbiParameter): unknown {
  const uint = /^uint(\d+)$/.exec(param.type)
  if (uint !== null) return Number(uint[1]) <= 64 ? 7n : 10n ** 20n + 5n
  if (param.type === 'bool') return true
  if (param.type === 'address') return addr(0xabc)
  if (param.type === 'string') return 'abc'
  if (param.type === 'bytes32') return hex32(0x1234)
  if (param.type === 'tuple' && 'components' in param) {
    return Object.fromEntries(param.components.map((c) => [c.name, c.name === 'poolFactorMaxBps' ? 100000 : sample(c)]))
  }
  throw new Error(`no sample for ${param.type}`)
}

export function eventAbi(name: string): { inputs: readonly AbiParameter[] } {
  const item = arenaAbi.find((entry) => entry.type === 'event' && entry.name === name)
  if (item === undefined || item.type !== 'event') throw new Error(`no event ${name}`)
  return item
}

export function sampleArgs(name: string): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const input of eventAbi(name).inputs) {
    if (input.name !== undefined) out[input.name] = sample(input)
  }
  return out
}

export interface LogOptions {
  block: number
  blockId?: Hex
  logIndex?: number
  commitState?: CommitState
  removed?: boolean
  withTimestamp?: boolean
}

export function makeRawLog(name: ArenaEventName, values: Record<string, unknown>, options: LogOptions): RawLog {
  const inputs = eventAbi(name).inputs
  const indexed = inputs.filter((i) => 'indexed' in i && i.indexed === true)
  const plain = inputs.filter((i) => !('indexed' in i && i.indexed === true))
  const topics = encodeEventTopics({
    abi: arenaAbi,
    eventName: name,
    args: Object.fromEntries(indexed.map((i) => [i.name, values[i.name ?? '']]))
  })
  const data = plain.length === 0 ? '0x' : encodeAbiParameters(plain, plain.map((i) => values[i.name ?? '']))
  const blockId = options.blockId ?? hex32(options.block * 1000)
  return {
    address: ARENA,
    topics: topics.flatMap((t) => (typeof t === 'string' ? [t] : [])),
    data,
    blockNumber: `0x${options.block.toString(16)}`,
    blockId,
    blockHash: blockId,
    logIndex: `0x${(options.logIndex ?? 0).toString(16)}`,
    transactionHash: hex32(options.block * 7 + (options.logIndex ?? 0)),
    commitState: options.commitState ?? 'Proposed',
    removed: options.removed ?? false,
    blockTimestamp: options.withTimestamp === false ? null : `0x${(1_760_000_000 + options.block).toString(16)}`
  }
}

export class FakeSocket implements WebSocketLike {
  readonly sent: string[] = []
  closed = false
  private readonly listeners = new Map<string, Array<(event: WsEventLike) => void>>()

  constructor(readonly url: string, private readonly journal: string[]) {}

  send(data: string): void {
    this.sent.push(data)
    this.journal.push(`ws:${JSON.parse(data).method}`)
  }

  close(): void {
    if (this.closed) return
    this.closed = true
    this.fire('close', {})
  }

  addEventListener(type: 'open' | 'message' | 'close' | 'error', listener: (event: WsEventLike) => void): void {
    const list = this.listeners.get(type) ?? []
    list.push(listener)
    this.listeners.set(type, list)
  }

  fire(type: string, event: WsEventLike): void {
    for (const listener of this.listeners.get(type) ?? []) listener(event)
  }

  open(): void {
    this.fire('open', {})
  }

  message(payload: unknown): void {
    this.fire('message', { data: JSON.stringify(payload) })
  }

  ackSubscriptions(logsId = '0xlogs', headsId = '0xheads'): void {
    this.message({ jsonrpc: '2.0', id: 1, result: logsId })
    this.message({ jsonrpc: '2.0', id: 2, result: headsId })
  }

  pushLog(raw: RawLog, subscription = '0xlogs'): void {
    this.message({ jsonrpc: '2.0', method: 'eth_subscription', params: { subscription, result: raw } })
  }

  pushHead(result: Record<string, unknown>, subscription = '0xheads'): void {
    this.message({ jsonrpc: '2.0', method: 'eth_subscription', params: { subscription, result } })
  }
}

export class ManualTimers implements TimerApi {
  current = 1_760_000_000_000
  private nextId = 1
  private readonly pending = new Map<number, { at: number; callback: () => void }>()

  setTimeout(callback: () => void, ms: number): unknown {
    const id = this.nextId
    this.nextId += 1
    this.pending.set(id, { at: this.current + ms, callback })
    return id
  }

  clearTimeout(handle: unknown): void {
    if (typeof handle === 'number') this.pending.delete(handle)
  }

  now(): number {
    return this.current
  }

  advance(ms: number): void {
    const target = this.current + ms
    for (;;) {
      let nextId: number | null = null
      let nextAt = Infinity
      for (const [id, entry] of this.pending) {
        if (entry.at <= target && entry.at < nextAt) {
          nextAt = entry.at
          nextId = id
        }
      }
      if (nextId === null) break
      const entry = this.pending.get(nextId)
      this.pending.delete(nextId)
      if (entry !== undefined) {
        this.current = Math.max(this.current, entry.at)
        entry.callback()
      }
    }
    this.current = target
  }

  get size(): number {
    return this.pending.size
  }
}

export interface RpcCall {
  method: string
  params: unknown[]
}

export interface FakeChainState {
  fixture: ChainFixture
  finalizedHead: number
  logs: RawLog[]
  failMethods: Set<string>
  delayMs: number
  failImageLogs?: boolean
}

export class FakeRpc {
  readonly calls: RpcCall[] = []
  readonly logRanges: Array<[number, number]> = []
  readonly imageRanges: Array<[number, number]> = []
  inFlightLogs = 0
  maxInFlightLogs = 0
  readonly state: FakeChainState

  constructor(fixture: ChainFixture, private readonly journal: string[], head = fixture.snapshotBlock) {
    this.state = { fixture, finalizedHead: head, logs: [], failMethods: new Set(), delayMs: 0 }
  }

  readonly fetch: FetchLike = async (_url, init) => {
    const body: { id: number; method: string; params: unknown[] } = JSON.parse(init.body)
    this.calls.push({ method: body.method, params: body.params })
    this.journal.push(`rpc:${body.method}`)
    if (this.state.failMethods.has(body.method)) {
      return { ok: false, status: 503, json: () => Promise.resolve({}) }
    }
    const isLogs = body.method === 'eth_getLogs'
    if (isLogs) {
      this.inFlightLogs += 1
      this.maxInFlightLogs = Math.max(this.maxInFlightLogs, this.inFlightLogs)
      await defaultSleep(2)
    }
    const result = this.answer(body.method, body.params)
    if (isLogs) this.inFlightLogs -= 1
    return { ok: true, status: 200, json: () => Promise.resolve({ jsonrpc: '2.0', id: body.id, result }) }
  }

  private answer(method: string, params: unknown[]): unknown {
    const { fixture } = this.state
    if (method === 'eth_call') {
      return encodeSnapshotReturn(fixture)
    }
    if (method === 'eth_getBlockByNumber') {
      const tag = String(params[0])
      const number = tag === 'finalized' ? this.state.finalizedHead : Number.parseInt(tag, 16)
      return {
        number: `0x${number.toString(16)}`,
        hash: hex32(number * 1000),
        timestamp: `0x${(1_760_000_000 + number).toString(16)}`
      }
    }
    if (method === 'eth_getLogs') {
      const filter = params[0] as { fromBlock: string; toBlock: string; topics?: Array<string | null> }
      const from = Number.parseInt(filter.fromBlock, 16)
      const to = Number.parseInt(filter.toBlock, 16)
      const topics = filter.topics
      if (topics !== undefined && this.state.failImageLogs === true) throw new Error('image scan down')
      ;(topics === undefined ? this.logRanges : this.imageRanges).push([from, to])
      return this.state.logs.filter((l) => {
        const n = Number.parseInt(String(l.blockNumber), 16)
        if (n < from || n > to) return false
        return (topics ?? []).every((t, i) => t === null || t === undefined || l.topics[i] === t)
      })
    }
    throw new Error(`unexpected rpc ${method}`)
  }
}
