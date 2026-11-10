export interface LaunchInput {
  name: string
  ticker: string
  seedNear: string
  minSeedNear: number
  maxSeedNear: number
  phase: string
  coinCount: number
  maxCoins: number
  launchedByMe: number
  connected: boolean
  balanceNear: number | null
  launchFeeNear: number
}

export const MAX_COINS_PER_ACCOUNT = 2
export const GAS_RESERVE_NEAR = 0.01
export const TICKER_PATTERN = /^[A-Z0-9]{2,7}$/

export function sanitizeTickerInput(raw: string): string {
  return raw.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 7)
}

export function launchBlocker(input: LaunchInput): string | null {
  if (input.phase !== 'Lobby') return 'Lobby only'
  if (!input.connected) return 'Connect a wallet first'
  if (input.coinCount >= input.maxCoins) return `Arena full (${input.coinCount} / ${input.maxCoins})`
  if (input.launchedByMe >= MAX_COINS_PER_ACCOUNT) return `Limit of ${MAX_COINS_PER_ACCOUNT} coins per account`
  const name = input.name.trim()
  if (name.length < 1 || name.length > 28) return 'Name must be 1 to 28 characters'
  if (!TICKER_PATTERN.test(input.ticker)) return 'Ticker must be 2 to 7 letters or digits'
  const seed = Number(input.seedNear)
  if (!Number.isFinite(seed) || input.seedNear.trim() === '') return 'Enter a seed amount'
  if (seed < input.minSeedNear) return `Minimum seed is ${input.minSeedNear} NEAR`
  if (seed > input.maxSeedNear) return `Maximum seed is ${input.maxSeedNear} NEAR`
  if (input.balanceNear !== null && input.balanceNear < seed + input.launchFeeNear + GAS_RESERVE_NEAR) return 'Balance too low'
  return null
}
