import { monsterByKey, skinByKey } from '@animal/shared'

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

export const HOUSE_WALLETS = 5
export const MAX_SEED_COUNT = 5

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

export function seedFor(minSeed: bigint, maxSeed: bigint): bigint {
  return minSeed > maxSeed ? maxSeed : minSeed
}

export function planLaunches(input: PlanInput): LaunchPlanItem[] {
  const roster = input.roster ?? HOUSE_ROSTER
  const cap = Math.min(input.freeSlots, input.limit ?? Number.MAX_SAFE_INTEGER)
  const plan: LaunchPlanItem[] = []
  roster.forEach((entry, index) => {
    if (input.existingTickers.has(entry.ticker)) return
    if (plan.length >= cap) return
    plan.push({ ...entry, seed: seedFor(input.minSeed, input.maxSeed), walletIndex: index % HOUSE_WALLETS })
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
  creator: string
}

export interface HouseState {
  coins: HouseCoinOnChain[]
  minSeed: bigint
  maxSeed: bigint
  launchFee: bigint
  maxCoins: number
}

export interface HouseChain {
  readState(): Promise<HouseState>
  houseBalance(walletIndex: number): Promise<bigint>
  fund(walletIndex: number, target: bigint): Promise<void>
  launch(item: LaunchPlanItem, launchFee: bigint): Promise<string>
}

export interface SeedHouseResult {
  launched: string[]
  txHashes: string[]
}

export interface SeedHouseOptions {
  chain: HouseChain
  gasBuffer: bigint
  roster?: readonly RosterEntry[]
  limit?: number
  log: (message: string, fields?: Record<string, unknown>) => void
}

export async function runSeedHouse(options: SeedHouseOptions): Promise<SeedHouseResult> {
  const before = await options.chain.readState()
  const plan = planLaunches({
    ...(options.roster === undefined ? {} : { roster: options.roster }),
    minSeed: before.minSeed,
    maxSeed: before.maxSeed,
    existingTickers: new Set(before.coins.map((coin) => coin.ticker)),
    freeSlots: Math.max(0, before.maxCoins - before.coins.length),
    ...(options.limit === undefined ? {} : { limit: options.limit })
  })
  for (const [walletIndex, target] of fundingByWallet(plan, before.launchFee, options.gasBuffer)) {
    await options.chain.fund(walletIndex, target)
    options.log('house wallet ready', { walletIndex, target: target.toString() })
  }
  const launched: string[] = []
  const txHashes: string[] = []
  for (const item of plan) {
    const txHash = await options.chain.launch(item, before.launchFee)
    launched.push(item.ticker)
    txHashes.push(txHash)
    options.log('launched house coin', { ticker: item.ticker, walletIndex: item.walletIndex, seed: item.seed.toString(), txHash })
  }
  return { launched, txHashes }
}
