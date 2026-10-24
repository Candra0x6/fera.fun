import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs'
import { parseArgs } from './args.mjs'
import { runChunked } from './parallel.mjs'
import { batchRatio } from './stats.mjs'

const OUT = new URL('./out/', import.meta.url)
mkdirSync(OUT, { recursive: true })

export const BRAINSTORM = {
  first: [3.97, 1.83, 1.15, 0.93, 0.78, 0.59],
  'first-capped': [1.86, 1.43, 1.15, 0.93, 0.78, 0.8],
  linear: [1.27, 0.85, 0.82, 0.92, 0.99, 1.11],
  recommended: [1.39, 0.94, 0.87, 0.91, 0.91, 0.97],
}
export const MULTS = [0.1, 0.25, 0.5, 1, 2, 5]
export const GATE_MULTS = [0.25, 0.5, 1, 2, 5]
export const BAND = [0.85, 0.99]
const SWEEP_MULTS = [0.25, 1, 5]
const GAMMA_MULTS = [0.25, 1, 5]

const W = Number(process.env.SIM_WORKERS || 3)

function ci95(a) {
  if (a.n < 2) return 0
  return 1.96 * Math.sqrt(a.m2 / (a.n - 1) / a.n)
}

function cell(a) {
  return { mean: a.mean, ci: ci95(a), n: a.n }
}

async function ev(spec, runs) {
  const { merged } = await runChunked('evCell', { ...spec, runs }, W * 6, W)
  return merged
}

function f(x, d = 3) {
  return x.toFixed(d)
}

function pm(c, d = 3) {
  return f(c.mean, d) + ' +-' + f(c.ci, d)
}

function save(name, data, md) {
  writeFileSync(new URL(name + '.json', OUT), JSON.stringify(data, null, 1))
  writeFileSync(new URL(name + '.md', OUT), md)
}

function load(name) {
  const u = new URL(name + '.json', OUT)
  if (!existsSync(u)) throw new Error('missing section ' + name + ', run it first')
  return JSON.parse(readFileSync(u, 'utf8'))
}

async function sectionRepro(runs, seed) {
  const rows = [
    ['first', 'first', 'first'],
    ['first-capped', 'first-capped', 'first-capped'],
    ['linear', 'linear', 'linear'],
    ['brainstorm-wide', 'brainstorm-wide', 'recommended'],
    ['recommended', 'recommended', 'recommended'],
  ]
  const res = {}
  const lines = []
  lines.push('| Variant | Source | ' + MULTS.map((m) => m + 'x').join(' | ') + ' |')
  lines.push('|---|---|' + MULTS.map(() => '---').join('|') + '|')
  for (const [label, variant, ref] of rows) {
    const cells = []
    for (const m of MULTS) {
      const c = await ev({ preset: 'repro', variant, mult: m, seed, coins: 30, bypassSeedFloor: true }, runs)
      cells.push({ ...cell(c.ev), champ: c.champ.mean, sys: c.systemEv.mean, champX: c.champMultiple.mean, rec: c.epoch1Recovery.mean, epochs: c.epochs.mean })
    }
    res[label] = cells
    const brain = BRAINSTORM[ref]
    const ok = cells.map((c, i) => Math.abs(c.mean - brain[i]) <= c.ci + 0.05)
    const ok4k = cells.map((c, i) => Math.abs(c.mean - brain[i]) <= c.ci * Math.sqrt(runs / 4000) + 0.05)
    res[label + ':ok'] = ok
    res[label + ':ok4k'] = ok4k
    lines.push('| ' + label + ' | this sim | ' + cells.map((c) => pm(c, 2)).join(' | ') + ' |')
    lines.push('| | brainstorm | ' + brain.map((b) => f(b, 2)).join(' | ') + ' |')
    lines.push('| | within this sim CI + 0.05 | ' + ok.map((o) => (o ? 'yes' : 'NO')).join(' | ') + ' |')
    lines.push('| | within the CI of a 4000-run experiment + 0.05 | ' + ok4k.map((o) => (o ? 'yes' : 'NO')).join(' | ') + ' |')
  }
  const rec = res.recommended
  const extra = [
    '',
    'Secondary numbers from the recommended 1x cell (same runs): system EV per MON ' + f(rec[3].sys) + ', champion redeem multiple ' + f(rec[3].champX, 1) + 'x, first-knockout loser recovery ' + f(rec[3].rec) + 'x, knockout epochs ' + f(rec[3].epochs, 2) + ', P(title) of the 1x coin ' + f(rec[3].champ, 4) + '.',
  ]
  save('repro', res, lines.concat(extra).join('\n') + '\n')
}

