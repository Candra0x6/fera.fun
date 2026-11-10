export type RoundPhase = 'None' | 'Lobby' | 'Leveling' | 'Knockout' | 'Settled' | 'Aborted'

export interface RoundState {
  phase: RoundPhase
  locked: boolean
  epoch: number
  coinCount: number
  aliveCount: number
  createdAt: number
  startedAt: number
  lockedAt: number
  lastEpochResolvedAt: number
  lockHeight: number
  treasury: bigint
}

export interface RoundParams {
  minCoins: number
  maxCoins: number
  lobbySeconds: number
  levelingEpochs: number
  epochSeconds: number
  maxRoundSeconds: number
  clashesPerEpoch: number
  minSeedBlocks: number
}

export type KeeperCall =
  | { fn: 'startRound'; roundId: number }
  | { fn: 'lockEpoch'; roundId: number }
  | { fn: 'resolveEpoch'; roundId: number; maxClashes: number }
  | { fn: 'abortRound'; roundId: number }

export type SendResult =
  | {
      kind: 'mined'
      hash: string
      status: 'success' | 'reverted'
      gasUsed: bigint
      gasLimit: bigint
      blockTimestamp: number
    }
  | { kind: 'skipped'; reason: string }

export interface ArenaPort {
  readonly account: string
  readRound(roundId: number): Promise<RoundState>
  readParams(roundId: number): Promise<RoundParams>
  latestTimestamp(): Promise<number>
  latestHeight(): Promise<number>
  send(call: KeeperCall): Promise<SendResult>
}
