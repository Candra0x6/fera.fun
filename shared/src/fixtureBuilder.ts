import { keccak256, stringToHex } from 'viem'
import { applyBoost, launchSeedState, quoteBuy, quoteSell, splitLoss } from './curve'
import type { CurveReserves } from './curve'
import { envelopeId } from './events'
import type { FixtureMessage } from './fixture'
import { clampBig } from './math'
import type {
  ArenaEventEnvelope,
  ArenaEventName,
  ArenaSnapshot,
  CoinStatus,
  CoinView,
  Hex,
  RoundView
} from './types'

export const FIXTURE_ROUND_ID = 1
export const FIXTURE_START_BLOCK = 5_000_000
export const FIXTURE_BASE_TIMESTAMP = 1_760_900_000
export const FIXTURE_BLOCK_MS = 300
export const FIXTURE_BURNER: Hex = '0x70997970c51812dc3a010c7d01b50e0d17dc79c8'

const E18 = 10n ** 18n
const TRADE_FEE_BPS = 100n
const EPOCH_BLOCKS = 67
const SEED_TIMEOUT_BLOCKS = 201
const LEVELING_EPOCHS = 3
const CLASHES_PER_EPOCH = 6
const VOTED_DELAY_MS = 350
const FINALIZED_DELAY_MS = 600
const XP_PER_HUNT = 30
const XP_PER_LEVEL = 50
const XP_PER_CLASH_WIN = 40
const LAUNCH_FEE = E18
const SEED_FEE = (E18 * 128n) / 1000n
const KEEPER_BOUNTY = E18 / 5n
const LOBBY_SECONDS = 120
const LOBBY_ELAPSED_AT_SNAPSHOT = 81

function levelFor(xp: number): number {
  return Math.min(10, 1 + Math.floor(xp / XP_PER_LEVEL))
}

type Args = ArenaEventEnvelope['args']

interface RosterEntry {
  ticker: string
  name: string
  monsterType: number
  skinId: number
  seedTenths: number
}

const HOUSE_ROSTER: readonly RosterEntry[] = [
  { ticker: 'MOOND', name: 'Moon Dragon Protocol', monsterType: 0, skinId: 2, seedTenths: 120 },
  { ticker: 'FIRECAT', name: 'FireCat On-Chain', monsterType: 0, skinId: 0, seedTenths: 110 },
  { ticker: 'AQUA', name: 'Aqua Frost Wolf', monsterType: 1, skinId: 3, seedTenths: 90 },
  { ticker: 'TITAN', name: 'Gaia Monolith LP', monsterType: 2, skinId: 0, seedTenths: 85 },
  { ticker: 'VOLT', name: 'Volt Kitsune', monsterType: 3, skinId: 2, seedTenths: 80 },
  { ticker: 'SHADE', name: 'Nether Wraith', monsterType: 4, skinId: 4, seedTenths: 75 },
  { ticker: 'DRACO', name: 'Draco Ignis', monsterType: 0, skinId: 1, seedTenths: 70 },
  { ticker: 'GLACIER', name: 'Glacier Fang', monsterType: 1, skinId: 0, seedTenths: 60 },
  { ticker: 'KITSUNE', name: 'Spark NineTail', monsterType: 3, skinId: 0, seedTenths: 55 },
  { ticker: 'CRAG', name: 'Basalt Guardian', monsterType: 2, skinId: 1, seedTenths: 50 },
  { ticker: 'UMBRA', name: 'Umbra Core', monsterType: 4, skinId: 0, seedTenths: 40 },
  { ticker: 'PYRO', name: 'Pyro Scale', monsterType: 0, skinId: 0, seedTenths: 30 }
]

type PlayerEntry = RosterEntry & { creator: Hex; imageUri?: string }

const PIXEL_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
const EMBER_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAEBgIApD5fRAAAAABJRU5ErkJggg=='

const PLAYER_ROSTER: readonly PlayerEntry[] = [
  {
    ticker: 'PIXEL',
    name: 'Pixel Fox',
    monsterType: 3,
    skinId: 3,
    seedTenths: 50,
    creator: FIXTURE_BURNER,
    imageUri: PIXEL_PNG
  },
  {
    ticker: 'EMBER7',
    name: 'Ember Wolf',
    monsterType: 1,
    skinId: 1,
    seedTenths: 30,
    creator: '0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc',
    imageUri: EMBER_PNG
  },
  {
    ticker: 'ZEPHYR',
    name: 'Zephyr Spirit',
    monsterType: 4,
    skinId: 2,
    seedTenths: 20,
    creator: '0x90f79bf6eb2c4f870365e785982e1f101e93b906'
  }
]

