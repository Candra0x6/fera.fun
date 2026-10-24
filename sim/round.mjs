import { newCurve, buy as cBuy, sell as cSell, boost as cBoost, boostPlain, quoteBuy, quoteSell, ceilDiv, BPS } from './curve.mjs'
import { winProbBps, pairing, clashRoll, huntRoll, levelFromXp } from './combat.mjs'
import { derive, TAG_EPOCH } from './rng.mjs'

export const ALIVE = 1
export const ELIMINATED = 2
export const CHAMPION = 3

export function createRound(cfg, baseSeed) {
  return {
    cfg,
    baseSeed,
    coins: [],
    alive: [],
    phase: 'Lobby',
    epoch: 0,
    levelingDone: 0,
    locked: false,
    lockAlive: null,
    meanR: 0,
    cursor: 0,
    pot: 0n,
    treasury: 0n,
    clashesPlayed: 0,
    champion: -1,
    redeemPool: 0n,
    redeemSupply: 0n,
    spread: [],
    wonThisEpoch: null,
    onEvent: null,
  }
}

function emit(round, name, data) {
  if (round.onEvent) round.onEvent(name, data)
}

export function launchCoin(round, creator, type, seedWei) {
  const cfg = round.cfg
  if (round.phase !== 'Lobby') throw new Error('WrongPhase')
  if (round.coins.length >= cfg.maxCoins) throw new Error('RoundFull')
  if (seedWei < cfg.minSeed || seedWei > cfg.maxSeed) throw new Error('SeedOutOfRange')
  const id = round.coins.length
  const curve = newCurve(cfg.vMon0, cfg.vTok0, cfg.plainBoost)
  const coin = {
    id,
    type,
    creator,
    status: ALIVE,
    level: 1,
    levelLock: 1,
    xp: 0,
    wins: 0,
    ...curve,
    seedMon: seedWei,
    seedTokens: 0n,
    grossIn: seedWei,
    rLock: 0n,
    rLockNum: 0,
    consolationPool: 0n,
    consolationSupply: 0n,
    eliminatedEpoch: 0,
    holders: new Map(),
  }
  const q = cfg.seedPaysFee ? cBuy(coin, seedWei, cfg.tradeFeeBps) : cBuy(coin, seedWei, 0)
  coin.seedTokens = q.out
  round.coins.push(coin)
  emit(round, 'CoinLaunched', { id, type })
  return id
}

export function startRound(round) {
  const cfg = round.cfg
  if (round.phase !== 'Lobby') throw new Error('WrongPhase')
  if (round.coins.length < cfg.minCoins) throw new Error('NotEnoughCoins')
  round.alive = round.coins.map((c) => c.id)
  round.phase = cfg.levelingEpochs > 0 ? 'Leveling' : 'Knockout'
  emit(round, 'RoundStarted', { coins: round.coins.length })
}

function tradable(round, coin) {
  if (round.phase !== 'Leveling' && round.phase !== 'Knockout') throw new Error('WrongPhase')
  if (round.locked) throw new Error('Locked')
  if (coin.status !== ALIVE) throw new Error('CoinNotAlive')
}

export function buyCoin(round, id, holder, monIn) {
  const coin = round.coins[id]
  tradable(round, coin)
  const q = cBuy(coin, monIn, round.cfg.tradeFeeBps)
  if (q.out === 0n) throw new Error('ZeroOut')
  coin.holders.set(holder, (coin.holders.get(holder) || 0n) + q.out)
  coin.grossIn += monIn
  emit(round, 'Trade', { id, isBuy: true })
  return q.out
}

export function sellCoin(round, id, holder, tokens) {
  const coin = round.coins[id]
  tradable(round, coin)
  const held = coin.holders.get(holder) || 0n
  if (tokens > held) throw new Error('InsufficientTokens')
  const q = cSell(coin, tokens, round.cfg.tradeFeeBps)
  coin.holders.set(holder, held - tokens)
  coin.grossIn -= q.out
  emit(round, 'Trade', { id, isBuy: false })
  return q.out
}

