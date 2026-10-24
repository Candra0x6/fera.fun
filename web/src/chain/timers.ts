export type LockdownPhase = 'seed-wait' | 'resolving' | 'idle'

export function lobbySecondsLeft(createdAt: number, lobbySeconds: number, nowSeconds: number): number {
  return Math.max(0, Math.ceil(createdAt + lobbySeconds - nowSeconds))
}

export function nextLockSecondsLeft(lastEpochResolvedAt: number, epochSeconds: number, nowSeconds: number): number {
  return Math.max(0, Math.ceil(lastEpochResolvedAt + epochSeconds - nowSeconds))
}

export function seedTimeoutSecondsLeft(lockedAt: number, seedTimeoutSeconds: number, nowSeconds: number): number {
  return Math.max(0, Math.ceil(lockedAt + seedTimeoutSeconds - nowSeconds))
}

export function lockdownPhase(locked: boolean, seedReady: boolean): LockdownPhase {
  if (!locked) return 'idle'
  return seedReady ? 'resolving' : 'seed-wait'
}

export function formatClock(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds))
  const minutes = Math.floor(safe / 60)
  const seconds = safe % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}
