import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { applyBoost, feeOf, launchSeedState, quoteBuy, quoteSell, splitLoss } from '../../shared/src/curve.ts'
import { ceilDiv } from '../../shared/src/math.ts'

const HERE = dirname(fileURLToPath(import.meta.url))
const WORK = join(HERE, '..', 'forge', 'work')
const IN_FILE = join(WORK, 'curve-in.json')
const SOL_FILE = join(WORK, 'curve-sol.txt')
const OUT_FILE = join(HERE, '..', 'curve.json')
const ROOT = join(HERE, '..', '..')

const U256 = (1n << 256n) - 1n
const E18 = 10n ** 18n
const E24 = 10n ** 24n
const MASK64 = (1n << 64n) - 1n
const SEED = 0x46455241n

type Name = 'ceil_div' | 'fee_of' | 'buy_out' | 'sell_gross' | 'boosted_vtok' | 'split_loss' | 'quote_buy' | 'quote_sell' | 'launch_seed'

interface Spec {
  code: number
  inputs: string[]
  outputs: string[]
}

const SPECS: Record<Name, Spec> = {
  ceil_div: { code: 0, inputs: ['a', 'b'], outputs: ['r'] },
  fee_of: { code: 1, inputs: ['amount', 'fee_bps'], outputs: ['fee'] },
  buy_out: { code: 2, inputs: ['v_mon', 'v_tok', 'mon_in_net'], outputs: ['out', 'new_v_tok'] },
  sell_gross: { code: 3, inputs: ['v_mon', 'v_tok', 'tokens'], outputs: ['gross'] },
  boosted_vtok: { code: 4, inputs: ['v_mon', 'v_tok', 'boost_mon'], outputs: ['new_v_tok'] },
  split_loss: {
    code: 5,
    inputs: ['reserve', 'boost_bps', 'consolation_bps', 'pot_bps'],
    outputs: ['boost', 'consolation', 'to_pot', 'to_treasury']
  },
  quote_buy: {
    code: 6,
    inputs: ['v_mon', 'v_tok', 'mon_in', 'fee_bps'],
    outputs: ['fee', 'net', 'out', 'new_v_tok']
  },
  quote_sell: { code: 7, inputs: ['v_mon', 'v_tok', 'tokens', 'fee_bps'], outputs: ['gross', 'fee', 'mon_out'] },
  launch_seed: { code: 8, inputs: ['v_mon0', 'v_tok0', 'seed'], outputs: ['tokens', 'v_tok', 'v_mon'] }
}

const NAMES = Object.keys(SPECS) as Name[]

interface Row {
  fn: Name
  args: bigint[]
  label?: string
}

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
  const extra = BigInt(Math.ceil(bits / 64) * 64 - bits)
  return v >> extra
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

function feeBpsRandom(): bigint {
  return next64() % 3n === 0n ? between(0n, 10000n) : pick([0n, 1n, 30n, 100n, 100n, 100n, 250n, 500n, 1000n, 9999n, 10000n])
}

function reserves(i: number): [bigint, bigint] {
  if (i % 2 === 0) return [between(E24, 2000n * E24), between(E18 * 100n, 1_000_000_000n * E18)]
  return [logU(110), logU(120)]
}

function amount(i: number, vMon: bigint): bigint {
  if (i % 2 === 0) return between(1n, 50n * E24)
  return next64() % 4n === 0n ? between(1n, vMon) : logU(110)
}

