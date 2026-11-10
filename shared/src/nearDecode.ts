import { EVENT_ARG_NAMES, envelopeId, isEventName } from './events'
import type { ArenaEventEnvelope, ArenaSnapshot, CoinStatus, CommitState, CoinView, Phase, RoundView } from './types'

export class NearDecodeError extends Error {
  constructor(what: string) {
    super(`near payload: ${what}`)
    this.name = 'NearDecodeError'
  }
}

export interface NearRawEvent {
  seq: number
  height: number
  tsMs: number
  name: string
  args: Record<string, unknown>
}

export interface NearEventPage {
  events: NearRawEvent[]
  headSeq: number
  oldestSeq: number
}

const PHASES: readonly (Phase | null)[] = [null, 'Lobby', 'Leveling', 'Knockout', 'Settled', 'Aborted']
const STATUSES: readonly (CoinStatus | null)[] = [null, 'Alive', 'Eliminated', 'Champion', 'Refunded']

function asRecord(value: unknown, what: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new NearDecodeError(`${what} is not an object`)
  return Object.fromEntries(Object.entries(value))
}

function count(source: Record<string, unknown>, key: string, what: string): number {
  const value = source[key]
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return value
  if (typeof value === 'string' && /^\d+$/.test(value) && Number.isSafeInteger(Number(value))) return Number(value)
  throw new NearDecodeError(`${what}.${key} is not a counter`)
}

function amount(source: Record<string, unknown>, key: string, what: string): string {
  const value = source[key]
  if (typeof value === 'string' && /^\d+$/.test(value)) return value
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return String(value)
  throw new NearDecodeError(`${what}.${key} is not an amount`)
}

function text(source: Record<string, unknown>, key: string, what: string): string {
  const value = source[key]
  if (typeof value === 'string') return value
  throw new NearDecodeError(`${what}.${key} is not a string`)
}

function flag(source: Record<string, unknown>, key: string, what: string): boolean {
  const value = source[key]
  if (typeof value === 'boolean') return value
  throw new NearDecodeError(`${what}.${key} is not a boolean`)
}

function enumName<T extends string>(value: unknown, names: readonly (T | null)[], what: string): T {
  const found = typeof value === 'number' ? names[value] : names.find((name) => name === value)
  if (found === null || found === undefined) throw new NearDecodeError(`${what} is unknown`)
  return found
}

function decodeRound(value: unknown): RoundView {
  const r = asRecord(value, 'round')
  const round: RoundView = {
    roundId: count(r, 'roundId', 'round'),
    phase: enumName(r['phase'], PHASES, 'round.phase'),
    locked: flag(r, 'locked', 'round'),
    epoch: count(r, 'epoch', 'round'),
    coinCount: count(r, 'coinCount', 'round'),
    aliveCount: count(r, 'aliveCount', 'round'),
    cancelStreak: count(r, 'cancelStreak', 'round'),
    winnerCoinId: count(r, 'winnerCoinId', 'round'),
    createdAt: count(r, 'createdAt', 'round'),
    startedAt: count(r, 'startedAt', 'round'),
    lockedAt: count(r, 'lockedAt', 'round'),
    lastEpochResolvedAt: count(r, 'lastEpochResolvedAt', 'round'),
    prizePot: amount(r, 'prizePot', 'round'),
    treasury: amount(r, 'treasury', 'round'),
    redeemPool: amount(r, 'redeemPool', 'round'),
    redeemSupply: amount(r, 'redeemSupply', 'round'),
    clashesPlayed: count(r, 'clashesPlayed', 'round')
  }
  if (typeof r['lockHeight'] === 'number') round.lockHeight = count(r, 'lockHeight', 'round')
  return round
}

