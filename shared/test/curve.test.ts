import { describe, expect, it } from 'vitest'
import { applyBoost, launchSeedState, quoteBuy, quoteSell, splitLoss } from '../src/curve'
import { ceilDiv, clampBig, parseDecimal } from '../src/math'

const E18 = 10n ** 18n
const fresh = { vMon: 20n * E18, vTok: 1_000_000_000n * E18, rMon: 0n }

describe('curve math', () => {
  it('rounds in favour of the pool on buy then sell', () => {
    const bought = quoteBuy(fresh, 5n * E18, 100n)
    const sold = quoteSell(bought.next, bought.tokensOut, 100n)
    expect(sold.monOut < 5n * E18).toBe(true)
    expect(sold.next.vMon * sold.next.vTok >= fresh.vMon * fresh.vTok).toBe(true)
  })

  it('keeps k from decreasing through a buy', () => {
    const quote = quoteBuy(fresh, 7n * E18 + 13n, 100n)
    expect(quote.next.vMon * quote.next.vTok >= fresh.vMon * fresh.vTok).toBe(true)
    expect(quote.next.rMon).toBe(7n * E18 + 13n - quote.fee)
  })

  it('boost is a virtual buy-and-burn with vTok = ceil(k / vMon)', () => {
    const start = quoteBuy(fresh, 9n * E18, 100n).next
    const k = start.vMon * start.vTok
    const boosted = applyBoost(start, 3n * E18 + 7n)
    expect(boosted.vMon).toBe(start.vMon + 3n * E18 + 7n)
    expect(boosted.vTok).toBe(ceilDiv(k, boosted.vMon))
    expect(boosted.rMon).toBe(start.rMon + 3n * E18 + 7n)
    expect(boosted.vTok < start.vTok).toBe(true)
  })

  it('splits a loss 50/30/15/5 with the remainder to the treasury', () => {
    const split = splitLoss(10n * E18 + 3n)
    expect(split.boost + split.consolation + split.toPot + split.toTreasury).toBe(10n * E18 + 3n)
    expect(split.boost).toBe(((10n * E18 + 3n) * 5000n) / 10000n)
    expect(split.consolation).toBe(((10n * E18 + 3n) * 3000n) / 10000n)
    expect(split.toPot).toBe(((10n * E18 + 3n) * 1500n) / 10000n)
  })

  it('derives the launch state from the seed', () => {
    const seeded = launchSeedState(20n * E18, 1_000_000_000n * E18, 5n * E18)
    expect(seeded.rMon).toBe(5n * E18)
    expect(seeded.vMon).toBe(25n * E18)
    expect(seeded.supply).toBe(1_000_000_000n * E18 - seeded.vTok)
  })

  it('helpers behave at the edges', () => {
    expect(ceilDiv(10n, 3n)).toBe(4n)
    expect(ceilDiv(9n, 3n)).toBe(3n)
    expect(() => ceilDiv(1n, 0n)).toThrow(RangeError)
    expect(clampBig(5n, 1n, 3n)).toBe(3n)
    expect(clampBig(0n, 1n, 3n)).toBe(1n)
    expect(parseDecimal('42')).toBe(42n)
    expect(() => parseDecimal('4.2')).toThrow(RangeError)
  })
})