async function sectionGate(runs, seed) {
  const rulesets = [
    { key: 'repro', preset: 'repro', base: 10 },
    { key: 'demo', preset: 'demo', base: 10 },
    { key: 'standard', preset: 'standard', base: 50 },
  ]
  const res = {}
  const lines = []
  for (const variant of ['recommended', 'tuned']) {
  res[variant] = {}
  lines.push('### Parameter set `' + variant + '` (gamma ' + (variant === 'tuned' ? '0.88' : '0.85') + ', pool factor clamp 0.1-10)')
  lines.push('')
  for (const rs of rulesets) {
    res[variant][rs.key] = {}
    lines.push('Ruleset `' + rs.key + '` (30 coins, mean pool ' + rs.base + ' MON, ' + runs + ' runs per cell):')
    lines.push('')
    lines.push('| Pool vs mean | Tagged pool (MON) | EV per MON (95% CI) | In band [0.85, 0.99] | Seed holder EV | Buyer cohort EV | P(title) |')
    lines.push('|---|---|---|---|---|---|---|')
    for (const m of MULTS) {
      const c = await ev({ preset: rs.preset, variant, mult: m, basePool: rs.base, seed, coins: 30, bypassSeedFloor: true }, runs)
      const e = cell(c.ev)
      const inBand = e.mean >= BAND[0] && e.mean <= BAND[1]
      res[variant][rs.key][m] = { ...e, inBand, seedEv: c.seedEv.mean, buyerEv: c.buyerEv.mean, champ: c.champ.mean }
      const label = m === 0.1 ? 'n/a, shown for comparison' : inBand ? 'yes' : 'NO'
      lines.push('| ' + m + 'x | ' + f(m * rs.base, 1) + ' | ' + pm(e) + ' | ' + label + ' | ' + f(c.seedEv.mean, 2) + ' | ' + f(c.buyerEv.mean, 2) + ' | ' + f(c.champ.mean, 4) + ' |')
    }
    lines.push('')
  }
  }
  save('gate', res, lines.join('\n'))
}

async function sectionGhost(runs, seed) {
  const res = {}
  const lines = []
  const bases = [10, 20, 40, 100]
  const sets = [
    { key: 'first', variant: 'first', overrides: undefined, label: 'first design (failing baseline)' },
    { key: 'recommended', variant: 'recommended', overrides: undefined, label: 'brainstorm recommended (gamma 0.85, clamp 0.1-10)' },
    { key: 'tuned', variant: 'tuned', overrides: undefined, label: 'tuned (gamma 0.88, clamp 0.1-10)' },
    { key: 'capped', variant: 'recommended', overrides: { boostCap: true, gammaBps: 6000 }, label: 'hardened: boost capped at winner reserve, gamma 0.60' },
  ]
  lines.push('| Parameter set | ' + bases.map((b) => '2 MON vs mean ' + b + ' (' + f(2 / b, 2) + 'x)').join(' | ') + ' |')
  lines.push('|---|' + bases.map(() => '---').join('|') + '|')
  for (const s of sets) {
    res[s.key] = {}
    const cells = []
    for (const b of bases) {
      const c = await ev({ preset: 'demo', variant: s.variant, overrides: s.overrides, mult: 2 / b, basePool: b, seed, coins: 30 }, runs)
      res[s.key][b] = cell(c.ev)
      cells.push(pm(c.ev.n ? cell(c.ev) : cell(c.ev), 2))
    }
    lines.push('| ' + s.label + ' | ' + cells.join(' | ') + ' |')
  }
  save('ghost', res, lines.join('\n') + '\n')
}

