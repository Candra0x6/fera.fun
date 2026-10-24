import { GET_LOGS_MAX_RANGE, MULTICALL3_ADDRESS, createChainFeed } from '@animal/shared'
import type { ChainFeed } from '@animal/shared'
import type { WebConfig } from './config'
import { asBigInt, readArena } from './contract'
import { createRoundFollower } from './roundFollow'
import { setStatus, statusFromFeed } from './status'
import type { SwitchableStore } from './switchableStore'

export interface LiveFeedHooks {
  onRoundSwitch: (roundId: number, previous: number | null) => void
}

export function startLiveFeed(config: WebConfig, store: SwitchableStore, hooks: LiveFeedHooks): () => void {
  if (config.arena === null) {
    setStatus({ kind: 'disconnected', blockNumber: null, lagSeconds: 0 })
    return () => undefined
  }
  const arena = config.arena
  let feed: ChainFeed | null = null
  let unsubscribers: Array<() => void> = []

  function closeFeed(): void {
    for (const unsubscribe of unsubscribers) unsubscribe()
    unsubscribers = []
    feed?.stop()
    feed = null
  }

  function openFeed(roundId: number): void {
    const next = createChainFeed(
      {
        wsUrls: config.wsUrls,
        httpUrls: config.httpUrls,
        arena,
        roundId,
        deployBlock: config.deployBlock,
        multicall3: MULTICALL3_ADDRESS,
        getLogsMaxRange: GET_LOGS_MAX_RANGE
      },
      { createWebSocket: (url) => new WebSocket(url), fetch: (url, init) => fetch(url, init) }
    )
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
        if (feed === next) setStatus(statusFromFeed(feedStatus))
      })
    ]
    setStatus({ kind: 'syncing', blockNumber: null, lagSeconds: 0 })
    void next.start().catch(() => setStatus({ kind: 'disconnected', blockNumber: null, lagSeconds: 0 }))
  }

  const follower = createRoundFollower({
    readCurrent: async () => {
      const roundId = Number(asBigInt(await readArena('currentRoundId', [])))
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
