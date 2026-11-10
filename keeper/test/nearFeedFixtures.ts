import type { ArenaEventEnvelope, ArenaSnapshot, BlockId, ChainFeed, CommitState, FeedStatus } from '@animal/shared'

type CommitMessage = { blockId: BlockId; blockNumber: number; commitState: CommitState }

export class PollingFeed implements ChainFeed {
  private readonly snapshots = new Set<(s: ArenaSnapshot) => void>()
  private readonly envelopes = new Set<(e: ArenaEventEnvelope) => void>()
  private readonly commits = new Set<(c: CommitMessage) => void>()
  private readonly statuses = new Set<(s: FeedStatus) => void>()
  stopped = false
  start(): Promise<void> {
    return Promise.resolve()
  }
  stop(): void {
    this.stopped = true
  }
  onSnapshot(cb: (s: ArenaSnapshot) => void): () => void {
    this.snapshots.add(cb)
    return () => void this.snapshots.delete(cb)
  }
  onEnvelope(cb: (e: ArenaEventEnvelope) => void): () => void {
    this.envelopes.add(cb)
    return () => void this.envelopes.delete(cb)
  }
  onCommit(cb: (c: CommitMessage) => void): () => void {
    this.commits.add(cb)
    return () => void this.commits.delete(cb)
  }
  onRetract(): () => void {
    return () => undefined
  }
  onStatus(cb: (s: FeedStatus) => void): () => void {
    this.statuses.add(cb)
    return () => void this.statuses.delete(cb)
  }
  snapshot(s: ArenaSnapshot): void {
    for (const cb of this.snapshots) cb(s)
  }
  envelope(e: ArenaEventEnvelope): void {
    for (const cb of this.envelopes) cb(e)
  }
  commit(c: CommitMessage): void {
    for (const cb of this.commits) cb(c)
  }
  status(s: FeedStatus): void {
    for (const cb of this.statuses) cb(s)
  }
}

export function snapshot(height: number): ArenaSnapshot {
  return {
    config: { maxCoins: 6 },
    round: {
      roundId: 1, phase: 'Leveling', locked: false, epoch: 1, coinCount: 6, aliveCount: 6, cancelStreak: 0,
      winnerCoinId: 0, createdAt: 1, startedAt: 2, lockedAt: 0, lastEpochResolvedAt: 0, prizePot: '0', treasury: '0',
      redeemPool: '0', redeemSupply: '0', clashesPlayed: 0, lockHeight: 0
    },
    coins: [],
    blockNumber: height,
    blockId: String(height),
    serverTime: 1_760_000_000
  }
}

export function event(height: number, logIndex: number, state: CommitState = 'Voted'): ArenaEventEnvelope {
  return {
    id: `${String(height).padStart(12, '0')}-${String(logIndex).padStart(6, '0')}`,
    name: 'ClashResolved',
    blockNumber: height,
    blockId: String(height),
    logIndex,
    txHash: '',
    timestamp: 1_760_000_000 + height,
    commitState: state,
    args: { roundId: 1, epoch: 1 }
  }
}
