import { describe, expect, it } from 'vitest'
import { createKeeperLoop, knockoutEpochs } from '../src/loop'
import { DEFAULT_PARAMS, FakeArena, baseRound, recordingLogger } from './fakeArena'

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
  baseRound({ phase: 'Leveling', startedAt: 1000, aliveCount: 6, ...patch })

describe('lobby', () => {
  it('starts the round only after the deadline with enough coins', async () => {
    const arena = new FakeArena(baseRound({ createdAt: 1000, coinCount: 6 }), { ...DEFAULT_PARAMS, maxCoins: 10 })
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
    const full = new FakeArena(baseRound({ coinCount: 6 }))
    expect((await setup(full).loop.tick()).action).toBe('startRound')
    const thin = new FakeArena(baseRound({ coinCount: 3 }))
    thin.now = 5000
    const { loop, records } = setup(thin)
    expect((await loop.tick()).action).toBe('abortRound')
    expect(thin.calls.map((c) => c.fn)).toEqual(['abortRound'])
    expect(thin.round.phase).toBe('Aborted')
    expect(records.filter((r) => r.level === 'warn' && r.message.includes('too few coins'))).toHaveLength(1)
  })

  it('counts knockout epochs like the contract', () => {
    expect(knockoutEpochs(30, 6)).toBe(7)
    expect(knockoutEpochs(2, 6)).toBe(1)
    expect(knockoutEpochs(1, 6)).toBe(0)
    expect(knockoutEpochs(6, 2)).toBe(3)
  })
})

describe('epoch lifecycle', () => {
  it('locks once epochSeconds have passed since the last resolve', async () => {
    const arena = new FakeArena(leveling({ lastEpochResolvedAt: 1000 }))
    const { loop } = setup(arena)
    arena.now = 1013
    expect((await loop.tick()).action).toBe('wait')
    arena.now = 1014
    expect((await loop.tick()).action).toBe('lockEpoch')
    expect(arena.round.locked).toBe(true)
  })

  it('uses startedAt as the base for the first epoch', async () => {
    const arena = new FakeArena(leveling({ startedAt: 2000 }))
    const { loop } = setup(arena)
    arena.now = 2013
    expect((await loop.tick()).action).toBe('wait')
    arena.now = 2014
    expect((await loop.tick()).action).toBe('lockEpoch')
  })

  it('resolves with the configured batch size only once minSeedBlocks have passed since the lock', async () => {
    const arena = new FakeArena(leveling({ locked: true, epoch: 1, lockedAt: 1000, lockHeight: 5000 }))
    const { loop, records } = setup(arena, 4)
    arena.now = 1002
    arena.height = 5002
    const early = await loop.tick()
    expect(early.action).toBe('wait')
    expect(arena.calls).toHaveLength(0)
    arena.now = 1013
    arena.height = 5003
    const step = await loop.tick()
    expect(step.action).toBe('resolveEpoch')
    expect(arena.calls).toEqual([{ fn: 'resolveEpoch', roundId: 1, maxClashes: 4 }])
    const done = records.find((r) => r.message === 'epoch resolved')
    expect(done?.fields['secondsLockToResolved']).toBe(13)
    expect(arena.round.locked).toBe(false)
  })

  it('keeps calling resolveEpoch while the round stays locked after a batch', async () => {
    const arena = new FakeArena(leveling({ locked: true, epoch: 4, lockedAt: 1000, lockHeight: 4000 }))
    const originalSend = arena.send.bind(arena)
    let batches = 0
    arena.send = async (call) => {
      const result = await originalSend(call)
      if (call.fn === 'resolveEpoch') {
        batches += 1
        if (batches < 3) arena.round = { ...arena.round, locked: true }
      }
      return result
    }
    const { loop } = setup(arena)
    for (let i = 0; i < 3; i += 1) await loop.tick()
    expect(arena.calls.filter((c) => c.fn === 'resolveEpoch')).toHaveLength(3)
    expect(arena.round.locked).toBe(false)
  })

  it('logs an alert above 90 seconds from lock to resolved', async () => {
    const arena = new FakeArena(leveling({ locked: true, epoch: 1, lockedAt: 1000, lockHeight: 4000 }))
    arena.now = 1100
    const { loop, records } = setup(arena)
    await loop.tick()
    const alert = records.find((r) => r.level === 'error' && r.fields['alert'] === true)
    expect(alert?.fields['secondsLockToResolved']).toBe(100)
  })

  it('does not double-lock a round that is already locked when the keeper restarts', async () => {
    const arena = new FakeArena(leveling({ locked: true, epoch: 2, lockedAt: 1000, lastEpochResolvedAt: 900, lockHeight: 5000 }))
    arena.now = 1050
    const { loop } = setup(arena)
    expect((await loop.tick()).action).toBe('wait')
    expect(arena.calls.map((c) => c.fn)).not.toContain('lockEpoch')
  })
})

