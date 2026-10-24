import { argBigInt, argBoolean, argHex, argNumber, argString, MalformedEventError } from './args'
import type { ArenaEventEnvelope, ArenaSnapshot, CoinView, RoundView } from './types'

export interface Draft {
  config: ArenaSnapshot['config'] | null
  round: RoundView | null
  coins: Map<number, CoinView>
  pendingImages: Map<number, string>
}

export function emptyRound(roundId: number): RoundView {
  return {
    roundId,
    phase: 'Lobby',
    locked: false,
    epoch: 0,
    coinCount: 0,
    aliveCount: 0,
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
    clashesPlayed: 0
  }
}

export function draftFromSnapshot(snapshot: ArenaSnapshot | null): Draft {
  if (snapshot === null) return { config: null, round: null, coins: new Map(), pendingImages: new Map() }
  return {
    config: snapshot.config,
    round: { ...snapshot.round },
    coins: new Map(snapshot.coins.map((coin) => [coin.coinId, { ...coin }])),
    pendingImages: new Map()
  }
}

function configBigInt(config: ArenaSnapshot['config'] | null, key: string): bigint | null {
  const value = config?.[key]
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return BigInt(value)
  if (typeof value === 'string' && /^\d+$/.test(value)) return BigInt(value)
  return null
}

function configNumber(config: ArenaSnapshot['config'] | null, key: string): number | null {
  const value = config?.[key]
  return typeof value === 'number' ? value : null
}

function parseConfigJson(e: ArenaEventEnvelope): ArenaSnapshot['config'] {
  let parsed: unknown
  try {
    parsed = JSON.parse(argString(e, 'config'))
  } catch {
    throw new MalformedEventError(e.name, 'config', 'a JSON object')
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new MalformedEventError(e.name, 'config', 'a JSON object')
  }
  const out: ArenaSnapshot['config'] = {}
  for (const [key, value] of Object.entries(parsed)) {
    if (typeof value !== 'number' && typeof value !== 'string' && typeof value !== 'boolean') {
      throw new MalformedEventError(e.name, 'config', 'a flat JSON object')
    }
    out[key] = value
  }
  return out
}

function patchCoin(draft: Draft, coinId: number, patch: Partial<CoinView>): CoinView | undefined {
  const coin = draft.coins.get(coinId)
  if (coin === undefined) return undefined
  const next = { ...coin, ...patch }
  draft.coins.set(coinId, next)
  return next
}

function currentRound(draft: Draft, roundId: number): RoundView {
  if (draft.round === null) draft.round = emptyRound(roundId)
  return draft.round
}

function patchRound(draft: Draft, roundId: number, patch: Partial<RoundView>): void {
  draft.round = { ...currentRound(draft, roundId), ...patch }
}

function minusFloor(value: bigint, amount: bigint): string {
  return (value > amount ? value - amount : 0n).toString()
}

function assertNever(value: never): never {
  throw new TypeError(`unhandled event ${String(value)}`)
}