export function lockEpoch(round) {
  if (round.locked) throw new Error('AlreadyLocked')
  if (round.phase !== 'Leveling' && round.phase !== 'Knockout') throw new Error('WrongPhase')
  let sum = 0n
  for (const id of round.alive) {
    const c = round.coins[id]
    c.rLock = c.rMon
    c.rLockNum = Number(c.rMon)
    c.levelLock = c.level
    sum += c.rMon
  }
  round.meanR = Number(sum) / round.alive.length
  round.lockAlive = round.alive.slice()
  round.locked = true
  round.cursor = 0
  round.epoch += 1
  round.wonThisEpoch = []
  round.spread = []
  emit(round, 'EpochLocked', { epoch: round.epoch })
}

function sweepFees(round, coin) {
  if (coin.feeAcc === 0n) return
  const toPot = (coin.feeAcc * BigInt(round.cfg.feeToPotBps)) / BPS
  round.pot += toPot
  round.treasury += coin.feeAcc - toPot
  coin.feeAcc = 0n
}

function addXp(cfg, coin, xp) {
  if (cfg.levelMode !== 'xp') return
  coin.xp += xp
  coin.level = levelFromXp(coin.xp, cfg.xpThresholds)
}

function applyBoost(round, winner, loser, x) {
  const cfg = round.cfg
  if (x === 0n) return 0n
  let amount = x
  let excess = 0n
  if (cfg.boostCap && amount > winner.rMon) {
    excess = amount - winner.rMon
    amount = winner.rMon
    if (cfg.boostCapExcess === 'pot') round.pot += excess
    else loser.consolationPool += excess
  }
  if (cfg.plainBoost) boostPlain(winner, amount)
  else cBoost(winner, amount)
  return amount
}

function resolveClash(round, seed, idA, idB, clashId) {
  const cfg = round.cfg
  const a = round.coins[idA]
  const b = round.coins[idB]
  const wp = winProbBps(cfg, a, b, round.meanR)
  const roll = clashRoll(seed, clashId)
  const aWins = roll < wp
  const w = aWins ? a : b
  const l = aWins ? b : a
  const r = l.rMon
  const boostAmt = (r * BigInt(cfg.boostBps)) / BPS
  const consAmt = (r * BigInt(cfg.consolationBps)) / BPS
  const potAmt = (r * BigInt(cfg.potBps)) / BPS
  const treAmt = r - boostAmt - consAmt - potAmt
  l.rMon = 0n
  sweepFees(round, l)
  l.status = ELIMINATED
  l.eliminatedEpoch = round.epoch
  if (cfg.consolationMode === 0) {
    l.consolationPool = consAmt
    l.consolationSupply = l.supply
  } else {
    l.consolationPool = 0n
    l.consolationSupply = l.supply
    round.spread.push({ amount: consAmt, winner: w.id })
  }
  round.pot += potAmt
  round.treasury += treAmt
  const applied = applyBoost(round, w, l, boostAmt)
  w.wins += 1
  if (cfg.levelMode === 'wins') w.level = 1 + w.wins
  else addXp(cfg, w, cfg.winXp)
  round.alive.splice(round.alive.indexOf(l.id), 1)
  round.wonThisEpoch.push(w.id)
  round.clashesPlayed += 1
  emit(round, 'ClashResolved', {
    epoch: round.epoch,
    clashId,
    winner: w.id,
    loser: l.id,
    winProbBps: wp,
    roll,
    boost: applied,
    consolation: consAmt + (boostAmt - applied),
    toPot: potAmt,
    toTreasury: treAmt,
    reserve: r,
  })
}

function distributeSpread(round) {
  for (const s of round.spread) {
    const eligible = round.alive.filter((id) => id !== s.winner)
    let total = 0n
    for (const id of eligible) total += round.coins[id].rMon
    if (eligible.length === 0 || total === 0n) {
      round.pot += s.amount
      continue
    }
    let given = 0n
    for (const id of eligible) {
      const c = round.coins[id]
      const x = (s.amount * c.rMon) / total
      given += x
      if (x > 0n) {
        if (round.cfg.plainBoost) boostPlain(c, x)
        else cBoost(c, x)
      }
    }
    round.treasury += s.amount - given
  }
  round.spread = []
}

