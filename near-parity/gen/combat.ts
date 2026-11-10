import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', '..')
const WORK = join(HERE, '..', 'forge', 'work')
const IN_FILE = join(WORK, 'combat-in.json')
const SOL_FILE = join(WORK, 'combat-sol.txt')
const OUT_FILE = join(HERE, '..', 'combat.json')

const req = createRequire(join(ROOT, 'shared', 'package.json'))
const viem = (await import(req.resolve('viem'))) as { keccak256: (hex: `0x${string}`) => `0x${string}` }

const WAD = 10n ** 18n
const E24 = 10n ** 24n
const U256 = (1n << 256n) - 1n
const MASK64 = (1n << 64n) - 1n
const SEED = 0x434f4d42n

type Name = 'pool_factor_wad' | 'power' | 'win_prob_bps' | 'pairing' | 'clash_roll' | 'hunt_roll' | 'element_bps' | 'level_from_xp'

interface Spec {
  code: number
  inputs: string[]
  outputs: string[]
}

const PF_PARAMS = ['gamma_bps', 'pool_factor_min_bps', 'pool_factor_max_bps']
const POWER_PARAMS = [...PF_PARAMS, 'level_bonus_bps', 'element_up_bps', 'element_down_bps']

const SPECS: Record<Name, Spec> = {
  pool_factor_wad: { code: 0, inputs: ['r_lock', 'sum_r', 'n', ...PF_PARAMS], outputs: ['pool_factor_wad'] },
  power: {
    code: 1,
    inputs: ['monster_type', 'level', 'opponent_type', 'r_lock', 'sum_r', 'n', ...POWER_PARAMS],
    outputs: ['power', 'pool_factor_wad']
  },
  win_prob_bps: {
    code: 2,
    inputs: [
      'type_a', 'level_a', 'r_lock_a', 'type_b', 'level_b', 'r_lock_b', 'sum_r', 'n',
      ...POWER_PARAMS, 'win_prob_min_bps', 'win_prob_max_bps'
    ],
    outputs: ['win_prob_bps', 'power_a', 'power_b']
  },
  pairing: { code: 3, inputs: ['seed', 'alive_mask'], outputs: ['perm'] },
  clash_roll: { code: 4, inputs: ['seed', 'clash_id'], outputs: ['roll'] },
  hunt_roll: { code: 5, inputs: ['seed', 'coin_id'], outputs: ['roll'] },
  element_bps: { code: 6, inputs: ['monster_type', 'opponent_type', 'element_up_bps', 'element_down_bps'], outputs: ['bps'] },
  level_from_xp: { code: 7, inputs: ['xp'], outputs: ['level'] }
}

const NAMES = Object.keys(SPECS) as Name[]
const SEED_FIELDS = new Set(['seed'])

interface Row {
  fn: Name
  args: bigint[]
  label?: string
}

interface Params {
  gamma: bigint
  pfMin: bigint
  pfMax: bigint
  lb: bigint
  up: bigint
  down: bigint
  wMin: bigint
  wMax: bigint
}

const DEFAULT: Params = { gamma: 8800n, pfMin: 1000n, pfMax: 100000n, lb: 400n, up: 11500n, down: 8700n, wMin: 1500n, wMax: 8500n }

