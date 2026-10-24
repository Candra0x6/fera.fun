import { envelopeId } from '../src/events'
import type {
  ArenaEventEnvelope,
  ArenaEventName,
  ArenaSnapshot,
  CoinView,
  CommitState,
  Hex,
  RoundView
} from '../src/types'

export function hexOf(value: number, width = 64): Hex {
  return `0x${value.toString(16).padStart(width, '0')}`
}

export function makeCoin(coinId: number, patch: Partial<CoinView> = {}): CoinView {
  return {
    roundId: 1,
    coinId,
    token: hexOf(coinId + 1, 40),
    creator: hexOf(900 + coinId, 40),
    name: `Coin ${coinId}`,
    ticker: `C${coinId}`,
    monsterType: 0,
    skinId: 0,
    status: 'Alive',
    level: 1,
    xp: 0,
    wins: 0,
    vMon: '20000000000000000000',
    vTok: '1000000000000000000000000000',
    rMon: '1000',
    rMonAtLock: '0',
    seedMon: '1000',
    consolationPool: '0',
    consolationSupply: '0',
    supply: '5000',
    isHouse: false,
    ...patch
  }
}

export function makeRound(patch: Partial<RoundView> = {}): RoundView {
  return {
    roundId: 1,
    phase: 'Leveling',
    locked: false,
    epoch: 0,
    coinCount: 3,
    aliveCount: 3,
    cancelStreak: 0,
    winnerCoinId: 0,
    createdAt: 0,
    startedAt: 0,
    lockedAt: 0,
    lastEpochResolvedAt: 0,
    prizePot: '0',
    treasury: '0',
    redeemPool: '0',
    redeemSupply: '0',
    clashesPlayed: 0,
    ...patch
  }
}

export function makeSnapshot(
  coins: CoinView[],
  blockNumber = 100,
  config: ArenaSnapshot['config'] = { levelingEpochs: 3 },
  round: Partial<RoundView> = {}
): ArenaSnapshot {
  return {
    config,
    round: makeRound({ coinCount: coins.length, aliveCount: coins.length, ...round }),
    coins,
    blockNumber,
    blockId: hexOf(blockNumber),
    serverTime: 1_760_000_000
  }
}

export interface EnvelopeOptions {
  block?: number
  logIndex?: number
  blockId?: Hex
  state?: CommitState
  timestamp?: number
}

export function makeEnvelope(
  name: ArenaEventName,
  args: ArenaEventEnvelope['args'],
  options: EnvelopeOptions = {}
): ArenaEventEnvelope {
  const block = options.block ?? 101
  const logIndex = options.logIndex ?? 0
  return {
    id: envelopeId(block, logIndex),
    name,
    blockNumber: block,
    blockId: options.blockId ?? hexOf(block),
    logIndex,
    txHash: hexOf(block * 10 + logIndex),
    timestamp: options.timestamp ?? 1_760_000_000 + block,
    commitState: options.state ?? 'Proposed',
    args: { roundId: 1, ...args }
  }
}

export function tradeArgs(coinId: number, rMon: string, isBuy = true, tokenAmount = '10'): ArenaEventEnvelope['args'] {
  return {
    coinId,
    trader: hexOf(77, 40),
    isBuy,
    monAmount: '100',
    tokenAmount,
    rMon,
    vMon: '20000000000000000100',
    vTok: '999999999999999999999999990'
  }
}
