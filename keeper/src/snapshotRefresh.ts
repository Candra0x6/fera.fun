import type { ArenaSnapshot } from '@animal/shared'

export interface SnapshotRefreshOptions {
  boundRound(): number | null
  read(roundId: number): Promise<ArenaSnapshot>
  rebase(snapshot: ArenaSnapshot): boolean
  intervalMs: number
  sleep(ms: number): Promise<void>
  shouldStop(): boolean
  onError?(error: unknown): void
}

export async function refreshOnce(options: SnapshotRefreshOptions): Promise<boolean> {
  const roundId = options.boundRound()
  if (roundId === null) return false
  const snapshot = await options.read(roundId)
  if (options.boundRound() !== roundId || snapshot.round.roundId !== roundId) return false
  return options.rebase(snapshot)
}

export async function runSnapshotRefresh(options: SnapshotRefreshOptions): Promise<void> {
  while (!options.shouldStop()) {
    try {
      await refreshOnce(options)
    } catch (error) {
      options.onError?.(error)
    }
    await options.sleep(options.intervalMs)
  }
}
