import { mon, makeConfig } from './config.mjs'
import { derive, mulberry32, pick, TAG_SETUP, TAG_TRADE } from './rng.mjs'
import { acc, push, gini } from './stats.mjs'
import {
  createRound,
  launchCoin,
  startRound,
  buyCoin,
  sellCoin,
  playToEnd,
  claimValue,
  ALIVE,
  ELIMINATED,
  CHAMPION,
} from './round.mjs'

function traderKinds(spec) {
  const kinds = []
  const mixSpec = spec.traders || { uniform: 20, momentum: 20, level: 20 }
  for (const k of Object.keys(mixSpec)) {
    for (let i = 0; i < mixSpec[k]; i++) kinds.push(k)
  }
  return kinds
}

function chooseTarget(round, rng, kind) {
  const alive = round.alive
  if (kind === 'uniform') return alive[pick(rng, alive.length)]
  let best = []
  let bestScore = -Infinity
  for (const id of alive) {
    const c = round.coins[id]
    let score
    if (kind === 'momentum') score = c.prevR > 0n ? Number(c.rMon) / Number(c.prevR) : 1
    else score = c.level
    if (score > bestScore + 1e-12) {
      bestScore = score
      best = [id]
    } else if (Math.abs(score - bestScore) <= 1e-12) {
      best.push(id)
    }
  }
  return best[pick(rng, best.length)]
}

