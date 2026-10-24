import { describe, expect, it } from 'vitest'
import { formatMonCompact, formatMonExact, formatMonPlain, formatRelativeTime, shortAddress, weiToMon } from './format'

describe('formatters', () => {
  it('converts wei strings to MON', () => {
    expect(weiToMon('1000000000000000000')).toBe(1)
    expect(weiToMon('12400000000000000000000')).toBe(12400)
    expect(weiToMon('500000000000000000')).toBe(0.5)
    expect(weiToMon('0')).toBe(0)
  })

  it('formats compact reserves with the MON symbol', () => {
    expect(formatMonCompact(12400)).toBe('12.4K MON')
    expect(formatMonCompact(2_500_000)).toBe('2.5M MON')
    expect(formatMonCompact(240.55)).toBe('240.6 MON')
    expect(formatMonCompact(4.5)).toBe('4.50 MON')
  })

  it('formats plain amounts without the symbol', () => {
    expect(formatMonPlain(8.0095)).toBe('8.01')
    expect(formatMonPlain(2400)).toBe('2.4K')
  })

  it('formats exact reserves with grouping', () => {
    expect(formatMonExact(12400.12345)).toBe('12,400.1235 MON')
  })

  it('shortens addresses', () => {
    expect(shortAddress('0x03f8d54454432355131e3f321a7db693543b4fc6')).toBe('0x03f8...4fc6')
    expect(shortAddress('0x1234')).toBe('0x1234')
  })

  it('formats relative time in steps', () => {
    const now = 1_000_000
    expect(formatRelativeTime(now, now - 2_000)).toBe('Just now')
    expect(formatRelativeTime(now, now - 30_000)).toBe('30s ago')
    expect(formatRelativeTime(now, now - 5 * 60_000)).toBe('5m ago')
    expect(formatRelativeTime(now, now - 3 * 3_600_000)).toBe('3h ago')
    expect(formatRelativeTime(now, now + 5_000)).toBe('Just now')
  })
})
