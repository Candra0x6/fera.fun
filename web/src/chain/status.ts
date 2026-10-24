export type StatusKind = 'live' | 'syncing' | 'lagging' | 'disconnected' | 'replay' | 'sandbox'

export interface StatusState {
  kind: StatusKind
  blockNumber: number | null
  lagSeconds: number
}

export interface FeedStatusInput {
  upstream: 'live' | 'reconnecting' | 'polling'
  headBlock: number
  lagSeconds: number
}

export const LAG_THRESHOLD_SECONDS = 8

export function statusFromFeed(feed: FeedStatusInput): StatusState {
  const base = { blockNumber: feed.headBlock, lagSeconds: feed.lagSeconds }
  if (feed.upstream === 'reconnecting') return { kind: 'disconnected', ...base }
  if (feed.lagSeconds > LAG_THRESHOLD_SECONDS) return { kind: 'lagging', ...base }
  return { kind: 'live', ...base }
}

let current: StatusState = { kind: 'syncing', blockNumber: null, lagSeconds: 0 }
const listeners = new Set<() => void>()

export function getStatus(): StatusState {
  return current
}

export function setStatus(next: StatusState): void {
  if (next.kind === current.kind && next.blockNumber === current.blockNumber && next.lagSeconds === current.lagSeconds) {
    return
  }
  current = next
  for (const listener of [...listeners]) listener()
}

export function subscribeStatus(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
