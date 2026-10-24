import type { Hex } from '@animal/shared'
import { ZERO_SEED } from '../src/port'
import type { ArenaPort, KeeperCall, RoundParams, RoundState, SendResult } from '../src/port'

export const SEED: Hex = `0x${'ab'.repeat(32)}`

export const DEFAULT_PARAMS: RoundParams = {
  minCoins: 8,
  maxCoins: 30,
  lobbySeconds: 120,
  levelingEpochs: 3,
  epochSeconds: 20,
  seedTimeoutSeconds: 60,
  maxRoundSeconds: 3600,
  clashesPerEpoch: 6,
  maxEntropyFee: 10n ** 18n
}

export function baseRound(patch: Partial<RoundState> = {}): RoundState {
  return {
    phase: 'Lobby',
    locked: false,
    epoch: 0,
    coinCount: 10,
    aliveCount: 10,
    cancelStreak: 0,
    createdAt: 1000,
    startedAt: 0,
    lockedAt: 0,
    lastEpochResolvedAt: 0,
    entropySeq: 0n,
    seed: ZERO_SEED,
    treasury: 40n * 10n ** 18n,
    ...patch
  }
}

export class FakeArena implements ArenaPort {
  readonly account: Hex = '0x00000000000000000000000000000000000000ee'
  readonly calls: KeeperCall[] = []
  readonly sent: Array<{ call: KeeperCall; result: SendResult }> = []
  now = 1000
  resolved = 0
  settleAfter = 99
  seedDelaySeconds: number | null = 3
  blockTimestampOffset = 0
  forceResultStatus: 'success' | 'reverted' = 'success'
  inFlight = 0
  maxInFlight = 0
  readHook: ((reads: number) => void) | null = null
  private reads = 0
  private seq = 0n
  private lockAt = 0

  constructor(public round: RoundState = baseRound(), readonly params: RoundParams = DEFAULT_PARAMS) {}

  readRound(): Promise<RoundState> {
    this.reads += 1
    this.readHook?.(this.reads)
    return Promise.resolve({ ...this.round })
  }

  reserveFloor = 10n * 10n ** 18n

  readReserveFloor(): Promise<bigint> {
    return Promise.resolve(this.reserveFloor)
  }

  readParams(): Promise<RoundParams> {
    return Promise.resolve(this.params)
  }

  latestTimestamp(): Promise<number> {
    return Promise.resolve(this.now)
  }

  advance(seconds: number): void {
    this.now += seconds
    if (this.round.locked && this.seedDelaySeconds !== null && this.round.seed === ZERO_SEED && this.now >= this.lockAt + this.seedDelaySeconds) {
      this.round = { ...this.round, seed: SEED }
    }
  }

  deliverSeed(): void {
    this.round = { ...this.round, seed: SEED }
  }

  private guard(call: KeeperCall): string | null {
    const r = this.round
    const p = this.params
    switch (call.fn) {
      case 'startRound': {
        const ready = r.coinCount >= p.maxCoins || (this.now >= r.createdAt + p.lobbySeconds && r.coinCount >= p.minCoins)
        return r.phase === 'Lobby' && ready ? null : 'NotReady'
      }
      case 'lockEpoch': {
        const base = r.lastEpochResolvedAt > 0 ? r.lastEpochResolvedAt : r.startedAt
        return (r.phase === 'Leveling' || r.phase === 'Knockout') && !r.locked && this.now >= base + p.epochSeconds ? null : 'BadTiming'
      }
      case 'resolveEpoch':
        return r.locked && r.seed !== ZERO_SEED ? null : 'NoSeed'
      case 'cancelEpoch':
        return r.locked && r.seed === ZERO_SEED && this.now >= r.lockedAt + p.seedTimeoutSeconds ? null : 'CannotCancel'
      case 'abortRound':
        return r.cancelStreak >= 3 || (r.phase === 'Lobby' && this.now >= r.createdAt + p.lobbySeconds && r.coinCount < p.minCoins)
          ? null
          : 'CannotAbort'
    }
  }

  async send(call: KeeperCall): Promise<SendResult> {
    this.calls.push(call)
    this.inFlight += 1
    this.maxInFlight = Math.max(this.maxInFlight, this.inFlight)
    await Promise.resolve()
    const refusal = this.guard(call)
    this.inFlight -= 1
    if (refusal !== null) {
      const skipped: SendResult = { kind: 'skipped', reason: refusal }
      this.sent.push({ call, result: skipped })
      return skipped
    }
    const r = this.round
    switch (call.fn) {
      case 'startRound':
        this.round = { ...r, phase: 'Leveling', startedAt: this.now, aliveCount: r.coinCount }
        break
      case 'lockEpoch':
        this.seq += 1n
        this.lockAt = this.now
        this.round = { ...r, locked: true, epoch: this.resolved + 1, lockedAt: this.now, entropySeq: this.seq, seed: ZERO_SEED }
        break
      case 'resolveEpoch':
        this.resolved += 1
        this.round = {
          ...r,
          locked: false,
          seed: ZERO_SEED,
          lastEpochResolvedAt: this.now,
          cancelStreak: 0,
          phase: this.resolved >= this.settleAfter ? 'Settled' : this.resolved >= this.params.levelingEpochs ? 'Knockout' : 'Leveling'
        }
        break
      case 'cancelEpoch':
        this.round = { ...r, locked: false, cancelStreak: r.cancelStreak + 1 }
        break
      case 'abortRound':
        this.round = { ...r, phase: 'Aborted' }
        break
    }
    const result: SendResult = {
      kind: 'mined',
      hash: `0x${(this.sent.length + 1).toString(16).padStart(64, '0')}`,
      status: this.forceResultStatus,
      gasUsed: 123_456n,
      gasLimit: 150_000n,
      blockTimestamp: this.now + this.blockTimestampOffset
    }
    this.sent.push({ call, result })
    return result
  }
}

export interface LogRecord {
  level: 'debug' | 'info' | 'warn' | 'error'
  fields: Record<string, unknown>
  message: string
}

export function recordingLogger(): { records: LogRecord[]; logger: import('../src/loop').LoopLogger } {
  const records: LogRecord[] = []
  const make =
    (level: LogRecord['level']) =>
    (fields: Record<string, unknown>, message: string): void => {
      records.push({ level, fields, message })
    }
  return { records, logger: { debug: make('debug'), info: make('info'), warn: make('warn'), error: make('error') } }
}