const TRADERS: readonly Hex[] = [
  '0x15d34aaf54267db7d7c367839aaf71a00a2c6a65',
  '0x9965507d1a55bcc2695c58ba16fb37d819b0a4dc',
  '0x976ea74026e726554db657fa54763abd0c3a0aa9',
  '0x14dc79964da2c08b23698b3d3cc7ca32193d9955'
]

function mon(tenths: number): bigint {
  return BigInt(tenths) * (E18 / 10n)
}

function hashOf(label: string): Hex {
  return keccak256(stringToHex(label))
}

function addressOf(label: string): Hex {
  const digest = hashOf(label)
  return `0x${digest.slice(26)}`
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function demoConfig(): ArenaSnapshot['config'] {
  return {
    maxCoins: 30,
    minCoins: 8,
    lobbySeconds: LOBBY_SECONDS,
    levelingEpochs: LEVELING_EPOCHS,
    epochSeconds: 20,
    clashesPerEpoch: CLASHES_PER_EPOCH,
    seedTimeoutSeconds: 60,
    maxRoundSeconds: 3600,
    launchFee: LAUNCH_FEE.toString(),
    minSeed: (2n * E18).toString(),
    maxSeed: (50n * E18).toString(),
    tradeFeeBps: Number(TRADE_FEE_BPS),
    boostBps: 5000,
    consolationBps: 3000,
    potBps: 1500,
    treasuryBps: 500,
    consolationMode: 0,
    gammaBps: 8500,
    poolFactorMinBps: 1000,
    poolFactorMaxBps: 100000,
    levelBonusBps: 400,
    elementUpBps: 11500,
    elementDownBps: 8700,
    winProbMinBps: 1500,
    winProbMaxBps: 8500,
    huntWinPct: 50,
    keeperBounty: (E18 / 5n).toString(),
    maxEntropyFee: E18.toString(),
    vMon0: (20n * E18).toString(),
    vTok0: (1_000_000_000n * E18).toString()
  }
}

interface SimCoin {
  coinId: number
  token: Hex
  creator: Hex
  name: string
  ticker: string
  monsterType: number
  skinId: number
  isHouse: boolean
  imageUri?: string
  status: CoinStatus
  level: number
  xp: number
  wins: number
  vMon: bigint
  vTok: bigint
  rMon: bigint
  rMonAtLock: bigint
  seedMon: bigint
  consolationPool: bigint
  consolationSupply: bigint
  supply: bigint
}

function toCoinView(coin: SimCoin): CoinView {
  return {
    roundId: FIXTURE_ROUND_ID,
    coinId: coin.coinId,
    token: coin.token,
    creator: coin.creator,
    name: coin.name,
    ticker: coin.ticker,
    monsterType: coin.monsterType,
    skinId: coin.skinId,
    status: coin.status,
    level: coin.level,
    xp: coin.xp,
    wins: coin.wins,
    vMon: coin.vMon.toString(),
    vTok: coin.vTok.toString(),
    rMon: coin.rMon.toString(),
    rMonAtLock: coin.rMonAtLock.toString(),
    seedMon: coin.seedMon.toString(),
    consolationPool: coin.consolationPool.toString(),
    consolationSupply: coin.consolationSupply.toString(),
    supply: coin.supply.toString(),
    isHouse: coin.isHouse,
    ...(coin.imageUri === undefined ? {} : { imageUri: coin.imageUri })
  }
}

function newCoin(
  coinId: number,
  entry: RosterEntry,
  creator: Hex,
  isHouse: boolean,
  vMon0: bigint,
  vTok0: bigint
): SimCoin {
  const seedMon = mon(entry.seedTenths)
  const seeded = launchSeedState(vMon0, vTok0, seedMon)
  return {
    coinId,
    token: addressOf(`token-${coinId}`),
    creator,
    name: entry.name,
    ticker: entry.ticker,
    monsterType: entry.monsterType,
    skinId: entry.skinId,
    isHouse,
    status: 'Alive',
    level: 1,
    xp: 0,
    wins: 0,
    vMon: seeded.vMon,
    vTok: seeded.vTok,
    rMon: seeded.rMon,
    rMonAtLock: 0n,
    seedMon,
    consolationPool: 0n,
    consolationSupply: 0n,
    supply: seeded.supply
  }
}

export interface FixtureBuild {
  messages: FixtureMessage[]
  eliminatedByEpoch: Map<number, number[]>
  champion: number
}

export interface FixturePlan {
  burnerTarget: number | null
}

function reservesOf(coin: SimCoin): CurveReserves {
  return { vMon: coin.vMon, vTok: coin.vTok, rMon: coin.rMon }
}

function applyReserves(coin: SimCoin, next: CurveReserves): void {
  coin.vMon = next.vMon
  coin.vTok = next.vTok
  coin.rMon = next.rMon
}

export function buildFixture(plan: FixturePlan): FixtureBuild {
  const config = demoConfig()
  const vMon0 = BigInt(String(config['vMon0']))
  const vTok0 = BigInt(String(config['vTok0']))
  const coins: SimCoin[] = HOUSE_ROSTER.map((entry, index) =>
    newCoin(index, entry, addressOf(`house-wallet-${Math.floor(index / 2)}`), true, vMon0, vTok0)
  )
  const holdings = new Map<string, bigint>()
  const holdingKey = (coinId: number, holder: Hex): string => `${coinId}:${holder}`
  const messages: FixtureMessage[] = []
  const eliminatedByEpoch = new Map<number, number[]>()
  const rng = mulberry32(20261019)
  let block = FIXTURE_START_BLOCK
  let prizePot = 0n
  let treasury = 40n * E18
  let pendingFees = 0n
  let clashesPlayed = 0
  let clashCounter = 0
  let entropySeq = 100
  let lastResolveBlock = FIXTURE_START_BLOCK
  let champion = -1

  const timestampOf = (height: number): number =>
    FIXTURE_BASE_TIMESTAMP + Math.floor(((height - FIXTURE_START_BLOCK) * FIXTURE_BLOCK_MS) / 1000)
  const atMsOf = (height: number): number => (height - FIXTURE_START_BLOCK) * FIXTURE_BLOCK_MS
  const coinById = (coinId: number): SimCoin => {
    const coin = coins[coinId]
    if (coin === undefined) throw new RangeError(`unknown coin ${coinId}`)
    return coin
  }
  const aliveCoins = (): SimCoin[] => coins.filter((coin) => coin.status === 'Alive')

  const snapshotRound: RoundView = {
    roundId: FIXTURE_ROUND_ID,
    phase: 'Lobby',
    locked: false,
    epoch: 0,
    coinCount: coins.length,
    aliveCount: coins.length,
    cancelStreak: 0,
    winnerCoinId: 0,
    createdAt: FIXTURE_BASE_TIMESTAMP - LOBBY_ELAPSED_AT_SNAPSHOT,
    startedAt: 0,
    lockedAt: 0,
    lastEpochResolvedAt: 0,
    prizePot: '0',
    treasury: treasury.toString(),
    redeemPool: '0',
    redeemSupply: '0',
    clashesPlayed: 0
  }
  messages.push({
    atMs: 0,
    message: {
      kind: 'snapshot',
      data: {
        config,
        round: snapshotRound,
        coins: coins.map(toCoinView),
        blockNumber: FIXTURE_START_BLOCK,
        blockId: hashOf(`block-${FIXTURE_START_BLOCK}`),
        serverTime: FIXTURE_BASE_TIMESTAMP
      }
    }
  })
  messages.push({ atMs: 0, message: { kind: 'status', data: { upstream: 'live', headBlock: FIXTURE_START_BLOCK, lagSeconds: 0.3 } } })

  function emitBlock(
    target: number,
    batch: ReadonlyArray<{ name: ArenaEventName; args: Args }>,
    variant: 'canonical' | 'fork' = 'canonical',
    delayMs = 0
  ): number {
    const height = variant === 'fork' ? target : Math.max(target, block + 1)
    if (variant === 'canonical') block = height
    const blockId = hashOf(`${variant}-block-${height}`)
    const txHash = hashOf(`${variant}-tx-${height}`)
    const atMs = atMsOf(height) + delayMs
    batch.forEach((item, logIndex) => {
      messages.push({
        atMs,
        message: {
          kind: 'event',
          data: {
            id: envelopeId(height, logIndex),
            name: item.name,
            blockNumber: height,
            blockId,
            logIndex,
            txHash,
            timestamp: timestampOf(height),
            commitState: 'Proposed',
            args: item.args
          }
        }
      })
    })
    if (variant === 'canonical') {
      messages.push({
        atMs: atMs + VOTED_DELAY_MS,
        message: { kind: 'commit', data: { blockId, blockNumber: height, commitState: 'Voted' } }
      })
      messages.push({
        atMs: atMs + FINALIZED_DELAY_MS,
        message: { kind: 'commit', data: { blockId, blockNumber: height, commitState: 'Finalized' } }
      })
    }
    return height
  }

  function launch(entry: PlayerEntry, coinId: number, target: number): void {
    const coin = newCoin(coinId, entry, entry.creator, false, vMon0, vTok0)
    if (entry.imageUri !== undefined) coin.imageUri = entry.imageUri
    coins.push(coin)
    treasury += LAUNCH_FEE
    emitBlock(target, [
      {
        name: 'CoinLaunched',
        args: {
          roundId: FIXTURE_ROUND_ID,
          coinId,
          token: coin.token,
          creator: coin.creator,
          name: coin.name,
          ticker: coin.ticker,
          monsterType: coin.monsterType,
          skinId: coin.skinId,
          seedMon: coin.seedMon.toString(),
          vMon: coin.vMon.toString(),
          vTok: coin.vTok.toString(),
          supply: coin.supply.toString()
        }
      },
      ...(entry.imageUri === undefined
        ? []
        : [{ name: 'CoinImage' as const, args: { roundId: FIXTURE_ROUND_ID, coinId, imageUri: entry.imageUri } }])
    ])
  }

  function tradeArgs(coin: SimCoin, trader: Hex, isBuy: boolean, monAmount: bigint, tokenAmount: bigint): Args {
    return {
      roundId: FIXTURE_ROUND_ID,
      coinId: coin.coinId,
      trader,
      isBuy,
      monAmount: monAmount.toString(),
      tokenAmount: tokenAmount.toString(),
      rMon: coin.rMon.toString(),
      vMon: coin.vMon.toString(),
      vTok: coin.vTok.toString()
    }
  }

  function buy(coinId: number, trader: Hex, monIn: bigint, target: number, delayMs = 0): void {
    const coin = coinById(coinId)
    const quote = quoteBuy(reservesOf(coin), monIn, TRADE_FEE_BPS)
    applyReserves(coin, quote.next)
    pendingFees += quote.fee
    coin.supply += quote.tokensOut
    const key = holdingKey(coinId, trader)
    holdings.set(key, (holdings.get(key) ?? 0n) + quote.tokensOut)
    emitBlock(target, [{ name: 'Trade', args: tradeArgs(coin, trader, true, monIn, quote.tokensOut) }], 'canonical', delayMs)
  }

  function sell(coinId: number, trader: Hex, tokens: bigint, target: number): void {
    const coin = coinById(coinId)
    const quote = quoteSell(reservesOf(coin), tokens, TRADE_FEE_BPS)
    applyReserves(coin, quote.next)
    pendingFees += quote.fee
    coin.supply -= tokens
    const key = holdingKey(coinId, trader)
    holdings.set(key, (holdings.get(key) ?? 0n) - tokens)
    emitBlock(target, [{ name: 'Trade', args: tradeArgs(coin, trader, false, quote.monOut, tokens) }])
  }

  function forkedBuy(coinId: number, trader: Hex, forkMon: bigint, realMon: bigint, target: number): void {
    const coin = coinById(coinId)
    const forkQuote = quoteBuy(reservesOf(coin), forkMon, TRADE_FEE_BPS)
    const forkCoin: SimCoin = { ...coin, ...forkQuote.next }
    const height = Math.max(target, block + 1)
    emitBlock(height, [{ name: 'Trade', args: tradeArgs(forkCoin, trader, true, forkMon, forkQuote.tokensOut) }], 'fork')
    const forkBlockId = hashOf(`fork-block-${height}`)
    buy(coinId, trader, realMon, height, 120)
    messages.push({
      atMs: atMsOf(height) + 450,
      message: { kind: 'retract', data: { blockId: forkBlockId } }
    })
  }

  function sellFirstHolding(target: number): void {
    for (const [key, held] of holdings) {
      const [coinText, holder] = key.split(':')
      if (coinText === undefined || holder === undefined || held <= 0n) continue
      const trader = TRADERS.find((candidate) => candidate === holder)
      const coinId = Number(coinText)
      if (trader === undefined || coinById(coinId).status !== 'Alive') continue
      sell(coinId, trader, held / 2n, target)
      return
    }
  }

  function tradingWindow(count: number, from: number, scripted: (() => void) | null): void {
    let cursor = from
    if (scripted !== null) scripted()
    for (let i = 0; i < count; i += 1) {
      cursor = Math.max(cursor, block) + 9
      const candidates = aliveCoins()
      const pick = candidates[Math.floor(rng() * candidates.length)]
      const trader = TRADERS[Math.floor(rng() * TRADERS.length)]
      if (pick === undefined || trader === undefined) continue
      const held = holdings.get(holdingKey(pick.coinId, trader)) ?? 0n
      if (held > 0n && rng() < 0.3) {
        sell(pick.coinId, trader, held / 2n, cursor)
      } else {
        buy(pick.coinId, trader, mon(10 + Math.floor(rng() * 70)), cursor)
      }
    }
  }

  function huntAll(epoch: number): Array<{ name: ArenaEventName; args: Args }> {
    const out: Array<{ name: ArenaEventName; args: Args }> = []
    for (const coin of aliveCoins()) {
      const success = rng() < 0.5
      const xpGained = success ? XP_PER_HUNT : 0
      coin.xp += xpGained
      out.push({
        name: 'HuntResolved',
        args: {
          roundId: FIXTURE_ROUND_ID,
          epoch,
          coinId: coin.coinId,
          success,
          xpGained,
          xp: coin.xp,
          level: levelFor(coin.xp)
        }
      })
      const level = levelFor(coin.xp)
      if (level > coin.level) {
        coin.level = level
        out.push({ name: 'LevelUp', args: { roundId: FIXTURE_ROUND_ID, coinId: coin.coinId, level } })
      }
    }
    return out
  }

  function shuffled(ids: number[], epoch: number): number[] {
    const local = mulberry32(epoch * 977 + 13)
    const copy = [...ids]
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(local() * (i + 1))
      const a = copy[i]
      const b = copy[j]
      if (a === undefined || b === undefined) continue
      copy[i] = b
      copy[j] = a
    }
    return copy
  }

  function knockout(epoch: number): Array<{ name: ArenaEventName; args: Args }> {
    const out: Array<{ name: ArenaEventName; args: Args }> = []
    const order = shuffled(aliveCoins().map((coin) => coin.coinId), epoch)
    const pairCount = Math.min(CLASHES_PER_EPOCH, Math.floor(order.length / 2))
    const eliminated: number[] = []
    for (let i = 0; i < pairCount; i += 1) {
      const a = coinById(order[2 * i] ?? -1)
      const b = coinById(order[2 * i + 1] ?? -1)
      const powA = a.rMonAtLock * BigInt(10000 + 400 * (a.level - 1))
      const powB = b.rMonAtLock * BigInt(10000 + 400 * (b.level - 1))
      const winProb = Number(clampBig((10000n * powA) / (powA + powB), 1500n, 8500n))
      const roll = Math.floor(rng() * 10000)
      const winner = roll < winProb ? a : b
      const loser = winner === a ? b : a
      clashCounter += 1
      clashesPlayed += 1
      const reserve = loser.rMon
      const split = splitLoss(reserve)
      out.push({
        name: 'ClashResolved',
        args: {
          roundId: FIXTURE_ROUND_ID,
          epoch,
          clashId: clashCounter,
          winner: winner.coinId,
          loser: loser.coinId,
          winProbBps: winProb,
          roll,
          boost: split.boost.toString(),
          consolation: split.consolation.toString(),
          toPot: split.toPot.toString(),
          toTreasury: split.toTreasury.toString()
        }
      })
      applyReserves(winner, applyBoost(reservesOf(winner), split.boost))
      winner.wins += 1
      winner.xp += XP_PER_CLASH_WIN
      const levelAfterClash = Math.max(winner.level, levelFor(winner.xp))
      const leveledUp = levelAfterClash > winner.level
      winner.level = levelAfterClash
      out.push({
        name: 'Boosted',
        args: {
          roundId: FIXTURE_ROUND_ID,
          epoch,
          clashId: clashCounter,
          coinId: winner.coinId,
          boostMon: split.boost.toString(),
          rMon: winner.rMon.toString(),
          vMon: winner.vMon.toString(),
          vTok: winner.vTok.toString(),
          wins: winner.wins,
          level: winner.level,
          xpGained: XP_PER_CLASH_WIN,
          xp: winner.xp
        }
      })
      if (leveledUp) {
        out.push({ name: 'LevelUp', args: { roundId: FIXTURE_ROUND_ID, coinId: winner.coinId, level: winner.level } })
      }
      loser.status = 'Eliminated'
      loser.rMon = 0n
      loser.consolationPool = split.consolation
      loser.consolationSupply = loser.supply
      prizePot += split.toPot
      treasury += split.toTreasury
      eliminated.push(loser.coinId)
      out.push({
        name: 'CoinEliminated',
        args: {
          roundId: FIXTURE_ROUND_ID,
          coinId: loser.coinId,
          consolationPool: loser.consolationPool.toString(),
          consolationSupply: loser.consolationSupply.toString()
        }
      })
    }
    eliminatedByEpoch.set(epoch, eliminated)
    for (const id of order.slice(pairCount * 2)) {
      out.push({ name: 'ByeGranted', args: { roundId: FIXTURE_ROUND_ID, epoch, coinId: id } })
    }
    return out
  }

  function runEpoch(epoch: number, withCancel: boolean): number {
    const lockTarget = Math.max(lastResolveBlock + EPOCH_BLOCKS, block + 1)
    const lockEvent = (lockedAtBlock: number): { name: ArenaEventName; args: Args } => {
      entropySeq += 1
      let mask = 0
      for (const coin of aliveCoins()) {
        coin.rMonAtLock = coin.rMon
        mask |= 1 << coin.coinId
      }
      return {
        name: 'EpochLocked',
        args: {
          roundId: FIXTURE_ROUND_ID,
          epoch,
          entropySeq,
          aliveMask: mask >>> 0,
          lockedAt: timestampOf(lockedAtBlock)
        }
      }
    }
    const seedFeeEvent = (): { name: ArenaEventName; args: Args } => {
      treasury -= SEED_FEE
      return {
        name: 'TreasurySpent',
        args: { roundId: FIXTURE_ROUND_ID, kind: 0, amount: SEED_FEE.toString(), treasuryAfter: treasury.toString() }
      }
    }
    let lockBlock = Math.max(lockTarget, block + 1)
    emitBlock(lockBlock, [lockEvent(lockBlock), seedFeeEvent()])
    messages.push({
      atMs: atMsOf(lockBlock),
      message: { kind: 'status', data: { upstream: 'live', headBlock: lockBlock, lagSeconds: 0.4 } }
    })
    if (withCancel) {
      const cancelBlock = emitBlock(lockBlock + SEED_TIMEOUT_BLOCKS, [
        { name: 'EpochCancelled', args: { roundId: FIXTURE_ROUND_ID, epoch } }
      ])
      lockBlock = cancelBlock + 3
      emitBlock(lockBlock, [lockEvent(lockBlock), seedFeeEvent()])
    }
    const seedBlock = emitBlock(lockBlock + 8, [
      { name: 'SeedReady', args: { roundId: FIXTURE_ROUND_ID, epoch, seed: hashOf(`seed-${epoch}-${entropySeq}`) } }
    ])
    const batch: Array<{ name: ArenaEventName; args: Args }> = []
    if (epoch > LEVELING_EPOCHS) batch.push(...knockout(epoch))
    batch.push(...huntAll(epoch))
    if (pendingFees > 0n) {
      const toPot = (pendingFees * 3n) / 4n
      const toTreasury = pendingFees - toPot
      pendingFees = 0n
      prizePot += toPot
      treasury += toTreasury
      batch.push({
        name: 'FeesSwept',
        args: {
          roundId: FIXTURE_ROUND_ID,
          epoch,
          toPot: toPot.toString(),
          toTreasury: toTreasury.toString(),
          prizePotAfter: prizePot.toString(),
          treasuryAfter: treasury.toString()
        }
      })
    }
    treasury -= KEEPER_BOUNTY
    batch.push({
      name: 'TreasurySpent',
      args: {
        roundId: FIXTURE_ROUND_ID,
        kind: 1,
        amount: KEEPER_BOUNTY.toString(),
        treasuryAfter: treasury.toString()
      }
    })
    batch.push({
      name: 'EpochResolved',
      args: { roundId: FIXTURE_ROUND_ID, epoch, aliveCount: aliveCoins().length }
    })
    const remaining = aliveCoins()
    if (epoch > LEVELING_EPOCHS && remaining.length === 1) {
      const winner = remaining[0]
      if (winner !== undefined) {
        winner.status = 'Champion'
        champion = winner.coinId
        batch.push({
          name: 'RoundSettled',
          args: {
            roundId: FIXTURE_ROUND_ID,
            winnerCoinId: winner.coinId,
            redeemPool: (winner.rMon + prizePot).toString(),
            redeemSupply: winner.supply.toString()
          }
        })
      }
    }
    const resolveBlock = emitBlock(seedBlock + 4, batch)
    lastResolveBlock = resolveBlock
    return resolveBlock
  }

  PLAYER_ROSTER.forEach((entry, index) => {
    launch(entry, HOUSE_ROSTER.length + index, block + (index === 0 ? 10 : 30))
  })
  const startBlock = emitBlock(block + 60, [
    {
      name: 'RoundStarted',
      args: { roundId: FIXTURE_ROUND_ID, startedAt: timestampOf(block + 60), coins: coins.length }
    }
  ])
  lastResolveBlock = startBlock

  for (let epoch = 1; epoch <= LEVELING_EPOCHS; epoch += 1) {
    const scripted =
      epoch === 1
        ? (): void => forkedBuy(2, FIXTURE_BURNER, mon(20), mon(30), block + 6)
        : epoch === 2
          ? (): void => sellFirstHolding(block + 6)
          : null
    tradingWindow(epoch === 1 ? 5 : 4, lastResolveBlock + 4, scripted)
    runEpoch(epoch, false)
  }

  tradingWindow(
    3,
    lastResolveBlock + 4,
    plan.burnerTarget === null ? null : (): void => buy(plan.burnerTarget ?? 0, FIXTURE_BURNER, mon(50), block + 5)
  )
  let epoch = LEVELING_EPOCHS + 1
  let resolved = runEpoch(epoch, false)

  if (plan.burnerTarget !== null) {
    const target = coinById(plan.burnerTarget)
    const key = holdingKey(target.coinId, FIXTURE_BURNER)
    const tokens = holdings.get(key) ?? 0n
    if (target.status === 'Eliminated' && tokens > 0n && target.consolationSupply > 0n) {
      const monPaid = (tokens * target.consolationPool) / target.consolationSupply
      target.supply -= tokens
      holdings.set(key, 0n)
      emitBlock(resolved + 24, [
        {
          name: 'ConsolationClaimed',
          args: {
            roundId: FIXTURE_ROUND_ID,
            coinId: target.coinId,
            holder: FIXTURE_BURNER,
            tokens: tokens.toString(),
            monPaid: monPaid.toString()
          }
        }
      ])
    }
  }

  epoch += 1
  tradingWindow(2, lastResolveBlock + 30, null)
  resolved = runEpoch(epoch, true)
  while (aliveCoins().length > 1) {
    epoch += 1
    tradingWindow(2, lastResolveBlock + 4, null)
    resolved = runEpoch(epoch, false)
  }
  messages.push({
    atMs: atMsOf(resolved) + 1200,
    message: { kind: 'status', data: { upstream: 'live', headBlock: resolved, lagSeconds: 0.4 } }
  })
  messages.sort((a, b) => a.atMs - b.atMs)
  return { messages, eliminatedByEpoch, champion }
}

export function generateFixture(): FixtureMessage[] {
  for (let candidate = 0; candidate < 15; candidate += 1) {
    const build = buildFixture({ burnerTarget: candidate })
    const eliminated = build.eliminatedByEpoch.get(LEVELING_EPOCHS + 1) ?? []
    if (eliminated.includes(candidate)) return build.messages
  }
  throw new Error('no burner target is eliminated in the first knockout epoch')
}