function randomRows(): Row[] {
  const rows: Row[] = []
  for (let i = 0; i < 1200; i++) {
    const [vMon, vTok] = reserves(i)
    rows.push({ fn: 'buy_out', args: [vMon, vTok, amount(i, vMon)] })
  }
  for (let i = 0; i < 1200; i++) {
    const [vMon, vTok] = reserves(i)
    const tokens = next64() % 10n < 7n ? between(0n, vTok) : logU(110)
    rows.push({ fn: 'sell_gross', args: [vMon, vTok, tokens] })
  }
  for (let i = 0; i < 800; i++) {
    const [vMon, vTok] = reserves(i)
    rows.push({ fn: 'boosted_vtok', args: [vMon, vTok, amount(i, vMon)] })
  }
  for (let i = 0; i < 800; i++) rows.push({ fn: 'fee_of', args: [logU(200), feeBpsRandom()] })
  for (let i = 0; i < 600; i++) {
    const r = logU(120)
    let triple: bigint[] = [5000n, 3000n, 1500n]
    const kind = Number(next64() % 10n)
    if (kind >= 5 && kind < 9) {
      const boost = between(0n, 10000n)
      const consolation = between(0n, 10000n - boost)
      const pot = between(0n, 10000n - boost - consolation)
      triple = [boost, consolation, pot]
    } else if (kind === 9) {
      triple = [between(0n, 10000n), between(0n, 10000n), between(0n, 10000n)]
    }
    rows.push({ fn: 'split_loss', args: [r, ...triple] })
  }
  for (let i = 0; i < 400; i++) rows.push({ fn: 'ceil_div', args: [logU(250), logU(200)] })
  return rows
}

function compositeRows(): Row[] {
  const rows: Row[] = []
  for (let i = 0; i < 400; i++) {
    const [vMon, vTok] = reserves(i)
    rows.push({ fn: 'quote_buy', args: [vMon, vTok, amount(i, vMon), i % 3 === 0 ? feeBpsRandom() : 100n] })
  }
  for (let i = 0; i < 400; i++) {
    const [vMon, vTok] = reserves(i)
    const tokens = next64() % 10n < 7n ? between(0n, vTok) : logU(110)
    rows.push({ fn: 'quote_sell', args: [vMon, vTok, tokens, i % 3 === 0 ? feeBpsRandom() : 100n] })
  }
  for (let i = 0; i < 200; i++) {
    const seed = next64() % 10n === 0n ? between(1n, 1000n) : between(E24 / 10n, 50n * E24)
    rows.push({ fn: 'launch_seed', args: [20n * E24, 1_000_000_000n * E18, seed] })
  }
  return rows
}

