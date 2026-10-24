import type { Hex } from '@animal/shared'

export type RoundPhase = 'None' | 'Lobby' | 'Leveling' | 'Knockout' | 'Settled' | 'Aborted'

export interface RoundState {
  phase: RoundPhase
  locked: boolean
  epoch: number
  coinCount: number
  aliveCount: number
  cancelStreak: number
  createdAt: number
  startedAt: number
  lockedAt: number
  lastEpochResolvedAt: number
  entropySeq: bigint
  seed: Hex
  treasury: bigint
}

export interface RoundParams {
  minCoins: number
  maxCoins: number
  lobbySeconds: number
  levelingEpochs: number
  epochSeconds: number
  seedTimeoutSeconds: number
  maxRoundSeconds: number
  clashesPerEpoch: number
  maxEntropyFee: bigint
}

export type KeeperCall =
  | { fn: 'startRound'; roundId: number }
  | { fn: 'lockEpoch'; roundId: number }
  | { fn: 'resolveEpoch'; roundId: number; maxClashes: number }
  | { fn: 'cancelEpoch'; roundId: number }
  | { fn: 'abortRound'; roundId: number }

export type SendResult =
  | {
      kind: 'mined'
      hash: Hex
      status: 'success' | 'reverted'
      gasUsed: bigint
      gasLimit: bigint
      blockTimestamp: number
    }
  | { kind: 'skipped'; reason: string }

export interface ArenaPort {
  readonly account: Hex
  readRound(roundId: number): Promise<RoundState>
  readParams(roundId: number): Promise<RoundParams>
  readReserveFloor(): Promise<bigint>
  latestTimestamp(): Promise<number>
  send(call: KeeperCall): Promise<SendResult>
}

export const ZERO_SEED: Hex = `0x${'0'.repeat(64)}`

export function seedArrived(round: RoundState): boolean {
  return round.seed !== ZERO_SEED && /[1-9a-fA-F]/.test(round.seed.slice(2))
}
