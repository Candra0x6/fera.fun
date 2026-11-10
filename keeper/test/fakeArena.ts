import type { ArenaPort, KeeperCall, RoundParams, RoundState, SendResult } from '../src/port'

export const DEFAULT_PARAMS: RoundParams = {
  minCoins: 6,
  maxCoins: 6,
  lobbySeconds: 120,
  levelingEpochs: 1,
  epochSeconds: 14,
  maxRoundSeconds: 3600,
  clashesPerEpoch: 2,
  minSeedBlocks: 3
}

export function baseRound(patch: Partial<RoundState> = {}): RoundState {
  return {
    phase: 'Lobby',
    locked: false,
    epoch: 0,
    coinCount: 6,
    aliveCount: 6,
    createdAt: 1000,
    startedAt: 0,
    lockedAt: 0,
    lastEpochResolvedAt: 0,
    lockHeight: 0,
    treasury: 0n,
    ...patch
  }
}

export class FakeArena implements ArenaPort {
  readonly account = 'fera-keeper.testnet'
  readonly calls: KeeperCall[] = []
  readonly sent: Array<{ call: KeeperCall; result: SendResult }> = []
  now = 1000
  height = 5000
  resolved = 0
  settleAfter = 99
  blockTimestampOffset = 0
  forceResultStatus: 'success' | 'reverted' = 'success'
  inFlight = 0
  maxInFlight = 0
  readHook: ((reads: number) => void) | null = null
  private reads = 0

  constructor(public round: RoundState = baseRound(), readonly params: RoundParams = DEFAULT_PARAMS) {}

  readRound(): Promise<RoundState> {
    this.reads += 1
    this.readHook?.(this.reads)
    return Promise.resolve({ ...this.round })
  }

  readParams(): Promise<RoundParams> {
    return Promise.resolve(this.params)
  }

  latestTimestamp(): Promise<number> {
    return Promise.resolve(this.now)
  }

  latestHeight(): Promise<number> {
    return Promise.resolve(this.height)
  }

  advance(seconds: number): void {
    this.now += seconds
    this.height += seconds
  }

  private guard(call: KeeperCall): string | null {
    const r = this.round
    const p = this.params
    switch (call.fn) {
      case 'startRound': {
        const ready = r.coinCount >= p.maxCoins || (this.now >= r.createdAt + p.lobbySeconds && r.coinCount >= p.minCoins)
        return r.phase === 'Lobby' && ready ? null : 'LobbyNotReady'
      }
      case 'lockEpoch': {
        const base = r.lastEpochResolvedAt > 0 ? r.lastEpochResolvedAt : r.startedAt
        return (r.phase === 'Leveling' || r.phase === 'Knockout') && !r.locked && this.now >= base + p.epochSeconds ? null : 'EpochTooEarly'
      }
      case 'resolveEpoch':
        if (!r.locked) return 'NotLocked'
        return this.height >= r.lockHeight + p.minSeedBlocks ? null : 'SeedBlockNotReached'
      case 'abortRound':
        return (r.phase === 'Lobby' && this.now >= r.createdAt + p.lobbySeconds && r.coinCount < p.minCoins) ||
          (r.startedAt > 0 && this.now >= r.startedAt + p.maxRoundSeconds)
          ? null
          : 'AbortNotOpen'
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
        this.round = { ...r, locked: true, epoch: this.resolved + 1, lockedAt: this.now, lockHeight: this.height }
        break
      case 'resolveEpoch':
        this.resolved += 1
        this.round = {
          ...r,
          locked: false,
          lastEpochResolvedAt: this.now,
          phase: this.resolved >= this.settleAfter ? 'Settled' : this.resolved >= this.params.levelingEpochs ? 'Knockout' : 'Leveling'
        }
        break
      case 'abortRound':
        this.round = { ...r, phase: 'Aborted' }
        break
    }
    const result: SendResult = {
      kind: 'mined',
      hash: `tx${(this.sent.length + 1).toString().padStart(8, '0')}`,
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
