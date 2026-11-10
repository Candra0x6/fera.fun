import { describe, expect, it } from 'vitest'
import { HOUSE_ROSTER, HOUSE_WALLETS, fundingByWallet, planLaunches, runSeedHouse, seedFor } from '../src/house'
import type { HouseChain, HouseState, LaunchPlanItem } from '../src/house'
import { createNearHouseChain } from '../src/houseChain'
import { houseAccountId, housePublicKey } from '../src/houseKeys'
import type { NearAccounts } from '../src/nearAccounts'
import type { NearCallResult, NearTransport } from '../src/nearPort'
import { TGAS } from '../src/nearPort'

const NEAR = 10n ** 24n
const TENTH = NEAR / 10n

describe('roster and plan', () => {
  it('has unique catalog-valid tickers the contract accepts', () => {
    expect(new Set(HOUSE_ROSTER.map((entry) => entry.ticker)).size).toBe(HOUSE_ROSTER.length)
    for (const entry of HOUSE_ROSTER) {
      expect(entry.ticker).toMatch(/^[A-Z0-9]{2,7}$/)
      expect(entry.name.length).toBeLessThanOrEqual(32)
    }
  })

  it('uses the minimum seed when the bounds are equal and never exceeds the maximum', () => {
    expect(seedFor(TENTH, TENTH)).toBe(TENTH)
    expect(seedFor(2n * TENTH, TENTH)).toBe(TENTH)
  })

  it('plans the first free roster entries up to the limit, one wallet each', () => {
    const plan = planLaunches({ minSeed: TENTH, maxSeed: TENTH, existingTickers: new Set(), freeSlots: 6, limit: 5 })
    expect(plan.map((item) => item.ticker)).toEqual(HOUSE_ROSTER.slice(0, 5).map((entry) => entry.ticker))
    expect(plan.map((item) => item.walletIndex)).toEqual([0, 1, 2, 3, 4])
    expect(HOUSE_WALLETS).toBe(5)
  })

  it('skips tickers already in the lobby and respects the free slots', () => {
    const plan = planLaunches({ minSeed: TENTH, maxSeed: TENTH, existingTickers: new Set(['MOOND']), freeSlots: 2, limit: 5 })
    expect(plan.map((item) => item.ticker)).toEqual(['FIRECAT', 'AQUA'])
  })

  it('sums the deposits per wallet plus the gas buffer', () => {
    const plan = planLaunches({ minSeed: TENTH, maxSeed: TENTH, existingTickers: new Set(), freeSlots: 6, limit: 2 })
    const funding = fundingByWallet(plan, TENTH, TENTH)
    expect([...funding.entries()]).toEqual([
      [0, 3n * TENTH],
      [1, 3n * TENTH]
    ])
  })
})

function fakeChain(existing: string[] = []): { chain: HouseChain; funded: Array<[number, bigint]>; launched: LaunchPlanItem[] } {
  const funded: Array<[number, bigint]> = []
  const launched: LaunchPlanItem[] = []
  const state: HouseState = {
    coins: existing.map((ticker, coinId) => ({ coinId, ticker, creator: 'x.testnet' })),
    minSeed: TENTH,
    maxSeed: TENTH,
    launchFee: TENTH,
    maxCoins: 6
  }
  return {
    funded,
    launched,
    chain: {
      readState: () => Promise.resolve(state),
      houseBalance: () => Promise.resolve(0n),
      fund(walletIndex, target) {
        funded.push([walletIndex, target])
        return Promise.resolve()
      },
      launch(item) {
        launched.push(item)
        return Promise.resolve(`TX-${item.ticker}`)
      }
    }
  }
}

describe('runSeedHouse concurrency', () => {
  function timed(options: { failTicker?: string } = {}) {
    const events: string[] = []
    let running = 0
    let peak = 0
    const perWallet = new Map<number, number>()
    let walletPeak = 0
    const chain: HouseChain = {
      readState: () => Promise.resolve({ coins: [], minSeed: TENTH, maxSeed: TENTH, launchFee: TENTH, maxCoins: 6 }),
      houseBalance: () => Promise.resolve(0n),
      async fund(walletIndex) {
        events.push(`fund${walletIndex}`)
        await new Promise<void>((resolve) => void setTimeout(resolve, 5))
      },
      async launch(item) {
        running += 1
        peak = Math.max(peak, running)
        perWallet.set(item.walletIndex, (perWallet.get(item.walletIndex) ?? 0) + 1)
        walletPeak = Math.max(walletPeak, perWallet.get(item.walletIndex) ?? 0)
        await new Promise<void>((resolve) => void setTimeout(resolve, 20))
        running -= 1
        perWallet.set(item.walletIndex, (perWallet.get(item.walletIndex) ?? 1) - 1)
        if (item.ticker === options.failTicker) throw new Error('launch refused')
        events.push(`launch${item.ticker}`)
        return `TX-${item.ticker}`
      }
    }
    return { chain, events, peak: () => peak, walletPeak: () => walletPeak }
  }

  it('launches the five coins in parallel and returns them in roster order', async () => {
    const t = timed()
    const started = Date.now()
    const result = await runSeedHouse({ chain: t.chain, gasBuffer: TENTH, limit: 5, log: () => undefined })
    expect(Date.now() - started).toBeLessThan(80)
    expect(t.peak()).toBe(5)
    expect(result.launched).toEqual(['MOOND', 'FIRECAT', 'AQUA', 'TITAN', 'VOLT'])
    expect(result.txHashes).toEqual(['TX-MOOND', 'TX-FIRECAT', 'TX-AQUA', 'TX-TITAN', 'TX-VOLT'])
  })

  it('keeps one launch in flight per wallet when a wallet holds two coins', async () => {
    const t = timed()
    const result = await runSeedHouse({ chain: t.chain, gasBuffer: TENTH, limit: 6, log: () => undefined })
    expect(result.launched).toHaveLength(6)
    expect(t.walletPeak()).toBe(1)
  })

  it('lets the other launches finish and then rethrows when one fails', async () => {
    const t = timed({ failTicker: 'AQUA' })
    const logs: string[] = []
    await expect(runSeedHouse({ chain: t.chain, gasBuffer: TENTH, limit: 5, log: (message) => logs.push(message) })).rejects.toThrow('launch refused')
    expect(t.events.filter((event) => event.startsWith('launch'))).toHaveLength(4)
    expect(logs).toContain('house launch partly failed')
  })
})

