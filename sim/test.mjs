import assert from 'node:assert/strict'
import { makeConfig, mon } from './config.mjs'
import { newCurve, buy, sell, boost, boostPlain, quoteSell, ceilDiv } from './curve.mjs'
import { mulberry32, derive, mix, TAG_PAIR, TAG_CLASH, TAG_HUNT } from './rng.mjs'
import { pairing } from './combat.mjs'
import { buildStaticRound } from './experiments.mjs'
import {
  createRound,
  launchCoin,
  startRound,
  buyCoin,
  sellCoin,
  lockEpoch,
  resolveEpoch,
  playToEnd,
  epochSeed,
  totalLiabilities,
  totalDeposits,
  claimValue,
  ALIVE,
  ELIMINATED,
  CHAMPION,
} from './round.mjs'

let passed = 0
function test(name, fn) {
  fn()
  passed += 1
  console.log('PASS ' + name)
}

function fresh(preset, seed, overrides) {
  const cfg = makeConfig(preset || 'demo', 'recommended', overrides)
  const round = createRound(cfg, seed)
  for (let i = 0; i < 30; i++) launchCoin(round, 'c' + i, i % 5, mon(2 + (i % 7)))
  startRound(round)
  return round
}

function snapshot(round) {
  return JSON.stringify(
    round.coins.map((c) => [c.status, c.level, c.xp, c.wins, c.eliminatedEpoch, String(c.rMon), String(c.vMon), String(c.vTok), String(c.consolationPool), String(c.supply)]),
  ) + String(round.pot) + String(round.treasury) + String(round.redeemPool) + round.epoch + round.champion
}

test('curve: buy then sell all never needs more than rMon, vMon = vMon0 + rMon, k never shrinks on trades', () => {
  const rng = mulberry32(7)
  for (let trial = 0; trial < 200; trial++) {
    const cfg = makeConfig('demo', 'recommended')
    const c = newCurve(cfg.vMon0, cfg.vTok0, false)
    const holders = []
    for (let step = 0; step < 40; step++) {
      const kBefore = c.vMon * c.vTok
      const op = rng()
      if (op < 0.5 || holders.length === 0) {
        const q = buy(c, mon(0.01 + rng() * 20), 100)
        holders.push(q.out)
        assert.ok(c.vMon * c.vTok >= kBefore)
      } else if (op < 0.8) {
        const t = holders.splice(Math.floor(rng() * holders.length), 1)[0]
        sell(c, t, 100)
        assert.ok(c.vMon * c.vTok >= kBefore)
      } else {
        const x = mon(0.01 + rng() * 10)
        boost(c, x)
        assert.equal(c.vTok, ceilDiv(kBefore, c.vMon))
      }
      assert.equal(c.vMon, cfg.vMon0 + c.rMon)
      const all = quoteSell(c, c.supply, 0)
      assert.ok(all.gross <= c.rMon, 'selling all supply needs more than rMon')
    }
  }
})

test('T1 virtual boost: sell(1 wei) after a boost pays nothing; plain injection with cached k pays the boost', () => {
  const cfg = makeConfig('demo', 'recommended')
  const v = newCurve(cfg.vMon0, cfg.vTok0, false)
  buy(v, mon(10), 100)
  const x = mon(5)
  boost(v, x)
  const q = quoteSell(v, 1n, 100)
  assert.equal(q.gross, 0n)
  const p = newCurve(cfg.vMon0, cfg.vTok0, true)
  buy(p, mon(10), 100)
  boostPlain(p, x)
  const qp = quoteSell(p, 1n, 100)
  assert.ok(qp.gross > (x * 99n) / 100n, 'plain injection must leak the boost to a 1 wei sell')
})

test('merger conservation: reserve == boost + consolation + pot + treasury at every clash', () => {
  for (const overrides of [{}, { boostCap: true }, { consolationMode: 1 }]) {
    const round = fresh('demo', 11, overrides)
    let checked = 0
    round.onEvent = (name, d) => {
      if (name === 'ClashResolved') {
        assert.equal(d.reserve, d.boost + d.consolation + d.toPot + d.toTreasury)
        checked += 1
      }
    }
    playToEnd(round)
    assert.equal(checked, 29)
  }
})

test('accounting: liabilities equal deposits after every resolve, with trades in between', () => {
  const rng = mulberry32(5)
  const round = fresh('demo', 21)
  while (round.phase !== 'Settled') {
    for (let i = 0; i < 6; i++) {
      const id = round.alive[Math.floor(rng() * round.alive.length)]
      buyCoin(round, id, 'p' + i, mon(0.5 + rng() * 3))
    }
    const id = round.alive[0]
    const held = round.coins[id].holders.get('p0') || 0n
    if (held > 0n) sellCoin(round, id, 'p0', held / 2n)
    lockEpoch(round)
    resolveEpoch(round, epochSeed(round, round.epoch))
    assert.equal(totalLiabilities(round), totalDeposits(round))
  }
})

