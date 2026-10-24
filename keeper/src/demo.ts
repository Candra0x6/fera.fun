import { formatEther } from 'viem'
import type { Hex } from '@animal/shared'
import { fundingByWallet, HOUSE_ROSTER, planLaunches, runSeedHouse } from './house'
import type { HouseChain } from './house'
import type { ArenaPort, RoundParams, RoundPhase, RoundState } from './port'
import { knockoutEpochs } from './loop'

export const MAX_SEED_COUNT = 5
export const CREATOR_GAS_RESERVE = 100_000_000_000_000_000n

export interface DefaultRoundConfig {
  minCoins: number
  maxCoins: number
  levelingEpochs: number
  clashesPerEpoch: number
  maxEntropyFee: bigint
  keeperBounty: bigint
}

export function plannedEpochs(config: DefaultRoundConfig): number {
  let worst = 0
  for (let coins = config.minCoins; coins <= config.maxCoins; coins += 1) {
    worst = Math.max(worst, config.levelingEpochs + knockoutEpochs(coins, config.clashesPerEpoch))
  }
  return worst
}

export function treasuryTarget(config: DefaultRoundConfig, reserveFloor: bigint): bigint {
  return reserveFloor + BigInt(plannedEpochs(config)) * (config.maxEntropyFee + config.keeperBounty)
}

export interface DemoChain {
  currentRoundId(): Promise<number>
  balance(address: Hex): Promise<bigint>
  estimateCarry(previous: number): Promise<bigint>
  recycle(roundId: number): Promise<void>
  readDefaultConfig(): Promise<DefaultRoundConfig | null>
  createDefaultRound(value: bigint): Promise<number>
  fundTreasury(roundId: number, amount: bigint): Promise<void>
  houseBalance(walletIndex: number): Promise<bigint>
}

export interface DemoDeps {
  port: Pick<ArenaPort, 'readRound' | 'readParams' | 'readReserveFloor'>
  chain: DemoChain
  houseChainFor(roundId: number): HouseChain
  creatorAddress: Hex | null
  seederAddress: Hex | null
  lobbySeconds: number
  houseGasBuffer: bigint
  log: (message: string, fields?: Record<string, unknown>) => void
}

export interface DemoStatus {
  roundId: number
  phase: RoundPhase
  coinCount: number
  maxCoins: number
  minCoins: number
  lobbyEndsAt: number | null
  canCreate: boolean
  canSeed: boolean
  freeSlots: number
  busy: boolean
  balances: { owner: string | null; creator: string | null; seeder: string | null }
}

export type DemoResult<T> = { ok: true; value: T } | { ok: false; status: 400 | 402 | 409 | 502 | 503; body: Record<string, unknown> }

export interface DemoAdmin {
  status(): Promise<DemoStatus>
  createRound(): Promise<DemoResult<{ roundId: number }>>
  seedHouse(count: number | undefined): Promise<DemoResult<{ launched: string[] }>>
  isBusy(): boolean
}

const ENDED: readonly RoundPhase[] = ['None', 'Settled', 'Aborted']

function fail(status: 400 | 402 | 409 | 502 | 503, body: Record<string, unknown>): { ok: false; status: typeof status; body: Record<string, unknown> } {
  return { ok: false, status, body }
}

function insufficient(address: Hex, shortfall: bigint): ReturnType<typeof fail> {
  return fail(402, { error: 'insufficient funds', shortfall: formatEther(shortfall), address })
}

