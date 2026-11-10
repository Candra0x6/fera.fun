import { describe, expect, it } from 'vitest'
import { DEFAULT_GAS, arenaErrorName, createNearArenaPort } from '../src/nearPort'
import type { NearCallResult, NearHead, NearTransport } from '../src/nearPort'
import { createKeeperLoop } from '../src/loop'
import { recordingLogger } from './fakeArena'

const CONFIG = {
  minCoins: 6,
  maxCoins: 6,
  lobbySeconds: 10800,
  levelingEpochs: 1,
  epochSeconds: 14,
  maxRoundSeconds: 3600,
  clashesPerEpoch: 2,
  minSeedBlocks: 3,
  launchFee: '100000000000000000000000'
}

const ROUND = {
  roundId: 1,
  phase: 'Leveling',
  locked: false,
  epoch: 0,
  coinCount: 6,
  aliveCount: 6,
  cancelStreak: 0,
  winnerCoinId: 0,
  createdAt: 1000,
  startedAt: 1100,
  lockedAt: 0,
  lastEpochResolvedAt: 0,
  prizePot: '0',
  treasury: '4200000000000000000000000',
  redeemPool: '0',
  redeemSupply: '0',
  clashesPlayed: 0,
  lockHeight: 0
}

interface Recorded {
  method: string
  args: Record<string, unknown>
  gas: bigint
}

function transport(overrides: {
  round?: () => unknown
  config?: () => unknown
  head?: () => NearHead
  call?: (method: string) => NearCallResult | Error
} = {}): { value: NearTransport; calls: Recorded[]; peak: () => number } {
  const calls: Recorded[] = []
  let inFlight = 0
  let peak = 0
  const value: NearTransport = {
    accountId: 'fera-keeper.testnet',
    view(method) {
      if (method === 'get_round') {
        const result = overrides.round?.() ?? ROUND
        if (result instanceof Error) return Promise.reject(result)
        return Promise.resolve(result)
      }
      if (method === 'get_config') return Promise.resolve(overrides.config?.() ?? CONFIG)
      return Promise.reject(new Error(`unexpected view ${method}`))
    },
    head: () => Promise.resolve(overrides.head?.() ?? { height: 9000, timestampSec: 1_760_000_000 }),
    async call(method, args, gas) {
      inFlight += 1
      peak = Math.max(peak, inFlight)
      calls.push({ method, args, gas })
      await Promise.resolve()
      inFlight -= 1
      const outcome = overrides.call?.(method) ?? {
        kind: 'success' as const,
        hash: 'HASH1',
        gasBurnt: 55_000_000_000_000n,
        blockTimestampSec: 1_760_000_007
      }
      if (outcome instanceof Error) throw outcome
      return outcome
    }
  }
  return { value, calls, peak: () => peak }
}

describe('reads', () => {
  it('parses a round view into RoundState with a bigint treasury', async () => {
    const port = createNearArenaPort({ transport: transport().value })
    expect(await port.readRound(1)).toEqual({
      phase: 'Leveling',
      locked: false,
      epoch: 0,
      coinCount: 6,
      aliveCount: 6,
      createdAt: 1000,
      startedAt: 1100,
      lockedAt: 0,
      lastEpochResolvedAt: 0,
      lockHeight: 0,
      treasury: 4_200_000_000_000_000_000_000_000n
    })
  })

  it('maps an UnknownRound panic to phase None and rethrows every other error', async () => {
    const missing = createNearArenaPort({
      transport: transport({ round: () => new Error('Smart contract panicked: ArenaError:UnknownRound') }).value
    })
    expect((await missing.readRound(9)).phase).toBe('None')
    const down = createNearArenaPort({ transport: transport({ round: () => new Error('rpc down') }).value })
    await expect(down.readRound(1)).rejects.toThrow('rpc down')
  })

  it('rejects a malformed round or config instead of guessing', async () => {
    const badRound = createNearArenaPort({ transport: transport({ round: () => ({ ...ROUND, epoch: 'x' }) }).value })
    await expect(badRound.readRound(1)).rejects.toThrow()
    const badConfig = createNearArenaPort({ transport: transport({ config: () => ({ minCoins: 6 }) }).value })
    await expect(badConfig.readParams(1)).rejects.toThrow()
  })

  it('reads the params the loop needs', async () => {
    const port = createNearArenaPort({ transport: transport().value })
    expect(await port.readParams(1)).toEqual({
      minCoins: 6,
      maxCoins: 6,
      lobbySeconds: 10800,
      levelingEpochs: 1,
      epochSeconds: 14,
      maxRoundSeconds: 3600,
      clashesPerEpoch: 2,
      minSeedBlocks: 3
    })
  })

  it('returns the head height and timestamp in seconds', async () => {
    const port = createNearArenaPort({ transport: transport({ head: () => ({ height: 123, timestampSec: 456 }) }).value })
    expect(await port.latestHeight()).toBe(123)
    expect(await port.latestTimestamp()).toBe(456)
    expect(port.account).toBe('fera-keeper.testnet')
  })
})