test('claims: fixed rate, payouts never exceed the pool, dust below one wei per holder', () => {
  const round = fresh('demo', 31)
  for (let i = 0; i < 30; i++) {
    buyCoin(round, i, 'a', mon(1.3))
    buyCoin(round, i, 'b', mon(0.7))
  }
  playToEnd(round)
  for (const c of round.coins) {
    const pool = c.status === ELIMINATED ? c.consolationPool : c.status === CHAMPION ? round.redeemPool : 0n
    const supply = c.status === ELIMINATED ? c.consolationSupply : round.redeemSupply
    if (pool === 0n) continue
    let paid = 0n
    let holders = 0n
    for (const t of [c.seedTokens, c.holders.get('a'), c.holders.get('b')]) {
      paid += claimValue(round, c, t)
      holders += 1n
    }
    assert.ok(paid <= pool)
    assert.ok(pool - paid <= holders, 'dust above one wei per holder ' + (pool - paid))
    assert.equal(c.status === ELIMINATED ? c.consolationSupply : round.redeemSupply, supply)
  }
})

test('determinism: same seed same final state, different seed different state', () => {
  const a = fresh('demo', 99)
  const b = fresh('demo', 99)
  const c = fresh('demo', 100)
  playToEnd(a)
  playToEnd(b)
  playToEnd(c)
  assert.equal(snapshot(a), snapshot(b))
  assert.notEqual(snapshot(a), snapshot(c))
})

test('batched resolve: maxClashes 1, 6 and 255 give the same pairings, outcomes and final state', () => {
  const snaps = []
  const traces = []
  for (const maxClashes of [1, 6, 255]) {
    const round = fresh('repro', 77, { levelingEpochs: 2 })
    const trace = []
    round.onEvent = (name, d) => {
      if (name === 'ClashResolved') trace.push([d.epoch, d.clashId, d.winner, d.loser, d.roll])
    }
    while (round.phase !== 'Settled') {
      lockEpoch(round)
      const seed = epochSeed(round, round.epoch)
      let done = false
      while (!done) done = resolveEpoch(round, seed, { maxClashes })
    }
    snaps.push(snapshot(round))
    traces.push(JSON.stringify(trace))
  }
  assert.equal(snaps[0], snaps[1])
  assert.equal(snaps[1], snaps[2])
  assert.equal(traces[0], traces[2])
})

test('T4: buy, sell and launch revert while locked; pairing depends on a seed that does not exist before the lock', () => {
  const round = fresh('demo', 5)
  buyCoin(round, 0, 'x', mon(1))
  lockEpoch(round)
  assert.throws(() => buyCoin(round, 0, 'x', mon(1)), /Locked/)
  assert.throws(() => sellCoin(round, 0, 'x', 1n), /Locked/)
  assert.throws(() => launchCoin(round, 'late', 0, mon(2)), /WrongPhase/)
  const before = pairing(derive(1, 1), round.lockAlive)
  const after = pairing(derive(1, 2), round.lockAlive)
  assert.notDeepEqual(before, after)
  resolveEpoch(round, epochSeed(round, round.epoch))
  buyCoin(round, round.alive[0], 'x', mon(1))
})

test('pairing is a permutation, domain tags separate draws', () => {
  const alive = Array.from({ length: 29 }, (_, i) => i)
  const perm = pairing(12345, alive)
  assert.deepEqual([...perm].sort((a, b) => a - b), alive)
  for (let i = 0; i < 100; i++) {
    assert.notEqual(mix(9, TAG_PAIR, i), mix(9, TAG_CLASH, i))
    assert.notEqual(mix(9, TAG_CLASH, i), mix(9, TAG_HUNT, i))
  }
})

test('T6: resolve does not throw when a coin has zero supply or zero reserve', () => {
  const round = fresh('repro', 8)
  lockEpoch(round)
  round.coins[3].supply = 0n
  round.coins[4].rMon = 0n
  round.coins[4].rLock = 0n
  round.coins[4].rLockNum = 0
  resolveEpoch(round, epochSeed(round, 1))
})

test('T2: seed tokens are not sellable and counted in supply', () => {
  const round = fresh('demo', 3)
  const c = round.coins[0]
  assert.ok(c.seedTokens > 0n)
  assert.ok(c.supply >= c.seedTokens)
  assert.throws(() => sellCoin(round, 0, 'c0', c.seedTokens), /InsufficientTokens/)
})

test('full round reaches Settled with one champion and 29 eliminations in every preset', () => {
  for (const preset of ['demo', 'standard', 'repro']) {
    const round = fresh(preset, 41, preset === 'standard' ? { minSeed: mon(2) } : {})
    playToEnd(round)
    assert.equal(round.phase, 'Settled')
    assert.equal(round.coins.filter((c) => c.status === ALIVE).length, 0)
    assert.equal(round.coins.filter((c) => c.status === CHAMPION).length, 1)
    assert.equal(round.coins.filter((c) => c.status === ELIMINATED).length, 29)
  }
})

test('static builder hits the requested pool sizes', () => {
  const cfg = makeConfig('repro', 'recommended')
  const targets = [10, 10, 25, 5, 10, 10, 10, 10]
  const round = buildStaticRound(cfg, 1, targets, {})
  for (let i = 0; i < targets.length; i++) {
    const got = Number(round.coins[i].rMon) / 1e18
    assert.ok(Math.abs(got - targets[i]) < 0.02, 'pool ' + i + ' is ' + got)
  }
})

console.log(passed + ' tests passed')