export function runDynamic(spec) {
  const n = spec.coins || 30
  const out = {
    champMultiple: acc(),
    outEpoch1: acc(),
    epoch1Recovery: acc(),
    systemEv: acc(),
    epochs: acc(),
    clashes: acc(),
    gini: acc(),
    evUniform: acc(),
    evMomentum: acc(),
    evLevel: acc(),
    whaleEv: acc(),
    whaleShare: acc(),
    snipeRandomWin: acc(),
    snipeStrongWin: acc(),
    snipeRandomEv: acc(),
    snipeStrongEv: acc(),
    creatorEv: acc(),
  }
  const evBy = { uniform: out.evUniform, momentum: out.evMomentum, level: out.evLevel }
  const kinds = traderKinds(spec)
  for (let r = 0; r < spec.runs; r++) {
    const baseSeed = derive(spec.seed, (spec.from || 0) + r)
    const cfg = makeConfig(spec.preset, spec.variant, spec.overrides)
    const rng = mulberry32(derive(baseSeed, TAG_SETUP))
    const trng = mulberry32(derive(baseSeed, TAG_TRADE))
    const round = createRound(cfg, derive(baseSeed, 99))
    for (let i = 0; i < n; i++) {
      const seedMon = (Number(cfg.minSeed) / 1e18) * (1 + pick(rng, 17) / 2)
      launchCoin(round, 'creator' + i, pick(rng, 5), mon(seedMon))
    }
    startRound(round)
    const traders = kinds.map((kind, i) => {
      const budget = mon(2 + rng() * 6)
      return { id: 't' + i, kind, budget, cash: budget, held: new Map(), spent: 0n, proceeds: 0n }
    })
    const whale = spec.whale ? { id: 'whale', budget: mon(spec.whale.amount), cash: mon(spec.whale.amount), held: new Map(), spent: 0n, proceeds: 0n } : null
    const snipers = spec.snipe
      ? [
          { id: 'snipeRandom', kind: 'random', budget: 0n, cash: 0n, held: new Map(), spent: 0n, wins: 0, fights: 0, targets: [] },
          { id: 'snipeStrong', kind: 'strong', budget: 0n, cash: 0n, held: new Map(), spent: 0n, wins: 0, fights: 0, targets: [] },
        ]
      : []
    const spendUnit = mon(1)
    const act = (t) => {
      if (t.cash <= 0n) return
      if (trng() > 0.6) return
      const id = chooseTarget(round, trng, t.kind)
      const frac = 0.2 + trng() * 0.4
      let amount = (t.cash * BigInt(Math.floor(frac * 1000))) / 1000n
      if (amount < mon(0.05)) amount = t.cash
      if (amount <= 0n) return
      const tokens = buyCoin(round, id, t.id, amount)
      t.spent += amount
      t.cash -= amount
      t.held.set(id, (t.held.get(id) || 0n) + tokens)
    }
    const maybeSell = (t) => {
      if (t.held.size === 0 || trng() > 0.15) return
      const ids = [...t.held.keys()].filter((id) => round.coins[id].status === ALIVE && t.held.get(id) > 0n)
      if (ids.length === 0) return
      const id = ids[pick(trng, ids.length)]
      const tokens = t.held.get(id)
      const outMon = sellCoin(round, id, t.id, tokens)
      t.cash += outMon
      t.proceeds += outMon
      t.held.set(id, 0n)
    }
    let whaleDone = false
    const hooks = {
      beforeLock(rd) {
        for (const id of rd.alive) rd.coins[id].prevR = rd.coins[id].prevR === undefined ? rd.coins[id].rMon : rd.coins[id].prevR
        for (const t of traders) {
          maybeSell(t)
          act(t)
        }
        if (whale && !whaleDone) {
          whaleDone = true
          const strat = spec.whale.strategy
          if (strat === 'spread') {
            const share = whale.cash / BigInt(rd.alive.length)
            for (const id of rd.alive) {
              const tk = buyCoin(rd, id, whale.id, share)
              whale.spent += share
              whale.cash -= share
              whale.held.set(id, tk)
            }
          } else {
            let id
            if (strat === 'top') {
              id = rd.alive[0]
              for (const a of rd.alive) if (rd.coins[a].rMon > rd.coins[id].rMon) id = a
            } else id = rd.alive[pick(trng, rd.alive.length)]
            const tk = buyCoin(rd, id, whale.id, whale.cash)
            whale.spent += whale.cash
            whale.held.set(id, tk)
            whale.cash = 0n
          }
        }
        if (rd.phase === 'Knockout') {
          for (const s of snipers) {
            let id
            if (s.kind === 'random') id = rd.alive[pick(trng, rd.alive.length)]
            else {
              id = rd.alive[0]
              let bestScore = -1
              for (const a of rd.alive) {
                const c = rd.coins[a]
                const score = (1 + 0.04 * (c.level - 1)) * Math.pow(Number(c.rMon), 0.85)
                if (score > bestScore) {
                  bestScore = score
                  id = a
                }
              }
            }
            const tk = buyCoin(rd, id, s.id, spendUnit)
            s.held.set(id, (s.held.get(id) || 0n) + tk)
            s.spent += spendUnit
            s.targets.push({ id, epoch: rd.epoch + 1 })
          }
        }
        for (const id of rd.alive) rd.coins[id].prevR = rd.coins[id].rMon
      },
    }
    const events = []
    round.onEvent = (name, data) => {
      if (name === 'ClashResolved') events.push(data)
    }
    playToEnd(round, hooks)
    for (const s of snipers) {
      for (const tg of s.targets) {
        const fight = events.find((e) => e.epoch === tg.epoch && (e.winner === tg.id || e.loser === tg.id))
        if (fight) {
          s.fights += 1
          if (fight.winner === tg.id) s.wins += 1
        }
      }
      if (s.fights > 0) push(s.kind === 'random' ? out.snipeRandomWin : out.snipeStrongWin, s.wins / s.fights)
      let value = 0n
      for (const [id, tk] of s.held) value += claimValue(round, round.coins[id], tk)
      if (s.spent > 0n) push(s.kind === 'random' ? out.snipeRandomEv : out.snipeStrongEv, Number(value) / Number(s.spent))
    }
    const finalOf = (t) => {
      let v = t.proceeds
      for (const [id, tk] of t.held) v += claimValue(round, round.coins[id], tk)
      return v
    }
    const values = []
    const totals = { uniform: [0, 0], momentum: [0, 0], level: [0, 0] }
    for (const t of traders) {
      const fv = finalOf(t)
      values.push(Number(fv) / 1e18)
      totals[t.kind][0] += Number(fv)
      totals[t.kind][1] += Number(t.spent)
    }
    for (const k of Object.keys(totals)) if (totals[k][1] > 0) push(evBy[k], totals[k][0] / totals[k][1])
    let creatorsFinal = 0
    let creatorsStake = 0
    for (const c of round.coins) {
      const v = claimValue(round, c, c.seedTokens)
      values.push(Number(v) / 1e18)
      creatorsFinal += Number(v)
      creatorsStake += Number(c.seedMon)
    }
    push(out.creatorEv, creatorsFinal / creatorsStake)
    if (whale) {
      const wv = finalOf(whale)
      values.push(Number(wv) / 1e18)
      push(out.whaleEv, Number(wv) / Number(whale.spent))
      let totalValue = 0
      for (const v of values) totalValue += v
      push(out.whaleShare, Number(wv) / 1e18 / totalValue)
    }
    push(out.gini, gini(values))
    let sumPay = 0
    let sumIn = 0
    let recSum = 0
    let recN = 0
    for (const c of round.coins) {
      const pool = c.status === ELIMINATED ? c.consolationPool : c.status === CHAMPION ? round.redeemPool : 0n
      sumPay += Number(pool)
      sumIn += Number(c.grossIn)
      if (c.eliminatedEpoch === cfg.levelingEpochs + 1) {
        push(out.outEpoch1, 1)
        recSum += Number(c.consolationPool) / Number(c.grossIn)
        recN += 1
      } else push(out.outEpoch1, 0)
    }
    if (recN > 0) push(out.epoch1Recovery, recSum / recN)
    push(out.systemEv, sumPay / sumIn)
    const champ = round.coins[round.champion]
    push(out.champMultiple, Number(round.redeemPool) / Number(champ.grossIn))
    push(out.epochs, round.epoch)
    push(out.clashes, round.clashesPlayed)
  }
  return out
}
