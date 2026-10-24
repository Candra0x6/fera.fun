export interface PowerInputs {
  baseStat: number
  level: number
  levelBonusBps: number
  rMonAtLock: number
  meanRMonAlive: number
  gammaBps: number
  poolFactorMinBps: number
  poolFactorMaxBps: number
}

export function powerRating(input: PowerInputs): number {
  const levelFactor = 1 + (input.levelBonusBps / 10000) * (input.level - 1)
  const ratio = input.meanRMonAlive > 0 ? input.rMonAtLock / input.meanRMonAlive : 1
  const raw = Math.pow(Math.max(ratio, 0), input.gammaBps / 10000)
  const poolFactor = Math.min(Math.max(raw, input.poolFactorMinBps / 10000), input.poolFactorMaxBps / 10000)
  return (input.baseStat / 10000) * levelFactor * poolFactor
}
