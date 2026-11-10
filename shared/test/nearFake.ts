import { EVENT_ARG_NAMES } from '../src/events'
import type { NearRawEvent } from '../src/nearDecode'
import { NearRpcError } from '../src/nearRpc'
import type { NearBlockHeader, NearRpc, NearViewResult } from '../src/nearRpc'
import type { NearFeedTimers } from '../src/nearFeed'
import type { ArenaEventName } from '../src/types'

export const ARENA = 'fera-arena.testnet'
export const RING_SIZE = 256

export interface FakeCoin {
  coinId: number
  creator: string
}

export class FakeChain implements NearRpc {
  height = 100
  finalHeight = 98
  tsMs = 1_760_000_000_000
  roundId = 1
  roundExists = true
  ring: NearRawEvent[] = []
  headSeq = 0
  calls: string[] = []
  failures = 0
  snapshotReads = 0
  headerReads = 0

  emit(name: ArenaEventName, args: Record<string, unknown>, roundId = this.roundId, blocksLater = 0): NearRawEvent {
    this.height += blocksLater
    this.headSeq += 1
    const event: NearRawEvent = {
      seq: this.headSeq,
      height: this.height,
      tsMs: this.tsMs + this.height * 600,
      name,
      args: { roundId, ...args }
    }
    this.ring.push(event)
    if (this.ring.length > RING_SIZE) this.ring.shift()
    return event
  }

  snapshotValue(): unknown {
    return {
      config: { levelingEpochs: 1, vMon0: '20000000000000000000000000', launchFee: '100000000000000000000000', epochSeconds: 14 },
      round: {
        roundId: this.roundId,
        phase: 'Lobby',
        locked: false,
        epoch: 0,
        coinCount: 0,
        aliveCount: 0,
        cancelStreak: 0,
        winnerCoinId: 0,
        createdAt: 1_760_000_000,
        startedAt: 0,
        lockedAt: 0,
        lastEpochResolvedAt: 0,
        prizePot: '0',
        treasury: '0',
        redeemPool: '0',
        redeemSupply: '0',
        clashesPlayed: 0,
        lockHeight: 0
      },
      coins: [],
      blockHeight: this.height,
      tsMs: this.tsMs + this.height * 600
    }
  }

  async callView(_contractId: string, method: string, args: Record<string, unknown>): Promise<NearViewResult> {
    this.calls.push(method)
    if (this.failures > 0) {
      this.failures -= 1
      throw new NearRpcError('http', 'http 503', true)
    }
    const base = { blockHeight: this.height, blockHash: `hash-${this.height}` }
    if (method === 'get_arena_snapshot') {
      this.snapshotReads += 1
      if (!this.roundExists) throw new NearRpcError('contract', 'ArenaError:UnknownRound')
      return { ...base, value: this.snapshotValue() }
    }
    if (method === 'events_since') {
      const from = Number(args['from_seq'])
      const limit = Number(args['limit'])
      const events = this.ring.filter((event) => event.seq > from).slice(0, limit)
      const oldest = this.ring[0]?.seq ?? this.headSeq + 1
      return {
        ...base,
        value: {
          events: events.map((event) => ({ seq: event.seq, height: event.height, tsMs: event.tsMs, name: event.name, args: event.args })),
          headSeq: this.headSeq,
          oldestSeq: oldest
        }
      }
    }
    throw new NearRpcError('contract', `ArenaError:unknown method ${method}`)
  }

  async viewAccount(): Promise<null> {
    return null
  }

  async blockHeader(finality: 'optimistic' | 'final'): Promise<NearBlockHeader> {
    if (this.failures > 0) {
      this.failures -= 1
      throw new NearRpcError('http', 'http 503', true)
    }
    this.headerReads += 1
    const height = finality === 'final' ? this.finalHeight : this.height
    return { height, hash: `block-${height}`, timestampMs: this.tsMs + height * 600 }
  }
}

export function flush(): Promise<void> {
  return new Promise<void>((resolve) => setTimeout(resolve, 0))
}

export interface ManualTimers extends NearFeedTimers {
  step(): Promise<void>
  clock: number
}

export function manualTimers(): ManualTimers {
  let pending: (() => void) | null = null
  const timers: ManualTimers = {
    clock: 1_760_000_000_000 + 100 * 600,
    setTimeout(callback) {
      pending = callback
      return 1
    },
    clearTimeout() {
      pending = null
    },
    now() {
      return timers.clock
    },
    async step() {
      const callback = pending
      pending = null
      callback?.()
      await flush()
    }
  }
  return timers
}

export function sampleArgs(name: ArenaEventName): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const key of EVENT_ARG_NAMES[name]) {
    if (key === 'config') out[key] = { levelingEpochs: 1, launchFee: '100' }
    else if (key === 'isBuy' || key === 'success') out[key] = true
    else if (key === 'name' || key === 'ticker' || key === 'trader' || key === 'creator' || key === 'holder' || key === 'funder') out[key] = 'x.testnet'
    else if (key === 'token') out[key] = '1:0'
    else if (key === 'seed') out[key] = `0x${'ab'.repeat(32)}`
    else if (key === 'reason' || key === 'kind' || key === 'imageUri') out[key] = 'text'
    else if (/Mon$|Amount$|^v|^r|supply|Supply|pool|Pool|toPot|toTreasury|After|^amount$|tokens|^boost|^consolation$/.test(key) && key !== 'epoch') out[key] = '12345'
    else out[key] = 1
  }
  return out
}