function decodeCoin(value: unknown, houseTokens: ReadonlySet<string>): CoinView {
  const c = asRecord(value, 'coin')
  const token = text(c, 'token', 'coin')
  return {
    roundId: count(c, 'roundId', 'coin'),
    coinId: count(c, 'coinId', 'coin'),
    token,
    creator: text(c, 'creator', 'coin'),
    name: text(c, 'name', 'coin'),
    ticker: text(c, 'ticker', 'coin'),
    monsterType: count(c, 'monsterType', 'coin'),
    skinId: count(c, 'skinId', 'coin'),
    status: enumName(c['status'], STATUSES, 'coin.status'),
    level: count(c, 'level', 'coin'),
    xp: count(c, 'xp', 'coin'),
    wins: count(c, 'wins', 'coin'),
    vMon: amount(c, 'vMon', 'coin'),
    vTok: amount(c, 'vTok', 'coin'),
    rMon: amount(c, 'rMon', 'coin'),
    rMonAtLock: amount(c, 'rMonAtLock', 'coin'),
    seedMon: amount(c, 'seedMon', 'coin'),
    consolationPool: amount(c, 'consolationPool', 'coin'),
    consolationSupply: amount(c, 'consolationSupply', 'coin'),
    supply: amount(c, 'supply', 'coin'),
    isHouse: flag(c, 'isHouse', 'coin') || houseTokens.has(token.toLowerCase())
  }
}

function decodeConfig(value: unknown): ArenaSnapshot['config'] {
  const raw = asRecord(value, 'config')
  const out: ArenaSnapshot['config'] = {}
  for (const [key, item] of Object.entries(raw)) {
    if (typeof item !== 'number' && typeof item !== 'string' && typeof item !== 'boolean') {
      throw new NearDecodeError(`config.${key} is not a flat value`)
    }
    out[key] = item
  }
  return out
}

export function decodeSnapshot(value: unknown, houseTokens: ReadonlySet<string> = new Set()): ArenaSnapshot {
  const s = asRecord(value, 'snapshot')
  const coins = s['coins']
  if (!Array.isArray(coins)) throw new NearDecodeError('snapshot.coins is not a list')
  const blockHeight = count(s, 'blockHeight', 'snapshot')
  return {
    config: decodeConfig(s['config']),
    round: decodeRound(s['round']),
    coins: coins.map((coin: unknown) => decodeCoin(coin, houseTokens)),
    blockNumber: blockHeight,
    blockId: String(blockHeight),
    serverTime: Math.floor(count(s, 'tsMs', 'snapshot') / 1000)
  }
}

export function decodeEventPage(value: unknown): NearEventPage {
  const page = asRecord(value, 'event page')
  const list = page['events']
  if (!Array.isArray(list)) throw new NearDecodeError('event page has no events list')
  const events = list.map((item: unknown): NearRawEvent => {
    const e = asRecord(item, 'event')
    return {
      seq: count(e, 'seq', 'event'),
      height: count(e, 'height', 'event'),
      tsMs: count(e, 'tsMs', 'event'),
      name: text(e, 'name', 'event'),
      args: asRecord(e['args'], 'event.args')
    }
  })
  return { events, headSeq: count(page, 'headSeq', 'event page'), oldestSeq: count(page, 'oldestSeq', 'event page') }
}

export function flattenEventArgs(name: string, raw: Record<string, unknown>): ArenaEventEnvelope['args'] | null {
  if (!isEventName(name)) return null
  const out: ArenaEventEnvelope['args'] = {}
  for (const key of EVENT_ARG_NAMES[name]) {
    const value = raw[key]
    if (typeof value === 'string' || typeof value === 'boolean') out[key] = value
    else if (typeof value === 'number' && Number.isFinite(value)) out[key] = value
    else if (typeof value === 'object' && value !== null) out[key] = JSON.stringify(value)
    else return null
  }
  return out
}

export function toEnvelope(event: NearRawEvent, commitState: CommitState): ArenaEventEnvelope | null {
  if (!isEventName(event.name)) return null
  const args = flattenEventArgs(event.name, event.args)
  if (args === null) return null
  return {
    id: envelopeId(event.height, event.seq),
    name: event.name,
    blockNumber: event.height,
    blockId: String(event.height),
    logIndex: event.seq,
    txHash: '',
    timestamp: Math.floor(event.tsMs / 1000),
    commitState,
    args
  }
}

export function eventRoundId(event: NearRawEvent): number | null {
  const id = event.args['roundId']
  return typeof id === 'number' && Number.isSafeInteger(id) ? id : null
}