function edgeRows(): Row[] {
  const rows: Row[] = []
  const add = (fn: Name, label: string, ...args: bigint[]) => rows.push({ fn, args, label })
  const NEAR_VMON = 20n * E24
  const NEAR_VTOK = 1_000_000_000n * E18
  const H = 1n << 128n

  add('ceil_div', 'zero_over_zero', 0n, 0n)
  add('ceil_div', 'zero_over_one', 0n, 1n)
  add('ceil_div', 'one_over_zero', 1n, 0n)
  add('ceil_div', 'one_over_one', 1n, 1n)
  add('ceil_div', 'exact', 6n, 3n)
  add('ceil_div', 'round_up', 7n, 3n)
  add('ceil_div', 'max_over_one', U256, 1n)
  add('ceil_div', 'max_over_max', U256, U256)
  add('ceil_div', 'max_minus_one_over_two', U256 - 1n, 2n)
  add('ceil_div', 'max_over_two', U256, 2n)

  add('fee_of', 'zero_amount', 0n, 100n)
  add('fee_of', 'one_wei_one_percent', 1n, 100n)
  add('fee_of', 'exact_percent', 100n, 100n)
  add('fee_of', 'just_over_percent', 101n, 100n)
  add('fee_of', 'zero_bps', 123456789n, 0n)
  add('fee_of', 'full_bps', 123456789n, 10000n)
  add('fee_of', 'max_no_overflow', U256 / 10000n, 10000n)
  add('fee_of', 'max_overflow', U256 / 10000n + 1n, 10000n)
  add('fee_of', 'two_pow_255_times_two', 1n << 255n, 2n)
  add('fee_of', 'one_near_one_percent', E24, 100n)

  add('buy_out', 'zero_reserves_zero_in', 0n, 0n, 0n)
  add('buy_out', 'zero_reserves', 0n, 0n, 5n)
  add('buy_out', 'zero_vmon', 0n, 1000n, 5n)
  add('buy_out', 'zero_vtok', 1000n, 0n, 5n)
  add('buy_out', 'zero_in', NEAR_VMON, NEAR_VTOK, 0n)
  add('buy_out', 'one_wei_in_near_scale', NEAR_VMON, NEAR_VTOK, 1n)
  add('buy_out', 'one_wei_in_out_zero', E24, E18, 1n)
  add('buy_out', 'tiny_in_out_zero_large_vmon', 1n << 100n, 1n << 60n, 1n << 20n)
  add('buy_out', 'one_wei_in_small_pool', 1n, 1n, 1n)
  add('buy_out', 'near_empty_pool', 1n, NEAR_VTOK, 1n)
  add('buy_out', 'near_empty_pool_big_in', 1n, NEAR_VTOK, NEAR_VMON)
  add('buy_out', 'exact_division', 10n, 10n, 10n)
  add('buy_out', 'rounding_up', 10n, 10n, 5n)
  add('buy_out', 'rounding_boundary_out_one', 1000n, 1000n, 1n)
  add('buy_out', 'rounding_boundary_out_zero', 1000n, 1000n, 0n)
  add('buy_out', 'near_scale_seed', NEAR_VMON, NEAR_VTOK, 1n * E24 / 10n)
  add('buy_out', 'near_scale_k_2e52', NEAR_VMON, NEAR_VTOK, 5n * E24)
  add('buy_out', 'product_max_ok', H - 1n, H + 1n, 1n)
  add('buy_out', 'product_overflow', H, H, 1n)
  add('buy_out', 'product_overflow_by_one', H - 1n, H + 2n, 1n)
  add('buy_out', 'vmon_plus_in_overflow', 1n, 1n, U256)
  add('buy_out', 'huge_in', NEAR_VMON, NEAR_VTOK, 1n << 200n)
  add('buy_out', 'u128_max_reserves', (1n << 128n) - 1n, (1n << 128n) - 1n, (1n << 127n))

  add('sell_gross', 'zero_reserves_zero_tokens', 0n, 0n, 0n)
  add('sell_gross', 'zero_vtok_zero_tokens_vmon_positive', 5n, 0n, 0n)
  add('sell_gross', 'zero_vtok_tokens_positive', 5n, 0n, 7n)
  add('sell_gross', 'zero_vmon', 0n, 1000n, 7n)
  add('sell_gross', 'zero_tokens', NEAR_VMON, NEAR_VTOK, 0n)
  add('sell_gross', 'one_token_near_scale', NEAR_VMON, NEAR_VTOK, 1n)
  add('sell_gross', 'one_wei_one_wei', 1n, 1n, 1n)
  add('sell_gross', 'sell_all_vtok', NEAR_VMON, NEAR_VTOK, NEAR_VTOK)
  add('sell_gross', 'tiny_tokens_gross_zero', NEAR_VMON + 5n * E24, NEAR_VTOK - 1000n, 1n)
  add('sell_gross', 'exact_division', 10n, 10n, 10n)
  add('sell_gross', 'rounding', 10n, 10n, 5n)
  add('sell_gross', 'product_max_ok', H - 1n, H + 1n, 1n)
  add('sell_gross', 'product_overflow', H, H, 1n)
  add('sell_gross', 'vtok_plus_tokens_overflow', 1n, 1n, U256)

  add('boosted_vtok', 'zero_reserves_zero_boost', 0n, 0n, 0n)
  add('boosted_vtok', 'zero_boost', NEAR_VMON, NEAR_VTOK, 0n)
  add('boosted_vtok', 'one_wei_boost', NEAR_VMON, NEAR_VTOK, 1n)
  add('boosted_vtok', 'zero_vtok', NEAR_VMON, 0n, 5n * E24)
  add('boosted_vtok', 'zero_vmon', 0n, NEAR_VTOK, 5n * E24)
  add('boosted_vtok', 'exact_division', 10n, 10n, 10n)
  add('boosted_vtok', 'rounding', 10n, 10n, 5n)
  add('boosted_vtok', 'doubling_boost', NEAR_VMON, NEAR_VTOK, NEAR_VMON)
  add('boosted_vtok', 'huge_boost', NEAR_VMON, NEAR_VTOK, 1n << 200n)
  add('boosted_vtok', 'product_overflow', H, H, 1n)
  add('boosted_vtok', 'boost_overflow', 1n, 1n, U256)

  add('split_loss', 'zero_reserve', 0n, 5000n, 3000n, 1500n)
  add('split_loss', 'one_wei_treasury_takes_all', 1n, 5000n, 3000n, 1500n)
  add('split_loss', 'nine_nine_nine_nine', 9999n, 5000n, 3000n, 1500n)
  add('split_loss', 'ten_thousand', 10000n, 5000n, 3000n, 1500n)
  add('split_loss', 'floors_leave_remainder', 7n, 5000n, 3000n, 1500n)
  add('split_loss', 'one_near', E24, 5000n, 3000n, 1500n)
  add('split_loss', 'all_boost', E24, 10000n, 0n, 0n)
  add('split_loss', 'no_split', E24, 0n, 0n, 0n)
  add('split_loss', 'sum_over_bps_underflow', 10000n, 6000n, 3000n, 2000n)
  add('split_loss', 'sum_over_bps_hidden_by_floor', 1n, 6000n, 3000n, 2000n)
  add('split_loss', 'overflow_mul', 1n << 255n, 5000n, 3000n, 1500n)
  add('split_loss', 'u128_max', (1n << 128n) - 1n, 5000n, 3000n, 1500n)

  add('quote_buy', 'one_wei_in_fee_eats_all', NEAR_VMON, NEAR_VTOK, 1n, 100n)
  add('quote_buy', 'zero_in', NEAR_VMON, NEAR_VTOK, 0n, 100n)
  add('quote_buy', 'one_near_one_percent', NEAR_VMON, NEAR_VTOK, E24, 100n)
  add('quote_buy', 'fee_over_full', NEAR_VMON, NEAR_VTOK, E24, 10001n)
  add('quote_buy', 'full_fee', NEAR_VMON, NEAR_VTOK, E24, 10000n)
  add('quote_buy', 'zero_fee', NEAR_VMON, NEAR_VTOK, E24, 0n)
  add('quote_buy', 'zero_reserves', 0n, 0n, E24, 100n)

  add('quote_sell', 'zero_tokens', NEAR_VMON, NEAR_VTOK, 0n, 100n)
  add('quote_sell', 'one_token', NEAR_VMON, NEAR_VTOK, 1n, 100n)
  add('quote_sell', 'sell_half', NEAR_VMON, NEAR_VTOK, NEAR_VTOK / 2n, 100n)
  add('quote_sell', 'sell_all_vtok', NEAR_VMON, NEAR_VTOK, NEAR_VTOK, 100n)
  add('quote_sell', 'full_fee', NEAR_VMON, NEAR_VTOK, NEAR_VTOK / 2n, 10000n)
  add('quote_sell', 'fee_over_full', NEAR_VMON, NEAR_VTOK, NEAR_VTOK / 2n, 10001n)
  add('quote_sell', 'zero_vtok', 5n, 0n, 0n, 100n)

  add('launch_seed', 'blitz_seed_0_1_near', NEAR_VMON, NEAR_VTOK, E24 / 10n)
  add('launch_seed', 'min_seed_2_near', NEAR_VMON, NEAR_VTOK, 2n * E24)
  add('launch_seed', 'max_seed_50_near', NEAR_VMON, NEAR_VTOK, 50n * E24)
  add('launch_seed', 'one_wei_seed', NEAR_VMON, NEAR_VTOK, 1n)
  add('launch_seed', 'zero_seed_bad_seed', NEAR_VMON, NEAR_VTOK, 0n)
  add('launch_seed', 'monad_scale_seed_2', 20n * E18, 1_000_000_000n * E18, 2n * E18)
  return rows
}