describe('wait hints', () => {
  it('sleeps until the next lock instead of polling every second', async () => {
    const arena = new FakeArena(leveling({ lastEpochResolvedAt: 1000 }))
    arena.now = 1004
    const { loop } = setup(arena)
    expect((await loop.tick()).waitMs).toBe(5000)
    arena.now = 1012
    expect((await loop.tick()).waitMs).toBe(2000)
    arena.now = 1013
    expect((await loop.tick()).waitMs).toBe(1000)
  })

  it('sleeps roughly one second per missing seed block and polls the lobby every two seconds', async () => {
    const arena = new FakeArena(leveling({ locked: true, epoch: 1, lockedAt: 1000, lockHeight: 5000 }))
    arena.height = 5001
    const { loop } = setup(arena)
    expect((await loop.tick()).waitMs).toBe(2000)
    const lobby = new FakeArena(baseRound({ createdAt: 1000, coinCount: 3 }))
    expect((await setup(lobby).loop.tick()).waitMs).toBe(2000)
  })
})

describe('abort', () => {
  it('aborts a round that outlives maxRoundSeconds', async () => {
    const arena = new FakeArena(leveling({ lastEpochResolvedAt: 1000 }), {
      ...new FakeArena().params,
      maxRoundSeconds: 100
    })
    arena.now = 1200
    const { loop } = setup(arena)
    expect((await loop.tick()).action).toBe('abortRound')
    expect(arena.round.phase).toBe('Aborted')
  })
})

describe('racing keepers and errors', () => {
  it('treats a refused call as a no-op and keeps going', async () => {
    const arena = new FakeArena(leveling({ lastEpochResolvedAt: 1000 }))
    arena.now = 1014
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
    arena.now = 1014
    arena.forceResultStatus = 'reverted'
    const { loop, records } = setup(arena)
    await loop.tick()
    expect(records.some((r) => r.level === 'warn' && r.message.includes('reverted'))).toBe(true)
  })

  it('survives a throwing port with backoff and recovers', async () => {
    const arena = new FakeArena(leveling({ lastEpochResolvedAt: 1000 }), undefined)
    arena.now = 1014
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
    const arena = new FakeArena(baseRound({ coinCount: 6, createdAt: 0 }))
    arena.settleAfter = 3
    const { loop } = setup(arena)
    await loop.run(() => false)
    expect(arena.maxInFlight).toBe(1)
  })
})

describe('full run', () => {
  it('starts, locks, resolves and finishes when the round settles', async () => {
    const arena = new FakeArena(baseRound({ coinCount: 6, createdAt: 1000 }))
    arena.settleAfter = 4
    const { loop, records } = setup(arena)
    const result = await loop.run(() => false)
    expect(result).toBe('settled')
    const names = arena.calls.map((c) => c.fn)
    expect(names[0]).toBe('startRound')
    expect(names.filter((n) => n === 'lockEpoch')).toHaveLength(4)
    expect(names.filter((n) => n === 'resolveEpoch')).toHaveLength(4)
    for (let i = 1; i < names.length; i += 2) {
      expect(names[i]).toBe('lockEpoch')
      expect(names[i + 1]).toBe('resolveEpoch')
    }
    const resolved = records.filter((r) => r.message === 'epoch resolved')
    expect(resolved).toHaveLength(4)
    expect(resolved.every((r) => Number(r.fields['secondsLockToResolved']) <= 5)).toBe(true)
    expect(records.filter((r) => r.message === 'transaction mined').every((r) => typeof r.fields['txHash'] === 'string')).toBe(true)
  })
})