async function sectionCheck1(runs, seed) {
  const res = {}
  const lines = []
  const dusts = [1n, 10n ** 9n, 10n ** 18n, 10n ** 21n, 10n ** 24n]
  lines.push('| Boost implementation | Tokens sold per winner (wei) | Share of the winner supply sold | Boost value captured above the pre-boost sale value (share of all boost) | Runs with a boost |')
  lines.push('|---|---|---|---|---|')
  for (const mode of ['plain', 'virtual']) {
    res[mode] = {}
    for (const d of dusts) {
      const { merged } = await runChunked('check1', { mode, dust: d.toString(), runs, seed, coins: 30, variant: 'tuned' }, W * 2, W)
      const share = merged.capturedTotal / merged.boostTotal
      const perRun = merged.shareByRun
      const frac = merged.fracN > 0 ? merged.fracSum / merged.fracN : 0
      res[mode][d.toString()] = { share, ci: ci95(perRun), trials: merged.trials, frac }
      const label = mode === 'plain' ? 'plain injection, k cached from launch (first design)' : 'virtual buy-and-burn, k read from state (specified)'
      lines.push('| ' + label + ' | ' + d.toString() + ' | ' + (frac * 100).toExponential(2) + '% | ' + f(share * 100, 3) + '% (per-run 95% CI +-' + f(ci95(perRun) * 100, 3) + ' pts) | ' + merged.trials + ' |')
    }
  }
  save('check1', res, lines.join('\n') + '\n')
}

async function sectionCheck3(runs, seed) {
  const res = {}
  const lines = []
  const rulesets = [
    { key: 'repro', preset: 'repro', label: '30 coins, uncapped clashes (15 alive in the first bye epoch)' },
    { key: 'demo', preset: 'demo', label: 'demo preset (cap 6 clashes per epoch, idle coins count as byes)' },
  ]
  lines.push('| Ruleset | Pairing regime | Title-odds ratio of the predicted bye coin (95% CI) | Runs |')
  lines.push('|---|---|---|---|')
  for (const rs of rulesets) {
    res[rs.key] = {}
    for (const mode of ['public', 'resolve']) {
      const chunks = 20
      const per = Math.ceil(runs / chunks)
      const { parts } = await runChunked('check3Bye', { preset: rs.preset, mode, seed, coins: 30, runs: per * chunks, variant: 'tuned' }, chunks, W)
      const nums = parts.map((p) => p.num)
      const dens = parts.map((p) => p.den)
      const n = parts.reduce((s, p) => s + p.n, 0)
      const r = batchRatio(nums.length, nums, dens)
      res[rs.key][mode] = { ratio: r.ratio, ci: r.ci, n }
      lines.push('| ' + rs.label + ' | ' + (mode === 'public' ? 'previous epoch seed, bracket public during trading' : 'new seed at resolve behind the lock') + ' | ' + f(r.ratio, 3) + ' +-' + f(r.ci, 3) + ' | ' + n + ' |')
    }
  }
  lines.push('')
  lines.push('| Regime | Informed trader edge per MON (95% CI) | Information-free trader edge (same rule, unrelated pairing) | Difference = value of the bracket information | Null edge (arbitrary pair, expected 0) |')
  lines.push('|---|---|---|---|---|')
  res.edge = {}
  for (const mode of ['public', 'resolve']) {
    const { merged } = await runChunked('check3Edge', { mode, seed, coins: 30, runs, variant: 'tuned' }, W * 6, W)
    res.edge[mode] = { edge: cell(merged.edge), blind: cell(merged.blind), leak: cell(merged.leak), nullEdge: cell(merged.nullEdge) }
    lines.push('| ' + (mode === 'public' ? 'public bracket (previous epoch seed)' : 'pairing at resolve behind the lock') + ' | ' + pm(cell(merged.edge)) + ' | ' + pm(cell(merged.blind)) + ' | ' + pm(cell(merged.leak)) + ' | ' + pm(cell(merged.nullEdge)) + ' |')
  }
  save('check3', res, lines.join('\n') + '\n')
}

