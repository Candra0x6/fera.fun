export function hashString(input: string): number {
  let hash = 0x811c9dc5
  for (let index = 0; index < input.length; index++) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash >>> 0
}

export function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let mixed = state
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1)
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61)
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296
  }
}

export interface SpawnAnchorInput {
  roundId: number
  coinId: number
  monsterType: number
  worldRadius: number
  innerRadius?: number
  rimMargin?: number
  isBlocked: (x: number, z: number) => boolean
}

export interface SpawnAnchor {
  x: number
  z: number
}

const BIOME_CENTER_ANGLES: readonly number[] = [Math.PI / 2, -Math.PI / 2, Math.PI, 0, 0]
const SECTOR_SPREAD = Math.PI / 2 - 0.4
const INNER_RADIUS = 28
const RIM_MARGIN = 20
const MAX_ATTEMPTS = 40

function biomeCenterAngle(monsterType: number, rng: () => number): number {
  if (monsterType === 3) {
    const quarter = Math.floor(rng() * 4)
    return -Math.PI / 2 + quarter * (Math.PI / 2)
  }
  return BIOME_CENTER_ANGLES[monsterType] ?? 0
}

export function spawnAnchor(input: SpawnAnchorInput): SpawnAnchor {
  const rng = createSeededRandom(hashString(`spawn:${input.roundId}:${input.coinId}`))
  const center = biomeCenterAngle(input.monsterType, rng)
  const inner = input.innerRadius ?? INNER_RADIUS
  const span = input.worldRadius - inner - (input.rimMargin ?? RIM_MARGIN)
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const angle = center + (rng() - 0.5) * 2 * SECTOR_SPREAD
    const radius = inner + rng() * span
    const x = Math.cos(angle) * radius
    const z = Math.sin(angle) * radius
    if (!input.isBlocked(x, z)) return { x, z }
  }
  const fallback = Math.min(60, input.worldRadius * 0.5)
  return { x: (rng() - 0.5) * fallback, z: (rng() - 0.5) * fallback }
}
