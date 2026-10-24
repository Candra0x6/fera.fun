import { ceilDiv } from './math'

export const BPS_DENOMINATOR = 10_000n

export interface CurveReserves {
  vMon: bigint
  vTok: bigint
  rMon: bigint
}

export interface BuyQuote {
  fee: bigint
  tokensOut: bigint
  next: CurveReserves
}

export interface SellQuote {
  fee: bigint
  gross: bigint
  monOut: bigint
  next: CurveReserves
}

export interface LossSplit {
  boost: bigint
  consolation: bigint
  toPot: bigint
  toTreasury: bigint
}

export interface SplitBps {
  boostBps: bigint
  consolationBps: bigint
  potBps: bigint
}

export const DEFAULT_SPLIT: SplitBps = { boostBps: 5000n, consolationBps: 3000n, potBps: 1500n }

export function feeOf(amount: bigint, feeBps: bigint): bigint {
  return ceilDiv(amount * feeBps, BPS_DENOMINATOR)
}

export function quoteBuy(reserves: CurveReserves, monIn: bigint, feeBps: bigint): BuyQuote {
  const fee = feeOf(monIn, feeBps)
  const net = monIn - fee
  const k = reserves.vMon * reserves.vTok
  const vMon = reserves.vMon + net
  const vTok = ceilDiv(k, vMon)
  const tokensOut = reserves.vTok - vTok
  return { fee, tokensOut, next: { vMon, vTok, rMon: reserves.rMon + net } }
}

export function quoteSell(reserves: CurveReserves, tokens: bigint, feeBps: bigint): SellQuote {
  const k = reserves.vMon * reserves.vTok
  const vTok = reserves.vTok + tokens
  const vMon = ceilDiv(k, vTok)
  const gross = reserves.vMon - vMon
  const fee = feeOf(gross, feeBps)
  return {
    fee,
    gross,
    monOut: gross - fee,
    next: { vMon, vTok, rMon: reserves.rMon - gross }
  }
}

export function applyBoost(reserves: CurveReserves, boost: bigint): CurveReserves {
  const k = reserves.vMon * reserves.vTok
  const vMon = reserves.vMon + boost
  return { vMon, vTok: ceilDiv(k, vMon), rMon: reserves.rMon + boost }
}

export function splitLoss(reserve: bigint, split: SplitBps = DEFAULT_SPLIT): LossSplit {
  const boost = (reserve * split.boostBps) / BPS_DENOMINATOR
  const consolation = (reserve * split.consolationBps) / BPS_DENOMINATOR
  const toPot = (reserve * split.potBps) / BPS_DENOMINATOR
  return { boost, consolation, toPot, toTreasury: reserve - boost - consolation - toPot }
}

export interface SeededCoin extends CurveReserves {
  supply: bigint
}

export function launchSeedState(vMon0: bigint, vTok0: bigint, seedMon: bigint): SeededCoin {
  const k = vMon0 * vTok0
  const vMon = vMon0 + seedMon
  const vTok = ceilDiv(k, vMon)
  return { vMon, vTok, rMon: seedMon, supply: vTok0 - vTok }
}
