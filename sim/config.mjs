import { ONE } from './curve.mjs'

export function mon(x) {
  return BigInt(Math.round(x * 1000)) * (ONE / 1000n)
}

const SIM_DEFAULTS = {
  baseStat: [10000, 10000, 10000, 10000, 10000],
  levelMode: 'xp',
  huntsEnabled: true,
  huntXp: 10,
  winXp: 20,
  xpThresholds: [0, 15, 35, 60, 90, 125, 165, 210, 260, 320],
  boostCap: false,
  boostCapExcess: 'loser',
  plainBoost: false,
  feeToPotBps: 5000,
  seedPaysFee: false,
}

const DEMO = {
  maxCoins: 30,
  minCoins: 8,
  lobbySeconds: 120,
  levelingEpochs: 3,
  epochSeconds: 20,
  clashesPerEpoch: 6,
  seedTimeoutSeconds: 60,
  maxRoundSeconds: 3600,
  launchFee: mon(1),
  minSeed: mon(2),
  maxSeed: mon(50),
  tradeFeeBps: 100,
  boostBps: 5000,
  consolationBps: 3000,
  potBps: 1500,
  treasuryBps: 500,
  consolationMode: 0,
  gammaBps: 8500,
  poolFactorMinBps: 1000,
  poolFactorMaxBps: 100000,
  levelBonusBps: 400,
  elementUpBps: 11500,
  elementDownBps: 8700,
  winProbMinBps: 1500,
  winProbMaxBps: 8500,
  huntWinPct: 50,
  keeperBounty: mon(0.2),
  maxEntropyFee: mon(1),
  vMon0: mon(20),
  vTok0: 1000000000n * ONE,
}

const STANDARD = {
  ...DEMO,
  minCoins: 12,
  lobbySeconds: 900,
  levelingEpochs: 10,
  epochSeconds: 60,
  clashesPerEpoch: 4,
  maxRoundSeconds: 86400,
  launchFee: mon(5),
  minSeed: mon(10),
  maxSeed: mon(500),
  keeperBounty: mon(1),
  maxEntropyFee: mon(10),
}

const REPRO = {
  ...DEMO,
  levelingEpochs: 0,
  clashesPerEpoch: 255,
  minSeed: mon(2),
}

export const PRESETS = { demo: DEMO, standard: STANDARD, repro: REPRO }

export const VARIANTS = {
  first: { gammaBps: 5000, poolFactorMinBps: 7500, poolFactorMaxBps: 13500, boostCap: false },
  'first-capped': { gammaBps: 5000, poolFactorMinBps: 7500, poolFactorMaxBps: 13500, boostCap: true },
  linear: { gammaBps: 10000, poolFactorMinBps: 500, poolFactorMaxBps: 200000, boostCap: false },
  'brainstorm-wide': { gammaBps: 8500, poolFactorMinBps: 500, poolFactorMaxBps: 200000, boostCap: false },
  tuned: { gammaBps: 8800, poolFactorMinBps: 1000, poolFactorMaxBps: 100000, boostCap: false },
  recommended: { gammaBps: 8500, poolFactorMinBps: 1000, poolFactorMaxBps: 100000, boostCap: false },
}

export function makeConfig(preset, variant, overrides) {
  const base = PRESETS[preset]
  if (!base) throw new Error('unknown preset ' + preset)
  const v = VARIANTS[variant]
  if (!v) throw new Error('unknown variant ' + variant)
  const levelModeDefault = preset === 'repro' ? { levelMode: 'wins', huntsEnabled: false } : {}
  const cfg = { ...SIM_DEFAULTS, ...levelModeDefault, ...base, ...v, ...(overrides || {}) }
  if (cfg.boostBps + cfg.consolationBps + cfg.potBps + cfg.treasuryBps !== 10000) {
    throw new Error('split must sum to 10000')
  }
  return cfg
}
