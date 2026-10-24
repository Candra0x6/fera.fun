import { describe, expect, it } from 'vitest'
import type { ChainFeed } from '@animal/shared'
import { createSwitchableRelay, followRounds } from '../src/follow'
import type { LoopResult } from '../src/loop'

function harness(current: () => number, fixed: number | null = null) {
  const events: string[] = []
  let stop = false
  let ticks = 0
  return {
    events,
    run: (runRound: (id: number) => Promise<LoopResult>) =>
      followRounds({
        fixedRoundId: fixed,
        readCurrentRoundId: () => Promise.resolve(current()),
        bind: (id) => void events.push(`bind:${id}`),
        runRound: async (id) => {
          events.push(`run:${id}`)
          return runRound(id)
        },
        sleep: () => {
          ticks += 1
          if (ticks > 50) stop = true
          return Promise.resolve()
        },
        pollMs: 1,
        shouldStop: () => stop,
        log: () => undefined
      })
  }
}

describe('followRounds', () => {
  it('waits while no round exists, then binds and runs it', async () => {
    let reads = 0
    const h = harness(() => {
      reads += 1
      return reads < 4 ? 0 : 1
    })
    await h.run(() => Promise.resolve('settled'))
    expect(h.events.slice(0, 2)).toEqual(['bind:1', 'run:1'])
    expect(reads).toBeGreaterThanOrEqual(4)
  })

  it('re-binds when currentRoundId changes after the round ends', async () => {
    let id = 1
    const h = harness(() => id)
    let runs = 0
    await h.run(() => {
      runs += 1
      if (runs === 1) id = 2
      return Promise.resolve('settled')
    })
    expect(h.events.slice(0, 4)).toEqual(['bind:1', 'run:1', 'bind:2', 'run:2'])
  })

  it('a fixed ROUND_ID binds once and never re-binds', async () => {
    let id = 7
    const h = harness(() => id, 3)
    await h.run(() => {
      id = 8
      return Promise.resolve('settled')
    })
    expect(h.events).toEqual(['bind:3', 'run:3'])
  })
})

describe('createSwitchableRelay', () => {
  it('is empty before a bind and forwards messages from the latest feed only', () => {
    const relay = createSwitchableRelay()
    expect(relay.snapshot()).toBeNull()
    expect(relay.eventsAfter(null)).toEqual([])
    const handlers = () => {
      const h: { status?: (s: never) => void } = {}
      const feed = {
        onSnapshot: () => undefined,
        onEnvelope: () => undefined,
        onCommit: () => undefined,
        onRetract: () => undefined,
        onStatus: (cb: (s: never) => void) => {
          h.status = cb
        }
      } as unknown as ChainFeed
      return { h, feed }
    }
    const a = handlers()
    const b = handlers()
    const seen: string[] = []
    relay.subscribe((message) => seen.push(`${message.kind}`))
    relay.bind(a.feed)
    a.h.status?.({ upstream: 'live' } as never)
    relay.bind(b.feed)
    a.h.status?.({ upstream: 'live' } as never)
    b.h.status?.({ upstream: 'live' } as never)
    expect(seen).toEqual(['status', 'status'])
  })
})