describe('runSeedHouse', () => {
  it('funds each wallet, launches in order and returns the hashes', async () => {
    const { chain, funded, launched } = fakeChain()
    const logs: string[] = []
    const result = await runSeedHouse({ chain, gasBuffer: TENTH, limit: 5, log: (message) => logs.push(message) })
    expect(result.launched).toEqual(['MOOND', 'FIRECAT', 'AQUA', 'TITAN', 'VOLT'])
    expect(result.txHashes[0]).toBe('TX-MOOND')
    expect(funded.map(([index]) => index)).toEqual([0, 1, 2, 3, 4])
    expect(launched).toHaveLength(5)
    expect(logs.filter((message) => message === 'launched house coin')).toHaveLength(5)
  })

  it('launches nothing when the lobby already holds the roster picks', async () => {
    const { chain, launched } = fakeChain(['MOOND', 'FIRECAT', 'AQUA', 'TITAN', 'VOLT'])
    const result = await runSeedHouse({ chain, gasBuffer: TENTH, limit: 5, log: () => undefined })
    expect(result.launched).toEqual(['SHADE'])
    expect(launched).toHaveLength(1)
  })
})

interface Ledger {
  accounts: NearAccounts
  balances: Map<string, bigint>
  created: Array<{ id: string; publicKey: string; amount: bigint }>
  transfers: Array<{ to: string; amount: bigint }>
}

function ledger(): Ledger {
  const balances = new Map<string, bigint>()
  const state: Ledger = {
    balances,
    created: [],
    transfers: [],
    accounts: {
      accountId: 'fera-seeder.testnet',
      exists: (id) => Promise.resolve(balances.has(id)),
      balance: (id) => Promise.resolve(balances.get(id) ?? 0n),
      transfer(to, amount) {
        state.transfers.push({ to, amount })
        balances.set(to, (balances.get(to) ?? 0n) + amount)
        return Promise.resolve('T')
      },
      waitFinal: () => Promise.resolve(),
      createAccount(id, publicKey, amount) {
        state.created.push({ id, publicKey, amount })
        balances.set(id, amount)
        return Promise.resolve('C')
      }
    }
  }
  return state
}

