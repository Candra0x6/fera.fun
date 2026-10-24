import type { ArenaState, CoinView } from '@animal/shared'

export const BTN_PRIMARY =
  'cartoon-btn-green font-extrabold text-sm px-5 py-2.5 flex items-center justify-center gap-1.5 transition disabled:opacity-50 disabled:cursor-not-allowed'
export const BTN_GLASS =
  'cartoon-btn-green font-extrabold text-sm px-5 py-2.5 flex items-center gap-2 transition disabled:opacity-50 disabled:cursor-not-allowed'
export const BTN_SECONDARY =
  'cartoon-btn-yellow font-extrabold text-sm px-5 py-2.5 flex items-center justify-center gap-1.5 transition disabled:opacity-50 disabled:cursor-not-allowed'
export const BTN_NEUTRAL =
  'cartoon-btn text-xs font-extrabold px-4 py-2 transition disabled:opacity-50 disabled:cursor-not-allowed'
export const INPUT =
  'w-full bg-[#fbf3de] border-[3px] border-[#d9c593] rounded-xl px-3 py-2 text-[#2a4a57] text-xs font-bold focus:border-[#2b7a8e] outline-none disabled:opacity-50'
export const LABEL = 'block text-[11px] font-extrabold uppercase tracking-wider text-[#2a4a57] mb-1'

export function cfgNumber(state: ArenaState, key: string, fallback: number): number {
  const value = state.config?.[key]
  return typeof value === 'number' ? value : fallback
}

export function cfgWei(state: ArenaState, key: string, fallback: bigint): bigint {
  const value = state.config?.[key]
  if (typeof value === 'string' && /^\d+$/.test(value)) return BigInt(value)
  if (typeof value === 'number') return BigInt(value)
  return fallback
}

export function coinId(coin: Pick<CoinView, 'roundId' | 'coinId'>): string {
  return `${coin.roundId}:${coin.coinId}`
}

export function findCoin(state: ArenaState, id: string | null): CoinView | undefined {
  if (id === null) return undefined
  return state.optimistic.coins.find((coin) => coinId(coin) === id)
}

export function weiToNumber(wei: bigint): number {
  return Number(wei / 10n ** 12n) / 1e6
}
