import { mon, makeConfig } from './config.mjs'
import { ceilDiv, BPS } from './curve.mjs'
import { derive, mulberry32, pick, TAG_SETUP } from './rng.mjs'
import { acc, push } from './stats.mjs'
import {
  createRound,
  launchCoin,
  startRound,
  buyCoin,
  playToEnd,
  ELIMINATED,
  CHAMPION,
} from './round.mjs'

export function buildStaticRound(cfgIn, baseSeed, poolsMon, opts) {
  const o = opts || {}
  const cfg = o.bypassSeedFloor ? { ...cfgIn, minSeed: 1n } : cfgIn
  const floorSeed = cfgIn.minSeed
  const rng = mulberry32(derive(baseSeed, TAG_SETUP))
  const round = createRound(cfg, derive(baseSeed, 99))
  const pools = poolsMon.map((p) => mon(p))
  for (let i = 0; i < pools.length; i++) {
    const type = pick(rng, 5)
    const seedWei = pools[i] < floorSeed ? pools[i] : floorSeed
    launchCoin(round, 'creator' + i, type, seedWei)
  }
  startRound(round)
  for (let i = 0; i < pools.length; i++) {
    const coin = round.coins[i]
    const remaining = pools[i] - coin.seedMon
    if (remaining > 0n) {
      const gross = ceilDiv(remaining * BPS, BPS - BigInt(cfg.tradeFeeBps))
      buyCoin(round, i, 'pool', gross)
    }
  }
  return round
}

export function claimPoolOf(round, coin) {
  if (coin.status === ELIMINATED) return coin.consolationPool
  if (coin.status === CHAMPION) return round.redeemPool
  return 0n
}

export function evCell(spec) {
  const cfg = makeConfig(spec.preset, spec.variant, spec.overrides)
  const n = spec.coins
  const firstKo = cfg.levelingEpochs + 1
  const base = spec.basePool || 10
  const out = {
    ev: acc(),
    seedEv: acc(),
    buyerEv: acc(),
    champ: acc(),
    outEpoch1: acc(),
    systemEv: acc(),
    champMultiple: acc(),
    epoch1Recovery: acc(),
    epochs: acc(),
    taggedWins: acc(),
  }
  for (let r = 0; r < spec.runs; r++) {
    const baseSeed = derive(spec.seed, (spec.from || 0) + r)
    const pools = new Array(n).fill(base)
    pools[0] = base * spec.mult
    const round = buildStaticRound(cfg, baseSeed, pools, { bypassSeedFloor: spec.bypassSeedFloor })
    playToEnd(round)
    const t = round.coins[0]
    const claimed = Number(claimPoolOf(round, t))
    const gross = Number(t.grossIn)
    push(out.ev, claimed / gross)
    const supply = Number(t.status === CHAMPION ? round.redeemSupply : t.consolationSupply)
    const seedShare = supply > 0 ? Number(t.seedTokens) / supply : 0
    push(out.seedEv, (claimed * seedShare) / Number(t.seedMon))
    const buyStake = gross - Number(t.seedMon)
    if (buyStake > 0) push(out.buyerEv, (claimed * (1 - seedShare)) / buyStake)
    push(out.champ, t.status === CHAMPION ? 1 : 0)
    push(out.outEpoch1, t.eliminatedEpoch === firstKo ? 1 : 0)
    push(out.taggedWins, t.wins)
    let sumPay = 0
    let sumGross = 0
    let recSum = 0
    let recN = 0
    for (const c of round.coins) {
      sumPay += Number(claimPoolOf(round, c))
      sumGross += Number(c.grossIn)
      if (c.eliminatedEpoch === firstKo) {
        recSum += Number(c.consolationPool) / Number(c.grossIn)
        recN += 1
      }
    }
    push(out.systemEv, sumPay / sumGross)
    const champ = round.coins[round.champion]
    push(out.champMultiple, Number(round.redeemPool) / Number(champ.grossIn))
    if (recN > 0) push(out.epoch1Recovery, recSum / recN)
    push(out.epochs, round.epoch)
  }
  return out
}