const SWEEPS = [
  { name: 'recommended (gamma 0.85)', overrides: {} },
  { name: 'split 40/40/15/5', overrides: { boostBps: 4000, consolationBps: 4000 } },
  { name: 'split 60/20/15/5', overrides: { boostBps: 6000, consolationBps: 2000 } },
  { name: 'split 50/25/25/0', overrides: { consolationBps: 2500, potBps: 2500, treasuryBps: 0 } },
  { name: 'element 1.00/1.00', overrides: { elementUpBps: 10000, elementDownBps: 10000 } },
  { name: 'element 1.30/0.77', overrides: { elementUpBps: 13000, elementDownBps: 7700 } },
  { name: 'level bonus 0%', overrides: { levelBonusBps: 0 } },
  { name: 'level bonus 8%', overrides: { levelBonusBps: 800 } },
  { name: 'win clamp 5-95%', overrides: { winProbMinBps: 500, winProbMaxBps: 9500 } },
  { name: 'win clamp 25-75%', overrides: { winProbMinBps: 2500, winProbMaxBps: 7500 } },
  { name: 'consolation to survivors (spread)', overrides: { consolationMode: 1 } },
  { name: 'boost capped, gamma 0.60', overrides: { boostCap: true, gammaBps: 6000 } },
  { name: 'boost capped, gamma 0.70', overrides: { boostCap: true, gammaBps: 7000 } },
]

async function sectionSweeps(runs, seed) {
  const res = {}
  const lines = []
  lines.push('| Parameter set (demo ruleset) | ' + SWEEP_MULTS.map((m) => m + 'x').join(' | ') + ' | ghost 2 MON vs 20 | ghost 2 MON vs 40 |')
  lines.push('|---|' + SWEEP_MULTS.map(() => '---').join('|') + '|---|---|')
  for (const s of SWEEPS) {
    const row = []
    const cells = []
    for (const m of SWEEP_MULTS) {
      const c = await ev({ preset: 'demo', variant: 'recommended', overrides: s.overrides, mult: m, basePool: 10, seed, coins: 30 }, runs)
      cells.push(cell(c.ev))
      row.push(pm(cell(c.ev), 2))
    }
    const ghosts = []
    for (const b of [20, 40]) {
      const c = await ev({ preset: 'demo', variant: 'recommended', overrides: s.overrides, mult: 2 / b, basePool: b, seed, coins: 30 }, runs)
      ghosts.push(cell(c.ev))
    }
    res[s.name] = { cells, ghosts }
    lines.push('| ' + s.name + ' | ' + row.join(' | ') + ' | ' + pm(ghosts[0], 2) + ' | ' + pm(ghosts[1], 2) + ' |')
  }
  save('sweeps', res, lines.join('\n') + '\n')
}

async function sectionGamma(runs, seed) {
  const res = {}
  const lines = []
  const gammas = [8500, 9000, 9500, 10000]
  for (const rs of [
    { key: 'demo', preset: 'demo', base: 10 },
    { key: 'standard', preset: 'standard', base: 50 },
  ]) {
    res[rs.key] = {}
    lines.push('Ruleset `' + rs.key + '`, ' + runs + ' runs per cell, EV per MON (95% CI):')
    lines.push('')
    lines.push('| gamma | ' + GAMMA_MULTS.map((m) => m + 'x').join(' | ') + ' | 0.2x |')
    lines.push('|---|' + GAMMA_MULTS.map(() => '---').join('|') + '|---|')
    for (const g of gammas) {
      const cells = []
      for (const m of GAMMA_MULTS) {
        const c = await ev({ preset: rs.preset, variant: 'recommended', overrides: { gammaBps: g }, mult: m, basePool: rs.base, seed, coins: 30, bypassSeedFloor: true }, runs)
        cells.push(cell(c.ev))
      }
      const gh = await ev({ preset: rs.preset, variant: 'recommended', overrides: { gammaBps: g }, mult: 0.2, basePool: rs.base, seed, coins: 30, bypassSeedFloor: true }, runs)
      res[rs.key][g] = { cells, ghost02: cell(gh.ev) }
      lines.push('| ' + (g / 10000).toFixed(2) + ' | ' + cells.map((c) => pm(c)).join(' | ') + ' | ' + pm(cell(gh.ev)) + ' |')
    }
    lines.push('')
  }
  save('gamma', res, lines.join('\n'))
}

