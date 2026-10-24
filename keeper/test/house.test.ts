import { describe, expect, it } from 'vitest'
import { english, generateMnemonic, generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { elementOf, skinById } from '@animal/shared'
import type { Hex } from '@animal/shared'
import { houseAccountFactory } from '../src/houseChain'
import {
  BLOCKS_BETWEEN_LAUNCHES,
  COINS_PER_HOUSE_WALLET,
  HOUSE_ROSTER,
  fundingByWallet,
  planLaunches,
  runSeedHouse,
  seedFor
} from '../src/house'
import type { HouseChain, HouseCoinOnChain, LaunchPlanItem } from '../src/house'

const ETH = 10n ** 18n
const MIN_SEED = 2n * ETH
const MAX_SEED = 50n * ETH

describe('house roster', () => {
  it('has the 12 prototype coins with valid tickers, monsters and skins', () => {
    expect(HOUSE_ROSTER.map((r) => r.ticker)).toEqual([
      'MOOND', 'FIRECAT', 'AQUA', 'TITAN', 'VOLT', 'SHADE', 'DRACO', 'GLACIER', 'KITSUNE', 'CRAG', 'UMBRA', 'PYRO'
    ])
    for (const entry of HOUSE_ROSTER) {
      expect(entry.ticker).toMatch(/^[A-Z0-9]{2,7}$/)
      expect(entry.name.length).toBeLessThanOrEqual(32)
      expect(elementOf(entry.monsterType)).toBeDefined()
      expect(skinById(entry.skinId)).toBeDefined()
    }
    const byTicker = Object.fromEntries(HOUSE_ROSTER.map((r) => [r.ticker, [r.monsterType, r.skinId]]))
    expect(byTicker['MOOND']).toEqual([0, 2])
    expect(byTicker['SHADE']).toEqual([4, 4])
    expect(byTicker['AQUA']).toEqual([1, 3])
  })
})

describe('launch plan', () => {
  it('uses differing seeds inside the configured bounds', () => {
    const plan = planLaunches({ minSeed: MIN_SEED, maxSeed: MAX_SEED, existingTickers: new Set(), freeSlots: 30 })
    expect(plan).toHaveLength(12)
    const seeds = plan.map((p) => p.seed)
    expect(new Set(seeds).size).toBe(12)
    for (const seed of seeds) {
      expect(seed >= MIN_SEED && seed <= MAX_SEED).toBe(true)
    }
    expect(seeds[0]).toBe(12n * ETH)
    expect(seeds[11]).toBe(2n * ETH)
  })

  it('clamps to maxSeed and to minSeed', () => {
    expect(seedFor(0, 10n * ETH, 20n * ETH)).toBe(20n * ETH)
    expect(seedFor(11, 10n * ETH, 20n * ETH)).toBe(10n * ETH)
  })

  it('gives each wallet at most two coins', () => {
    const plan = planLaunches({ minSeed: MIN_SEED, maxSeed: MAX_SEED, existingTickers: new Set(), freeSlots: 30 })
    const perWallet = new Map<number, number>()
    for (const item of plan) perWallet.set(item.walletIndex, (perWallet.get(item.walletIndex) ?? 0) + 1)
    expect(perWallet.size).toBe(6)
    expect([...perWallet.values()].every((n) => n <= COINS_PER_HOUSE_WALLET)).toBe(true)
  })

  it('skips tickers that are already launched and respects the free slots', () => {
    const plan = planLaunches({ minSeed: MIN_SEED, maxSeed: MAX_SEED, existingTickers: new Set(['MOOND', 'AQUA']), freeSlots: 3 })
    expect(plan.map((p) => p.ticker)).toEqual(['FIRECAT', 'TITAN', 'VOLT'])
  })

  it('sums the launch fee, seeds and a gas buffer per wallet', () => {
    const plan = planLaunches({ minSeed: MIN_SEED, maxSeed: MAX_SEED, existingTickers: new Set(), freeSlots: 30 })
    const funding = fundingByWallet(plan, ETH, ETH / 2n)
    expect(funding.get(0)).toBe(ETH / 2n + (ETH + 12n * ETH) + (ETH + 11n * ETH))
    expect(funding.size).toBe(6)
  })
})

function fakeChain(initial: HouseCoinOnChain[] = []) {
  const coins = [...initial]
  const journal: string[] = []
  const funded: Array<[number, bigint]> = []
  const chain: HouseChain = {
    readState: () =>
      Promise.resolve({ coins: [...coins], minSeed: MIN_SEED, maxSeed: MAX_SEED, launchFee: ETH, maxCoins: 30 }),
    ensureReserve: () => {
      journal.push('reserve')
      return Promise.resolve(0n)
    },
    fund: (walletIndex, amount) => {
      journal.push(`fund:${walletIndex}`)
      funded.push([walletIndex, amount])
      return Promise.resolve()
    },
    launch: (item: LaunchPlanItem) => {
      journal.push(`launch:${item.ticker}`)
      coins.push({ coinId: coins.length, ticker: item.ticker, token: `0x${(coins.length + 1).toString(16).padStart(40, '0')}` as Hex })
      return Promise.resolve()
    },
    waitBlocks: (count) => {
      journal.push(`wait:${count}`)
      return Promise.resolve()
    }
  }
  return { chain, journal, funded, coins }
}

describe('runSeedHouse', () => {
  it('funds first, launches one coin per four blocks and returns public addresses only', async () => {
    const { chain, journal, funded } = fakeChain()
    const result = await runSeedHouse({ chain, roundId: 1, gasBuffer: ETH / 2n, log: () => undefined })
    expect(result.launched).toHaveLength(12)
    expect(result.skipped).toEqual([])
    const firstLaunch = journal.findIndex((entry) => entry.startsWith('launch:'))
    expect(journal[0]).toBe('reserve')
    expect(journal.slice(1, firstLaunch).every((entry) => entry.startsWith('fund:'))).toBe(true)
    expect(funded).toHaveLength(6)
    const launches = journal.filter((entry) => entry.startsWith('launch:') || entry.startsWith('wait:'))
    for (let i = 0; i < launches.length; i += 2) {
      expect(launches[i]?.startsWith('launch:')).toBe(true)
      expect(launches[i + 1]).toBe(`wait:${BLOCKS_BETWEEN_LAUNCHES}`)
    }
    expect(result.entries).toHaveLength(12)
    expect(result.entries[0]).toEqual({ roundId: 1, coinId: 0, ticker: 'MOOND', token: `0x${'1'.padStart(40, '0')}` })
    expect(Object.keys(result.entries[0] ?? {}).sort()).toEqual(['coinId', 'roundId', 'ticker', 'token'])
  })

  it('is idempotent per ticker: a second run launches nothing and funds nothing', async () => {
    const { chain, journal } = fakeChain()
    await runSeedHouse({ chain, roundId: 1, gasBuffer: ETH / 2n, log: () => undefined })
    journal.length = 0
    const again = await runSeedHouse({ chain, roundId: 1, gasBuffer: ETH / 2n, log: () => undefined })
    expect(again.launched).toEqual([])
    expect(again.skipped).toHaveLength(12)
    expect(journal).toEqual(['reserve'])
    expect(again.entries).toHaveLength(12)
  })

  it('tops up only the missing coins after a partial run and ignores foreign coins in the file', async () => {
    const { chain } = fakeChain([
      { coinId: 0, ticker: 'MOOND', token: `0x${'a'.repeat(40)}` },
      { coinId: 1, ticker: 'PLAYER', token: `0x${'b'.repeat(40)}` }
    ])
    const result = await runSeedHouse({ chain, roundId: 2, gasBuffer: ETH / 2n, log: () => undefined })
    expect(result.launched).toHaveLength(11)
    expect(result.skipped).toEqual(['MOOND'])
    expect(result.entries.map((e) => e.ticker)).not.toContain('PLAYER')
    expect(result.entries.every((e) => e.roundId === 2)).toBe(true)
  })

  it('stops planning when the lobby has no free slot', async () => {
    const coins: HouseCoinOnChain[] = Array.from({ length: 30 }, (_, i) => ({
      coinId: i,
      ticker: `P${i}`,
      token: `0x${(i + 1).toString(16).padStart(40, '0')}` as Hex
    }))
    const { chain } = fakeChain(coins)
    const result = await runSeedHouse({ chain, roundId: 1, gasBuffer: ETH, log: () => undefined })
    expect(result.launched).toEqual([])
  })
})

describe('house wallets', () => {
  it('derives deterministic accounts from a mnemonic and warns through the ephemeral flag otherwise', () => {
    const mnemonic = generateMnemonic(english)
    const derived = houseAccountFactory(mnemonic, () => privateKeyToAccount(generatePrivateKey()))
    expect(derived.ephemeral).toBe(false)
    expect(derived.account(0).address).toBe(derived.account(0).address)
    expect(derived.account(0).address).not.toBe(derived.account(1).address)
    const ephemeral = houseAccountFactory(null, () => privateKeyToAccount(generatePrivateKey()))
    expect(ephemeral.ephemeral).toBe(true)
    expect(ephemeral.account(3).address).toBe(ephemeral.account(3).address)
    expect(ephemeral.account(3).address).not.toBe(ephemeral.account(4).address)
  })
})