export function createDemoAdmin(deps: DemoDeps): DemoAdmin {
  let busy = false

  async function exclusive<T>(run: () => Promise<DemoResult<T>>): Promise<DemoResult<T>> {
    if (busy) return fail(409, { error: 'busy' })
    busy = true
    try {
      return await run()
    } catch (error) {
      deps.log('demo operation failed', { error: error instanceof Error ? error.name : 'unknown' })
      return fail(502, { error: 'operation_failed' })
    } finally {
      busy = false
    }
  }

  async function read(): Promise<{ roundId: number; round: RoundState | null; params: RoundParams | null }> {
    const roundId = await deps.chain.currentRoundId()
    if (roundId === 0) return { roundId, round: null, params: null }
    const [round, params] = await Promise.all([deps.port.readRound(roundId), deps.port.readParams(roundId)])
    return { roundId, round, params }
  }

  async function balanceOrNull(address: Hex | null): Promise<string | null> {
    if (address === null) return null
    return formatEther(await deps.chain.balance(address))
  }

  async function status(): Promise<DemoStatus> {
    const { roundId, round, params } = await read()
    const defaults = params === null ? await deps.chain.readDefaultConfig() : null
    const phase: RoundPhase = round?.phase ?? 'None'
    const maxCoins = params?.maxCoins ?? defaults?.maxCoins ?? 0
    const coinCount = round?.coinCount ?? 0
    const freeSlots = phase === 'Lobby' ? Math.max(0, maxCoins - coinCount) : 0
    const [creator, seeder] = await Promise.all([balanceOrNull(deps.creatorAddress), balanceOrNull(deps.seederAddress)])
    return {
      roundId,
      phase,
      coinCount,
      maxCoins,
      minCoins: params?.minCoins ?? defaults?.minCoins ?? 0,
      lobbyEndsAt: phase === 'Lobby' && round !== null && params !== null ? round.createdAt + params.lobbySeconds : null,
      canCreate: ENDED.includes(phase),
      canSeed: phase === 'Lobby' && freeSlots > 0,
      freeSlots,
      busy,
      balances: { owner: creator, creator, seeder }
    }
  }

  async function createRound(): Promise<DemoResult<{ roundId: number }>> {
    return exclusive(async () => {
      const creator = deps.creatorAddress
      if (creator === null) return fail(503, { error: 'creator_key_missing' })
      const { roundId: previous, round } = await read()
      if (round !== null && !ENDED.includes(round.phase)) return fail(409, { error: 'round in progress' })
      const config = await deps.chain.readDefaultConfig()
      if (config === null) return fail(409, { error: 'no_default_config' })
      const floor = await deps.port.readReserveFloor()
      const target = treasuryTarget(config, floor)
      const carry = previous === 0 ? 0n : await deps.chain.estimateCarry(previous)
      const value = target > carry ? target - carry : 0n
      const needed = value + CREATOR_GAS_RESERVE
      const balance = await deps.chain.balance(creator)
      if (balance < needed) return insufficient(creator, needed - balance)

      if (previous !== 0) {
        await deps.chain.recycle(previous)
      }
      let roundId: number
      try {
        roundId = await deps.chain.createDefaultRound(value)
      } catch (error) {
        const message = error instanceof Error ? error.message : ''
        if (message.includes('NoDefaultConfig')) return fail(409, { error: 'no_default_config' })
        if (message.includes('RoundInProgress')) return fail(409, { error: 'round in progress' })
        throw error
      }
      const created = await deps.port.readRound(roundId)
      if (created.treasury < target) await deps.chain.fundTreasury(roundId, target - created.treasury)
      deps.log('demo round created', { roundId, treasuryTarget: target.toString(), value: value.toString() })
      return { ok: true, value: { roundId } }
    })
  }

  async function seedHouse(count: number | undefined): Promise<DemoResult<{ launched: string[] }>> {
    return exclusive(async () => {
      const seeder = deps.seederAddress
      if (seeder === null) return fail(503, { error: 'seeder_key_missing' })
      const wanted = Math.min(MAX_SEED_COUNT, count ?? MAX_SEED_COUNT)
      if (!Number.isInteger(wanted) || wanted < 1) return fail(400, { error: 'bad_count' })
      const { roundId, round } = await read()
      if (round === null || round.phase !== 'Lobby') return fail(409, { error: 'not in lobby' })
      const chain = deps.houseChainFor(roundId)
      const state = await chain.readState()
      const freeSlots = Math.max(0, state.maxCoins - state.coins.length)
      if (freeSlots === 0) return fail(409, { error: 'lobby full' })
      const limit = Math.min(wanted, freeSlots)
      const plan = planLaunches({
        roster: HOUSE_ROSTER,
        minSeed: state.minSeed,
        maxSeed: state.maxSeed,
        existingTickers: new Set(state.coins.map((coin) => coin.ticker)),
        freeSlots,
        limit
      })
      if (plan.length === 0) return { ok: true, value: { launched: [] } }
      const floor = await deps.port.readReserveFloor()
      let needed = round.treasury < floor ? floor - round.treasury : 0n
      for (const [walletIndex, amount] of fundingByWallet(plan, state.launchFee, deps.houseGasBuffer)) {
        const held = await deps.chain.houseBalance(walletIndex)
        if (amount > held) needed += amount - held
      }
      const balance = await deps.chain.balance(seeder)
      if (balance < needed) return insufficient(seeder, needed - balance)
      const result = await runSeedHouse({
        chain,
        roundId,
        roster: HOUSE_ROSTER,
        limit,
        gasBuffer: deps.houseGasBuffer,
        log: deps.log
      })
      return { ok: true, value: { launched: result.launched } }
    })
  }

  return { status, createRound, seedHouse, isBusy: () => busy }
}
