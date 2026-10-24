import { compareBig } from './math'
import type { CoinView, RankedCoin } from './types'

export function compareCoinRank(a: CoinView, b: CoinView): number {
  const byReserve = compareBig(BigInt(b.rMon), BigInt(a.rMon))
  if (byReserve !== 0) return byReserve
  if (a.wins !== b.wins) return b.wins - a.wins
  const left = a.token.toLowerCase()
  const right = b.token.toLowerCase()
  if (left < right) return -1
  if (left > right) return 1
  return 0
}

export function rankCoins(coins: readonly CoinView[]): RankedCoin[] {
  return [...coins].sort(compareCoinRank).map((coin, index) => ({ ...coin, rank: index + 1 }))
}