let state = SEED
function next64(): bigint {
  state = (state + 0x9e3779b97f4a7c15n) & MASK64
  let z = state
  z = ((z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n) & MASK64
  z = ((z ^ (z >> 27n)) * 0x94d049bb133111ebn) & MASK64
  return z ^ (z >> 31n)
}

function rndBits(bits: number): bigint {
  let v = 0n
  for (let got = 0; got < bits; got += 64) v = (v << 64n) | next64()
  return v >> BigInt(Math.ceil(bits / 64) * 64 - bits)
}

function logU(maxBits: number): bigint {
  const bits = 1 + Number(next64() % BigInt(maxBits))
  return rndBits(bits) | (1n << BigInt(bits - 1))
}

function between(lo: bigint, hi: bigint): bigint {
  return lo + (rndBits(300) % (hi - lo + 1n))
}

function pick<T>(items: T[]): T {
  const item = items[Number(next64() % BigInt(items.length))]
  if (item === undefined) throw new Error('empty pick')
  return item
}

function seed256(): bigint {
  return rndBits(256)
}

function params(): Params {
  if (next64() % 5n !== 0n) return DEFAULT
  return {
    gamma: between(0n, 20000n),
    pfMin: between(0n, 2000n),
    pfMax: between(20000n, 200000n),
    lb: between(0n, 1000n),
    up: between(10000n, 15000n),
    down: between(5000n, 10000n),
    wMin: between(0n, 3000n),
    wMax: between(7000n, 10000n)
  }
}

function pfArgs(p: Params): bigint[] {
  return [p.gamma, p.pfMin, p.pfMax]
}

function powerArgs(p: Params): bigint[] {
  return [...pfArgs(p), p.lb, p.up, p.down]
}

function level(): bigint {
  return next64() % 40n === 0n ? between(1n, 255n) : between(1n, 10n)
}

function pool(): { reserves: bigint[]; n: bigint } {
  const n = next64() % 12n === 0n ? between(2n, 255n) : between(2n, 32n)
  const reserves: bigint[] = []
  const regime = next64() % 3n
  for (let i = 0n; i < n; i++) {
    if (regime === 0n) reserves.push(between(E24 / 10n, 50n * E24))
    else if (regime === 1n) reserves.push(logU(90))
    else reserves.push(next64() % 4n === 0n ? between(E24, 1000n * E24) : between(1n, E24 / 100n))
  }
  return { reserves, n }
}

function pairOfReserves(): { rA: bigint; rB: bigint; sum: bigint; n: bigint } {
  const { reserves, n } = pool()
  const sum = reserves.reduce((a, b) => a + b, 0n)
  const rA = reserves[0] ?? 0n
  const rB = reserves[1] ?? 0n
  return { rA, rB, sum, n }
}

function nearBoundaryRatio(n: bigint, sumR: bigint, lowSide: boolean): bigint {
  const ratio = lowSide ? between(55n * WAD / 1000n, 95n * WAD / 1000n) : between(13n * WAD, 145n * WAD / 10n)
  return ratio * sumR / (n * WAD)
}

function poolFactorRows(): Row[] {
  const rows: Row[] = []
  for (let i = 0; i < 1400; i++) {
    const p = params()
    if (i % 4 === 3) {
      rows.push({ fn: 'pool_factor_wad', args: [logU(120), logU(125), between(0n, 40n), ...pfArgs(p)] })
    } else {
      const { rA, sum, n } = pairOfReserves()
      rows.push({ fn: 'pool_factor_wad', args: [rA, sum, n, ...pfArgs(p)] })
    }
  }
  for (let i = 0; i < 300; i++) {
    const n = between(2n, 32n)
    const sumR = between(E24, 500n * E24)
    const rLock = nearBoundaryRatio(n, sumR, i % 2 === 0)
    rows.push({ fn: 'pool_factor_wad', args: [rLock, sumR, n, ...pfArgs(DEFAULT)], label: i % 2 === 0 ? 'near_min_clamp' : 'near_max_clamp' })
  }
  return rows
}

function powerRows(): Row[] {
  const rows: Row[] = []
  for (let i = 0; i < 1700; i++) {
    const p = params()
    const { rA, sum, n } = pairOfReserves()
    const wide = i % 10 === 9
    rows.push({
      fn: 'power',
      args: [
        wide ? between(0n, 6n) : between(0n, 4n),
        wide ? level() : between(1n, 10n),
        between(0n, 4n),
        rA,
        sum,
        n,
        ...powerArgs(p)
      ]
    })
  }
  return rows
}

function winProbRows(): Row[] {
  const rows: Row[] = []
  for (let i = 0; i < 1700; i++) {
    const p = params()
    const { rA, rB, sum, n } = pairOfReserves()
    let la = i % 10 === 9 ? level() : between(1n, 10n)
    let lb = i % 10 === 9 ? level() : between(1n, 10n)
    if (i % 7 === 0) {
      la = 1n
      lb = 10n
    }
    rows.push({
      fn: 'win_prob_bps',
      args: [between(0n, 4n), la, rA, between(0n, 4n), lb, rB, sum, n, ...powerArgs(p), p.wMin, p.wMax]
    })
  }
  return rows
}

function pairingRows(): Row[] {
  const rows: Row[] = []
  for (let i = 0; i < 1000; i++) {
    let mask: bigint
    const kind = i % 4
    if (kind === 0) mask = rndBits(32)
    else if (kind === 1) mask = rndBits(32) & rndBits(32)
    else if (kind === 2) mask = rndBits(32) | rndBits(32)
    else mask = (1n << between(2n, 10n)) - 1n
    rows.push({ fn: 'pairing', args: [seed256(), mask] })
  }
  return rows
}

function rollRows(): Row[] {
  const rows: Row[] = []
  for (let i = 0; i < 2500; i++) {
    const id = i % 5 === 4 ? rndBits(256) : between(0n, 300n)
    rows.push({ fn: 'clash_roll', args: [seed256(), id] })
  }
  for (let i = 0; i < 2500; i++) {
    const id = i % 5 === 4 ? rndBits(256) : between(0n, 31n)
    rows.push({ fn: 'hunt_roll', args: [seed256(), id] })
  }
  return rows
}

function edgeRows(): Row[] {
  const rows: Row[] = []
  const add = (fn: Name, label: string, ...args: bigint[]) => rows.push({ fn, args, label })
  const D = DEFAULT
  const R = 5n * E24
  const strongP = (lvl: bigint, ta: bigint, tb: bigint) => [ta, lvl, tb]

  add('level_from_xp', 'zero', 0n)
  for (const xp of [14n, 15n, 34n, 35n, 59n, 60n, 89n, 90n, 124n, 125n, 164n, 165n, 209n, 210n, 259n, 260n, 319n, 320n, 60000n, U256]) {
    add('level_from_xp', `xp_${xp === U256 ? 'max' : xp}`, xp)
  }
  for (let a = 0n; a < 5n; a++) {
    for (let b = 0n; b < 5n; b++) add('element_bps', `elem_${a}_${b}`, a, b, D.up, D.down)
  }
  add('element_bps', 'type_5_vs_0', 5n, 0n, D.up, D.down)
  add('element_bps', 'type_0_vs_5', 0n, 5n, D.up, D.down)
  add('element_bps', 'type_4_vs_0', 4n, 0n, D.up, D.down)
  add('element_bps', 'type_255_overflow', 255n, 0n, D.up, D.down)
  add('element_bps', 'type_254', 254n, 0n, D.up, D.down)
  add('element_bps', 'custom_up_down', 0n, 1n, 15000n, 5000n)

  add('pool_factor_wad', 'sum_zero', R, 0n, 10n, ...pfArgs(D))
  add('pool_factor_wad', 'n_zero', R, R, 0n, ...pfArgs(D))
  add('pool_factor_wad', 'sum_zero_n_zero', 0n, 0n, 0n, ...pfArgs(D))
  add('pool_factor_wad', 'sum_zero_min_above_wad', R, 0n, 10n, 8800n, 20000n, 100000n)
  add('pool_factor_wad', 'sum_zero_max_below_wad', R, 0n, 10n, 8800n, 1000n, 5000n)
  add('pool_factor_wad', 'rlock_zero', 0n, R, 10n, ...pfArgs(D))
  add('pool_factor_wad', 'ratio_zero_truncates', 1n, 10n * WAD, 1n, ...pfArgs(D))
  add('pool_factor_wad', 'ratio_zero_min_bps_zero', 1n, 10n * WAD, 1n, 8800n, 0n, 100000n)
  add('pool_factor_wad', 'ratio_exactly_one', R, R, 1n, ...pfArgs(D))
  add('pool_factor_wad', 'equal_pool_n_10', R, 10n * R, 10n, ...pfArgs(D))
  add('pool_factor_wad', 'ratio_two', 2n * R, 10n * R, 10n, ...pfArgs(D))
  add('pool_factor_wad', 'ratio_half', R, 2n * R, 1n, ...pfArgs(D))
  add('pool_factor_wad', 'min_clamp', 1n * E24, 1000n * E24, 10n, ...pfArgs(D))
  add('pool_factor_wad', 'max_clamp_n32_all_in_one', R, R, 32n, ...pfArgs(D))
  add('pool_factor_wad', 'max_clamp_n255', R, R, 255n, ...pfArgs(D))
  add('pool_factor_wad', 'gamma_zero', R, 10n * R, 10n, 0n, 1000n, 100000n)
  add('pool_factor_wad', 'gamma_one', R, 4n * R, 4n, 10000n, 1000n, 100000n)
  add('pool_factor_wad', 'gamma_two', 3n * R, 10n * R, 10n, 20000n, 1000n, 100000n)
  add('pool_factor_wad', 'gamma_max_u16', 3n * R, 10n * R, 10n, 65535n, 1000n, 100000n)
  add('pool_factor_wad', 'pf_max_u32', 3n * R, 10n * R, 10n, 8800n, 1000n, 4294967295n)
  add('pool_factor_wad', 'pf_min_equals_max', 3n * R, 10n * R, 10n, 8800n, 5000n, 5000n)
  add('pool_factor_wad', 'pf_min_above_max', 3n * R, 10n * R, 10n, 8800n, 6000n, 5000n)
  add('pool_factor_wad', 'ratio_huge_default_gamma_clamps_max', 1n << 190n, 1n, 1n, ...pfArgs(D))
  add('pool_factor_wad', 'ratio_max_below_2_pow_255_default_gamma', (1n << 254n) / WAD, 1n, 1n, ...pfArgs(D))
  add('pool_factor_wad', 'exp_overflow_gamma_max_u16', 1n << 190n, 1n, 1n, 65535n, 1000n, 100000n)
  add('pool_factor_wad', 'exp_overflow_gamma_20000', 1n << 98n, 1n, 1n, 20000n, 1000n, 100000n)
  add('pool_factor_wad', 'just_below_exp_overflow_gamma_20000', 1n << 97n, 1n, 1n, 20000n, 1000n, 100000n)
  add('pool_factor_wad', 'ratio_ge_2_pow_255', 1n << 195n, 1n, 2n, ...pfArgs(D))
  add('pool_factor_wad', 'mul_overflow', 1n << 240n, 1n, 1n, ...pfArgs(D))
  add('pool_factor_wad', 'u128_reserves', (1n << 128n) - 1n, (1n << 128n) - 1n, 10n, ...pfArgs(D))
  for (let k = 0n; k < 12n; k++) {
    add('pool_factor_wad', `sweep_ratio_${k}`, (k + 1n) * R, 12n * 6n * R, 12n, ...pfArgs(D))
  }

  for (let lvl = 1n; lvl <= 10n; lvl++) add('power', `level_${lvl}_neutral_elem`, ...strongP(lvl, 0n, 2n), R, 10n * R, 10n, ...powerArgs(D))
  for (let a = 0n; a < 5n; a++) add('power', `elem_up_${a}`, a, 1n, (a + 1n) % 5n, R, 10n * R, 10n, ...powerArgs(D))
  add('power', 'elem_down', 1n, 1n, 0n, R, 10n * R, 10n, ...powerArgs(D))
  add('power', 'level_zero_underflow', 0n, 0n, 1n, R, 10n * R, 10n, ...powerArgs(D))
  add('power', 'level_255', 0n, 255n, 2n, R, 10n * R, 10n, ...powerArgs(D))
  add('power', 'zero_pool_sum', 0n, 1n, 2n, R, 0n, 10n, ...powerArgs(D))
  add('power', 'zero_rlock', 0n, 1n, 2n, 0n, R, 10n, ...powerArgs(D))
  add('power', 'max_pool_factor_level_10_elem_up', 0n, 10n, 1n, R, R, 32n, ...powerArgs(D))
  add('power', 'pf_min_zero_rlock_zero', 0n, 1n, 2n, 0n, R, 10n, 8800n, 0n, 100000n, 400n, 11500n, 8700n)
  add('power', 'type_5_opponent', 5n, 1n, 0n, R, R, 10n, ...powerArgs(D))
  add('power', 'pf_max_u32_extreme_params', 0n, 255n, 1n, 1n << 100n, 1n, 1n, 10000n, 1000n, 4294967295n, 65535n, 65535n, 65535n)

  const equal = (ta: bigint, tb: bigint, la: bigint, lb: bigint, p: Params, label: string) =>
    add('win_prob_bps', label, ta, la, R, tb, lb, R, 10n * R, 10n, ...powerArgs(p), p.wMin, p.wMax)
  equal(0n, 0n, 1n, 1n, D, 'equal_powers_same_type')
  equal(0n, 2n, 5n, 5n, D, 'equal_powers_neutral_elem_level_5')
  equal(0n, 1n, 1n, 1n, D, 'element_up_a')
  equal(1n, 0n, 1n, 1n, D, 'element_down_a')
  equal(0n, 2n, 10n, 1n, D, 'level_10_vs_1')
  equal(0n, 2n, 1n, 10n, D, 'level_1_vs_10')
  equal(0n, 1n, 10n, 1n, D, 'level_10_elem_up_vs_1')
  equal(0n, 2n, 1n, 1n, { ...D, wMin: 0n, wMax: 10000n }, 'no_clamp_params_equal')
  add('win_prob_bps', 'clamp_max_dominant_pool', 0n, 3n, 9n * R, 2n, 3n, 1n, 10n * R, 10n, ...powerArgs(D), D.wMin, D.wMax)
  add('win_prob_bps', 'clamp_min_weak_pool', 0n, 3n, 1n, 2n, 3n, 9n * R, 10n * R, 10n, ...powerArgs(D), D.wMin, D.wMax)
  add('win_prob_bps', 'unclamped_wide_params_dominant', 0n, 10n, 9n * R, 1n, 1n, 1n, 10n * R, 10n, ...powerArgs(D), 0n, 10000n)
  add('win_prob_bps', 'both_zero_pool', 0n, 1n, 0n, 2n, 1n, 0n, 10n * R, 10n, ...powerArgs(D), D.wMin, D.wMax)
  add('win_prob_bps', 'both_zero_pool_min_zero_power_zero', 0n, 1n, 0n, 2n, 1n, 0n, 10n * R, 10n, 8800n, 0n, 100000n, 400n, 11500n, 8700n, D.wMin, D.wMax)
  add('win_prob_bps', 'power_sum_zero_no_clamp', 0n, 1n, 0n, 2n, 1n, 0n, 10n * R, 10n, 8800n, 0n, 100000n, 400n, 11500n, 8700n, 0n, 10000n)
  add('win_prob_bps', 'a_zero_pool_min_zero', 0n, 1n, 0n, 2n, 1n, R, 10n * R, 10n, 8800n, 0n, 100000n, 400n, 11500n, 8700n, 0n, 10000n)
  add('win_prob_bps', 'sum_zero', 0n, 1n, R, 2n, 1n, R, 0n, 10n, ...powerArgs(D), D.wMin, D.wMax)
  add('win_prob_bps', 'level_zero_underflow', 0n, 0n, R, 2n, 1n, R, 10n * R, 10n, ...powerArgs(D), D.wMin, D.wMax)
  add('win_prob_bps', 'type_255_overflow', 255n, 1n, R, 0n, 1n, R, 10n * R, 10n, ...powerArgs(D), D.wMin, D.wMax)
  add('win_prob_bps', 'max_wmax_u16', 0n, 1n, 9n * R, 2n, 1n, 1n, 10n * R, 10n, ...powerArgs(D), 0n, 65535n)
  for (let k = 1n; k <= 12n; k++) {
    add('win_prob_bps', `ratio_sweep_${k}`, 0n, 2n, k * R, 2n, 2n, (13n - k) * R, 13n * R, 13n, ...powerArgs(D), D.wMin, D.wMax)
  }

  const S0 = 0n
  const SMAX = U256
  const S1 = 0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdefn
  const masks: Array<[string, bigint]> = [
    ['mask_zero', 0n], ['mask_one_bit', 1n], ['mask_high_bit', 1n << 31n], ['mask_two_bits', 0b11n],
    ['mask_three_bits', 0b111n], ['mask_alternating', 0xaaaaaaaan], ['mask_alternating_odd', 0x55555555n],
    ['mask_all_32', 0xffffffffn], ['mask_31_bits', 0x7fffffffn], ['mask_six_coins', 0b111111n],
    ['mask_sparse', 0x80010001n], ['mask_two_far', (1n << 31n) | 1n]
  ]
  for (const [label, mask] of masks) {
    add('pairing', `${label}_seed_zero`, S0, mask)
    add('pairing', `${label}_seed_max`, SMAX, mask)
    add('pairing', `${label}_seed_pattern`, S1, mask)
  }
  for (const [label, seed] of [['zero', S0], ['max', SMAX], ['pattern', S1], ['one', 1n]] as Array<[string, bigint]>) {
    for (const id of [0n, 1n, 2n, 255n, 256n, 2n ** 64n, 2n ** 128n, U256]) {
      add('clash_roll', `seed_${label}_id_${id === U256 ? 'max' : id}`, seed, id)
      add('hunt_roll', `seed_${label}_id_${id === U256 ? 'max' : id}`, seed, id)
    }
  }
  return rows
}

function allRows(): Row[] {
  return [
    ...edgeRows(),
    ...poolFactorRows(),
    ...powerRows(),
    ...winProbRows(),
    ...pairingRows(),
    ...rollRows()
  ]
}

function writeInputs(rows: Row[]): void {
  const body: Record<string, unknown> = { fn: rows.map((r) => SPECS[r.fn].code) }
  for (let k = 0; k < 16; k++) body[`c${k}`] = rows.map((r) => (r.args[k] ?? 0n).toString())
  writeFileSync(IN_FILE, JSON.stringify(body))
}

function hex32(v: bigint): `0x${string}` {
  return `0x${v.toString(16).padStart(64, '0')}`
}

function tag(name: string): string {
  return Buffer.from(name, 'ascii').toString('hex').padEnd(64, '0')
}

function hashOf(seed: bigint, tagName: string, idx: bigint): bigint {
  const data = `0x${hex32(seed).slice(2)}${tag(tagName)}${hex32(idx).slice(2)}` as `0x${string}`
  return BigInt(viem.keccak256(data))
}

function tsLevel(xp: bigint): bigint {
  const t: Array<[bigint, bigint]> = [[320n, 10n], [260n, 9n], [210n, 8n], [165n, 7n], [125n, 6n], [90n, 5n], [60n, 4n], [35n, 3n], [15n, 2n]]
  for (const [lim, lvl] of t) if (xp >= lim) return lvl
  return 1n
}

function tsElement(a: bigint, b: bigint, up: bigint, down: bigint): bigint {
  if ((a + 1n) % 5n === b) return up
  if ((b + 1n) % 5n === a) return down
  return 10000n
}

function tsPairing(seed: bigint, mask: bigint): bigint[] {
  const perm: bigint[] = []
  for (let i = 0n; i < 32n; i++) if ((mask >> i) & 1n) perm.push(i)
  for (let i = BigInt(perm.length); i > 1n; i--) {
    const idx = Number(i - 1n)
    const j = Number(hashOf(seed, 'PAIR', i - 1n) % i)
    const a = perm[idx]
    const b = perm[j]
    if (a === undefined || b === undefined) throw new Error('perm index')
    perm[idx] = b
    perm[j] = a
  }
  return perm
}

function floatPow(rLock: bigint, sumR: bigint, n: bigint, gamma: bigint): number {
  const ratio = Number((rLock * n * WAD) / sumR) / 1e18
  return Math.pow(ratio, Number(gamma) / 10000) * 1e18
}

const stats = { pfCompared: 0, pfClampOnly: 0, pfMaxRel: 0, pfMaxAbs: 0 }

function checkPoolFactor(args: bigint[], sol: bigint): string | undefined {
  const [rLock = 0n, sumR = 0n, n = 0n, gamma = 0n, pMin = 0n, pMax = 0n] = args
  const minW = (pMin * WAD) / 10000n
  const maxW = (pMax * WAD) / 10000n
  if (sumR === 0n || n === 0n) {
    const w = WAD < minW ? minW : WAD > maxW ? maxW : WAD
    return sol === w ? undefined : `degenerate expected ${w}`
  }
  if (rLock === 0n) return sol === minW ? undefined : `rlock zero expected ${minW}`
  const ratio = (rLock * n * WAD) / sumR
  if (ratio === 0n) return sol === minW ? undefined : `ratio zero expected ${minW}`
  const raw = floatPow(rLock, sumR, n, gamma)
  const tol = Math.max(raw * 1e-11, 4)
  const lo = Number(minW)
  const hi = Number(maxW)
  if (sol === minW || sol === maxW) {
    stats.pfClampOnly++
    const okMin = sol === minW && raw <= lo + tol
    const okMax = sol === maxW && raw >= hi - tol
    if (!okMin && !okMax) return `clamp branch wrong raw=${raw}`
    return undefined
  }
  stats.pfCompared++
  const diff = Math.abs(Number(sol) - raw)
  stats.pfMaxAbs = Math.max(stats.pfMaxAbs, diff)
  stats.pfMaxRel = Math.max(stats.pfMaxRel, diff / Math.max(raw, 1))
  if (diff > tol) return `float diff ${diff} raw=${raw}`
  return undefined
}

function checkRow(row: Row, sol: bigint[], perm?: bigint[]): string | undefined {
  const a = row.args
  const g = (i: number) => a[i] ?? 0n
  switch (row.fn) {
    case 'level_from_xp':
      return sol[0] === tsLevel(g(0)) ? undefined : 'level'
    case 'element_bps':
      return sol[0] === tsElement(g(0), g(1), g(2), g(3)) ? undefined : 'element'
    case 'pool_factor_wad':
      return checkPoolFactor(a, sol[0] ?? 0n)
    case 'power': {
      const pf = sol[1] ?? 0n
      const pfErr = checkPoolFactor([g(3), g(4), g(5), g(6), g(7), g(8)], pf)
      if (pfErr) return `pf: ${pfErr}`
      const lvl = 10000n + g(9) * (g(1) - 1n)
      const el = tsElement(g(0), g(2), g(10), g(11))
      const expected = (pf * lvl * el * 10000n) / (10000n * 10000n * 10000n)
      return sol[0] === expected ? undefined : `power expected ${expected}`
    }
    case 'win_prob_bps': {
      const pa = sol[1] ?? 0n
      const pb = sol[2] ?? 0n
      let bps = pa + pb === 0n ? 5000n : (pa * 10000n) / (pa + pb)
      if (bps < g(14)) bps = g(14)
      if (bps > g(15)) bps = g(15)
      return sol[0] === bps ? undefined : `win prob expected ${bps}`
    }
    case 'pairing': {
      const expected = tsPairing(g(0), g(1))
      return perm !== undefined && perm.length === expected.length && perm.every((v, i) => v === expected[i]) ? undefined : 'pairing'
    }
    case 'clash_roll':
      return sol[0] === hashOf(g(0), 'CLASH', g(1)) % 10000n ? undefined : 'clash'
    case 'hunt_roll':
      return sol[0] === hashOf(g(0), 'HUNT', g(1)) % 100n ? undefined : 'hunt'
  }
}

function git(args: string[]): string {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim()
}

function renderValue(field: string, v: bigint): string {
  return SEED_FIELDS.has(field) ? hex32(v) : v.toString()
}

function merge(): void {
  const rows = allRows()
  const lines = readFileSync(SOL_FILE, 'utf8').split('\n').filter((l, i, all) => l.length > 0 || i < all.length - 1)
  if (lines.length !== rows.length) throw new Error(`forge produced ${lines.length} lines for ${rows.length} rows`)
  const outRows: string[] = []
  const revertTally = new Map<string, number>()
  let okRows = 0
  let revertRows = 0
  const problems: string[] = []

  rows.forEach((row, i) => {
    const spec = SPECS[row.fn]
    const parts = (lines[i] ?? '').split('|')
    const head: Record<string, unknown> = { fn: row.fn }
    if (row.label !== undefined) head.case = row.label
    const input: Record<string, string> = {}
    spec.inputs.forEach((name, k) => {
      input[name] = renderValue(name, row.args[k] ?? 0n)
    })
    head.in = input
    if (parts[0] === 'ok') {
      okRows++
      let err: string | undefined
      if (row.fn === 'pairing') {
        const perm = (parts[1] ?? '').split(',').filter((s) => s.length > 0).map((s) => BigInt(s))
        head.out = { perm: perm.map((v) => v.toString()) }
        err = checkRow(row, [], perm)
      } else {
        const sol = parts.slice(1).map((v) => BigInt(v))
        if (sol.length !== spec.outputs.length) throw new Error(`row ${i}: arity`)
        const out: Record<string, string> = {}
        spec.outputs.forEach((name, k) => {
          out[name] = (sol[k] ?? 0n).toString()
        })
        head.out = out
        err = checkRow(row, sol)
      }
      if (err) problems.push(`row ${i} ${row.fn} ${row.label ?? ''} ${JSON.stringify(input)}: ${err}`)
    } else if (parts[0] === 'rv') {
      revertRows++
      head.revert = parts[1]
      const key = `${row.fn}: ${parts[1]}`
      revertTally.set(key, (revertTally.get(key) ?? 0) + 1)
    } else {
      throw new Error(`row ${i}: bad forge line`)
    }
    outRows.push(JSON.stringify(head))
  })

  if (problems.length > 0) {
    console.error(problems.slice(0, 20).join('\n'))
    throw new Error(`${problems.length} rows failed the independent cross-check`)
  }

  const counts: Record<string, number> = {}
  for (const n of NAMES) counts[n] = rows.filter((r) => r.fn === n).length
  const reverts = [...revertTally.entries()].sort().map(([k, v]) => `${v} x ${k}`)
  const meta = {
    format:
      'rows[]: {fn, case?, in:{name:value}, out:{name:value}} or {fn, case?, in, revert:code}. Numbers are decimal strings; seed is a 0x-prefixed 32-byte big-endian hex string; pairing out.perm is a list of decimal strings (coin indexes of the alive set in shuffled order, empty when alive_mask is 0). Function names are the Rust engine names: pool_factor_wad, power, win_prob_bps, pairing, clash_roll, hunt_roll, plus element_bps and level_from_xp. power also returns the pool_factor_wad it used, win_prob_bps also returns power_a and power_b, for debugging. Params in every row mirror CombatMath.Params (gamma_bps, pool_factor_min_bps, pool_factor_max_bps, level_bonus_bps, element_up_bps, element_down_bps, win_prob_min_bps, win_prob_max_bps); power rows carry only the six that power reads. Production defaults: 8800, 1000, 100000, 400, 11500, 8700, 1500, 8500. revert codes: overflow (Solidity panic 0x11, arithmetic overflow or underflow, including uint8 level - 1 when level is 0 and uint8 monsterType + 1 when 255), exp_overflow (Solady ExpOverflow from powWad when ln(ratio) * gamma exceeds about 135.3 in WAD), safecast_uint_to_int (ratio >= 2^255, OpenZeppelin SafeCast).',
    functions: Object.fromEntries(NAMES.map((n) => [n, { in: SPECS[n].inputs, out: SPECS[n].outputs }])),
    row_counts: counts,
    rows_total: rows.length,
    rows_ok: okRows,
    rows_revert: revertRows,
    revert_breakdown: reverts,
    edge_rows: edgeRows().length,
    prng: `splitmix64 seed 0x${SEED.toString(16)} (gen/combat.ts)`,
    authority:
      'outputs come from forge running contracts/src/libs/CombatMath.sol (Solady powWad, OpenZeppelin SafeCast) through near-parity/forge/script/GenCombat.s.sol',
    cross_check: {
      note: 'shared/src has no combat math (fixtureBuilder uses its own simplified formula), so rows are verified by an independent re-implementation in gen/combat.ts; the generator fails on the first mismatch',
      exact: 'element_bps, level_from_xp, power (from the reported pool factor), win_prob_bps (from the reported powers), pairing (keccak256 of 96 bytes via viem), clash_roll, hunt_roll are bit-exact',
      pool_factor_wad: `${stats.pfCompared} unclamped rows compared with Math.pow double precision (tolerance max(1e-11 relative, 4 wad units)); max relative diff ${stats.pfMaxRel.toExponential(2)}, max absolute diff ${stats.pfMaxAbs.toFixed(1)} wad; ${stats.pfClampOnly} clamped rows checked for the correct branch; degenerate branches (sum 0, n 0, rLock 0, ratio 0) are exact`
    },
    rust_notes: [
      'pairing/clash_roll/hunt_roll hash input is exactly 96 bytes: seed (32 bytes) || tag right-padded with zero bytes to 32 (ASCII PAIR, CLASH, HUNT) || index as 32-byte big-endian. clash_roll = hash mod 10000, hunt_roll = hash mod 100, both on the full 256-bit hash read as big-endian.',
      'pairing: perm starts as the ascending indexes of the set bits of alive_mask (bits 0..31); then for i = n down to 2: idx = i - 1, j = hash(seed, PAIR, idx) mod i, swap perm[idx] and perm[j]. The hash index is idx (i - 1), not i.',
      'pool_factor_wad branch order: sum_r == 0 or n == 0 returns WAD clamped to [min, max] before anything else (even when r_lock is 0); then r_lock == 0 returns min; then ratio = r_lock * n * WAD / sum_r (floor, 256-bit intermediate); ratio == 0 returns min; else raw = powWad(ratio, gamma_bps * WAD / BPS) clamped to [min_wad, max_wad] where min_wad = min_bps * WAD / BPS. min > max is not rejected: min wins below, max wins above, so min is returned when raw < min and max when raw > max.',
      'powWad(x, y) = expWad(lnWad(x) * y / 1e18) in signed 256-bit; the division truncates toward zero (ln is negative when ratio < 1). expWad returns 0 below about -41.4 and reverts ExpOverflow at or above about 135.3 (WAD). With production gamma 8800 ExpOverflow is unreachable because ratio >= 2^255 already reverts SafeCast first.',
      'power = pool_factor_wad * (10000 + level_bonus_bps * (level - 1)) * element_bps * 10000 / 10^12. Intermediate can reach about 7e46 with extreme params (more than u128 max 3.4e38), production params stay below 2e31; use a 256-bit intermediate.',
      'level is uint8: level == 0 reverts (checked level - 1). monster_type 255 reverts in element_bps (uint8 + 1). Types 5..254 are accepted and follow the modulo-5 rule literally, so only type pairs congruent per (a + 1) % 5 == b get the bonus; the game only uses 0..4.',
      'win_prob_bps: bps = power_a + power_b == 0 ? 5000 : power_a * 10000 / (power_a + power_b) (floor), then clamped to [win_prob_min_bps, win_prob_max_bps], min checked first. Zero power needs pool_factor_min_bps == 0 and r_lock == 0.',
      'level_from_xp thresholds: 15, 35, 60, 90, 125, 165, 210, 260, 320 give levels 2 to 10; every xp value up to 2^256 - 1 is accepted.'
    ],
    pool_factor_wad_parity_note:
      'Only Solady powWad itself is not re-derivable here: the Rust port is bit-exact with these rows only if it reproduces Solady lnWad and expWad exactly; otherwise it is within about 1e-9 relative and must be stated as such',
    generator: 'bash near-parity/run.sh combat',
    source_ref: 'monad-final',
    source: git(['rev-parse', 'monad-final']),
    contracts_src_clean_vs_source: git(['diff', '--stat', 'monad-final', '--', 'contracts/src']) === '',
    solady: git(['-C', 'contracts/lib/solady', 'rev-parse', 'HEAD']),
    solc: '0.8.31 (evm osaka, optimizer 200 runs, as contracts/foundry.toml)',
    forge: execFileSync('forge', ['--version'], { encoding: 'utf8' }).split('\n')[0]
  }
  const text = `{\n"schema": 1,\n"source": ${JSON.stringify(meta.source)},\n"meta": ${JSON.stringify(meta, null, 1)},\n"rows": [\n${outRows.join(',\n')}\n]\n}\n`
  writeFileSync(OUT_FILE, text)
  console.log(`rows=${rows.length} ok=${okRows} revert=${revertRows}`)
  reverts.forEach((r) => console.log(`revert: ${r}`))
  console.log(`pf compared=${stats.pfCompared} clampOnly=${stats.pfClampOnly} maxRel=${stats.pfMaxRel.toExponential(2)} maxAbs=${stats.pfMaxAbs.toFixed(1)}`)
}

const mode = process.argv[2]
if (mode === 'inputs') {
  const rows = allRows()
  writeInputs(rows)
  console.log(`wrote ${rows.length} input rows`)
} else if (mode === 'merge') {
  merge()
} else {
  throw new Error('usage: combat.ts inputs|merge')
}