function allRows(): Row[] {
  return [...edgeRows(), ...randomRows(), ...compositeRows()]
}

function writeInputs(rows: Row[]): void {
  const col = (i: number) => rows.map((r) => (r.args[i] ?? 0n).toString())
  const body = {
    fn: rows.map((r) => SPECS[r.fn].code),
    a: col(0),
    b: col(1),
    c: col(2),
    d: col(3)
  }
  writeFileSync(IN_FILE, JSON.stringify(body))
}

class TsThrow extends Error {}

function tsCompute(row: Row): bigint[] {
  const [a = 0n, b = 0n, c = 0n, d = 0n] = row.args
  const guard = <T>(f: () => T): T => {
    try {
      return f()
    } catch (e) {
      throw new TsThrow(e instanceof Error ? e.message : String(e))
    }
  }
  switch (row.fn) {
    case 'ceil_div':
      return [guard(() => ceilDiv(a, b))]
    case 'fee_of':
      return [guard(() => feeOf(a, b))]
    case 'buy_out': {
      const q = guard(() => quoteBuy({ vMon: a, vTok: b, rMon: 0n }, c, 0n))
      return [q.tokensOut, q.next.vTok]
    }
    case 'sell_gross':
      return [guard(() => quoteSell({ vMon: a, vTok: b, rMon: a }, c, 0n)).gross]
    case 'boosted_vtok':
      return [guard(() => applyBoost({ vMon: a, vTok: b, rMon: 0n }, c)).vTok]
    case 'split_loss': {
      const s = splitLoss(a, { boostBps: b, consolationBps: c, potBps: d })
      return [s.boost, s.consolation, s.toPot, s.toTreasury]
    }
    case 'quote_buy': {
      const q = guard(() => quoteBuy({ vMon: a, vTok: b, rMon: 0n }, c, d))
      return [q.fee, c - q.fee, q.tokensOut, q.next.vTok]
    }
    case 'quote_sell': {
      const q = guard(() => quoteSell({ vMon: a, vTok: b, rMon: a }, c, d))
      return [q.gross, q.fee, q.monOut]
    }
    case 'launch_seed': {
      const s = guard(() => launchSeedState(a, b, c))
      return [s.supply, s.vTok, s.vMon]
    }
  }
}

