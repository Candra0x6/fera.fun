import { describe, expect, it } from 'vitest'
import { createKeeperLoop, knockoutEpochs } from '../src/loop'
import { ZERO_SEED } from '../src/port'
import { FakeArena, SEED, baseRound, recordingLogger } from './fakeArena'

function setup(arena: FakeArena, maxClashes = 6) {
  const { records, logger } = recordingLogger()
  const loop = createKeeperLoop({
    port: arena,
    roundId: 1,
    maxClashes,
    log: logger,
    sleep: (ms) => {
      arena.advance(Math.max(1, Math.round(ms / 1000)))
      return Promise.resolve()
    },
    pollMs: 1000,
    retryMs: 1000
  })
  return { loop, records }
}

const leveling = (patch = {}) =>
  baseRound({ phase: 'Leveling', startedAt: 1000, aliveCount: 10, ...patch })

describe('lobby', () => {
  it('starts the round only after the deadline with enough coins', async () => {
    const arena = new FakeArena(baseRound({ createdAt: 1000, coinCount: 10 }))
    const { loop } = setup(arena)
    arena.now = 1100
    expect((await loop.tick()).action).toBe('wait')
    expect(arena.calls).toHaveLength(0)
    arena.now = 1120
    const step = await loop.tick()
    expect(step.action).toBe('startRound')
    expect(arena.calls).toEqual([{ fn: 'startRound', roundId: 1 }])
    expect(arena.round.phase).toBe('Leveling')
  })

  it('starts as soon as the lobby is full and never with too few coins', async () => {
    const full = new FakeArena(baseRound({ coinCount: 30 }))
    expect((await setup(full).loop.tick()).action).toBe('startRound')
    const thin = new FakeArena(baseRound({ coinCount: 5 }))
    thin.now = 5000
    const { loop, records } = setup(thin)
    expect((await loop.tick()).action).toBe('abortRound')
    expect(thin.calls.map((c) => c.fn)).toEqual(['abortRound'])
    expect(thin.round.phase).toBe('Aborted')
    expect(records.filter((r) => r.level === 'warn' && r.message.includes('too few coins'))).toHaveLength(1)
  })

  it('does not start while the treasury is below reserveFloor + plannedEpochs * maxEntropyFee', async () => {
    const arena = new FakeArena(baseRound({ coinCount: 30, treasury: 10n * 10n ** 18n + 3n * 10n ** 18n }))
    const { loop, records } = setup(arena)
    expect((await loop.tick()).action).toBe('wait')
    expect(arena.calls).toHaveLength(0)
    expect(records.some((r) => r.message.includes('treasury does not cover'))).toBe(true)
    arena.round = { ...arena.round, treasury: 10n * 10n ** 18n + 12n * 10n ** 18n }
    expect((await loop.tick()).action).toBe('startRound')
  })

  it('counts knockout epochs like the contract', () => {
    expect(knockoutEpochs(30, 6)).toBe(7)
    expect(knockoutEpochs(2, 6)).toBe(1)
    expect(knockoutEpochs(1, 6)).toBe(0)
    expect(knockoutEpochs(15, 6)).toBe(5)
  })
})

