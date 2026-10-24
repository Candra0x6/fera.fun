import type { ArenaBridge, ClashPlan, CoinSceneView } from '../arena/bridge'
import { safeImageSrc } from './coinImage'
import { weiToMon } from './format'
import { isFinalClash } from './finalDuel'
import { withTimeout } from './safety'

export type DirectorCommitState = 'Proposed' | 'Voted' | 'Finalized' | 'Verified'

export interface DirectorEnvelope {
  id: string
  name: string
  txHash: string
  timestamp: number
  commitState: DirectorCommitState
  args: Readonly<Record<string, string | number | boolean>>
}

export interface DirectorCoin {
  roundId: number
  coinId: number
  token: string
  name: string
  ticker: string
  monsterType: number
  skinId: number
  status: string
  level: number
  xp: number
  wins: number
  rMon: string
  isHouse: boolean
  imageUri?: string
}

export interface DirectorRound {
  roundId: number
  phase: string
  locked: boolean
  epoch: number
  coinCount: number
  aliveCount: number
  winnerCoinId: number
  redeemPool?: string
}

export interface DirectorStateView {
  round: DirectorRound | null
  coins: readonly DirectorCoin[]
}

export interface DirectorState {
  hydrated: boolean
  config: Readonly<Record<string, number | string | boolean>> | null
  persisted: DirectorStateView
  optimistic: DirectorStateView
  events: readonly DirectorEnvelope[]
}

export interface DirectorStore {
  getState(): DirectorState
  subscribe(cb: () => void): () => void
}

export type DirectorBridge = Pick<
  ArenaBridge,
  | 'hydrate'
  | 'spawnCoin'
  | 'updateCoins'
  | 'onTrade'
  | 'onEpochLocked'
  | 'onSeedReady'
  | 'onEpochResolved'
  | 'onClashResolved'
  | 'onHuntResolved'
  | 'onLevelUp'
  | 'onCoinEliminated'
  | 'onBye'
  | 'onEpochCancelled'
  | 'onRoundSettled'
  | 'on'
> & { camera: Pick<ArenaBridge['camera'], 'fit'> }

export interface FeedCoin {
  id: string
  ticker: string
  monsterType: number
}

export interface FeedRow {
  clashId: string
  winner: FeedCoin
  loser: FeedCoin
  boost: number
  consolation: number
  toPot: number
  toTreasury: number
  txHash: string
  timestampMs: number
}

export interface RoundSummary {
  roundId: number
  phase: string
  locked: boolean
  epoch: number
  coinCount: number
  aliveCount: number
  maxCoins: number | null
}

export interface DirectorOptions {
  store: DirectorStore
  bridge: DirectorBridge
  nowSeconds: () => number
  maxAgeSeconds?: number
  onFeedRow?: (row: FeedRow) => void
  onRoundChange?: (summary: RoundSummary) => void
}

export interface Director {
  dispose(): void
}

const COMMIT_ORDER: Readonly<Record<DirectorCommitState, number>> = {
  Proposed: 0,
  Voted: 1,
  Finalized: 2,
  Verified: 3
}

const ANIMATED_EVENTS: ReadonlySet<string> = new Set([
  'CoinLaunched',
  'RoundStarted',
  'EpochLocked',
  'SeedReady',
  'ClashResolved',
  'HuntResolved',
  'LevelUp',
  'CoinEliminated',
  'ByeGranted',
  'EpochResolved',
  'EpochCancelled',
  'RoundSettled'
])

const CLASH_WAIT_TIMEOUT_MS = 15000
const DEFAULT_MAX_AGE_SECONDS = 15
const DEFAULT_EPOCH_SECONDS = 20

export function coinKey(roundId: number, coinId: number): string {
  return `${roundId}:${coinId}`
}

function isOnStage(coin: DirectorCoin): boolean {
  return coin.status === 'Alive' || coin.status === 'Champion'
}

function compareCoins(a: DirectorCoin, b: DirectorCoin): number {
  const left = BigInt(a.rMon)
  const right = BigInt(b.rMon)
  if (left !== right) return left > right ? -1 : 1
  if (a.wins !== b.wins) return b.wins - a.wins
  const tokenA = a.token.toLowerCase()
  const tokenB = b.token.toLowerCase()
  if (tokenA < tokenB) return -1
  if (tokenA > tokenB) return 1
  return 0
}

function numberArg(e: DirectorEnvelope, key: string): number {
  const value = e.args[key]
  return typeof value === 'number' ? value : Number(value ?? 0)
}

function stringArg(e: DirectorEnvelope, key: string): string {
  const value = e.args[key]
  return value === undefined ? '' : String(value)
}

