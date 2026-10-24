const WEI_PER_MON = 10n ** 18n

export function weiToMon(wei: string): number {
  const value = BigInt(wei)
  const whole = value / WEI_PER_MON
  const fraction = value % WEI_PER_MON
  return Number(whole) + Number(fraction) / 1e18
}

export function formatMonCompact(mon: number): string {
  const abs = Math.abs(mon)
  if (abs >= 1_000_000) return `${(mon / 1_000_000).toFixed(1)}M MON`
  if (abs >= 1_000) return `${(mon / 1_000).toFixed(1)}K MON`
  if (abs >= 100) return `${mon.toFixed(1)} MON`
  return `${mon.toFixed(2)} MON`
}

export function formatMonPlain(mon: number): string {
  const abs = Math.abs(mon)
  if (abs >= 1_000_000) return `${(mon / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000) return `${(mon / 1_000).toFixed(1)}K`
  return mon.toFixed(2)
}

export function formatMonExact(mon: number): string {
  return `${mon.toLocaleString('en-US', { maximumFractionDigits: 4 })} MON`
}

export function shortAddress(address: string): string {
  if (address.length <= 12) return address
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

export function formatRelativeTime(nowMs: number, thenMs: number): string {
  const seconds = Math.max(0, Math.floor((nowMs - thenMs) / 1000))
  if (seconds < 10) return 'Just now'
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  return `${Math.floor(minutes / 60)}h ago`
}
