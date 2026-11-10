export const DEFAULT_SLIPPAGE_BPS = 500
export const DEADLINE_SECONDS = 120

export function minOutWithSlippage(quoted: bigint, slippageBps: number = DEFAULT_SLIPPAGE_BPS): bigint {
  const minimum = (quoted * BigInt(10000 - slippageBps)) / 10000n
  return minimum > 0n ? minimum : 1n
}

export function deadlineMsFrom(nowMs: number, aheadSeconds: number = DEADLINE_SECONDS): number {
  return Math.floor(nowMs) + aheadSeconds * 1000
}

function parseDecimal(value: string, decimals: number): bigint | null {
  const trimmed = value.trim()
  if (!new RegExp(`^\\d+(\\.\\d{1,${decimals}})?$`).test(trimmed)) return null
  const [whole = '0', fraction = ''] = trimmed.split('.')
  const units = BigInt(whole) * 10n ** BigInt(decimals) + BigInt(fraction.padEnd(decimals, '0'))
  return units > 0n ? units : null
}

export function parseNearInput(value: string): bigint | null {
  return parseDecimal(value, 24)
}

export function parseTokenInput(value: string): bigint | null {
  return parseDecimal(value, 18)
}
