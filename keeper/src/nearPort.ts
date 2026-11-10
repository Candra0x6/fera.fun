import { z } from 'zod'
import type { ArenaPort, KeeperCall, RoundParams, RoundState, SendResult } from './port'

export interface NearHead {
  height: number
  timestampSec: number
}

export type NearCallResult =
  | { kind: 'success'; hash: string; gasBurnt: bigint; blockTimestampSec: number }
  | { kind: 'failure'; hash: string; gasBurnt: bigint; blockTimestampSec: number; message: string }

export interface NearTransport {
  readonly accountId: string
  view(method: string, args: Record<string, unknown>): Promise<unknown>
  head(): Promise<NearHead>
  call(method: string, args: Record<string, unknown>, gas: bigint, deposit?: bigint): Promise<NearCallResult>
}

export const TGAS = 1_000_000_000_000n

export type GasTable = Readonly<Record<KeeperCall['fn'], bigint>>

export const DEFAULT_GAS: GasTable = {
  startRound: 30n * TGAS,
  lockEpoch: 30n * TGAS,
  resolveEpoch: 100n * TGAS,
  abortRound: 30n * TGAS
}

const METHODS: Readonly<Record<KeeperCall['fn'], string>> = {
  startRound: 'start_round',
  lockEpoch: 'lock_epoch',
  resolveEpoch: 'resolve_epoch',
  abortRound: 'abort_round'
}

const count = z.number().int().nonnegative()

const roundSchema = z.object({
  phase: z.enum(['None', 'Lobby', 'Leveling', 'Knockout', 'Settled', 'Aborted']),
  locked: z.boolean(),
  epoch: count,
  coinCount: count,
  aliveCount: count,
  createdAt: count,
  startedAt: count,
  lockedAt: count,
  lastEpochResolvedAt: count,
  lockHeight: count,
  treasury: z.string().regex(/^\d+$/)
})

const configSchema = z.object({
  minCoins: count,
  maxCoins: count,
  lobbySeconds: count,
  levelingEpochs: count,
  epochSeconds: count,
  maxRoundSeconds: count,
  clashesPerEpoch: count,
  minSeedBlocks: count
})

const ARENA_ERROR = /ArenaError:([A-Za-z]+)/

export function arenaErrorName(message: string): string | null {
  const found = ARENA_ERROR.exec(message)
  return found?.[1] ?? null
}

export interface NearPortOptions {
  transport: NearTransport
  gas?: Partial<GasTable>
  headTtlMs?: number
  clock?: () => number
}

const NO_ROUND: RoundState = {
  phase: 'None',
  locked: false,
  epoch: 0,
  coinCount: 0,
  aliveCount: 0,
  createdAt: 0,
  startedAt: 0,
  lockedAt: 0,
  lastEpochResolvedAt: 0,
  lockHeight: 0,
  treasury: 0n
}

export function createNearArenaPort(options: NearPortOptions): ArenaPort {
  const { transport } = options
  const gas: GasTable = { ...DEFAULT_GAS, ...options.gas }
  const headTtl = options.headTtlMs ?? 400
  const clock = options.clock ?? (() => Date.now())
  let queue: Promise<unknown> = Promise.resolve()
  let cached: { at: number; head: Promise<NearHead> } | null = null

  function head(): Promise<NearHead> {
    const at = clock()
    if (cached !== null && at - cached.at < headTtl) return cached.head
    const fresh = transport.head()
    cached = { at, head: fresh }
    fresh.catch(() => {
      if (cached !== null && cached.head === fresh) cached = null
    })
    return fresh
  }

  function argsOf(call: KeeperCall): Record<string, unknown> {
    if (call.fn === 'resolveEpoch') return { round_id: call.roundId, max_clashes: call.maxClashes }
    return { round_id: call.roundId }
  }

  async function execute(call: KeeperCall): Promise<SendResult> {
    const limit = gas[call.fn]
    const outcome = await transport.call(METHODS[call.fn], argsOf(call), limit)
    cached = null
    if (outcome.kind === 'success') {
      return {
        kind: 'mined',
        hash: outcome.hash,
        status: 'success',
        gasUsed: outcome.gasBurnt,
        gasLimit: limit,
        blockTimestamp: outcome.blockTimestampSec
      }
    }
    const reason = arenaErrorName(outcome.message)
    if (reason !== null) return { kind: 'skipped', reason }
    return {
      kind: 'mined',
      hash: outcome.hash,
      status: 'reverted',
      gasUsed: outcome.gasBurnt,
      gasLimit: limit,
      blockTimestamp: outcome.blockTimestampSec
    }
  }

  return {
    account: transport.accountId,
    async readRound(roundId) {
      try {
        const parsed = roundSchema.parse(await transport.view('get_round', { round_id: roundId }))
        return { ...parsed, treasury: BigInt(parsed.treasury) } satisfies RoundState
      } catch (error) {
        const reason = error instanceof Error ? arenaErrorName(error.message) : null
        if (reason === 'UnknownRound') return { ...NO_ROUND }
        throw error
      }
    },
    async readParams() {
      return configSchema.parse(await transport.view('get_config', {})) satisfies RoundParams
    },
    async latestTimestamp() {
      return (await head()).timestampSec
    },
    async latestHeight() {
      return (await head()).height
    },
    send(call) {
      const run = queue.then(() => execute(call))
      queue = run.catch(() => undefined)
      return run
    }
  }
}
