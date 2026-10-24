export interface LaunchInput {
  name: string
  ticker: string
  seedMon: string
  minSeedMon: number
  maxSeedMon: number
  phase: string
  coinCount: number
  maxCoins: number
  launchedByMe: number
  connected: boolean
  chainOk: boolean
  balanceMon: number | null
  launchFeeMon: number
  reserveFunded?: boolean
}

export const MAX_COINS_PER_ADDRESS = 2
export const TICKER_PATTERN = /^[A-Z0-9]{2,7}$/

export function sanitizeTickerInput(raw: string): string {
  return raw.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 7)
}

export function launchBlocker(input: LaunchInput): string | null {
  if (input.phase !== 'Lobby') return 'Lobby only'
  if (!input.connected) return 'Connect a wallet first'
  if (!input.chainOk) return 'Switch to Monad Testnet'
  if (input.reserveFunded === false) return 'Reserve not funded yet'
  if (input.coinCount >= input.maxCoins) return `Arena full (${input.coinCount} / ${input.maxCoins})`
  if (input.launchedByMe >= MAX_COINS_PER_ADDRESS) return `Limit of ${MAX_COINS_PER_ADDRESS} coins per address`
  const name = input.name.trim()
  if (name.length < 1 || name.length > 28) return 'Name must be 1 to 28 characters'
  if (!TICKER_PATTERN.test(input.ticker)) return 'Ticker must be 2 to 7 letters or digits'
  const seed = Number(input.seedMon)
  if (!Number.isFinite(seed) || input.seedMon.trim() === '') return 'Enter a seed amount'
  if (seed < input.minSeedMon) return `Minimum seed is ${input.minSeedMon} MON`
  if (seed > input.maxSeedMon) return `Maximum seed is ${input.maxSeedMon} MON`
  if (input.balanceMon !== null && input.balanceMon < seed + input.launchFeeMon) return 'Balance too low'
  return null
}