describe('createNearHouseChain', () => {
  const snapshot = {
    config: { minSeed: TENTH.toString(), maxSeed: TENTH.toString(), launchFee: TENTH.toString(), maxCoins: 6 },
    coins: [{ coinId: 0, ticker: 'MOOND', creator: 'h1.fera-seeder.testnet' }]
  }

  function build(ledgerState: Ledger, calls: Array<{ method: string; args: Record<string, unknown>; gas: bigint; deposit: bigint | undefined; wallet: number }>, result?: NearCallResult) {
    return createNearHouseChain({
      roundId: 4,
      arenaView: (method, args) => {
        if (method === 'get_arena_snapshot' && args['round_id'] === 4) return Promise.resolve(snapshot)
        return Promise.reject(new Error(`unexpected ${method}`))
      },
      seederAccounts: ledgerState.accounts,
      houseSeed: 'house-seed-long',
      retryDelayMs: 0,
      sleep: () => Promise.resolve(),
      transportFor: (wallet): NearTransport => ({
        accountId: houseAccountId(wallet, 'fera-seeder.testnet'),
        view: () => Promise.reject(new Error('not used')),
        head: () => Promise.reject(new Error('not used')),
        call(method, args, gas, deposit) {
          calls.push({ method, args, gas, deposit, wallet })
          return Promise.resolve(result ?? { kind: 'success', hash: 'LAUNCH', gasBurnt: 1n, blockTimestampSec: 1 })
        }
      })
    })
  }

  it('reads the lobby state from the arena snapshot', async () => {
    const chain = build(ledger(), [])
    expect(await chain.readState()).toEqual({
      coins: [{ coinId: 0, ticker: 'MOOND', creator: 'h1.fera-seeder.testnet' }],
      minSeed: TENTH,
      maxSeed: TENTH,
      launchFee: TENTH,
      maxCoins: 6
    })
  })

  it('creates a missing house sub-account with its derived key and the target balance', async () => {
    const l = ledger()
    await build(l, []).fund(2, 3n * TENTH)
    expect(l.created).toEqual([{ id: 'h3.fera-seeder.testnet', publicKey: housePublicKey('house-seed-long', 2), amount: 9n * TENTH }])
  })

  it('tops an existing account up to three rounds of funding and leaves a funded one alone', async () => {
    const l = ledger()
    l.balances.set('h1.fera-seeder.testnet', TENTH)
    l.balances.set('h2.fera-seeder.testnet', 5n * TENTH)
    const chain = build(l, [])
    await chain.fund(0, 3n * TENTH)
    await chain.fund(1, 3n * TENTH)
    expect(l.transfers).toEqual([{ to: 'h1.fera-seeder.testnet', amount: 8n * TENTH }])
  })

  it('launches from the house account with launchFee plus seed attached', async () => {
    const calls: Array<{ method: string; args: Record<string, unknown>; gas: bigint; deposit: bigint | undefined; wallet: number }> = []
    const chain = build(ledger(), calls)
    const item: LaunchPlanItem = { ticker: 'FIRECAT', name: 'FireCat On-Chain', monsterType: 0, skinId: 1, seed: TENTH, walletIndex: 1 }
    expect(await chain.launch(item, TENTH)).toBe('LAUNCH')
    expect(calls).toEqual([
      {
        method: 'launch_coin',
        args: { round_id: 4, name: 'FireCat On-Chain', ticker: 'FIRECAT', monster_type: 0, skin_id: 1 },
        gas: 30n * TGAS,
        deposit: 2n * TENTH,
        wallet: 1
      }
    ])
  })

  it('throws with the failure text when the launch is refused', async () => {
    const failure: NearCallResult = { kind: 'failure', hash: 'F', gasBurnt: 1n, blockTimestampSec: 1, message: 'ArenaError:BadSeed' }
    const chain = build(ledger(), [], failure)
    const item: LaunchPlanItem = { ticker: 'AQUA', name: 'Aqua Frost Wolf', monsterType: 1, skinId: 2, seed: TENTH, walletIndex: 2 }
    await expect(chain.launch(item, TENTH)).rejects.toThrow('ArenaError:BadSeed')
  })

  it('retries a launch that failed on the network and stops once the coin shows up in the lobby', async () => {
    let tries = 0
    const l = ledger()
    const chain = createNearHouseChain({
      roundId: 4,
      arenaView: () => Promise.resolve(snapshot),
      seederAccounts: l.accounts,
      houseSeed: 'house-seed-long',
      retryDelayMs: 0,
      sleep: () => Promise.resolve(),
      transportFor: (wallet): NearTransport => ({
        accountId: houseAccountId(wallet, 'fera-seeder.testnet'),
        view: () => Promise.reject(new Error('not used')),
        head: () => Promise.reject(new Error('not used')),
        call() {
          tries += 1
          if (tries < 3) return Promise.reject(new Error('Exceeded 4 providers to execute request'))
          return Promise.resolve({ kind: 'success', hash: 'RETRIED', gasBurnt: 1n, blockTimestampSec: 1 })
        }
      })
    })
    const item: LaunchPlanItem = { ticker: 'AQUA', name: 'Aqua Frost Wolf', monsterType: 1, skinId: 2, seed: TENTH, walletIndex: 2 }
    expect(await chain.launch(item, TENTH)).toBe('RETRIED')
    expect(tries).toBe(3)
    const landed: LaunchPlanItem = { ...item, ticker: 'MOOND', walletIndex: 0 }
    tries = 0
    expect(await chain.launch(landed, TENTH)).toBe('')
    expect(tries).toBe(1)
  })

  it('gives up after the configured attempts with the last network error', async () => {
    const chain = createNearHouseChain({
      roundId: 4,
      arenaView: () => Promise.resolve(snapshot),
      seederAccounts: ledger().accounts,
      houseSeed: 'house-seed-long',
      attempts: 2,
      retryDelayMs: 0,
      sleep: () => Promise.resolve(),
      transportFor: (wallet): NearTransport => ({
        accountId: houseAccountId(wallet, 'fera-seeder.testnet'),
        view: () => Promise.reject(new Error('not used')),
        head: () => Promise.reject(new Error('not used')),
        call: () => Promise.reject(new Error('rpc down'))
      })
    })
    const item: LaunchPlanItem = { ticker: 'AQUA', name: 'Aqua Frost Wolf', monsterType: 1, skinId: 2, seed: TENTH, walletIndex: 2 }
    await expect(chain.launch(item, TENTH)).rejects.toThrow('rpc down')
  })
})
