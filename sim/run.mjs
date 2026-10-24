import { parseArgs } from './args.mjs'
import { VARIANTS, makeConfig } from './config.mjs'
import { evCell } from './experiments.mjs'
import { runChunked } from './parallel.mjs'
import { ci } from './stats.mjs'

const MULTS = [0.1, 0.25, 0.5, 1, 2, 5]

function pad(s, n) {
  return String(s).padEnd(n)
}

async function cell(args, variant, mult) {
  const spec = {
    preset: args.preset,
    variant,
    mult,
    runs: Number(args.runs),
    seed: Number(args.seed),
    coins: Number(args.coins),
    basePool: Number(args.pool),
    bypassSeedFloor: true,
    overrides: args.overrides ? JSON.parse(args.overrides, (k, v) => (typeof v === 'string' && /^\d+n$/.test(v) ? BigInt(v.slice(0, -1)) : v)) : undefined,
  }
  const workers = Number(args.workers)
  if (workers <= 1) return evCell(spec)
  const { merged } = await runChunked('evCell', spec, workers * 4, workers)
  return merged
}

function fmtEv(a) {
  return a.mean.toFixed(3) + ' +-' + ci(a).toFixed(3)
}

async function main() {
  const args = parseArgs(process.argv.slice(2), {
    seed: '1',
    coins: '30',
    runs: '4000',
    variant: 'recommended',
    preset: 'repro',
    pool: '10',
    workers: '1',
  })
  const variants = args.variant === 'all' ? Object.keys(VARIANTS) : [args.variant]
  for (const v of variants) {
    if (!VARIANTS[v]) throw new Error('unknown variant ' + v + ', choose one of ' + Object.keys(VARIANTS).join(', ') + ', all')
    const cfg = makeConfig(args.preset, v)
    console.log('variant=' + v + ' preset=' + args.preset + ' seed=' + args.seed + ' coins=' + args.coins + ' runs=' + args.runs + ' basePool=' + args.pool + 'MON')
    console.log(
      'gammaBps=' + cfg.gammaBps + ' poolFactor=[' + cfg.poolFactorMinBps + ',' + cfg.poolFactorMaxBps + '] bps split=' +
        [cfg.boostBps, cfg.consolationBps, cfg.potBps, cfg.treasuryBps].join('/') + ' boostCap=' + cfg.boostCap +
        ' levelingEpochs=' + cfg.levelingEpochs + ' clashesPerEpoch=' + cfg.clashesPerEpoch + ' levelMode=' + cfg.levelMode,
    )
    console.log(pad('pool x', 8) + pad('EV/MON (95% CI)', 18) + pad('seed EV', 9) + pad('buyer EV', 10) + pad('P(title)', 10) + pad('P(out 1st KO)', 14))
    let last = null
    for (const m of MULTS) {
      const c = await cell(args, v, m)
      last = c
      console.log(
        pad(m + 'x', 8) + pad(fmtEv(c.ev), 18) + pad(c.seedEv.mean.toFixed(3), 9) + pad(c.buyerEv.mean.toFixed(3), 10) + pad(c.champ.mean.toFixed(4), 10) + pad(c.outEpoch1.mean.toFixed(3), 14),
      )
    }
    console.log(
      'system EV per MON=' + last.systemEv.mean.toFixed(3) + ' champion multiple=' + last.champMultiple.mean.toFixed(2) + 'x first-KO recovery=' + last.epoch1Recovery.mean.toFixed(3) + 'x epochs=' + last.epochs.mean.toFixed(2),
    )
    console.log('')
  }
}

main().catch((e) => {
  console.error(e.message)
  process.exit(1)
})