describe('send', () => {
  it('maps each call to its method, arguments and gas', async () => {
    const t = transport()
    const port = createNearArenaPort({ transport: t.value })
    await port.send({ fn: 'startRound', roundId: 2 })
    await port.send({ fn: 'lockEpoch', roundId: 2 })
    await port.send({ fn: 'resolveEpoch', roundId: 2, maxClashes: 4 })
    await port.send({ fn: 'abortRound', roundId: 2 })
    expect(t.calls).toEqual([
      { method: 'start_round', args: { round_id: 2 }, gas: DEFAULT_GAS.startRound },
      { method: 'lock_epoch', args: { round_id: 2 }, gas: DEFAULT_GAS.lockEpoch },
      { method: 'resolve_epoch', args: { round_id: 2, max_clashes: 4 }, gas: DEFAULT_GAS.resolveEpoch },
      { method: 'abort_round', args: { round_id: 2 }, gas: DEFAULT_GAS.abortRound }
    ])
    expect(DEFAULT_GAS.resolveEpoch).toBe(100_000_000_000_000n)
  })

  it('applies a gas override from the deployment record', async () => {
    const t = transport()
    const port = createNearArenaPort({ transport: t.value, gas: { resolveEpoch: 150_000_000_000_000n } })
    await port.send({ fn: 'resolveEpoch', roundId: 1, maxClashes: 2 })
    expect(t.calls[0]?.gas).toBe(150_000_000_000_000n)
  })

  it('reports a successful transaction as mined', async () => {
    const port = createNearArenaPort({ transport: transport().value })
    expect(await port.send({ fn: 'lockEpoch', roundId: 1 })).toEqual({
      kind: 'mined',
      hash: 'HASH1',
      status: 'success',
      gasUsed: 55_000_000_000_000n,
      gasLimit: DEFAULT_GAS.lockEpoch,
      blockTimestamp: 1_760_000_007
    })
  })

  it('treats an ArenaError panic as a skipped call', async () => {
    const message = 'Action #0: Smart contract panicked: ArenaError:EpochTooEarly'
    const t = transport({ call: () => ({ kind: 'failure', hash: 'H', gasBurnt: 1n, blockTimestampSec: 1, message }) })
    const port = createNearArenaPort({ transport: t.value })
    expect(await port.send({ fn: 'lockEpoch', roundId: 1 })).toEqual({ kind: 'skipped', reason: 'EpochTooEarly' })
  })

  it('reports every other failure as a reverted transaction', async () => {
    const t = transport({
      call: () => ({ kind: 'failure', hash: 'H2', gasBurnt: 9n, blockTimestampSec: 5, message: 'Exceeded the prepaid gas' })
    })
    const result = await createNearArenaPort({ transport: t.value }).send({ fn: 'resolveEpoch', roundId: 1, maxClashes: 2 })
    expect(result).toMatchObject({ kind: 'mined', status: 'reverted', hash: 'H2' })
  })

  it('lets a transport error propagate so the loop backs off', async () => {
    const t = transport({ call: () => new Error('rpc down') })
    await expect(createNearArenaPort({ transport: t.value }).send({ fn: 'lockEpoch', roundId: 1 })).rejects.toThrow('rpc down')
  })

  it('keeps one transaction in flight even when sends are issued together', async () => {
    const t = transport()
    const port = createNearArenaPort({ transport: t.value })
    await Promise.all([
      port.send({ fn: 'lockEpoch', roundId: 1 }),
      port.send({ fn: 'resolveEpoch', roundId: 1, maxClashes: 2 }),
      port.send({ fn: 'abortRound', roundId: 1 })
    ])
    expect(t.calls).toHaveLength(3)
    expect(t.peak()).toBe(1)
  })

  it('recovers the queue after a failed send', async () => {
    let fail = true
    const t = transport({ call: () => (fail ? new Error('rpc down') : { kind: 'success', hash: 'OK', gasBurnt: 1n, blockTimestampSec: 1 }) })
    const port = createNearArenaPort({ transport: t.value })
    await expect(port.send({ fn: 'lockEpoch', roundId: 1 })).rejects.toThrow()
    fail = false
    expect((await port.send({ fn: 'lockEpoch', roundId: 1 })).kind).toBe('mined')
  })
})

