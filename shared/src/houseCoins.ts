import houseCoinsJson from '../house-coins.json'
import { isHex } from './args'
import type { Hex } from './types'

export interface HouseCoinEntry {
  roundId: number
  coinId: number
  ticker: string
  token: Hex
}

export function parseHouseCoins(value: unknown): HouseCoinEntry[] {
  if (!Array.isArray(value)) throw new TypeError('house-coins.json must be an array')
  return value.map((entry: unknown, index: number) => {
    if (typeof entry !== 'object' || entry === null) throw new TypeError(`house-coins.json[${index}] is invalid`)
    const { roundId, coinId, ticker, token } = entry as Record<string, unknown>
    if (typeof roundId !== 'number' || typeof coinId !== 'number' || typeof ticker !== 'string' || !isHex(token)) {
      throw new TypeError(`house-coins.json[${index}] is invalid`)
    }
    return { roundId, coinId, ticker, token }
  })
}

export const houseCoins: readonly HouseCoinEntry[] = parseHouseCoins(houseCoinsJson)

export function houseTokenSet(entries: readonly HouseCoinEntry[] = houseCoins): ReadonlySet<string> {
  return new Set(entries.map((entry) => entry.token.toLowerCase()))
}
