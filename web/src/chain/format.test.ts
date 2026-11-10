import { describe, expect, it } from 'vitest'
import { formatNearCompact, formatNearExact, formatNearPlain, formatRelativeTime, formatTokenUnits, shortAddress, tokensToNumber, yoctoToNear, yoctoToNumber } from './format'

describe('formatters', () => {
  it('converts yocto strings to NEAR', () => {
    expect(yoctoToNear('1000000000000000000000000')).toBe(1)
    expect(yoctoToNear('12400000000000000000000000000')).toBe(12400)
    expect(yoctoToNear('100000000000000000000000')).toBe(0.1)
    expect(yoctoToNear('0')).toBe(0)
  })

  it('converts bigint amounts with the right decimals', () => {
    expect(yoctoToNumber(2_500_000_000_000_000_000_000_000n)).toBe(2.5)
    expect(tokensToNumber(1_500_000_000_000_000_000n)).toBe(1.5)
    expect(formatTokenUnits(1_500_000_000_000_000_000n)).toBe('1.5')
    expect(formatTokenUnits(3_000_000_000_000_000_000n)).toBe('3')
  })

  it('formats compact reserves with the NEAR symbol', () => {
    expect(formatNearCompact(12400)).toBe('12.4K NEAR')
    expect(formatNearCompact(2_500_000)).toBe('2.5M NEAR')
    expect(formatNearCompact(240.55)).toBe('240.6 NEAR')
    expect(formatNearCompact(4.5)).toBe('4.50 NEAR')
    expect(formatNearCompact(0.1)).toBe('0.100 NEAR')
  })

  it('formats plain amounts without the symbol', () => {
    expect(formatNearPlain(8.0095)).toBe('8.01')
    expect(formatNearPlain(2400)).toBe('2.4K')
    expect(formatNearPlain(0.045)).toBe('0.045')
  })

  it('formats exact reserves with grouping', () => {
    expect(formatNearExact(12400.12345)).toBe('12,400.1235 NEAR')
  })

  it('shortens account ids', () => {
    expect(shortAddress('fera-1a2b3c4d5e.testnet')).toBe('fera-1...4d5e.testnet')
    expect(shortAddress('alice.testnet')).toBe('alice.testnet')
    expect(shortAddress('Dx3mGS9zyhZacu9buGxCVtZFkPBejCtRmpmRbD7XYEuC')).toBe('Dx3mGS9z...7XYEuC')
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
