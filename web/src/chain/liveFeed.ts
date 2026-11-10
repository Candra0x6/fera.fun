import { createNearFeed } from '@animal/shared'
import type { ChainFeed } from '@animal/shared'
import type { WebConfig } from './config'
import { asBigInt, readArena } from './contract'
import { createRelayFeed } from './relayFeed'
import { createRoundFollower } from './roundFollow'
import { setStatus, statusFromFeed } from './status'
import type { SwitchableStore } from './switchableStore'

export interface LiveFeedHooks {
  onRoundSwitch: (roundId: number, previous: number | null) => void
}

const RELAY_STALL_MS = 10_000

export function startLiveFeed(config: WebConfig, store: SwitchableStore, hooks: LiveFeedHooks): () => void {
  let feed: ChainFeed | null = null
  let unsubscribers: Array<() => void> = []
  let stallTimer: number | null = null

  function clearStall(): void {
    if (stallTimer !== null) window.clearTimeout(stallTimer)
    stallTimer = null
  }

  function closeFeed(): void {
    clearStall()
    for (const unsubscribe of unsubscribers) unsubscribe()
    unsubscribers = []
    feed?.stop()
    feed = null
  }

  function attach(next: ChainFeed, onStall: (() => void) | null): void {
    feed = next
    unsubscribers = [
      next.onSnapshot((snapshot) => {
        if (feed === next) store.hydrate(snapshot)
      }),
      next.onEnvelope((envelope) => {
        if (feed !== next) return
        if (envelope.name === 'RoundCreated') follower.noteRoundCreated(Number(envelope.args['roundId']))
        store.apply(envelope)
      }),
      next.onCommit((commit) => {
        if (feed === next) store.commit(commit)
      }),
      next.onRetract((retract) => {
        if (feed === next) store.retract(retract)
      }),
      next.onStatus((feedStatus) => {
        if (feed !== next) return
        setStatus(statusFromFeed(feedStatus))
        if (onStall === null) return
        if (feedStatus.upstream === 'reconnecting') {
          if (stallTimer === null) stallTimer = window.setTimeout(onStall, RELAY_STALL_MS)
        } else {
          clearStall()
        }
      })
    ]
  }

  function openRpcFeed(roundId: number): void {
    const next = createNearFeed({ rpcUrls: config.rpcUrls, arena: config.arena, roundId })
    attach(next, null)
    void next.start().catch(() => setStatus({ kind: 'disconnected', blockNumber: null, lagSeconds: 0 }))
  }

  function openFeed(roundId: number): void {
    setStatus({ kind: 'syncing', blockNumber: null, lagSeconds: 0 })
    if (config.keeperUrl === null) {
      openRpcFeed(roundId)
      return
    }
    const relay = createRelayFeed({ baseUrl: config.keeperUrl, roundId })
    const fallBack = (): void => {
      if (feed !== relay) return
      closeFeed()
      openRpcFeed(roundId)
    }
    attach(relay, fallBack)
    relay.start().catch(fallBack)
  }

  const follower = createRoundFollower({
    readCurrent: async () => {
      const roundId = Number(asBigInt(await readArena('current_round_id', {})))
      if (roundId === 0 && feed === null) setStatus({ kind: 'live', blockNumber: null, lagSeconds: 0 })
      return roundId
    },
    fixedRoundId: config.roundId,
    onRound: (roundId, previous) => {
      closeFeed()
      if (previous !== null) store.reset()
      hooks.onRoundSwitch(roundId, previous)
      openFeed(roundId)
    }
  })
  void follower.start()
  return () => {
    follower.stop()
    closeFeed()
  }
}
