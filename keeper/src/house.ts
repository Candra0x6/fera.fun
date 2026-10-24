import { monsterByKey, skinByKey } from '@animal/shared'
import type { HouseCoinEntry } from '@animal/shared'
import type { Hex } from '@animal/shared'

export interface RosterEntry {
  ticker: string
  name: string
  monsterType: number
  skinId: number
}

const RAW_ROSTER: ReadonlyArray<readonly [string, string, string, string]> = [
  ['MOOND', 'Moon Dragon Protocol', 'fire_dragon', 'royal'],
  ['FIRECAT', 'FireCat On-Chain', 'fire_dragon', 'default'],
  ['AQUA', 'Aqua Frost Wolf', 'ice_wolf', 'crystal'],
  ['TITAN', 'Gaia Monolith LP', 'earth_golem', 'default'],
  ['VOLT', 'Volt Kitsune', 'electric_fox', 'royal'],
  ['SHADE', 'Nether Wraith', 'dark_spirit', 'celestial'],
  ['DRACO', 'Draco Ignis', 'fire_dragon', 'obsidian'],
  ['GLACIER', 'Glacier Fang', 'ice_wolf', 'default'],
  ['KITSUNE', 'Spark NineTail', 'electric_fox', 'default'],
  ['CRAG', 'Basalt Guardian', 'earth_golem', 'obsidian'],
  ['UMBRA', 'Umbra Core', 'dark_spirit', 'default'],
  ['PYRO', 'Pyro Scale', 'fire_dragon', 'default']
]

const SEED_WEIGHTS_TENTHS: readonly number[] = [60, 55, 50, 45, 40, 35, 30, 25, 22, 20, 15, 10]
export const COINS_PER_HOUSE_WALLET = 2
export const BLOCKS_BETWEEN_LAUNCHES = 4

export const HOUSE_ROSTER: readonly RosterEntry[] = RAW_ROSTER.map(([ticker, name, monster, skin]) => {
  const monsterType = monsterByKey(monster)?.monsterType
  const skinId = skinByKey(skin)?.skinId
  if (monsterType === undefined || skinId === undefined) throw new Error(`roster entry ${ticker} is not in the catalog`)
  return { ticker, name, monsterType, skinId }
})

export interface LaunchPlanItem extends RosterEntry {
  seed: bigint
  walletIndex: number
}

export interface PlanInput {
  roster?: readonly RosterEntry[]
  minSeed: bigint
  maxSeed: bigint
  existingTickers: ReadonlySet<string>
  freeSlots: number
  limit?: number
}

export function seedFor(index: number, minSeed: bigint, maxSeed: bigint): bigint {
  const flat = process.env['HOUSE_FLAT_SEED'] === '1'
  const weight = flat ? 10n : BigInt(SEED_WEIGHTS_TENTHS[index % SEED_WEIGHTS_TENTHS.length] ?? 10)
  const raw = (minSeed * weight) / 10n
  if (raw < minSeed) return minSeed
  return raw > maxSeed ? maxSeed : raw
}

export function planLaunches(input: PlanInput): LaunchPlanItem[] {
  const roster = input.roster ?? HOUSE_ROSTER
  const plan: LaunchPlanItem[] = []
  roster.forEach((entry, index) => {
    if (input.existingTickers.has(entry.ticker)) return
    if (plan.length >= Math.min(input.freeSlots, input.limit ?? Number.MAX_SAFE_INTEGER)) return
    plan.push({
      ...entry,
      seed: seedFor(index, input.minSeed, input.maxSeed),
      walletIndex: Math.floor(index / COINS_PER_HOUSE_WALLET)
    })
  })
  return plan
}

export function fundingByWallet(plan: readonly LaunchPlanItem[], launchFee: bigint, gasBuffer: bigint): Map<number, bigint> {
  const out = new Map<number, bigint>()
  for (const item of plan) {
    const current = out.get(item.walletIndex) ?? gasBuffer
    out.set(item.walletIndex, current + launchFee + item.seed)
  }
  return out
}

export interface HouseCoinOnChain {
  coinId: number
  ticker: string
  token: Hex
}

export interface HouseChain {
  readState(): Promise<{
    coins: HouseCoinOnChain[]
    minSeed: bigint
    maxSeed: bigint
    launchFee: bigint
    maxCoins: number
  }>
  ensureReserve(): Promise<bigint>
  fund(walletIndex: number, amount: bigint): Promise<void>
  launch(item: LaunchPlanItem, launchFee: bigint): Promise<void>
  waitBlocks(count: number): Promise<void>
}

export interface SeedHouseResult {
  launched: string[]
  skipped: string[]
  entries: HouseCoinEntry[]
}

export interface SeedHouseOptions {
  chain: HouseChain
  roundId: number
  gasBuffer: bigint
  roster?: readonly RosterEntry[]
  limit?: number
  log: (message: string, fields?: Record<string, unknown>) => void
}

export async function runSeedHouse(options: SeedHouseOptions): Promise<SeedHouseResult> {
  const roster = options.roster ?? HOUSE_ROSTER
  const topUp = await options.chain.ensureReserve()
  if (topUp > 0n) options.log('funded the reserve floor through fundTreasury', { amount: topUp.toString() })
  const before = await options.chain.readState()
  const existing = new Set(before.coins.map((coin) => coin.ticker))
  const plan = planLaunches({
    roster,
    minSeed: before.minSeed,
    maxSeed: before.maxSeed,
    existingTickers: existing,
    freeSlots: Math.max(0, before.maxCoins - before.coins.length),
    ...(options.limit === undefined ? {} : { limit: options.limit })
  })
  const skipped = roster.filter((entry) => existing.has(entry.ticker)).map((entry) => entry.ticker)
  const funding = fundingByWallet(plan, before.launchFee, options.gasBuffer)
  for (const [walletIndex, amount] of funding) {
    options.log('funding house wallet', { walletIndex, amount: amount.toString() })
    await options.chain.fund(walletIndex, amount)
  }
  const launched: string[] = []
  for (const item of plan) {
    await options.chain.launch(item, before.launchFee)
    launched.push(item.ticker)
    options.log('launched house coin', { ticker: item.ticker, walletIndex: item.walletIndex, seed: item.seed.toString() })
    await options.chain.waitBlocks(BLOCKS_BETWEEN_LAUNCHES)
  }
  const after = await options.chain.readState()
  const wanted = new Set(roster.map((entry) => entry.ticker))
  const entries: HouseCoinEntry[] = after.coins
    .filter((coin) => wanted.has(coin.ticker))
    .map((coin) => ({ roundId: options.roundId, coinId: coin.coinId, ticker: coin.ticker, token: coin.token }))
  return { launched, skipped, entries }
}
