import { mix, TAG_PAIR, TAG_CLASH, TAG_HUNT } from './rng.mjs'

export const BEATS = [1, 2, 3, 4, 0]

export function elementBps(a, b, upBps, downBps) {
  if (BEATS[a] === b) return upBps
  if (BEATS[b] === a) return downBps
  return 10000
}

export function levelFromXp(xp, thresholds) {
  let level = 1
  for (let i = 1; i < thresholds.length; i++) {
    if (xp >= thresholds[i]) level = i + 1
  }
  return level
}

export function poolFactor(rLock, meanR, gammaBps, minBps, maxBps) {
  if (meanR <= 0) return 1
  const ratio = rLock / meanR
  const raw = ratio <= 0 ? 0 : Math.pow(ratio, gammaBps / 10000)
  return Math.min(maxBps / 10000, Math.max(minBps / 10000, raw))
}

export function power(cfg, a, b, meanR) {
  const base = cfg.baseStat[a.type] / 10000
  const lvl = 1 + (cfg.levelBonusBps / 10000) * (a.levelLock - 1)
  const elem = elementBps(a.type, b.type, cfg.elementUpBps, cfg.elementDownBps) / 10000
  const pf = poolFactor(a.rLockNum, meanR, cfg.gammaBps, cfg.poolFactorMinBps, cfg.poolFactorMaxBps)
  return base * lvl * elem * pf
}

export function winProbBps(cfg, a, b, meanR) {
  const pa = power(cfg, a, b, meanR)
  const pb = power(cfg, b, a, meanR)
  const p = pa / (pa + pb)
  const bps = Math.floor(p * 10000)
  return Math.min(cfg.winProbMaxBps, Math.max(cfg.winProbMinBps, bps))
}

export function pairing(seed, aliveList) {
  const perm = aliveList.slice()
  for (let i = perm.length - 1; i > 0; i--) {
    const j = mix(seed, TAG_PAIR, i) % (i + 1)
    const t = perm[i]
    perm[i] = perm[j]
    perm[j] = t
  }
  return perm
}

export function clashRoll(seed, clashId) {
  return Math.floor((mix(seed, TAG_CLASH, clashId) / 4294967296) * 10000)
}

export function huntRoll(seed, coinId) {
  return Math.floor((mix(seed, TAG_HUNT, coinId) / 4294967296) * 100)
}