export function reduceEvent(draft: Draft, e: ArenaEventEnvelope, houseTokens: ReadonlySet<string>): void {
  const roundId = argNumber(e, 'roundId')
  if (draft.round !== null && draft.round.roundId !== roundId) return
  switch (e.name) {
    case 'RoundCreated': {
      draft.config = parseConfigJson(e)
      patchRound(draft, roundId, { createdAt: e.timestamp })
      return
    }
    case 'CoinLaunched': {
      const coinId = argNumber(e, 'coinId')
      if (draft.coins.has(coinId)) return
      const seedMon = argBigInt(e, 'seedMon')
      const vMon = argBigInt(e, 'vMon')
      const vMon0 = configBigInt(draft.config, 'vMon0')
      const token = argHex(e, 'token')
      draft.coins.set(coinId, {
        roundId,
        coinId,
        token,
        creator: argHex(e, 'creator'),
        name: argString(e, 'name'),
        ticker: argString(e, 'ticker'),
        monsterType: argNumber(e, 'monsterType'),
        skinId: argNumber(e, 'skinId'),
        status: 'Alive',
        level: 1,
        xp: 0,
        wins: 0,
        vMon: vMon.toString(),
        vTok: argBigInt(e, 'vTok').toString(),
        rMon: (vMon0 !== null && vMon >= vMon0 ? vMon - vMon0 : seedMon).toString(),
        rMonAtLock: '0',
        seedMon: seedMon.toString(),
        consolationPool: '0',
        consolationSupply: '0',
        supply: argBigInt(e, 'supply').toString(),
        isHouse: houseTokens.has(token.toLowerCase())
      })
      const pendingImage = draft.pendingImages.get(coinId)
      if (pendingImage !== undefined) {
        patchCoin(draft, coinId, { imageUri: pendingImage })
        draft.pendingImages.delete(coinId)
      }
      const round = currentRound(draft, roundId)
      const launchFee = configBigInt(draft.config, 'launchFee') ?? 0n
      patchRound(draft, roundId, {
        coinCount: round.coinCount + 1,
        aliveCount: round.aliveCount + 1,
        treasury: (BigInt(round.treasury) + launchFee).toString()
      })
      return
    }
    case 'RoundStarted': {
      const levelingEpochs = configNumber(draft.config, 'levelingEpochs')
      patchRound(draft, roundId, {
        phase: levelingEpochs === null || levelingEpochs > 0 ? 'Leveling' : 'Knockout',
        startedAt: argNumber(e, 'startedAt'),
        coinCount: argNumber(e, 'coins'),
        aliveCount: argNumber(e, 'coins'),
        locked: false
      })
      return
    }
    case 'Trade': {
      const coin = draft.coins.get(argNumber(e, 'coinId'))
      if (coin === undefined) return
      const tokens = argBigInt(e, 'tokenAmount')
      const supply = BigInt(coin.supply)
      patchCoin(draft, coin.coinId, {
        rMon: argBigInt(e, 'rMon').toString(),
        vMon: argBigInt(e, 'vMon').toString(),
        vTok: argBigInt(e, 'vTok').toString(),
        supply: (argBoolean(e, 'isBuy') ? supply + tokens : supply - tokens).toString()
      })
      return
    }
    case 'EpochLocked': {
      const mask = argNumber(e, 'aliveMask')
      for (const coin of [...draft.coins.values()]) {
        if (coin.status === 'Alive' && ((mask >>> coin.coinId) & 1) === 1) {
          draft.coins.set(coin.coinId, { ...coin, rMonAtLock: coin.rMon })
        }
      }
      patchRound(draft, roundId, {
        locked: true,
        epoch: argNumber(e, 'epoch'),
        lockedAt: argNumber(e, 'lockedAt')
      })
      return
    }
    case 'CoinImage': {
      const coinId = argNumber(e, 'coinId')
      const imageUri = argString(e, 'imageUri')
      if (patchCoin(draft, coinId, { imageUri }) === undefined) draft.pendingImages.set(coinId, imageUri)
      return
    }
    case 'SeedReady':
    case 'ByeGranted': {
      return
    }
    case 'ClashResolved': {
      const round = currentRound(draft, roundId)
      patchRound(draft, roundId, {
        clashesPlayed: round.clashesPlayed + 1,
        prizePot: (BigInt(round.prizePot) + argBigInt(e, 'toPot')).toString(),
        treasury: (BigInt(round.treasury) + argBigInt(e, 'toTreasury')).toString()
      })
      return
    }
    case 'Boosted': {
      patchCoin(draft, argNumber(e, 'coinId'), {
        rMon: argBigInt(e, 'rMon').toString(),
        vMon: argBigInt(e, 'vMon').toString(),
        vTok: argBigInt(e, 'vTok').toString(),
        wins: argNumber(e, 'wins'),
        level: argNumber(e, 'level'),
        xp: argNumber(e, 'xp')
      })
      return
    }
    case 'CoinEliminated': {
      const coin = patchCoin(draft, argNumber(e, 'coinId'), {
        status: 'Eliminated',
        rMon: '0',
        consolationPool: argBigInt(e, 'consolationPool').toString(),
        consolationSupply: argBigInt(e, 'consolationSupply').toString()
      })
      if (coin !== undefined) {
        const round = currentRound(draft, roundId)
        patchRound(draft, roundId, { aliveCount: Math.max(0, round.aliveCount - 1) })
      }
      return
    }
    case 'HuntResolved': {
      patchCoin(draft, argNumber(e, 'coinId'), { xp: argNumber(e, 'xp'), level: argNumber(e, 'level') })
      return
    }
    case 'LevelUp': {
      patchCoin(draft, argNumber(e, 'coinId'), { level: argNumber(e, 'level') })
      return
    }
    case 'FeesSwept': {
      patchRound(draft, roundId, {
        prizePot: argBigInt(e, 'prizePotAfter').toString(),
        treasury: argBigInt(e, 'treasuryAfter').toString()
      })
      return
    }
    case 'TreasurySpent': {
      patchRound(draft, roundId, { treasury: argBigInt(e, 'treasuryAfter').toString() })
      return
    }
    case 'TreasuryFunded': {
      const round = currentRound(draft, roundId)
      patchRound(draft, roundId, { treasury: (BigInt(round.treasury) + argBigInt(e, 'amount')).toString() })
      return
    }
    case 'EpochResolved': {
      const epoch = argNumber(e, 'epoch')
      const levelingEpochs = configNumber(draft.config, 'levelingEpochs')
      const round = currentRound(draft, roundId)
      const flips =
        (round.phase === 'Leveling' || round.phase === 'Knockout') && levelingEpochs !== null && epoch >= levelingEpochs
      patchRound(draft, roundId, {
        locked: false,
        epoch,
        phase: flips ? 'Knockout' : round.phase,
        aliveCount: argNumber(e, 'aliveCount'),
        cancelStreak: 0,
        lastEpochResolvedAt: e.timestamp
      })
      return
    }
    case 'EpochCancelled': {
      const round = currentRound(draft, roundId)
      patchRound(draft, roundId, { locked: false, cancelStreak: round.cancelStreak + 1 })
      return
    }
    case 'RoundSettled': {
      const winnerCoinId = argNumber(e, 'winnerCoinId')
      patchCoin(draft, winnerCoinId, { status: 'Champion', rMon: '0' })
      patchRound(draft, roundId, {
        prizePot: '0',
        phase: 'Settled',
        locked: false,
        aliveCount: 1,
        winnerCoinId,
        redeemPool: argBigInt(e, 'redeemPool').toString(),
        redeemSupply: argBigInt(e, 'redeemSupply').toString()
      })
      return
    }
    case 'RoundAborted': {
      patchRound(draft, roundId, { phase: 'Aborted', locked: false, prizePot: '0' })
      return
    }
    case 'CoinRefundRate': {
      const coin = patchCoin(draft, argNumber(e, 'coinId'), {
        status: 'Refunded',
        rMon: '0',
        consolationPool: argBigInt(e, 'refundPool').toString(),
        consolationSupply: argBigInt(e, 'refundSupply').toString()
      })
      if (coin !== undefined) {
        const round = currentRound(draft, roundId)
        patchRound(draft, roundId, { aliveCount: Math.max(0, round.aliveCount - 1) })
      }
      return
    }
    case 'SeedClaimed':
    case 'ConsolationClaimed':
    case 'RefundClaimed': {
      const coin = draft.coins.get(argNumber(e, 'coinId'))
      if (coin === undefined) return
      const wasAlive = coin.status === 'Alive' && e.name === 'RefundClaimed'
      patchCoin(draft, coin.coinId, {
        supply: minusFloor(BigInt(coin.supply), argBigInt(e, 'tokens')),
        ...(wasAlive ? { status: 'Refunded' as const, rMon: '0' } : {})
      })
      if (wasAlive) {
        const round = currentRound(draft, roundId)
        patchRound(draft, roundId, { aliveCount: Math.max(0, round.aliveCount - 1) })
      }
      return
    }
    case 'Redeemed': {
      const round = currentRound(draft, roundId)
      const burned = argBigInt(e, 'tokens')
      patchRound(draft, roundId, {
        redeemPool: minusFloor(BigInt(round.redeemPool), argBigInt(e, 'monPaid')),
        redeemSupply: minusFloor(BigInt(round.redeemSupply), burned)
      })
      const winner = draft.coins.get(round.winnerCoinId)
      if (winner !== undefined) {
        patchCoin(draft, winner.coinId, { supply: minusFloor(BigInt(winner.supply), burned) })
      }
      return
    }
    default:
      return assertNever(e.name)
  }
}
