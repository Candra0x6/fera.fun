import { mon, makeConfig } from './config.mjs'
import { derive } from './rng.mjs'
import { acc, push } from './stats.mjs'
import { winProbBps, pairing } from './combat.mjs'
import { buildStaticRound, claimPoolOf } from './experiments.mjs'
import { quoteSell } from './curve.mjs'
import {
  buyCoin,
  sellCoin,
  lockEpoch,
  resolveEpoch,
  playToEnd,
  epochSeed,
  ALIVE,
} from './round.mjs'

function runIndex(spec, r) {
  return (spec.from || 0) + r
}

export function check1(spec) {
  const out = { shareByRun: acc(), boostTotal: 0, capturedTotal: 0, trials: 0, fracSum: 0, fracN: 0 }
  const plain = spec.mode === 'plain'
  const dust = BigInt(spec.dust)
  for (let r = 0; r < spec.runs; r++) {
    const baseSeed = derive(spec.seed, runIndex(spec, r))
    const cfg = makeConfig('repro', spec.variant || 'tuned', { plainBoost: plain })
    const pools = new Array(spec.coins || 30).fill(10)
    const round = buildStaticRound(cfg, baseSeed, pools)
    for (const c of round.coins) buyCoin(round, c.id, 'bot', mon(1))
    let epochBoost = 0n
    round.onEvent = (name, d) => {
      if (name === 'ClashResolved') epochBoost += d.boost
    }
    let boostSum = 0n
    let capturedSum = 0n
    let guard = 0
    while (round.phase !== 'Settled' && guard < 2000) {
      epochBoost = 0n
      lockEpoch(round)
      const before = new Map()
      for (const id of round.lockAlive) {
        const c = round.coins[id]
        if ((c.holders.get('bot') || 0n) >= dust) before.set(id, quoteSell(c, dust, cfg.tradeFeeBps).out)
      }
      resolveEpoch(round, epochSeed(round, round.epoch))
      guard += 1
      if (round.phase === 'Settled') break
      boostSum += epochBoost
      for (const id of round.wonThisEpoch) {
        const c = round.coins[id]
        if (c.status !== ALIVE || !before.has(id)) continue
        const frac = Number(dust) / Number(c.supply)
        const got = sellCoin(round, id, 'bot', dust)
        const extra = got > before.get(id) ? got - before.get(id) : 0n
        capturedSum += extra
        out.fracSum += frac
        out.fracN += 1
      }
    }
    if (boostSum > 0n) {
      push(out.shareByRun, Number(capturedSum) / Number(boostSum))
      out.boostTotal += Number(boostSum)
      out.capturedTotal += Number(capturedSum)
      out.trials += 1
    }
  }
  return out
}

export function publicSeedFor(prevSeed) {
  return derive(prevSeed, 777)
}

function resolveOptsFor(mode) {
  return (round, seed) => {
    if (mode === 'resolve') return { pairSeed: seed }
    return { pairSeed: publicSeedFor(epochSeed(round, round.epoch - 1)) }
  }
}

export function check3Bye(spec) {
  let num = 0
  let den = 0
  let n = 0
  for (let r = 0; r < spec.runs; r++) {
    const baseSeed = derive(spec.seed, runIndex(spec, r))
    const cfg = makeConfig(spec.preset || 'repro', spec.variant || 'tuned')
    const pools = new Array(spec.coins || 30).fill(10)
    const round = buildStaticRound(cfg, baseSeed, pools)
    let candidate = -1
    let aliveAtGuess = 0
    let probed = false
    const hooks = {
      resolveOpts: resolveOptsFor(spec.mode),
      beforeLock(rd) {
        if (probed || rd.phase !== 'Knockout') return
        const alive = rd.alive.length
        const pairs = Math.min(rd.cfg.clashesPerEpoch, alive >> 1)
        if (pairs * 2 >= alive) return
        const prevSeed = rd.epoch === 0 ? derive(rd.baseSeed, 4242) : epochSeed(rd, rd.epoch)
        const guess = pairing(publicSeedFor(prevSeed), rd.alive)
        candidate = guess[2 * pairs]
        aliveAtGuess = alive
        probed = true
      },
    }
    playToEnd(round, hooks)
    if (!probed) continue
    num += round.champion === candidate ? 1 : 0
    den += 1 / aliveAtGuess
    n += 1
  }
  return { num, den, n }
}

function oddsOf(round, idA, idB) {
  let sum = 0n
  for (const id of round.alive) {
    const c = round.coins[id]
    c.rLockNum = Number(c.rMon)
    c.levelLock = c.level
    sum += c.rMon
  }
  return winProbBps(round.cfg, round.coins[idA], round.coins[idB], Number(sum) / round.alive.length)
}

function pickLopsided(round, guess) {
  const pairs = guess.length >> 1
  let bestGap = -1
  let best = 0
  for (let p = 0; p < pairs; p++) {
    const gap = Math.abs(oddsOf(round, guess[2 * p], guess[2 * p + 1]) - 5000)
    if (gap > bestGap) {
      bestGap = gap
      best = p
    }
  }
  const idA = guess[2 * best]
  const idB = guess[2 * best + 1]
  const fav = oddsOf(round, idA, idB) >= 5000 ? idA : idB
  return { fav, und: fav === idA ? idB : idA }
}

export function check3Edge(spec) {
  const out = { edge: acc(), blind: acc(), leak: acc(), nullEdge: acc() }
  for (let r = 0; r < spec.runs; r++) {
    const baseSeed = derive(spec.seed, runIndex(spec, r))
    const cfg = makeConfig('repro', spec.variant || 'tuned')
    const pools = new Array(spec.coins || 30).fill(10)
    const round = buildStaticRound(cfg, baseSeed, pools)
    lockEpoch(round)
    const s1 = epochSeed(round, 1)
    resolveEpoch(round, s1)
    const guessInformed = pairing(publicSeedFor(s1), round.alive)
    const guessBlind = pairing(derive(s1, 999), round.alive)
    const informed = pickLopsided(round, guessInformed)
    const blind = pickLopsided(round, guessBlind)
    const stake = {}
    for (const id of round.alive) stake[id] = Number(round.coins[id].rMon)
    playToEnd(round, { resolveOpts: resolveOptsFor(spec.mode) })
    const evOf = (id) => Number(claimPoolOf(round, round.coins[id])) / stake[id]
    const edgeInformed = evOf(informed.fav) - evOf(informed.und)
    const edgeBlind = evOf(blind.fav) - evOf(blind.und)
    push(out.edge, edgeInformed)
    push(out.blind, edgeBlind)
    push(out.leak, edgeInformed - edgeBlind)
    push(out.nullEdge, evOf(guessInformed[0]) - evOf(guessInformed[1]))
  }
  return out
}
