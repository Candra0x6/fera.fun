import { describe, expect, it } from 'vitest'
import { readConfig } from './config'
import { launchBlocker, sanitizeTickerInput } from './launchRules'
import type { LaunchInput } from './launchRules'
import { powerRating } from './power'
import { deadlineMsFrom, minOutWithSlippage, parseNearInput, parseTokenInput } from './slippage'
import { formatClock, lobbySecondsLeft, lockdownPhase, nextLockSecondsLeft, seedTimeoutSecondsLeft } from './timers'

const base: LaunchInput = {
  name: 'Solar',
  ticker: 'SOLAR',
  seedNear: '0.1',
  minSeedNear: 0.1,
  maxSeedNear: 0.5,
  phase: 'Lobby',
  coinCount: 3,
  maxCoins: 6,
  launchedByMe: 0,
  connected: true,
  balanceNear: 2,
  launchFeeNear: 0.1
}

describe('launchBlocker', () => {
  it('accepts a valid launch', () => {
    expect(launchBlocker(base)).toBeNull()
  })
  it('reports the first blocking reason', () => {
    expect(launchBlocker({ ...base, phase: 'Leveling' })).toBe('Lobby only')
    expect(launchBlocker({ ...base, connected: false })).toBe('Connect a wallet first')
    expect(launchBlocker({ ...base, coinCount: 6 })).toBe('Arena full (6 / 6)')
    expect(launchBlocker({ ...base, launchedByMe: 2 })).toBe('Limit of 2 coins per account')
    expect(launchBlocker({ ...base, name: '  ' })).toBe('Name must be 1 to 28 characters')
    expect(launchBlocker({ ...base, ticker: 'A' })).toBe('Ticker must be 2 to 7 letters or digits')
    expect(launchBlocker({ ...base, seedNear: '0.01' })).toBe('Minimum seed is 0.1 NEAR')
    expect(launchBlocker({ ...base, seedNear: '0.6' })).toBe('Maximum seed is 0.5 NEAR')
    expect(launchBlocker({ ...base, balanceNear: 0.15 })).toBe('Balance too low')
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
  it('sets the deadline 120 seconds ahead in milliseconds', () => {
    expect(deadlineMsFrom(1_000_900.9)).toBe(1_120_900)
  })
  it('parses NEAR input to yocto', () => {
    expect(parseNearInput('1.5')).toBe(1_500_000_000_000_000_000_000_000n)
    expect(parseNearInput('0.1')).toBe(100_000_000_000_000_000_000_000n)
    expect(parseNearInput('0')).toBeNull()
    expect(parseNearInput('abc')).toBeNull()
    expect(parseNearInput('1.0000000000000000000000001')).toBeNull()
  })
  it('parses token input with 18 decimals', () => {
    expect(parseTokenInput('1.5')).toBe(1_500_000_000_000_000_000n)
    expect(parseTokenInput('1.0000000000000000001')).toBeNull()
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
  it('falls back to the deployed testnet arena and the public fastnear endpoints', () => {
    const config = readConfig({})
    expect(config.network).toBe('testnet')
    expect(config.arena).toBe('fera-arena.testnet')
    expect(config.roundId).toBeNull()
    expect(config.keeperUrl).toBeNull()
    expect(config.rpcUrls).toEqual([
      'https://test.rpc.fastnear.com',
      'https://rpc.testnet.fastnear.com',
      'https://near-testnet.drpc.org',
      'https://rpc.testnet.near.org'
    ])
  })
  it('reads the VITE variables', () => {
    const config = readConfig({
      VITE_NEAR_NETWORK: 'testnet',
      VITE_ARENA_ACCOUNT: 'my-arena.testnet',
      VITE_RPC_URLS: 'https://a.example, https://b.example',
      VITE_ROUND_ID: '2',
      VITE_KEEPER_URL: 'http://127.0.0.1:8787/'
    })
    expect(config).toMatchObject({ arena: 'my-arena.testnet', roundId: 2, keeperUrl: 'http://127.0.0.1:8787' })
    expect(config.rpcUrls).toEqual(['https://a.example', 'https://b.example'])
  })
  it('ignores a malformed arena account and unusable rpc urls', () => {
    const config = readConfig({ VITE_ARENA_ACCOUNT: 'NOPE!', VITE_RPC_URLS: 'not-a-url' })
    expect(config.arena).toBe('fera-arena.testnet')
    expect(config.rpcUrls).toHaveLength(4)
  })
})
