import * as shared from '@animal/shared'
import type { ChainFeed } from '@animal/shared'

export interface NearFeedOptions {
  rpcUrls: string[]
  arena: string
  roundId: number
  pollMs?: number
  fetchImpl?: typeof fetch
}

export type NearFeedFactory = (options: NearFeedOptions) => ChainFeed

function isFactory(value: unknown): value is NearFeedFactory {
  return typeof value === 'function'
}

export function resolveNearFeedFactory(): NearFeedFactory {
  const candidate: unknown = Reflect.get(shared, 'createNearFeed')
  if (!isFactory(candidate)) throw new Error('createNearFeed is not exported by @animal/shared yet')
  return candidate
}