async function sectionCurve(runs, seed) {
  const res = {}
  const lines = []
  lines.push('| vMon0 (MON) | Seed holder EV at 1x | Buyer cohort EV at 1x | Seed holder EV at 5x | Buyer cohort EV at 5x | Coin-level EV at 1x |')
  lines.push('|---|---|---|---|---|---|')
  for (const v of [20, 50, 100, 200, 500]) {
    const overrides = { vMon0: BigInt(v) * 10n ** 18n }
    const a = await ev({ preset: 'demo', variant: 'recommended', overrides, mult: 1, basePool: 10, seed, coins: 30 }, runs)
    const b = await ev({ preset: 'demo', variant: 'recommended', overrides, mult: 5, basePool: 10, seed, coins: 30 }, runs)
    res[v] = { seed1: a.seedEv.mean, buyer1: a.buyerEv.mean, seed5: b.seedEv.mean, buyer5: b.buyerEv.mean, ev1: a.ev.mean }
    lines.push('| ' + v + ' | ' + f(a.seedEv.mean, 2) + ' | ' + f(a.buyerEv.mean, 2) + ' | ' + f(b.seedEv.mean, 2) + ' | ' + f(b.buyerEv.mean, 2) + ' | ' + f(a.ev.mean, 3) + ' |')
  }
  save('curve', res, lines.join('\n') + '\n')
}

async function sectionDynamic(runs, seed) {
  const res = {}
  const lines = []
  for (const preset of ['demo', 'standard']) {
    const base = { preset, variant: 'tuned', seed, coins: 30, snipe: true }
    const none = (await runChunked('runDynamic', { ...base, runs }, W * 6, W)).merged
    res[preset] = { none: pack(none) }
    for (const strategy of ['top', 'spread', 'single']) {
      const w = (await runChunked('runDynamic', { ...base, runs, whale: { amount: 100, strategy } }, W * 6, W)).merged
      res[preset]['whale-' + strategy] = pack(w)
    }
  }
  const d = res.demo.none
  const s = res.standard.none
  lines.push('| Metric (trader population, 30 coins) | demo preset | standard preset |')
  lines.push('|---|---|---|')
  const row = (label, k, digits = 3) => lines.push('| ' + label + ' | ' + f(d[k].mean, digits) + ' +-' + f(d[k].ci, digits) + ' | ' + f(s[k].mean, digits) + ' +-' + f(s[k].ci, digits) + ' |')
  row('Champion redeem multiple (redeem pool / MON put into the champion)', 'champMultiple', 2)
  row('Share of coins out in the first knockout epoch', 'outEpoch1')
  row('Their recovery through consolation (x of MON put in)', 'epoch1Recovery')
  row('System EV per MON (all claims / all MON put in)', 'systemEv')
  row('Epochs to completion (leveling plus knockout)', 'epochs', 2)
  row('Clashes played', 'clashes', 2)
  row('Gini of final holder value (creators and traders)', 'gini')
  row('Creator seed EV per MON', 'creatorEv')
  row('Uniform small buyers, EV per MON deployed', 'evUniform')
  row('Momentum buyers, EV per MON deployed', 'evMomentum')
  row('Level-chasing buyers, EV per MON deployed', 'evLevel')
  row('Random coin bought at the last moment before each lock, win rate', 'snipeRandomWin')
  row('Strongest public-power coin bought at the last moment, win rate', 'snipeStrongWin')
  row('Strongest public-power coin bought at the last moment, EV per MON', 'snipeStrongEv')
  lines.push('')
  lines.push('| Whale buying 100 MON before the first lock | demo EV per MON | demo share of all final value | standard EV per MON | standard share of all final value |')
  lines.push('|---|---|---|---|---|')
  for (const strategy of ['top', 'spread', 'single']) {
    const a = res.demo['whale-' + strategy]
    const b = res.standard['whale-' + strategy]
    lines.push('| ' + strategy + ' | ' + f(a.whaleEv.mean, 3) + ' +-' + f(a.whaleEv.ci, 3) + ' | ' + f(a.whaleShare.mean * 100, 2) + '% | ' + f(b.whaleEv.mean, 3) + ' +-' + f(b.whaleEv.ci, 3) + ' | ' + f(b.whaleShare.mean * 100, 2) + '% |')
  }
  save('dynamic', res, lines.join('\n') + '\n')
}