describe('epoch lifecycle', () => {
  it('locks once epochSeconds have passed since the last resolve', async () => {
    const arena = new FakeArena(leveling({ lastEpochResolvedAt: 1000 }))
    const { loop } = setup(arena)
    arena.now = 1019
    expect((await loop.tick()).action).toBe('wait')
    arena.now = 1020
    expect((await loop.tick()).action).toBe('lockEpoch')
    expect(arena.round.locked).toBe(true)
  })

  it('uses startedAt as the base for the first epoch', async () => {
    const arena = new FakeArena(leveling({ startedAt: 2000 }))
    const { loop } = setup(arena)
    arena.now = 2019
    expect((await loop.tick()).action).toBe('wait')
    arena.now = 2020
    expect((await loop.tick()).action).toBe('lockEpoch')
  })

  it('resolves with the configured batch size once the seed has arrived and not before', async () => {
    const arena = new FakeArena(leveling({ locked: true, epoch: 1, lockedAt: 1000, entropySeq: 1n }))
    const { loop, records } = setup(arena, 4)
    arena.now = 1010
    expect((await loop.tick()).action).toBe('wait')
    arena.deliverSeed()
    arena.now = 1013
    const step = await loop.tick()
    expect(step.action).toBe('resolveEpoch')
    expect(arena.calls).toEqual([{ fn: 'resolveEpoch', roundId: 1, maxClashes: 4 }])
    const done = records.find((r) => r.message === 'epoch resolved')
    expect(done?.fields['secondsLockToResolved']).toBe(13)
    expect(arena.round.locked).toBe(false)
  })

  it('keeps calling resolveEpoch while the round stays locked after a batch', async () => {
    const arena = new FakeArena(leveling({ locked: true, epoch: 4, lockedAt: 1000, seed: SEED }))
    const originalSend = arena.send.bind(arena)
    let batches = 0
    arena.send = async (call) => {
      const result = await originalSend(call)
      if (call.fn === 'resolveEpoch') {
        batches += 1
        if (batches < 3) arena.round = { ...arena.round, locked: true, seed: SEED }
      }
      return result
    }
    const { loop } = setup(arena)
    for (let i = 0; i < 3; i += 1) await loop.tick()
    expect(arena.calls.filter((c) => c.fn === 'resolveEpoch')).toHaveLength(3)
    expect(arena.round.locked).toBe(false)
  })

  it('logs an alert above 90 seconds from lock to resolved', async () => {
    const arena = new FakeArena(leveling({ locked: true, epoch: 1, lockedAt: 1000, seed: SEED }))
    arena.now = 1100
    const { loop, records } = setup(arena)
    await loop.tick()
    const alert = records.find((r) => r.level === 'error' && r.fields['alert'] === true)
    expect(alert?.fields['secondsLockToResolved']).toBe(100)
  })

  it('does not double-lock a round that is already locked when the keeper restarts', async () => {
    const arena = new FakeArena(leveling({ locked: true, epoch: 2, lockedAt: 1000, lastEpochResolvedAt: 900 }))
    arena.now = 1050
    const { loop } = setup(arena)
    expect((await loop.tick()).action).toBe('wait')
    expect(arena.calls.map((c) => c.fn)).not.toContain('lockEpoch')
  })
})

describe('cancel watchdog', () => {
  it('cancels after seedTimeoutSeconds when no seed has arrived', async () => {
    const arena = new FakeArena(leveling({ locked: true, epoch: 1, lockedAt: 1000, entropySeq: 1n }))
    arena.seedDelaySeconds = null
    const { loop } = setup(arena)
    arena.now = 1059
    expect((await loop.tick()).action).toBe('wait')
    arena.now = 1060
    expect((await loop.tick()).action).toBe('cancelEpoch')
    expect(arena.round).toMatchObject({ locked: false, cancelStreak: 1 })
  })

  it('never cancels when a seed has arrived, even past the timeout', async () => {
    const arena = new FakeArena(leveling({ locked: true, epoch: 1, lockedAt: 1000, seed: SEED }))
    arena.now = 1500
    const { loop } = setup(arena)
    await loop.tick()
    expect(arena.calls.map((c) => c.fn)).toEqual(['resolveEpoch'])
  })

  it('re-reads the round right before cancelling and backs off if the seed landed meanwhile', async () => {
    const arena = new FakeArena(leveling({ locked: true, epoch: 1, lockedAt: 1000 }))
    arena.seedDelaySeconds = null
    arena.now = 1061
    arena.readHook = (reads) => {
      if (reads === 2) arena.deliverSeed()
    }
    const { loop } = setup(arena)
    const step = await loop.tick()
    expect(step.action).toBe('wait')
    expect(arena.calls).toHaveLength(0)
  })

  it('aborts after three cancels in a row', async () => {
    const arena = new FakeArena(leveling({ cancelStreak: 3, lastEpochResolvedAt: 1000 }))
    const { loop } = setup(arena)
    expect((await loop.tick()).action).toBe('abortRound')
    expect(arena.round.phase).toBe('Aborted')
  })

  it('aborts a round that outlives maxRoundSeconds', async () => {
    const arena = new FakeArena(leveling({ cancelStreak: 3, lastEpochResolvedAt: 1000 }), {
      ...new FakeArena().params,
      maxRoundSeconds: 100
    })
    arena.now = 1200
    const { loop } = setup(arena)
    expect((await loop.tick()).action).toBe('abortRound')
  })
})