function boolArg(e: DirectorEnvelope, key: string): boolean {
  return e.args[key] === true
}

function monArg(e: DirectorEnvelope, key: string): number {
  const value = stringArg(e, key)
  return /^\d+$/.test(value) ? weiToMon(value) : 0
}

export function toSceneView(coin: DirectorCoin, rank: number): CoinSceneView {
  return {
    id: coinKey(coin.roundId, coin.coinId),
    ticker: coin.ticker,
    name: coin.name,
    monsterType: coin.monsterType,
    skinId: coin.skinId,
    rMon: weiToMon(coin.rMon),
    level: coin.level,
    xp: coin.xp,
    wins: coin.wins,
    rank,
    isHouse: coin.isHouse,
    token: coin.token,
    imageUri: safeImageSrc(coin.imageUri) ?? undefined
  }
}

export function createDirector(options: DirectorOptions): Director {
  const { store, bridge, nowSeconds } = options
  const maxAge = options.maxAgeSeconds ?? DEFAULT_MAX_AGE_SECONDS
  const seen = new Set<string>()
  const displayed = new Map<string, DirectorCoin>()
  const locked = new Set<string>()
  const removed = new Set<string>()
  const inFlight = new Map<string, { winnerKey: string; loserKey: string }>()
  const clashEnvelopeIds = new Map<string, string>()
  const mergedClashes = new Set<string>()
  const outstanding = new Set<Promise<void>>()
  const emittedFeedRows = new Set<string>()
  const clashRows = new Map<string, FeedRow>()
  let hydratedConfig: DirectorState['config'] | undefined
  let lastSummary = ''
  let disposed = false
  let wasHydrated = false
  let generation = 0

  function epochSeconds(state: DirectorState): number {
    const value = state.config?.['epochSeconds']
    return typeof value === 'number' ? value : DEFAULT_EPOCH_SECONDS
  }

  function rankedViews(): CoinSceneView[] {
    return [...displayed.values()].sort(compareCoins).map((coin, index) => toSceneView(coin, index + 1))
  }

  function pushNumbers(): void {
    bridge.updateCoins(rankedViews())
  }

  function syncNumbers(state: DirectorState): void {
    let changed = false
    for (const coin of state.persisted.coins) {
      const key = coinKey(coin.roundId, coin.coinId)
      if (locked.has(key)) continue
      if (!isOnStage(coin)) {
        if (displayed.delete(key)) {
          changed = true
          if (coin.status === 'Refunded') bridge.onCoinEliminated({ id: key })
        }
        continue
      }
      const settledPool = state.persisted.round?.phase === 'Settled' && coin.status === 'Champion' ? state.persisted.round : null
      const shown = settledPool === null || !('redeemPool' in settledPool) ? coin : { ...coin, rMon: String(settledPool.redeemPool) }
      const previous = displayed.get(key)
      if (
        previous === undefined ||
        previous.rMon !== shown.rMon ||
        previous.wins !== coin.wins ||
        previous.level !== coin.level ||
        previous.xp !== coin.xp ||
        previous.imageUri !== coin.imageUri
      ) {
        displayed.set(key, shown)
        changed = true
      }
    }
    if (changed) pushNumbers()
  }

  function reportRound(state: DirectorState): void {
    const round = state.optimistic.round
    if (round === null || options.onRoundChange === undefined) return
    const maxValue = state.config?.['maxCoins']
    const summary: RoundSummary = {
      roundId: round.roundId,
      phase: round.phase,
      locked: round.locked,
      epoch: round.epoch,
      coinCount: round.coinCount,
      aliveCount: round.aliveCount,
      maxCoins: typeof maxValue === 'number' ? maxValue : null
    }
    const signature = JSON.stringify(summary)
    if (signature === lastSummary) return
    lastSummary = signature
    options.onRoundChange(summary)
  }

  function hydrateFrom(state: DirectorState): void {
    displayed.clear()
    locked.clear()
    removed.clear()
    inFlight.clear()
    clashEnvelopeIds.clear()
    mergedClashes.clear()
    clashRows.clear()
    for (const coin of state.persisted.coins) {
      const key = coinKey(coin.roundId, coin.coinId)
      if (isOnStage(coin)) displayed.set(key, coin)
      else removed.add(key)
    }
    for (const e of state.events) seen.add(e.id)
    bridge.hydrate(rankedViews())
    const round = state.persisted.round
    if (round !== null && round.locked) {
      bridge.onEpochLocked({ epoch: round.epoch, seconds: epochSeconds(state) })
    }
  }

  function findCoin(state: DirectorState, roundId: number, coinId: number): DirectorCoin | undefined {
    const fromOptimistic = state.optimistic.coins.find((coin) => coin.roundId === roundId && coin.coinId === coinId)
    return fromOptimistic ?? state.persisted.coins.find((coin) => coin.roundId === roundId && coin.coinId === coinId)
  }

  function launchedCoin(state: DirectorState, e: DirectorEnvelope): DirectorCoin {
    const roundId = numberArg(e, 'roundId')
    const coinId = numberArg(e, 'coinId')
    const known = findCoin(state, roundId, coinId)
    if (known !== undefined) return known
    return {
      roundId,
      coinId,
      token: stringArg(e, 'token'),
      name: stringArg(e, 'name'),
      ticker: stringArg(e, 'ticker'),
      monsterType: numberArg(e, 'monsterType'),
      skinId: numberArg(e, 'skinId'),
      status: 'Alive',
      level: 1,
      xp: 0,
      wins: 0,
      rMon: stringArg(e, 'seedMon') || '0',
      isHouse: false
    }
  }

  function feedCoin(state: DirectorState, roundId: number, coinId: number): FeedCoin {
    const coin = findCoin(state, roundId, coinId)
    return {
      id: coinKey(roundId, coinId),
      ticker: coin?.ticker ?? `#${coinId}`,
      monsterType: coin?.monsterType ?? 0
    }
  }

  function flushFeed(state: DirectorState): void {
    if (options.onFeedRow === undefined) return
    for (const clashId of mergedClashes) {
      if (emittedFeedRows.has(clashId)) continue
      const envelopeId = clashEnvelopeIds.get(clashId)
      const row = clashRows.get(clashId)
      if (envelopeId === undefined || row === undefined) continue
      const envelope = state.events.find((candidate) => candidate.id === envelopeId)
      if (envelope === undefined || COMMIT_ORDER[envelope.commitState] < COMMIT_ORDER.Finalized) continue
      emittedFeedRows.add(clashId)
      options.onFeedRow(row)
    }
  }

  function handleClash(state: DirectorState, e: DirectorEnvelope, stale: boolean): void {
    const roundId = numberArg(e, 'roundId')
    const winnerKey = coinKey(roundId, numberArg(e, 'winner'))
    const loserKey = coinKey(roundId, numberArg(e, 'loser'))
    if (removed.has(loserKey) || removed.has(winnerKey)) return
    const finalDuel = isFinalClash(displayed.keys(), removed, winnerKey, loserKey)
    const clashId = `${roundId}:${numberArg(e, 'epoch')}:${stringArg(e, 'clashId')}`
    const plan: ClashPlan = {
      clashId,
      winnerId: winnerKey,
      loserId: loserKey,
      winProbBps: numberArg(e, 'winProbBps'),
      roll: numberArg(e, 'roll'),
      boost: monArg(e, 'boost'),
      consolation: monArg(e, 'consolation'),
      toPot: monArg(e, 'toPot'),
      toTreasury: monArg(e, 'toTreasury'),
      blockTimestamp: e.timestamp,
      spread: state.config?.['consolationMode'] === 1,
      finalDuel
    }
    clashEnvelopeIds.set(clashId, e.id)
    clashRows.set(clashId, {
      clashId,
      winner: feedCoin(state, roundId, numberArg(e, 'winner')),
      loser: feedCoin(state, roundId, numberArg(e, 'loser')),
      boost: plan.boost,
      consolation: plan.consolation,
      toPot: plan.toPot,
      toTreasury: plan.toTreasury,
      txHash: e.txHash,
      timestampMs: e.timestamp * 1000
    })
    removed.add(loserKey)
    if (stale) {
      bridge.onCoinEliminated({ id: loserKey })
      mergedClashes.add(clashId)
      return
    }
    locked.add(winnerKey)
    locked.add(loserKey)
    inFlight.set(clashId, { winnerKey, loserKey })
    const playing = bridge.onClashResolved(plan)
    outstanding.add(playing)
    void playing.finally(() => outstanding.delete(playing))
  }

  function settleAfterClashes(winnerId: string): void {
    const waiting = [...outstanding]
    const startedIn = generation
    if (waiting.length === 0) {
      void bridge.onRoundSettled({ winnerId })
      return
    }
    void withTimeout(Promise.allSettled(waiting), CLASH_WAIT_TIMEOUT_MS).then(() => {
      if (!disposed && startedIn === generation) void bridge.onRoundSettled({ winnerId })
    })
  }

  function handleAnimated(state: DirectorState, e: DirectorEnvelope, stale: boolean): void {
    const roundId = numberArg(e, 'roundId')
    switch (e.name) {
      case 'CoinLaunched': {
        const coin = launchedCoin(state, e)
        const key = coinKey(coin.roundId, coin.coinId)
        displayed.set(key, coin)
        const ranked = rankedViews()
        const view = ranked.find((candidate) => candidate.id === key)
        if (view !== undefined) bridge.spawnCoin(view, { animate: !stale })
        pushNumbers()
        break
      }
      case 'RoundStarted':
        if (!stale) bridge.camera.fit()
        break
      case 'EpochLocked':
        if (!stale) bridge.onEpochLocked({ epoch: numberArg(e, 'epoch'), seconds: epochSeconds(state) })
        break
      case 'SeedReady':
        if (!stale) bridge.onSeedReady({ epoch: numberArg(e, 'epoch') })
        break
      case 'ClashResolved':
        handleClash(state, e, stale)
        break
      case 'HuntResolved':
        if (!stale) {
          void bridge.onHuntResolved({
            id: coinKey(roundId, numberArg(e, 'coinId')),
            success: boolArg(e, 'success'),
            xp: numberArg(e, 'xpGained')
          })
        }
        break
      case 'LevelUp':
        if (!stale) bridge.onLevelUp({ id: coinKey(roundId, numberArg(e, 'coinId')), level: numberArg(e, 'level') })
        break
      case 'CoinEliminated': {
        const key = coinKey(roundId, numberArg(e, 'coinId'))
        removed.add(key)
        bridge.onCoinEliminated({ id: key })
        break
      }
      case 'ByeGranted':
        if (!stale) bridge.onBye({ id: coinKey(roundId, numberArg(e, 'coinId')) })
        break
      case 'EpochResolved':
        bridge.onEpochResolved({ epoch: numberArg(e, 'epoch') })
        break
      case 'EpochCancelled':
        bridge.onEpochCancelled({ epoch: numberArg(e, 'epoch') })
        break
      case 'RoundSettled':
        settleAfterClashes(coinKey(roundId, numberArg(e, 'winnerCoinId')))
        break
      default:
        break
    }
  }

  function handleTrade(e: DirectorEnvelope, stale: boolean): void {
    if (stale) return
    bridge.onTrade({
      id: coinKey(numberArg(e, 'roundId'), numberArg(e, 'coinId')),
      isBuy: boolArg(e, 'isBuy'),
      mon: monArg(e, 'monAmount'),
      rMon: monArg(e, 'rMon')
    })
  }

  function processEvents(state: DirectorState): void {
    let animationBlocked = false
    for (const e of state.events) {
      if (seen.has(e.id)) continue
      const commit = COMMIT_ORDER[e.commitState]
      const stale = e.timestamp > 0 && nowSeconds() - e.timestamp > maxAge
      if (e.name === 'Trade') {
        seen.add(e.id)
        handleTrade(e, stale)
        continue
      }
      if (!ANIMATED_EVENTS.has(e.name)) {
        seen.add(e.id)
        continue
      }
      if (animationBlocked || commit < COMMIT_ORDER.Voted) {
        animationBlocked = true
        continue
      }
      seen.add(e.id)
      handleAnimated(state, e, stale)
    }
  }

  function resetForNewRound(): void {
    wasHydrated = false
    hydratedConfig = undefined
    lastSummary = ''
    generation += 1
    displayed.clear()
    locked.clear()
    removed.clear()
    inFlight.clear()
    clashEnvelopeIds.clear()
    mergedClashes.clear()
    clashRows.clear()
    bridge.hydrate([])
  }

  function onStoreChange(): void {
    if (disposed) return
    const state = store.getState()
    if (!state.hydrated) {
      if (wasHydrated) resetForNewRound()
      return
    }
    if (state.config !== hydratedConfig || !wasHydrated) {
      wasHydrated = true
      hydratedConfig = state.config
      hydrateFrom(state)
      reportRound(state)
      return
    }
    processEvents(state)
    syncNumbers(state)
    flushFeed(state)
    reportRound(state)
  }

  function releaseClash(clashId: string): void {
    const flight = inFlight.get(clashId)
    if (flight === undefined) return
    inFlight.delete(clashId)
    locked.delete(flight.winnerKey)
    locked.delete(flight.loserKey)
    mergedClashes.add(clashId)
    const state = store.getState()
    syncNumbers(state)
    flushFeed(state)
  }

  const unsubscribeDuel = bridge.on('duel', (event) => {
    if (event.phase === 'merged' || event.phase === 'skipped') releaseClash(event.clashId)
  })
  const unsubscribeStore = store.subscribe(onStoreChange)
  onStoreChange()

  return {
    dispose() {
      disposed = true
      unsubscribeStore()
      unsubscribeDuel()
    }
  }
}
