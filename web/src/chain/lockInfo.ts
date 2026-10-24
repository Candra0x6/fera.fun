import type { ArenaEventEnvelope } from '@animal/shared'

export interface LockInfo {
  epoch: number
  seedReady: boolean
}

export function lockInfo(events: readonly Pick<ArenaEventEnvelope, 'name' | 'args'>[]): LockInfo | null {
  let lockedAt = -1
  for (let index = events.length - 1; index >= 0; index--) {
    if (events[index]?.name === 'EpochLocked') {
      lockedAt = index
      break
    }
  }
  const locked = events[lockedAt]
  if (locked === undefined) return null
  const epoch = Number(locked.args['epoch'])
  const seedReady = events.slice(lockedAt + 1).some((event) => event.name === 'SeedReady' && Number(event.args['epoch']) === epoch)
  return { epoch, seedReady }
}
