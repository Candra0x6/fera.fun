import { EVENT_ARG_NAMES, isEventName } from './events'
import { isHex } from './args'
import { defaultSleep } from './store'
import type { Sleep } from './store'
import type {
  ArenaEventEnvelope,
  ArenaSnapshot,
  ArenaStore,
  CoinView,
  CommitState,
  FeedStatus,
  Hex,
  Phase,
  RoundView
} from './types'

export interface CommitMessage {
  blockId: Hex
  blockNumber: number
  commitState: CommitState
}

export interface RetractMessage {
  blockId: Hex
}

export type FixtureBody =
  | { kind: 'snapshot'; data: ArenaSnapshot }
  | { kind: 'event'; data: ArenaEventEnvelope }
  | { kind: 'commit'; data: CommitMessage }
  | { kind: 'retract'; data: RetractMessage }
  | { kind: 'status'; data: FeedStatus }

export interface FixtureMessage {
  atMs: number
  message: FixtureBody
}

const COMMIT_STATES: readonly CommitState[] = ['Proposed', 'Voted', 'Finalized', 'Verified']
const PHASES: readonly Phase[] = ['Lobby', 'Leveling', 'Knockout', 'Settled', 'Aborted']
const COIN_STATUSES: readonly CoinView['status'][] = ['Alive', 'Eliminated', 'Champion', 'Refunded']
const UPSTREAMS: readonly FeedStatus['upstream'][] = ['live', 'reconnecting', 'polling']

function fail(path: string): never {
  throw new TypeError(`fixture is invalid at ${path}`)
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return fail(path)
  return Object.fromEntries(Object.entries(value))
}

function num(source: Record<string, unknown>, key: string, path: string): number {
  const value = source[key]
  if (typeof value !== 'number' || !Number.isFinite(value)) return fail(`${path}.${key}`)
  return value
}

function str(source: Record<string, unknown>, key: string, path: string): string {
  const value = source[key]
  if (typeof value !== 'string') return fail(`${path}.${key}`)
  return value
}

function bool(source: Record<string, unknown>, key: string, path: string): boolean {
  const value = source[key]
  if (typeof value !== 'boolean') return fail(`${path}.${key}`)
  return value
}

function decimal(source: Record<string, unknown>, key: string, path: string): string {
  const value = str(source, key, path)
  if (!/^\d+$/.test(value)) return fail(`${path}.${key}`)
  return value
}

function hex(source: Record<string, unknown>, key: string, path: string): Hex {
  const value = source[key]
  if (!isHex(value)) return fail(`${path}.${key}`)
  return value
}

function oneOf<T extends string>(source: Record<string, unknown>, key: string, allowed: readonly T[], path: string): T {
  const value = source[key]
  const match = allowed.find((candidate) => candidate === value)
  if (match === undefined) return fail(`${path}.${key}`)
  return match
}

function parseCoin(value: unknown, path: string): CoinView {
  const c = record(value, path)
  return {
    roundId: num(c, 'roundId', path),
    coinId: num(c, 'coinId', path),
    token: hex(c, 'token', path),
    creator: hex(c, 'creator', path),
    name: str(c, 'name', path),
    ticker: str(c, 'ticker', path),
    monsterType: num(c, 'monsterType', path),
    skinId: num(c, 'skinId', path),
    status: oneOf(c, 'status', COIN_STATUSES, path),
    level: num(c, 'level', path),
    xp: num(c, 'xp', path),
    wins: num(c, 'wins', path),
    vMon: decimal(c, 'vMon', path),
    vTok: decimal(c, 'vTok', path),
    rMon: decimal(c, 'rMon', path),
    rMonAtLock: decimal(c, 'rMonAtLock', path),
    seedMon: decimal(c, 'seedMon', path),
    consolationPool: decimal(c, 'consolationPool', path),
    consolationSupply: decimal(c, 'consolationSupply', path),
    supply: decimal(c, 'supply', path),
    isHouse: bool(c, 'isHouse', path)
  }
}

function parseRound(value: unknown, path: string): RoundView {
  const r = record(value, path)
  return {
    roundId: num(r, 'roundId', path),
    phase: oneOf(r, 'phase', PHASES, path),
    locked: bool(r, 'locked', path),
    epoch: num(r, 'epoch', path),
    coinCount: num(r, 'coinCount', path),
    aliveCount: num(r, 'aliveCount', path),
    cancelStreak: num(r, 'cancelStreak', path),
    winnerCoinId: num(r, 'winnerCoinId', path),
    createdAt: num(r, 'createdAt', path),
    startedAt: num(r, 'startedAt', path),
    lockedAt: num(r, 'lockedAt', path),
    lastEpochResolvedAt: num(r, 'lastEpochResolvedAt', path),
    prizePot: decimal(r, 'prizePot', path),
    treasury: decimal(r, 'treasury', path),
    redeemPool: decimal(r, 'redeemPool', path),
    redeemSupply: decimal(r, 'redeemSupply', path),
    clashesPlayed: num(r, 'clashesPlayed', path)
  }
}

