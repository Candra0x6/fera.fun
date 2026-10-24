export type Hex = `0x${string}`
export type DecimalString = string
export type CommitState = 'Proposed' | 'Voted' | 'Finalized' | 'Verified'
export type Phase = 'Lobby' | 'Leveling' | 'Knockout' | 'Settled' | 'Aborted'
export type CoinStatus = 'Alive' | 'Eliminated' | 'Champion' | 'Refunded'

export interface CoinView {
  roundId: number
  coinId: number
  token: Hex
  creator: Hex
  name: string
  ticker: string
  monsterType: number
  skinId: number
  status: CoinStatus
  level: number
  xp: number
  wins: number
  vMon: DecimalString
  vTok: DecimalString
  rMon: DecimalString
  rMonAtLock: DecimalString
  seedMon: DecimalString
  consolationPool: DecimalString
  consolationSupply: DecimalString
  supply: DecimalString
  isHouse: boolean
  imageUri?: string
}

export interface RoundView {
  roundId: number
  phase: Phase
  locked: boolean
  epoch: number
  coinCount: number
  aliveCount: number
  cancelStreak: number
  winnerCoinId: number
  createdAt: number
  startedAt: number
  lockedAt: number
  lastEpochResolvedAt: number
  prizePot: DecimalString
  treasury: DecimalString
  redeemPool: DecimalString
  redeemSupply: DecimalString
  clashesPlayed: number
}

export interface ArenaSnapshot {
  config: Record<string, number | string | boolean>
  round: RoundView
  coins: CoinView[]
  blockNumber: number
  blockId: Hex
  serverTime: number
}

export type ArenaEventName =
  | 'RoundCreated' | 'CoinLaunched' | 'RoundStarted' | 'Trade' | 'EpochLocked' | 'SeedReady'
  | 'ClashResolved' | 'Boosted' | 'CoinEliminated' | 'ByeGranted' | 'HuntResolved' | 'LevelUp'
  | 'EpochResolved' | 'EpochCancelled' | 'RoundSettled' | 'RoundAborted' | 'ConsolationClaimed'
  | 'Redeemed' | 'RefundClaimed' | 'SeedClaimed' | 'TreasuryFunded' | 'TreasurySpent' | 'FeesSwept' | 'CoinRefundRate' | 'CoinImage'

export interface ArenaEventEnvelope {
  id: string
  name: ArenaEventName
  blockNumber: number
  blockId: Hex
  logIndex: number
  txHash: Hex
  timestamp: number
  commitState: CommitState
  args: Record<string, string | number | boolean>
}

export interface ChainFeedOptions {
  wsUrls: string[]
  httpUrls: string[]
  arena: Hex
  roundId: number
  multicall3: Hex
  getLogsMaxRange: number
  deployBlock?: number
}
export interface ChainFeed {
  start(): Promise<void>
  stop(): void
  onSnapshot(cb: (s: ArenaSnapshot) => void): () => void
  onEnvelope(cb: (e: ArenaEventEnvelope) => void): () => void
  onCommit(cb: (c: { blockId: Hex; blockNumber: number; commitState: CommitState }) => void): () => void
  onRetract(cb: (r: { blockId: Hex }) => void): () => void
  onStatus(cb: (s: { upstream: 'live' | 'reconnecting' | 'polling'; headBlock: number; lagSeconds: number }) => void): () => void
}
export interface ArenaStore {
  getState(): ArenaState
  subscribe(cb: () => void): () => void
  hydrate(snapshot: ArenaSnapshot): void
  apply(e: ArenaEventEnvelope): void
  commit(c: { blockId: Hex; blockNumber: number; commitState: CommitState }): void
  retract(r: { blockId: Hex }): void
  replay(events: ArenaEventEnvelope[], opts?: { atMs?: boolean }): Promise<void>
}

export interface RankedCoin extends CoinView {
  rank: number
}

export interface ArenaStateView {
  round: RoundView | null
  coins: CoinView[]
  ranked: RankedCoin[]
}

export interface ArenaState {
  hydrated: boolean
  config: ArenaSnapshot['config'] | null
  persisted: ArenaStateView
  optimistic: ArenaStateView
  events: ArenaEventEnvelope[]
  headBlock: number
  finalizedBlock: number
}

export type FeedStatus = Parameters<Parameters<ChainFeed['onStatus']>[0]>[0]