describe('head cache', () => {
  it('shares one head read between the height and the timestamp within the ttl and refreshes after it', async () => {
    let reads = 0
    let now = 0
    const t = transport({
      head: () => {
        reads += 1
        return { height: 100 + reads, timestampSec: 1000 + reads }
      }
    })
    const port = createNearArenaPort({ transport: t.value, headTtlMs: 400, clock: () => now })
    expect(await port.latestHeight()).toBe(101)
    expect(await port.latestTimestamp()).toBe(1001)
    expect(reads).toBe(1)
    now = 401
    expect(await port.latestHeight()).toBe(102)
    await port.send({ fn: 'lockEpoch', roundId: 1 })
    expect(await port.latestHeight()).toBe(103)
  })
})

describe('arenaErrorName', () => {
  it('extracts the panic name or null', () => {
    expect(arenaErrorName('Smart contract panicked: ArenaError:SeedBlockNotReached')).toBe('SeedBlockNotReached')
    expect(arenaErrorName('{"Failure":{"ActionError":{"kind":"X"}}}')).toBeNull()
  })
})

describe('port driven by the keeper loop', () => {
  it('locks, waits for the seed block and resolves through the NEAR port', async () => {
    let height = 9000
    let now = 2000
    let phase: 'Leveling' | 'Settled' = 'Leveling'
    let locked = false
    let lockHeight = 0
    let lockedAt = 0
    let resolvedAt = 0
    const t = transport({
      head: () => ({ height, timestampSec: now }),
      round: () => ({ ...ROUND, phase, locked, lockHeight, lockedAt, startedAt: 1000, lastEpochResolvedAt: resolvedAt }),
      call: (method) => {
        if (method === 'lock_epoch') {
          locked = true
          lockHeight = height
          lockedAt = now
        }
        if (method === 'resolve_epoch') {
          locked = false
          phase = 'Settled'
          resolvedAt = now
        }
        return { kind: 'success', hash: `H-${method}`, gasBurnt: 1n, blockTimestampSec: now }
      }
    })
    const { records, logger } = recordingLogger()
    const loop = createKeeperLoop({
      port: createNearArenaPort({ transport: t.value, headTtlMs: 0 }),
      roundId: 1,
      maxClashes: 2,
      log: logger,
      sleep: () => {
        now += 1
        height += 1
        return Promise.resolve()
      },
      pollMs: 1000
    })
    expect(await loop.run(() => false)).toBe('settled')
    expect(t.calls.map((c) => c.method)).toEqual(['lock_epoch', 'resolve_epoch'])
    const resolved = records.find((r) => r.message === 'epoch resolved')
    expect(Number(resolved?.fields['secondsLockToResolved'])).toBeGreaterThanOrEqual(3)
  })
})