describe('racing keepers and errors', () => {
  it('treats a refused call as a no-op and keeps going', async () => {
    const arena = new FakeArena(leveling({ lastEpochResolvedAt: 1000 }))
    arena.now = 1020
    const { loop, records } = setup(arena)
    const real = arena.send.bind(arena)
    arena.send = (call) => {
      arena.round = { ...arena.round, locked: true, lockedAt: arena.now }
      return real(call)
    }
    const step = await loop.tick()
    expect(step.sent?.kind).toBe('skipped')
    expect(records.some((r) => r.level === 'debug' && r.message.includes('skipped'))).toBe(true)
  })

  it('logs a reverted mined transaction as a warning', async () => {
    const arena = new FakeArena(leveling({ lastEpochResolvedAt: 1000 }))
    arena.now = 1020
    arena.forceResultStatus = 'reverted'
    const { loop, records } = setup(arena)
    await loop.tick()
    expect(records.some((r) => r.level === 'warn' && r.message.includes('reverted'))).toBe(true)
  })

  it('survives a throwing port with backoff and recovers', async () => {
    const arena = new FakeArena(leveling({ lastEpochResolvedAt: 1000 }), undefined)
    arena.now = 1020
    let failures = 2
    const real = arena.readRound.bind(arena)
    arena.readRound = () => {
      if (failures > 0) {
        failures -= 1
        return Promise.reject(new Error('rpc down'))
      }
      return real()
    }
    const sleeps: number[] = []
    const { records, logger } = recordingLogger()
    const loop = createKeeperLoop({
      port: arena,
      roundId: 1,
      maxClashes: 6,
      log: logger,
      sleep: (ms) => {
        sleeps.push(ms)
        return Promise.resolve()
      },
      pollMs: 1000,
      retryMs: 500
    })
    let ticks = 0
    const result = await loop.run(() => {
      ticks += 1
      return ticks > 4
    })
    expect(result).toBe('stopped')
    expect(records.filter((r) => r.level === 'warn' && r.message === 'keeper tick failed')).toHaveLength(2)
    expect(sleeps[0]).toBe(1000)
    expect(sleeps[1]).toBe(2000)
    expect(arena.calls.map((c) => c.fn)).toContain('lockEpoch')
  })

  it('never has two transactions in flight', async () => {
    const arena = new FakeArena(baseRound({ coinCount: 12, createdAt: 0 }))
    arena.settleAfter = 3
    const { loop } = setup(arena)
    await loop.run(() => false)
    expect(arena.maxInFlight).toBe(1)
  })
})

describe('full run', () => {
  it('starts, locks, resolves and finishes when the round settles', async () => {
    const arena = new FakeArena(baseRound({ coinCount: 12, createdAt: 1000 }))
    arena.settleAfter = 4
    const { loop, records } = setup(arena)
    const result = await loop.run(() => false)
    expect(result).toBe('settled')
    const names = arena.calls.map((c) => c.fn)
    expect(names[0]).toBe('startRound')
    expect(names.filter((n) => n === 'lockEpoch')).toHaveLength(4)
    expect(names.filter((n) => n === 'resolveEpoch')).toHaveLength(4)
    expect(names).not.toContain('cancelEpoch')
    for (let i = 1; i < names.length; i += 2) {
      expect(names[i]).toBe('lockEpoch')
      expect(names[i + 1]).toBe('resolveEpoch')
    }
    const resolved = records.filter((r) => r.message === 'epoch resolved')
    expect(resolved).toHaveLength(4)
    expect(resolved.every((r) => Number(r.fields['secondsLockToResolved']) <= 10)).toBe(true)
    expect(records.filter((r) => r.message === 'transaction mined').every((r) => typeof r.fields['txHash'] === 'string')).toBe(true)
  })

  it('cancels a stalled epoch and retries it, then ends in an abort after three stalls', async () => {
    const arena = new FakeArena(baseRound({ coinCount: 12, createdAt: 1000 }))
    arena.seedDelaySeconds = null
    const { loop } = setup(arena)
    const result = await loop.run(() => false)
    expect(result).toBe('aborted')
    const names = arena.calls.map((c) => c.fn)
    expect(names.filter((n) => n === 'cancelEpoch')).toHaveLength(3)
    expect(names.filter((n) => n === 'resolveEpoch')).toHaveLength(0)
    expect(names[names.length - 1]).toBe('abortRound')
    expect(arena.round.seed).toBe(ZERO_SEED)
  })
})
