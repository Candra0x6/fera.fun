import { MalformedEventError } from './args'
import { draftFromSnapshot, reduceEvent } from './reduce'
import type { Draft } from './reduce'
import { rankCoins } from './rank'
import { houseTokenSet } from './houseCoins'
import type {
  ArenaEventEnvelope,
  ArenaSnapshot,
  ArenaState,
  ArenaStateView,
  ArenaStore,
  CommitState,
  Hex
} from './types'

export const COMMIT_RANK: Readonly<Record<CommitState, number>> = {
  Proposed: 0,
  Voted: 1,
  Finalized: 2,
  Verified: 3
}

export type Sleep = (ms: number) => Promise<void>

export interface ArenaStoreOptions {
  houseTokens?: ReadonlySet<string>
  sleep?: Sleep
  blockTimeMs?: number
}

export function defaultSleep(ms: number): Promise<void> {
  const timers = globalThis as { setTimeout?: (callback: () => void, delay: number) => unknown }
  const schedule = timers.setTimeout
  if (schedule === undefined) return Promise.resolve()
  return new Promise<void>((resolve) => {
    schedule(resolve, ms)
  })
}

export function compareEnvelopes(a: ArenaEventEnvelope, b: ArenaEventEnvelope): number {
  if (a.blockNumber !== b.blockNumber) return a.blockNumber - b.blockNumber
  if (a.logIndex !== b.logIndex) return a.logIndex - b.logIndex
  if (a.blockId < b.blockId) return -1
  if (a.blockId > b.blockId) return 1
  return 0
}

function maxCommit(a: CommitState, b: CommitState): CommitState {
  return COMMIT_RANK[a] >= COMMIT_RANK[b] ? a : b
}

function isFinal(state: CommitState): boolean {
  return COMMIT_RANK[state] >= COMMIT_RANK.Finalized
}

function safeReduce(draft: Draft, e: ArenaEventEnvelope, houseTokens: ReadonlySet<string>): void {
  try {
    reduceEvent(draft, e, houseTokens)
  } catch (error) {
    if (!(error instanceof MalformedEventError)) throw error
  }
}

function viewOf(draft: Draft): ArenaStateView {
  const coins = [...draft.coins.values()].sort((a, b) => a.coinId - b.coinId)
  return {
    round: draft.round === null ? null : { ...draft.round },
    coins,
    ranked: rankCoins(coins)
  }
}

function envelopeKey(blockId: Hex, logIndex: number): string {
  return `${blockId}:${logIndex}`
}

export function createArenaStore(options: ArenaStoreOptions = {}): ArenaStore {
  const houseTokens = options.houseTokens ?? houseTokenSet()
  const sleep = options.sleep ?? defaultSleep
  const blockTimeMs = options.blockTimeMs ?? 300
  const events = new Map<string, ArenaEventEnvelope>()
  const blockStates = new Map<Hex, CommitState>()
  const finalizedAtHeight = new Map<number, Hex>()
  const listeners = new Set<() => void>()
  let base: ArenaSnapshot | null = null
  let cached: ArenaState | null = null

  function changed(): void {
    cached = null
    for (const listener of [...listeners]) listener()
  }

  function compute(): ArenaState {
    const baseBlock = base === null ? -1 : base.blockNumber
    const ordered = [...events.values()].sort(compareEnvelopes)
    const foldable = ordered.filter((e) => e.blockNumber > baseBlock || e.name === 'CoinImage')
    const persisted = draftFromSnapshot(base)
    const optimistic = draftFromSnapshot(base)
    for (const e of foldable) {
      safeReduce(optimistic, e, houseTokens)
      if (isFinal(e.commitState)) safeReduce(persisted, e, houseTokens)
    }
    let headBlock = baseBlock
    let finalizedBlock = baseBlock
    for (const e of ordered) {
      if (e.blockNumber > headBlock) headBlock = e.blockNumber
      if (isFinal(e.commitState) && e.blockNumber > finalizedBlock) finalizedBlock = e.blockNumber
    }
    return {
      hydrated: base !== null,
      config: persisted.config ?? optimistic.config,
      persisted: viewOf(persisted),
      optimistic: viewOf(optimistic),
      events: ordered,
      headBlock,
      finalizedBlock
    }
  }

  function dropSiblings(blockNumber: number, keep: Hex): void {
    for (const [key, e] of [...events]) {
      if (e.blockNumber === blockNumber && e.blockId !== keep) events.delete(key)
    }
  }

  function markFinal(blockNumber: number, blockId: Hex): void {
    finalizedAtHeight.set(blockNumber, blockId)
    dropSiblings(blockNumber, blockId)
  }

  const store: ArenaStore = {
    getState() {
      if (cached === null) cached = compute()
      return cached
    },
    subscribe(cb) {
      listeners.add(cb)
      return () => {
        listeners.delete(cb)
      }
    },
    hydrate(snapshot) {
      base = {
        ...snapshot,
        config: { ...snapshot.config },
        round: { ...snapshot.round },
        coins: snapshot.coins.map((coin) => ({ ...coin }))
      }
      changed()
    },
    apply(e) {
      const lockedSibling = finalizedAtHeight.get(e.blockNumber)
      if (lockedSibling !== undefined && lockedSibling !== e.blockId) return
      const key = envelopeKey(e.blockId, e.logIndex)
      const known = blockStates.get(e.blockId)
      const incoming = known === undefined ? e.commitState : maxCommit(e.commitState, known)
      const existing = events.get(key)
      if (existing !== undefined) {
        const upgraded = maxCommit(existing.commitState, incoming)
        if (upgraded === existing.commitState) return
        events.set(key, { ...existing, commitState: upgraded })
      } else {
        events.set(key, { ...e, commitState: incoming })
      }
      if (isFinal(incoming)) markFinal(e.blockNumber, e.blockId)
      changed()
    },
    commit(c) {
      const known = blockStates.get(c.blockId)
      const next = known === undefined ? c.commitState : maxCommit(known, c.commitState)
      blockStates.set(c.blockId, next)
      let touched = known !== next
      for (const [key, e] of events) {
        if (e.blockId !== c.blockId) continue
        const upgraded = maxCommit(e.commitState, next)
        if (upgraded !== e.commitState) {
          events.set(key, { ...e, commitState: upgraded })
          touched = true
        }
      }
      if (isFinal(next)) {
        const before = events.size
        markFinal(c.blockNumber, c.blockId)
        if (events.size !== before) touched = true
      }
      if (touched) changed()
    },
    retract(r) {
      let touched = blockStates.delete(r.blockId)
      for (const [height, blockId] of [...finalizedAtHeight]) {
        if (blockId === r.blockId) finalizedAtHeight.delete(height)
      }
      for (const [key, e] of [...events]) {
        if (e.blockId === r.blockId) {
          events.delete(key)
          touched = true
        }
      }
      if (touched) changed()
    },
    async replay(batch, opts) {
      let previousBlock: number | null = null
      for (const e of batch) {
        if (opts?.atMs === true && previousBlock !== null) {
          const wait = (e.blockNumber - previousBlock) * blockTimeMs
          if (wait > 0) await sleep(wait)
        }
        previousBlock = e.blockNumber
        store.apply(e)
      }
    }
  }
  return store
}
