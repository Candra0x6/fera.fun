import type { ArenaEventName } from './types'

export const EVENT_ARG_NAMES: Readonly<Record<ArenaEventName, readonly string[]>> = {
  RoundCreated: ['roundId', 'config'],
  CoinLaunched: ['roundId', 'coinId', 'token', 'creator', 'name', 'ticker', 'monsterType', 'skinId', 'seedMon', 'vMon', 'vTok', 'supply'],
  RoundStarted: ['roundId', 'startedAt', 'coins'],
  Trade: ['roundId', 'coinId', 'trader', 'isBuy', 'monAmount', 'tokenAmount', 'rMon', 'vMon', 'vTok'],
  EpochLocked: ['roundId', 'epoch', 'entropySeq', 'aliveMask', 'lockedAt'],
  SeedReady: ['roundId', 'epoch', 'seed'],
  ClashResolved: [
    'roundId', 'epoch', 'clashId', 'winner', 'loser', 'winProbBps', 'roll', 'boost', 'consolation', 'toPot', 'toTreasury'
  ],
  Boosted: ['roundId', 'epoch', 'clashId', 'coinId', 'boostMon', 'rMon', 'vMon', 'vTok', 'wins', 'level', 'xpGained', 'xp'],
  CoinEliminated: ['roundId', 'coinId', 'consolationPool', 'consolationSupply'],
  ByeGranted: ['roundId', 'epoch', 'coinId'],
  HuntResolved: ['roundId', 'epoch', 'coinId', 'success', 'xpGained', 'xp', 'level'],
  LevelUp: ['roundId', 'coinId', 'level'],
  EpochResolved: ['roundId', 'epoch', 'aliveCount'],
  EpochCancelled: ['roundId', 'epoch'],
  RoundSettled: ['roundId', 'winnerCoinId', 'redeemPool', 'redeemSupply'],
  RoundAborted: ['roundId', 'reason'],
  ConsolationClaimed: ['roundId', 'coinId', 'holder', 'tokens', 'monPaid'],
  Redeemed: ['roundId', 'holder', 'tokens', 'monPaid'],
  RefundClaimed: ['roundId', 'coinId', 'holder', 'tokens', 'monPaid'],
  SeedClaimed: ['roundId', 'coinId', 'creator', 'tokens', 'monPaid'],
  TreasuryFunded: ['roundId', 'funder', 'amount'],
  TreasurySpent: ['roundId', 'kind', 'amount', 'treasuryAfter'],
  FeesSwept: ['roundId', 'epoch', 'toPot', 'toTreasury', 'prizePotAfter', 'treasuryAfter'],
  CoinRefundRate: ['roundId', 'coinId', 'refundPool', 'refundSupply'],
  CoinImage: ['roundId', 'coinId', 'imageUri']
}

export const EVENT_NAMES = Object.keys(EVENT_ARG_NAMES) as ArenaEventName[]

export function isEventName(value: unknown): value is ArenaEventName {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(EVENT_ARG_NAMES, value)
}

export function envelopeId(blockNumber: number, logIndex: number): string {
  return `${String(blockNumber).padStart(12, '0')}-${String(logIndex).padStart(6, '0')}`
}
