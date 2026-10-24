import { parseFixture, replayFixture } from '@animal/shared'
import { StrictMode } from 'react'
import type { ReactElement } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/index.css'
import { startArena } from './arena/bridge'
import type { ArenaBridge } from './arena/bridge'
import { setClock, nowSeconds } from './chain/clock'
import { createDirector } from './chain/director'
import type { RoundSummary } from './chain/director'
import { createFeedRenderer } from './chain/feed'
import { withTimeout } from './chain/safety'
import { startLiveFeed } from './chain/liveFeed'
import { createEpoch } from './chain/roundFollow'
import { arenaStore, config, mode, setBridge, setFeedNoteHandler, uiStore } from './chain/session'
import { setStatus, statusFromFeed } from './chain/status'
import { stressSnapshot } from './chain/stress'
import { ChampionIsland } from './islands/ChampionIsland'
import { resolveDemoToken } from './chain/demo'
import { ClaimsIsland } from './islands/ClaimsIsland'
import { DemoIsland } from './islands/DemoIsland'
import { LaunchIsland } from './islands/LaunchIsland'
import { LockdownIsland } from './islands/LockdownIsland'
import { RulesIsland } from './islands/RulesIsland'
import { StageIsland } from './islands/StageIsland'
import { StatusChip } from './islands/StatusChip'
import { ToastsIsland } from './islands/ToastsIsland'
import { TradeIsland } from './islands/TradeIsland'
import { WalletIsland } from './islands/WalletIsland'

const params = new URLSearchParams(window.location.search)
const replay = params.get('replay')
const speedParam = Number(params.get('speed'))
const replaySpeed = Number.isFinite(speedParam) && speedParam > 0 ? speedParam : 1
const stressParam = Number(params.get('coins'))

document.documentElement.dataset['mode'] = mode
if (params.get('debug') === '1') document.documentElement.dataset['debug'] = ''

function mount(id: string, element: ReactElement): void {
  const host = document.getElementById(id)
  if (host !== null) createRoot(host).render(<StrictMode>{element}</StrictMode>)
}

mount('island-status', <StatusChip />)

function applyRound(summary: RoundSummary): void {
  const target = document.getElementById('stat-target-count')
  if (target !== null && summary.maxCoins !== null) target.textContent = String(summary.maxCoins)
  if (summary.phase !== 'Settled') uiStore.set((previous) => (previous.sawLiveRound ? previous : { ...previous, sawLiveRound: true }))
  else if (!uiStore.get().sawLiveRound) uiStore.set((previous) => ({ ...previous, finaleDone: true }))
}

const FINALE_TIMEOUT_MS = 12000

const roundEpoch = createEpoch()

function withFinale(bridge: ArenaBridge): ArenaBridge {
  return {
    ...bridge,
    onRoundSettled: async (event) => {
      const token = roundEpoch.token()
      await withTimeout(bridge.onRoundSettled(event), FINALE_TIMEOUT_MS)
      if (roundEpoch.isCurrent(token)) uiStore.set((previous) => ({ ...previous, finaleDone: true }))
    }
  }
}

async function startFixtureReplay(): Promise<void> {
  const { default: rawFixture } = await import('@animal/shared/fixtures/arena-replay.json')
  const messages = parseFixture(rawFixture)
  const snapshot = messages.find((item) => item.message.kind === 'snapshot')
  const baseSeconds = snapshot?.message.kind === 'snapshot' ? snapshot.message.data.serverTime : Date.now() / 1000
  let fixtureMs = 0
  setClock(() => baseSeconds + fixtureMs / 1000)
  setStatus({ kind: 'replay', blockNumber: null, lagSeconds: 0 })
  await replayFixture(arenaStore, messages, {
    speed: replaySpeed,
    sleep: async (ms) => {
      await new Promise<void>((resolve) => window.setTimeout(resolve, ms))
      fixtureMs += ms * replaySpeed
    },
    onStatus: (feedStatus) => {
      const mapped = statusFromFeed(feedStatus)
      setStatus(mapped.kind === 'live' ? { ...mapped, kind: 'replay' } : mapped)
    }
  })
}

async function startStress(count: number): Promise<void> {
  const { default: rawFixture } = await import('@animal/shared/fixtures/arena-replay.json')
  const first = parseFixture(rawFixture).find((item) => item.message.kind === 'snapshot')
  if (first === undefined || first.message.kind !== 'snapshot') return
  setStatus({ kind: 'replay', blockNumber: null, lagSeconds: 0 })
  arenaStore.hydrate(stressSnapshot(first.message.data, count))
}

function mountDemo(): void {
  if (replay !== null || config.keeperUrl === null) return
  const token = resolveDemoToken(window.location.search, window.sessionStorage, import.meta.env['VITE_DEMO_TOKEN'] ?? null)
  if (token === null) return
  const host = document.createElement('div')
  host.id = 'island-demo'
  host.className = 'fixed bottom-3 left-3 z-30 pointer-events-none'
  document.body.append(host)
  mount('island-demo', <DemoIsland baseUrl={config.keeperUrl} token={token} />)
}

async function boot(): Promise<void> {
  if (mode === 'sim') {
    setStatus({ kind: 'sandbox', blockNumber: null, lagSeconds: 0 })
    mount('island-wallet', <WalletIsland />)
    await startArena('sim')
    return
  }
  setStatus({ kind: 'syncing', blockNumber: null, lagSeconds: 0 })
  mount('island-wallet', <WalletIsland />)
  mount('island-lobby', <LaunchIsland />)
  mount('island-stage', <StageIsland />)
  mount('island-rules', <RulesIsland />)
  mount('island-lockdown', <LockdownIsland />)
  mount('island-trade', <TradeIsland />)
  mount('island-claims', <ClaimsIsland />)
  mount('island-champion', <ChampionIsland />)
  mount('island-toasts', <ToastsIsland />)
  mountDemo()

  const feedHost = document.getElementById('kill-feed-list')
  const feed = feedHost === null ? null : createFeedRenderer(feedHost)
  setFeedNoteHandler((text) => feed?.addNote(text))
  const bridge = await startArena('chain')
  setBridge(bridge)
  if (params.get('debug') === '1') bridge.on('stats', (event) => Reflect.set(window, '__arenaStats', event))
  createDirector({
    store: arenaStore,
    bridge: withFinale(bridge),
    nowSeconds,
    onFeedRow: (row) => feed?.add(replay === null ? row : { ...row, timestampMs: Date.now() }),
    onRoundChange: applyRound
  })
  if (replay === 'fixture') await startFixtureReplay()
  else if (replay === 'stress') await startStress(Number.isInteger(stressParam) && stressParam > 0 ? stressParam : 30)
  else {
    startLiveFeed(config, arenaStore, {
      onRoundSwitch: (_roundId, previous) => {
        if (previous === null) return
        roundEpoch.advance()
        uiStore.set((state) => ({ ...state, selectedId: null, finaleDone: false, championClosed: false, sawLiveRound: false }))
      }
    })
  }
}

void boot()