function git(args: string[]): string {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim()
}

function same(x: bigint[], y: bigint[]): boolean {
  return x.length === y.length && x.every((v, i) => v === y[i])
}

function merge(): void {
  const rows = allRows()
  const lines = readFileSync(SOL_FILE, 'utf8').split('\n').filter((l) => l.length > 0)
  if (lines.length !== rows.length) throw new Error(`forge produced ${lines.length} lines for ${rows.length} rows`)
  const outRows: string[] = []
  const tally = new Map<string, number>()
  const bump = (key: string) => tally.set(key, (tally.get(key) ?? 0) + 1)
  let okRows = 0
  let revertRows = 0
  let compared = 0
  const mismatches: string[] = []

  rows.forEach((row, i) => {
    const spec = SPECS[row.fn]
    const line = lines[i] ?? ''
    const parts = line.split('|')
    const head: Record<string, unknown> = { fn: row.fn }
    if (row.label !== undefined) head.case = row.label
    const input: Record<string, string> = {}
    spec.inputs.forEach((name, k) => {
      input[name] = (row.args[k] ?? 0n).toString()
    })
    head.in = input

    let ts: bigint[] | undefined
    let tsError: string | undefined
    try {
      ts = tsCompute(row)
    } catch (e) {
      tsError = e instanceof TsThrow ? e.message : String(e)
      if (!(e instanceof TsThrow)) throw e
    }

    if (parts[0] === 'ok') {
      okRows++
      const sol = parts.slice(1).map((v) => BigInt(v))
      if (sol.length !== spec.outputs.length) throw new Error(`row ${i}: output arity`)
      const out: Record<string, string> = {}
      spec.outputs.forEach((name, k) => {
        out[name] = (sol[k] ?? 0n).toString()
      })
      head.out = out
      if (ts === undefined) {
        bump(`${row.fn}: solidity returns a value, TypeScript throws (${tsError})`)
      } else {
        compared++
        if (!same(sol, ts)) mismatches.push(`row ${i} ${row.fn} ${JSON.stringify(input)} sol=${sol} ts=${ts}`)
      }
    } else if (parts[0] === 'rv') {
      revertRows++
      head.revert = parts[1]
      if (ts === undefined) bump(`${row.fn}: both fail (${parts[1]} vs TypeScript throw)`)
      else if (ts.some((v) => v < 0n)) bump(`${row.fn}: solidity reverts ${parts[1]}, TypeScript returns a negative value`)
      else bump(`${row.fn}: solidity reverts ${parts[1]}, TypeScript has no 256-bit bound or no guard`)
    } else {
      throw new Error(`row ${i}: bad forge line ${line}`)
    }
    outRows.push(JSON.stringify(head))
  })

  if (mismatches.length > 0) {
    console.error(mismatches.slice(0, 20).join('\n'))
    throw new Error(`${mismatches.length} rows differ between forge CurveMath and shared/src/curve.ts`)
  }

  const counts: Record<string, number> = {}
  for (const n of NAMES) counts[n] = rows.filter((r) => r.fn === n).length
  const divergences = [...tally.entries()].sort().map(([k, v]) => `${v} x ${k}`)
  const meta = {
    format:
      'rows[]: {fn, case?, in:{name:decimal string}, out:{name:decimal string}} or {fn, case?, in, revert:code}. All numbers are decimal strings of unsigned 256-bit integers. revert codes: overflow (Solidity panic 0x11, arithmetic overflow or underflow, Rust must use checked ops and fail), div_zero (panic 0x12), bad_seed (launch_seed custom error BadSeed when tokens == 0). The function names are the Rust engine names. Composite rows (quote_buy, quote_sell, launch_seed, split_loss) mirror the exact sequence used in Arena.sol: buy 367-370, sell 389-391, launch 293-297, merger split 680-707 (split_loss is the treasury-remainder arithmetic with 3 bps inputs). Solidity state is uint128 in Arena; values above 2^128 exist only to prove 256-bit intermediates.',
    functions: Object.fromEntries(NAMES.map((n) => [n, { in: SPECS[n].inputs, out: SPECS[n].outputs }])),
    row_counts: counts,
    rows_total: rows.length,
    rows_ok: okRows,
    rows_revert: revertRows,
    random_rows: rows.length - edgeRows().length,
    random_primitive_rows: 5000,
    edge_rows: edgeRows().length,
    prng: `splitmix64 seed 0x${SEED.toString(16)} (gen/curve.ts)`,
    authority: 'outputs come from forge running contracts/src/libs/CurveMath.sol through near-parity/forge/script/GenCurve.s.sol',
    cross_check: `${compared} non-reverting rows compared with shared/src/curve.ts (quoteBuy/quoteSell/applyBoost/splitLoss/launchSeedState/feeOf/ceilDiv), all equal; the generator fails on the first mismatch`,
    ts_vs_solidity_divergences: divergences,
    generator: 'bash near-parity/run.sh curve',
    source_ref: 'monad-final',
    source: git(['rev-parse', 'monad-final']),
    contracts_src_clean_vs_source: git(['diff', '--stat', 'monad-final', '--', 'contracts/src']) === '',
    solc: '0.8.31 (evm osaka, optimizer 200 runs, as contracts/foundry.toml)',
    forge: execFileSync('forge', ['--version'], { encoding: 'utf8' }).split('\n')[0]
  }
  const text = `{\n"schema": 1,\n"source": ${JSON.stringify(meta.source)},\n"meta": ${JSON.stringify(meta, null, 1)},\n"rows": [\n${outRows.join(',\n')}\n]\n}\n`
  writeFileSync(OUT_FILE, text)
  console.log(`rows=${rows.length} ok=${okRows} revert=${revertRows} compared=${compared}`)
  divergences.forEach((d) => console.log(`divergence: ${d}`))
}

const mode = process.argv[2]
if (mode === 'inputs') {
  const rows = allRows()
  writeInputs(rows)
  console.log(`wrote ${rows.length} input rows`)
} else if (mode === 'merge') {
  merge()
} else {
  throw new Error('usage: curve.ts inputs|merge')
}
