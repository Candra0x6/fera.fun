export const ONE = 10n ** 18n
export const BPS = 10000n

export function ceilDiv(a, b) {
  return (a + b - 1n) / b
}

export function newCurve(vMon0, vTok0, kCached) {
  return {
    vMon: vMon0,
    vTok: vTok0,
    rMon: 0n,
    supply: 0n,
    feeAcc: 0n,
    kFixed: kCached ? vMon0 * vTok0 : 0n,
  }
}

function kOf(c) {
  return c.kFixed > 0n ? c.kFixed : c.vMon * c.vTok
}

export function quoteBuy(c, monIn, feeBps) {
  const fee = ceilDiv(monIn * BigInt(feeBps), BPS)
  const inNet = monIn - fee
  const nv = c.vMon + inNet
  const nt = ceilDiv(kOf(c), nv)
  const out = c.vTok > nt ? c.vTok - nt : 0n
  return { fee, inNet, out, nv, nt }
}

export function buy(c, monIn, feeBps) {
  const q = quoteBuy(c, monIn, feeBps)
  c.vMon = q.nv
  c.vTok = c.vTok - q.out
  c.rMon += q.inNet
  c.supply += q.out
  c.feeAcc += q.fee
  return q
}

export function quoteSell(c, tokens, feeBps) {
  const floor = ceilDiv(kOf(c), c.vTok + tokens)
  const gross = c.vMon > floor ? c.vMon - floor : 0n
  const fee = ceilDiv(gross * BigInt(feeBps), BPS)
  return { gross, fee, out: gross - fee }
}

export function sell(c, tokens, feeBps) {
  if (tokens > c.supply) throw new Error('SellExceedsSupply')
  const q = quoteSell(c, tokens, feeBps)
  if (q.gross > c.rMon) throw new Error('InsolventSell')
  c.vMon -= q.gross
  c.vTok += tokens
  c.rMon -= q.gross
  c.supply -= tokens
  c.feeAcc += q.fee
  return q
}

export function boost(c, x) {
  const k = c.vMon * c.vTok
  c.vMon += x
  c.rMon += x
  c.vTok = ceilDiv(k, c.vMon)
}

export function boostPlain(c, x) {
  c.vMon += x
  c.rMon += x
}

export function spot(c) {
  return Number(c.vMon) / Number(c.vTok)
}