function pack(m) {
  const out = {}
  for (const k of Object.keys(m)) if (m[k] && typeof m[k] === 'object' && 'm2' in m[k]) out[k] = { mean: m[k].mean, ci: ci95(m[k]), n: m[k].n }
  return out
}

function sectionVerdict() {
  const repro = load('repro')
  const gate = load('gate')
  const c1 = load('check1')
  const c3 = load('check3')
  const failures = []
  for (const key of Object.keys(repro)) {
    if (key.endsWith(':ok')) continue
  }
  const literal = []
  for (const rs of Object.keys(gate.recommended)) for (const m of GATE_MULTS) if (!gate.recommended[rs][m].inBand) literal.push(rs + ' ' + m + 'x = ' + gate.recommended[rs][m].mean.toFixed(3))
  for (const rs of Object.keys(gate.tuned)) {
    for (const m of GATE_MULTS) {
      const c = gate.tuned[rs][m]
      if (!c.inBand) failures.push('ghost EV out of band: ' + rs + ' ' + m + 'x = ' + c.mean.toFixed(3))
    }
  }
  const virtual = c1.virtual
  for (const d of Object.keys(virtual)) {
    if (virtual[d].share >= 0.01) failures.push('1-wei bot captured ' + (virtual[d].share * 100).toFixed(2) + '% with dust ' + d)
  }
  const plainShare = c1.plain['1'].share
  if (plainShare < 0.5) failures.push('baseline check cannot fail: plain injection captured only ' + plainShare)
  const bye = c3.repro.resolve
  if (Math.abs(bye.ratio - 1) > 0.05) failures.push('bye ratio under pairing at resolve is ' + bye.ratio.toFixed(3))
  const byePublic = c3.repro.public
  if (byePublic.ratio < 1.2) failures.push('baseline check cannot fail: public bracket bye ratio only ' + byePublic.ratio.toFixed(3))
  const leak = c3.edge.resolve.leak
  if (Math.abs(leak.mean) > Math.max(2 * leak.ci, 0.02)) failures.push('value of bracket information under pairing at resolve is ' + leak.mean.toFixed(3))
  const leakPublic = c3.edge.public.leak
  if (leakPublic.mean < 0.05) failures.push('baseline cannot fail: value of the public bracket is only ' + leakPublic.mean.toFixed(3))
  const verdict = failures.length === 0 ? 'GATE: PASS' : 'GATE: FAIL'
  const body = [verdict, '', 'Literal brainstorm parameters (gamma 0.85) out of band: ' + (literal.length ? literal.join('; ') : 'none'), '', failures.length === 0 ? 'All gate conditions met.' : failures.map((x) => '- ' + x).join('\n'), '']
  save('verdict', { verdict, failures }, body.join('\n'))
}

async function main() {
  const args = parseArgs(process.argv.slice(2), { section: 'all', runs: '', seed: '777001' })
  const seed = Number(args.seed)
  const defaults = { repro: 100000, gate: 300000, ghost: 40000, check1: 600, check3: 300000, sweeps: 20000, curve: 20000, dynamic: 20000, gamma: 100000 }
  const sections = args.section === 'all' ? ['repro', 'gate', 'ghost', 'check1', 'check3', 'sweeps', 'curve', 'dynamic', 'verdict'] : args.section.split(',')
  for (const s of sections) {
    const runs = args.runs ? Number(args.runs) : defaults[s]
    const t0 = Date.now()
    if (s === 'repro') await sectionRepro(runs, seed)
    else if (s === 'gate') await sectionGate(runs, seed)
    else if (s === 'ghost') await sectionGhost(runs, seed)
    else if (s === 'check1') await sectionCheck1(runs, seed)
    else if (s === 'check3') await sectionCheck3(runs, seed)
    else if (s === 'sweeps') await sectionSweeps(runs, seed)
    else if (s === 'curve') await sectionCurve(runs, seed)
    else if (s === 'gamma') await sectionGamma(runs, seed)
    else if (s === 'dynamic') await sectionDynamic(runs, seed)
    else if (s === 'verdict') sectionVerdict()
    else throw new Error('unknown section ' + s)
    console.log('section ' + s + ' done in ' + ((Date.now() - t0) / 1000).toFixed(1) + 's')
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