export function resolveEpoch(round, seed, opts) {
  if (!round.locked) throw new Error('NotLocked')
  const cfg = round.cfg
  const maxClashes = (opts && opts.maxClashes) || 255
  const pairSeed = opts && opts.pairSeed !== undefined ? opts.pairSeed : seed
  if (round.phase === 'Knockout') {
    const perm = pairing(pairSeed, round.lockAlive)
    const total = Math.min(cfg.clashesPerEpoch, perm.length >> 1)
    let n = 0
    while (round.cursor < total && n < maxClashes) {
      const c = round.cursor
      resolveClash(round, seed, perm[2 * c], perm[2 * c + 1], round.epoch * 256 + c)
      round.cursor += 1
      n += 1
    }
    if (round.cursor < total) return false
    if (perm.length % 2 === 1 && total * 2 < perm.length && total === perm.length >> 1) {
      emit(round, 'ByeGranted', { epoch: round.epoch, coin: perm[perm.length - 1] })
    }
    if (cfg.consolationMode === 1) distributeSpread(round)
  }
  if (cfg.huntsEnabled) {
    for (const id of round.alive) {
      const coin = round.coins[id]
      const success = huntRoll(seed, id) < cfg.huntWinPct
      if (success) addXp(cfg, coin, cfg.huntXp)
      emit(round, 'HuntResolved', { id, success })
    }
  }
  for (const id of round.alive) sweepFees(round, round.coins[id])
  if (round.phase === 'Leveling') {
    round.levelingDone += 1
    if (round.levelingDone >= cfg.levelingEpochs) round.phase = 'Knockout'
  }
  round.locked = false
  round.lockAlive = null
  emit(round, 'EpochResolved', { epoch: round.epoch, alive: round.alive.length })
  if (round.alive.length === 1) settle(round)
  return true
}

function settle(round) {
  const coin = round.coins[round.alive[0]]
  coin.status = CHAMPION
  round.champion = coin.id
  round.phase = 'Settled'
  round.redeemPool = coin.rMon + round.pot
  round.redeemSupply = coin.supply
  emit(round, 'RoundSettled', { winner: coin.id, redeemPool: round.redeemPool, redeemSupply: round.redeemSupply })
}

export function claimRate(round, coin) {
  if (coin.status === ELIMINATED) return { pool: coin.consolationPool, supply: coin.consolationSupply }
  if (coin.status === CHAMPION) return { pool: round.redeemPool, supply: round.redeemSupply }
  return null
}

export function claimValue(round, coin, tokens) {
  const r = claimRate(round, coin)
  if (!r || r.supply === 0n) return 0n
  return (tokens * r.pool) / r.supply
}

export function totalLiabilities(round) {
  let sum = round.treasury
  for (const c of round.coins) {
    if (c.status === ELIMINATED) sum += c.consolationPool
  }
  if (round.phase === 'Settled') {
    sum += round.redeemPool
    return sum
  }
  sum += round.pot
  for (const c of round.coins) {
    if (c.status === ALIVE) sum += c.rMon + c.feeAcc
  }
  return sum
}

export function totalDeposits(round) {
  let sum = 0n
  for (const c of round.coins) sum += c.grossIn
  return sum
}

export function playToEnd(round, hooks, maxEpochs) {
  const cap = maxEpochs || 2000
  let guard = 0
  while (round.phase !== 'Settled' && guard < cap) {
    if (hooks && hooks.beforeLock) hooks.beforeLock(round)
    lockEpoch(round)
    const seed = epochSeed(round, round.epoch)
    if (hooks && hooks.afterLock) hooks.afterLock(round, seed)
    resolveEpoch(round, seed, hooks && hooks.resolveOpts ? hooks.resolveOpts(round, seed) : undefined)
    if (hooks && hooks.afterResolve) hooks.afterResolve(round)
    guard += 1
  }
  if (round.phase !== 'Settled') throw new Error('RoundDidNotSettle')
}

export function epochSeed(round, epoch) {
  return derive(round.baseSeed, TAG_EPOCH, epoch)
}

export { quoteBuy, quoteSell, ceilDiv }
