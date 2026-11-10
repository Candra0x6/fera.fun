const TOKEN_UNIT = 10n ** 18n

export function yoctoToNear(yocto: string): number {
  return Number(BigInt(yocto) / 10n ** 12n) / 1e12
}

export function yoctoToNumber(yocto: bigint): number {
  return Number(yocto / 10n ** 18n) / 1e6
}

export function tokensToNumber(units: bigint): number {
  return Number(units / 10n ** 12n) / 1e6
}

export function formatTokenUnits(units: bigint): string {
  const whole = units / TOKEN_UNIT
  const fraction = (units % TOKEN_UNIT).toString().padStart(18, '0').replace(/0+$/, '')
  return fraction === '' ? whole.toString() : `${whole}.${fraction}`
}

export function formatNearCompact(near: number): string {
  const abs = Math.abs(near)
  if (abs >= 1_000_000) return `${(near / 1_000_000).toFixed(1)}M NEAR`
  if (abs >= 1_000) return `${(near / 1_000).toFixed(1)}K NEAR`
  if (abs >= 100) return `${near.toFixed(1)} NEAR`
  if (abs >= 1) return `${near.toFixed(2)} NEAR`
  return `${near.toFixed(3)} NEAR`
}

export function formatNearPlain(near: number): string {
  const abs = Math.abs(near)
  if (abs >= 1_000_000) return `${(near / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000) return `${(near / 1_000).toFixed(1)}K`
  if (abs >= 1) return near.toFixed(2)
  return near.toFixed(3)
}

export function formatNearExact(near: number): string {
  return `${near.toLocaleString('en-US', { maximumFractionDigits: 4 })} NEAR`
}

export function shortAddress(address: string): string {
  if (address.length <= 16) return address
  const dot = address.lastIndexOf('.')
  if (dot > 0) {
    const name = address.slice(0, dot)
    return name.length <= 12 ? address : `${name.slice(0, 6)}...${name.slice(-4)}${address.slice(dot)}`
  }
  return `${address.slice(0, 8)}...${address.slice(-6)}`
}

export function formatRelativeTime(nowMs: number, thenMs: number): string {
  const seconds = Math.max(0, Math.floor((nowMs - thenMs) / 1000))
  if (seconds < 10) return 'Just now'
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  return `${Math.floor(minutes / 60)}h ago`
}

export { formatNearCompact as formatMonCompact, formatNearExact as formatMonExact }
