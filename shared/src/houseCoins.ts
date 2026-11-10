import houseCoinsJson from '../house-coins.json'

export const HOUSE_CREATOR_SUFFIX = '.fera-seeder.testnet'

export interface HouseCoinEntry {
  roundId: number
  coinId: number
  ticker: string
  token: string
}

export function isHouseCreator(creator: string, suffix: string = HOUSE_CREATOR_SUFFIX): boolean {
  return creator.endsWith(suffix) && creator.length > suffix.length
}

export function parseHouseCoins(value: unknown): HouseCoinEntry[] {
  if (!Array.isArray(value)) throw new TypeError('house-coins.json must be an array')
  return value.map((entry: unknown, index: number) => {
    if (typeof entry !== 'object' || entry === null) throw new TypeError(`house-coins.json[${index}] is invalid`)
    const { roundId, coinId, ticker, token } = entry as Record<string, unknown>
    if (typeof roundId !== 'number' || typeof coinId !== 'number' || typeof ticker !== 'string' || typeof token !== 'string' || token === '') {
      throw new TypeError(`house-coins.json[${index}] is invalid`)
    }
    return { roundId, coinId, ticker, token }
  })
}

export const houseCoins: readonly HouseCoinEntry[] = parseHouseCoins(houseCoinsJson)

export function houseTokenSet(entries: readonly HouseCoinEntry[] = houseCoins): ReadonlySet<string> {
  return new Set(entries.map((entry) => entry.token.toLowerCase()))
}
