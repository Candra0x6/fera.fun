import type { ChainFeed } from '@animal/shared'
import type { LoopResult } from './loop'
import { createRelayHub } from './relay'
import type { RelayHub, RelayMessage } from './relay'

export interface FollowOptions {
  fixedRoundId: number | null
  readCurrentRoundId(): Promise<number>
  bind(roundId: number): void | Promise<void>
  runRound(roundId: number, shouldStop: () => boolean): Promise<LoopResult>
  sleep(ms: number): Promise<void>
  pollMs: number
  shouldStop(): boolean
  log(message: string, fields: Record<string, unknown>): void
}

export async function followRounds(options: FollowOptions): Promise<void> {
  const { fixedRoundId, log } = options
  let bound: number | null = null
  let waitingLogged = false

  async function currentOrNull(): Promise<number | null> {
    try {
      return await options.readCurrentRoundId()
    } catch (error) {
      log('currentRoundId read failed', { error: error instanceof Error ? error.message : String(error) })
      return null
    }
  }

  while (!options.shouldStop()) {
    const id = fixedRoundId ?? (await currentOrNull())
    if (id === null || id === 0) {
      if (id === 0 && !waitingLogged) {
        waitingLogged = true
        log('no round exists yet, waiting for createRound', {})
      }
      await options.sleep(options.pollMs)
      continue
    }
    waitingLogged = false
    if (id !== bound) {
      log('following round', { roundId: id, previous: bound })
      await options.bind(id)
      bound = id
    }
    const result = await options.runRound(id, options.shouldStop)
    if (options.shouldStop()) return
    log('round loop finished', { roundId: id, result })
    for (;;) {
      if (options.shouldStop()) return
      await options.sleep(options.pollMs)
      if (fixedRoundId !== null) continue
      const next = await currentOrNull()
      if (next !== null && next !== id) break
    }
  }
}

export interface SwitchableRelay extends RelayHub {
  bind(feed: ChainFeed): void
}
export function createSwitchableRelay(): SwitchableRelay {
  let current: RelayHub | null = null
  let detach: (() => void) | null = null
  const listeners = new Set<(message: RelayMessage) => void>()
  return {
    bind(feed) {
      detach?.()
      const hub = createRelayHub(feed)
      current = hub
      detach = hub.subscribe((message) => {
        for (const cb of [...listeners]) cb(message)
      })
    },
    snapshot: () => current?.snapshot() ?? null,
    eventsAfter: (after) => current?.eventsAfter(after) ?? [],
    resume: (after) => current?.resume(after) ?? [],
    lastStatus: () => current?.lastStatus() ?? null,
    subscribe(cb) {
      listeners.add(cb)
      return () => {
        listeners.delete(cb)
      }
    }
  }
}
