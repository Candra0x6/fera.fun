import { describe, expect, it } from 'vitest'
import { readConfig } from './config'
import { launchBlocker, sanitizeTickerInput } from './launchRules'
import type { LaunchInput } from './launchRules'
import { powerRating } from './power'
import { deadlineFrom, minOutWithSlippage, parseMonInput } from './slippage'
import { formatClock, lobbySecondsLeft, lockdownPhase, nextLockSecondsLeft, seedTimeoutSecondsLeft } from './timers'

const base: LaunchInput = {
  name: 'Solar',
  ticker: 'SOLAR',
  seedMon: '5',
  minSeedMon: 2,
  maxSeedMon: 50,
  phase: 'Lobby',
  coinCount: 12,
  maxCoins: 30,
  launchedByMe: 0,
  connected: true,
  chainOk: true,
  balanceMon: 20,
  launchFeeMon: 1
}

describe('launchBlocker', () => {
  it('accepts a valid launch', () => {
    expect(launchBlocker(base)).toBeNull()
  })
  it('reports the first blocking reason', () => {
    expect(launchBlocker({ ...base, phase: 'Leveling' })).toBe('Lobby only')
    expect(launchBlocker({ ...base, connected: false })).toBe('Connect a wallet first')
    expect(launchBlocker({ ...base, chainOk: false })).toBe('Switch to Monad Testnet')
    expect(launchBlocker({ ...base, reserveFunded: false })).toBe('Reserve not funded yet')
    expect(launchBlocker({ ...base, coinCount: 30 })).toBe('Arena full (30 / 30)')
    expect(launchBlocker({ ...base, launchedByMe: 2 })).toBe('Limit of 2 coins per address')
    expect(launchBlocker({ ...base, name: '  ' })).toBe('Name must be 1 to 28 characters')
    expect(launchBlocker({ ...base, ticker: 'A' })).toBe('Ticker must be 2 to 7 letters or digits')
    expect(launchBlocker({ ...base, seedMon: '1' })).toBe('Minimum seed is 2 MON')
    expect(launchBlocker({ ...base, seedMon: '51' })).toBe('Maximum seed is 50 MON')
    expect(launchBlocker({ ...base, balanceMon: 3 })).toBe('Balance too low')
  })
  it('sanitises tickers', () => {
    expect(sanitizeTickerInput('so-lar_9!x')).toBe('SOLAR9X')
    expect(sanitizeTickerInput('abcdefghij')).toBe('ABCDEFG')
  })
})

describe('slippage helpers', () => {
  it('applies five percent slippage by default', () => {
    expect(minOutWithSlippage(1000n)).toBe(950n)
    expect(minOutWithSlippage(1000n, 100)).toBe(990n)
    expect(minOutWithSlippage(0n)).toBe(1n)
    expect(minOutWithSlippage(1n)).toBe(1n)
  })
  it('sets the deadline 120 seconds ahead', () => {
    expect(deadlineFrom(1000.9)).toBe(1120n)
  })
  it('parses MON input to wei', () => {
    expect(parseMonInput('1.5')).toBe(1_500_000_000_000_000_000n)
    expect(parseMonInput('0')).toBeNull()
    expect(parseMonInput('abc')).toBeNull()
    expect(parseMonInput('1.0000000000000000001')).toBeNull()
  })
})

describe('timers', () => {
  it('counts down and clamps at zero', () => {
    expect(lobbySecondsLeft(100, 120, 150)).toBe(70)
    expect(lobbySecondsLeft(100, 120, 500)).toBe(0)
    expect(nextLockSecondsLeft(100, 20, 110.2)).toBe(10)
    expect(seedTimeoutSecondsLeft(100, 60, 130)).toBe(30)
  })
  it('derives the lockdown phase', () => {
    expect(lockdownPhase(false, true)).toBe('idle')
    expect(lockdownPhase(true, false)).toBe('seed-wait')
    expect(lockdownPhase(true, true)).toBe('resolving')
  })
  it('formats clocks', () => {
    expect(formatClock(75)).toBe('01:15')
    expect(formatClock(-3)).toBe('00:00')
  })
})

describe('powerRating', () => {
  const common = { baseStat: 10000, levelBonusBps: 400, gammaBps: 8500, poolFactorMinBps: 1000, poolFactorMaxBps: 100000 }
  it('is 1 for an average coin at level 1', () => {
    expect(powerRating({ ...common, level: 1, rMonAtLock: 10, meanRMonAlive: 10 })).toBeCloseTo(1)
  })
  it('rises with level and reserve and clamps the pool factor', () => {
    const average = powerRating({ ...common, level: 1, rMonAtLock: 10, meanRMonAlive: 10 })
    expect(powerRating({ ...common, level: 5, rMonAtLock: 10, meanRMonAlive: 10 })).toBeGreaterThan(average)
    expect(powerRating({ ...common, level: 1, rMonAtLock: 20, meanRMonAlive: 10 })).toBeGreaterThan(average)
    expect(powerRating({ ...common, level: 1, rMonAtLock: 0, meanRMonAlive: 10 })).toBeCloseTo(0.1)
  })
})

describe('readConfig', () => {
  it('falls back to the public Monad testnet endpoints', () => {
    const config = readConfig({})
    expect(config.chainId).toBe(10143)
    expect(config.arena).toBeNull()
    expect(config.roundId).toBeNull()
    expect(config.httpUrls.length).toBeGreaterThan(0)
  })
  it('reads the VITE variables', () => {
    const config = readConfig({
      VITE_CHAIN_ID: '31337',
      VITE_RPC_HTTP_URL: 'http://127.0.0.1:8545',
      VITE_RPC_WS_URL: 'ws://127.0.0.1:8545',
      VITE_ARENA_ADDRESS: '0x5FbDB2315678afecb367f032d93F642f64180aa3',
      VITE_ROUND_ID: '2',
      VITE_KEEPER_URL: 'http://127.0.0.1:8787/'
    })
    expect(config).toMatchObject({ chainId: 31337, roundId: 2, keeperUrl: 'http://127.0.0.1:8787' })
    expect(config.httpUrls).toEqual(['http://127.0.0.1:8545'])
    expect(config.arena).toBe('0x5FbDB2315678afecb367f032d93F642f64180aa3')
  })
  it('ignores a malformed arena address', () => {
    expect(readConfig({ VITE_ARENA_ADDRESS: 'nope' }).arena).toBeNull()
  })
})
