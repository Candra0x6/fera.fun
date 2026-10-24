export interface CoinSceneView {
  id: string
  ticker: string
  name: string
  monsterType: number
  skinId: number
  rMon: number
  level: number
  xp: number
  wins: number
  rank: number
  isHouse: boolean
  token?: string
  imageUri?: string
}

export interface ClashPlan {
  clashId: string
  winnerId: string
  loserId: string
  winProbBps: number
  roll: number
  boost: number
  consolation: number
  toPot: number
  toTreasury: number
  blockTimestamp: number
  spread?: boolean
  finalDuel?: boolean
}

export interface ArenaEvents {
  ready: Record<string, never>
  select: { id: string | null; source: 'pick' | 'api' | 'removed' }
  stats: {
    fps: number
    liveCoins: number
    activeDuels: number
    clashesPlayed: number
    quality: number
    calls: number
    triangles: number
    cpuMs: { sim: number; labels: number; minimap: number; render: number }
  }
  telemetry: { id: string; state: string; x: number; z: number; biome: string; opponent: string | null }
  duel: {
    clashId: string
    phase: 'approach' | 'strike' | 'finisher' | 'merged' | 'done' | 'skipped'
    winnerId: string
    loserId: string
  }
}

export interface ArenaFilters {
  element: string
  monsterId: string
  query: string
  selectiveLabels: boolean
  biomeMarkers: boolean
}

export type ArenaMode = 'chain' | 'sim'

export interface ArenaBridge {
  hydrate(coins: CoinSceneView[]): void
  spawnCoin(coin: CoinSceneView, opts?: { animate?: boolean }): void
  updateCoins(coins: CoinSceneView[]): void
  onTrade(e: { id: string; isBuy: boolean; mon: number; rMon: number }): void
  onEpochLocked(e: { epoch: number; seconds: number }): void
  onSeedReady(e: { epoch: number }): void
  onEpochResolved(e: { epoch: number }): void
  onClashResolved(plan: ClashPlan): Promise<void>
  onHuntResolved(e: { id: string; success: boolean; xp: number }): Promise<void>
  onLevelUp(e: { id: string; level: number }): void
  onCoinEliminated(e: { id: string }): void
  onBye(e: { id: string }): void
  onEpochCancelled(e: { epoch: number }): void
  onRoundSettled(e: { winnerId: string }): Promise<void>
  select(id: string | null): void
  setFilters(f: ArenaFilters): void
  camera: { fit(): void; zoom(dir: 1 | -1): void; panTo(x: number, z: number): void }
  setMode(mode: ArenaMode): void
  dispose(): void
  on<K extends keyof ArenaEvents>(name: K, cb: (e: ArenaEvents[K]) => void): () => void
}

export async function startArena(mode: ArenaMode): Promise<ArenaBridge> {
  const scene = await import('./arena3d.js')
  return scene.start(mode)
}

export interface LaunchPreview {
  supported: boolean
  setMonster(key: string): void
  setSkin(key: string): void
  dispose(): void
}

// Mounts the live 3D preview into `container`. Keys are catalog keys (fire_dragon, royal, ...).
// Dispose it when the modal closes: it owns its own WebGL renderer and rAF loop.
export async function mountLaunchPreview(container: HTMLElement, opts: { monsterId: string; skinId: string }): Promise<LaunchPreview> {
  const scene = await import('./arena3d.js')
  return scene.mountLaunchPreview(container, opts)
}
