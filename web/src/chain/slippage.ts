export const DEFAULT_SLIPPAGE_BPS = 500
export const DEADLINE_SECONDS = 120

export function minOutWithSlippage(quoted: bigint, slippageBps: number = DEFAULT_SLIPPAGE_BPS): bigint {
  const minimum = (quoted * BigInt(10000 - slippageBps)) / 10000n
  return minimum > 0n ? minimum : 1n
}

export function deadlineFrom(nowSeconds: number, ahead: number = DEADLINE_SECONDS): bigint {
  return BigInt(Math.floor(nowSeconds) + ahead)
}

export function parseMonInput(value: string): bigint | null {
  const trimmed = value.trim()
  if (!/^\d+(\.\d{1,18})?$/.test(trimmed)) return null
  const [whole = '0', fraction = ''] = trimmed.split('.')
  const wei = BigInt(whole) * 10n ** 18n + BigInt(fraction.padEnd(18, '0'))
  return wei > 0n ? wei : null
}