function parseSnapshot(value: unknown, path: string): ArenaSnapshot {
  const s = record(value, path)
  const rawConfig = record(s['config'], `${path}.config`)
  const config: ArenaSnapshot['config'] = {}
  for (const [key, entry] of Object.entries(rawConfig)) {
    if (typeof entry !== 'number' && typeof entry !== 'string' && typeof entry !== 'boolean') {
      return fail(`${path}.config.${key}`)
    }
    config[key] = entry
  }
  const rawCoins = s['coins']
  if (!Array.isArray(rawCoins)) return fail(`${path}.coins`)
  return {
    config,
    round: parseRound(s['round'], `${path}.round`),
    coins: rawCoins.map((coin: unknown, index: number) => parseCoin(coin, `${path}.coins[${index}]`)),
    blockNumber: num(s, 'blockNumber', path),
    blockId: hex(s, 'blockId', path),
    serverTime: num(s, 'serverTime', path)
  }
}

export function parseEnvelope(value: unknown, path: string): ArenaEventEnvelope {
  const e = record(value, path)
  const name = e['name']
  if (!isEventName(name)) return fail(`${path}.name`)
  const rawArgs = record(e['args'], `${path}.args`)
  const args: ArenaEventEnvelope['args'] = {}
  for (const [key, entry] of Object.entries(rawArgs)) {
    if (typeof entry !== 'number' && typeof entry !== 'string' && typeof entry !== 'boolean') {
      return fail(`${path}.args.${key}`)
    }
    args[key] = entry
  }
  const expected = EVENT_ARG_NAMES[name]
  const actual = Object.keys(args)
  if (actual.length !== expected.length || !expected.every((key) => key in args)) {
    return fail(`${path}.args (expected ${expected.join(',')})`)
  }
  return {
    id: str(e, 'id', path),
    name,
    blockNumber: num(e, 'blockNumber', path),
    blockId: hex(e, 'blockId', path),
    logIndex: num(e, 'logIndex', path),
    txHash: hex(e, 'txHash', path),
    timestamp: num(e, 'timestamp', path),
    commitState: oneOf(e, 'commitState', COMMIT_STATES, path),
    args
  }
}

function parseBody(value: unknown, path: string): FixtureBody {
  const m = record(value, path)
  const kind = m['kind']
  const dataPath = `${path}.data`
  if (kind === 'snapshot') return { kind, data: parseSnapshot(m['data'], dataPath) }
  if (kind === 'event') return { kind, data: parseEnvelope(m['data'], dataPath) }
  if (kind === 'commit') {
    const d = record(m['data'], dataPath)
    return {
      kind,
      data: {
        blockId: hex(d, 'blockId', dataPath),
        blockNumber: num(d, 'blockNumber', dataPath),
        commitState: oneOf(d, 'commitState', COMMIT_STATES, dataPath)
      }
    }
  }
  if (kind === 'retract') {
    const d = record(m['data'], dataPath)
    return { kind, data: { blockId: hex(d, 'blockId', dataPath) } }
  }
  if (kind === 'status') {
    const d = record(m['data'], dataPath)
    return {
      kind,
      data: {
        upstream: oneOf(d, 'upstream', UPSTREAMS, dataPath),
        headBlock: num(d, 'headBlock', dataPath),
        lagSeconds: num(d, 'lagSeconds', dataPath)
      }
    }
  }
  return fail(`${path}.kind`)
}

export function parseFixture(value: unknown): FixtureMessage[] {
  if (!Array.isArray(value)) return fail('root')
  return value.map((entry: unknown, index: number) => {
    const path = `[${index}]`
    const item = record(entry, path)
    return { atMs: num(item, 'atMs', path), message: parseBody(item['message'], `${path}.message`) }
  })
}

export interface ReplayFixtureOptions {
  speed?: number
  sleep?: Sleep
  onStatus?: (status: FeedStatus) => void
  shouldStop?: () => boolean
}

export async function replayFixture(
  store: ArenaStore,
  messages: readonly FixtureMessage[],
  options: ReplayFixtureOptions = {}
): Promise<void> {
  const speed = options.speed !== undefined && options.speed > 0 ? options.speed : 1
  const sleep = options.sleep ?? defaultSleep
  let previous = 0
  for (const item of messages) {
    if (options.shouldStop?.() === true) return
    const wait = (item.atMs - previous) / speed
    previous = item.atMs
    if (wait > 0) await sleep(wait)
    const { message } = item
    switch (message.kind) {
      case 'snapshot':
        store.hydrate(message.data)
        break
      case 'event':
        store.apply(message.data)
        break
      case 'commit':
        store.commit(message.data)
        break
      case 'retract':
        store.retract(message.data)
        break
      case 'status':
        options.onStatus?.(message.data)
        break
    }
  }
}
