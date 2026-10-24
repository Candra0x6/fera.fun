export function ceilDiv(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) {
    throw new RangeError('denominator must be positive')
  }
  return (numerator + denominator - 1n) / denominator
}

export function compareBig(a: bigint, b: bigint): number {
  if (a < b) return -1
  if (a > b) return 1
  return 0
}

export function minBig(a: bigint, b: bigint): bigint {
  return a < b ? a : b
}

export function maxBig(a: bigint, b: bigint): bigint {
  return a > b ? a : b
}

export function clampBig(value: bigint, low: bigint, high: bigint): bigint {
  return minBig(maxBig(value, low), high)
}

export function parseDecimal(value: string): bigint {
  if (!/^\d+$/.test(value)) {
    throw new RangeError(`not a decimal string: ${value}`)
  }
  return BigInt(value)
}
