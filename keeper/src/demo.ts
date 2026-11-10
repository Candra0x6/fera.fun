import type { RoundPhase } from './port'
import type { ArenaPort } from './port'
import { HOUSE_ROSTER, MAX_SEED_COUNT, fundingByWallet, planLaunches, runSeedHouse, topUpTarget } from './house'
import type { HouseChain } from './house'

const ENDED: readonly RoundPhase[] = ['None', 'Settled', 'Aborted']
const NEAR = 10n ** 24n

export function formatNear(yocto: bigint): string {
  const whole = yocto / NEAR
  const fraction = (yocto % NEAR).toString().padStart(24, '0').slice(0, 4).replace(/0+$/, '')
  return fraction.length === 0 ? whole.toString() : `${whole}.${fraction}`
}

export interface DemoChain {
  currentRoundId(): Promise<number>
  balance(accountId: string): Promise<bigint>
  createRound(): Promise<{ roundId: number; txHash: string }>
}

export interface DemoDeps {
  port: Pick<ArenaPort, 'readRound' | 'readParams'>
  chain: DemoChain
  houseChainFor(roundId: number): HouseChain | null
  creatorAccountId: string
  seederAccountId: string
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
  balances: { owner: string; creator: string; seeder: string }
}

export type DemoResult<T> = { ok: true; value: T } | { ok: false; status: 400 | 402 | 409 | 502 | 503; body: Record<string, unknown> }

export interface DemoAdmin {
  status(): Promise<DemoStatus>
  createRound(): Promise<DemoResult<{ ok: true; roundId: number; txHash: string }>>
  seedHouse(count: number | undefined): Promise<DemoResult<{ ok: true; launched: string[]; txHash: string }>>
  isBusy(): boolean
}

function fail(status: 400 | 402 | 409 | 502 | 503, body: Record<string, unknown>): { ok: false; status: typeof status; body: Record<string, unknown> } {
  return { ok: false, status, body }
}

export function createDemoAdmin(deps: DemoDeps): DemoAdmin {
  let busy = false

  async function exclusive<T>(run: () => Promise<DemoResult<T>>): Promise<DemoResult<T>> {
    if (busy) return fail(409, { error: 'busy' })
    busy = true
    try {
      return await run()
    } catch (error) {
      const detail = error instanceof Error ? error.message.replace(/ed25519:[1-9A-HJ-NP-Za-km-z]+/g, 'ed25519:..').slice(0, 200) : ''
      deps.log('demo operation failed', { error: error instanceof Error ? error.name : 'unknown', detail })
      return fail(502, { error: 'operation_failed' })
    } finally {
      busy = false
    }
  }

  async function read() {
    const roundId = await deps.chain.currentRoundId()
    if (roundId === 0) return { roundId, round: null, params: null }
    const [round, params] = await Promise.all([deps.port.readRound(roundId), deps.port.readParams(roundId)])
    return { roundId, round, params }
  }

  async function status(): Promise<DemoStatus> {
    const { roundId, round, params } = await read()
    const phase: RoundPhase = round?.phase ?? 'None'
    const maxCoins = params?.maxCoins ?? 0
    const coinCount = round?.coinCount ?? 0
    const freeSlots = phase === 'Lobby' ? Math.max(0, maxCoins - coinCount) : 0
    const [creator, seeder] = await Promise.all([
      deps.chain.balance(deps.creatorAccountId),
      deps.chain.balance(deps.seederAccountId)
    ])
    return {
      roundId,
      phase,
      coinCount,
      maxCoins,
      minCoins: params?.minCoins ?? 0,
      lobbyEndsAt: phase === 'Lobby' && round !== null && params !== null ? round.createdAt + params.lobbySeconds : null,
      canCreate: ENDED.includes(phase),
      canSeed: phase === 'Lobby' && freeSlots > 0,
      freeSlots,
      busy,
      balances: { owner: formatNear(creator), creator: formatNear(creator), seeder: formatNear(seeder) }
    }
  }

  async function createRound() {
    return exclusive<{ ok: true; roundId: number; txHash: string }>(async () => {
      const { round } = await read()
      if (round !== null && !ENDED.includes(round.phase)) return fail(409, { error: 'round in progress' })
      const created = await deps.chain.createRound()
      deps.log('demo round created', { roundId: created.roundId, txHash: created.txHash })
      return { ok: true, value: { ok: true, roundId: created.roundId, txHash: created.txHash } }
    })
  }

  async function seedHouse(count: number | undefined) {
    return exclusive<{ ok: true; launched: string[]; txHash: string }>(async () => {
      const wanted = Math.min(MAX_SEED_COUNT, count ?? MAX_SEED_COUNT)
      if (!Number.isInteger(wanted) || wanted < 1) return fail(400, { error: 'bad_count' })
      const { roundId, round } = await read()
      if (round === null || round.phase !== 'Lobby') return fail(409, { error: 'not in lobby' })
      const chain = deps.houseChainFor(roundId)
      if (chain === null) return fail(503, { error: 'house_seed_missing' })
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
      if (plan.length === 0) return { ok: true, value: { ok: true, launched: [], txHash: '' } }
      let needed = 0n
      for (const [walletIndex, minimum] of fundingByWallet(plan, state.launchFee, deps.houseGasBuffer)) {
        const held = await chain.houseBalance(walletIndex)
        if (held < minimum) needed += topUpTarget(minimum) - held
      }
      const balance = await deps.chain.balance(deps.seederAccountId)
      if (balance < needed) {
        return fail(402, { error: 'insufficient funds', shortfall: formatNear(needed - balance), account: deps.seederAccountId })
      }
      const result = await runSeedHouse({ chain, roster: HOUSE_ROSTER, limit, gasBuffer: deps.houseGasBuffer, log: deps.log })
      return { ok: true, value: { ok: true, launched: result.launched, txHash: result.txHashes[result.txHashes.length - 1] ?? '' } }
    })
  }

  return { status, createRound, seedHouse, isBusy: () => busy }
}
