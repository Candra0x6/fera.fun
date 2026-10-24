import catalogJson from '../catalog.json'

export type Element = 'fire' | 'ice' | 'earth' | 'electric' | 'dark'

export interface MonsterEntry {
  monsterType: number
  key: string
  name: string
  element: Element
  baseStat: number
}

export interface SkinEntry {
  skinId: number
  key: string
  name: string
}

export interface ElementMultipliers {
  upBps: number
  downBps: number
  neutralBps: number
}

export interface Catalog {
  monsters: readonly MonsterEntry[]
  skins: readonly SkinEntry[]
  elementCycle: readonly Element[]
  elementMultipliers: ElementMultipliers
}

const ELEMENTS: readonly Element[] = ['fire', 'ice', 'earth', 'electric', 'dark']

function isElement(value: unknown): value is Element {
  return ELEMENTS.some((element) => element === value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function fail(path: string): never {
  throw new TypeError(`catalog.json is invalid at ${path}`)
}

function parseMonster(value: unknown, index: number): MonsterEntry {
  if (!isRecord(value)) return fail(`monsters[${index}]`)
  const { monsterType, key, name, element, baseStat } = value
  if (typeof monsterType !== 'number' || !Number.isInteger(monsterType)) return fail(`monsters[${index}].monsterType`)
  if (typeof key !== 'string') return fail(`monsters[${index}].key`)
  if (typeof name !== 'string') return fail(`monsters[${index}].name`)
  if (!isElement(element)) return fail(`monsters[${index}].element`)
  if (typeof baseStat !== 'number') return fail(`monsters[${index}].baseStat`)
  return { monsterType, key, name, element, baseStat }
}

function parseSkin(value: unknown, index: number): SkinEntry {
  if (!isRecord(value)) return fail(`skins[${index}]`)
  const { skinId, key, name } = value
  if (typeof skinId !== 'number' || !Number.isInteger(skinId)) return fail(`skins[${index}].skinId`)
  if (typeof key !== 'string') return fail(`skins[${index}].key`)
  if (typeof name !== 'string') return fail(`skins[${index}].name`)
  return { skinId, key, name }
}

export function parseCatalog(value: unknown): Catalog {
  if (!isRecord(value)) return fail('root')
  const { monsters, skins, elementCycle, elementMultipliers } = value
  if (!Array.isArray(monsters)) return fail('monsters')
  if (!Array.isArray(skins)) return fail('skins')
  if (!Array.isArray(elementCycle) || !elementCycle.every(isElement)) return fail('elementCycle')
  if (!isRecord(elementMultipliers)) return fail('elementMultipliers')
  const { upBps, downBps, neutralBps } = elementMultipliers
  if (typeof upBps !== 'number' || typeof downBps !== 'number' || typeof neutralBps !== 'number') {
    return fail('elementMultipliers')
  }
  return {
    monsters: monsters.map(parseMonster),
    skins: skins.map(parseSkin),
    elementCycle,
    elementMultipliers: { upBps, downBps, neutralBps }
  }
}

export const catalog: Catalog = parseCatalog(catalogJson)

export const MONSTERS: readonly MonsterEntry[] = catalog.monsters
export const SKINS: readonly SkinEntry[] = catalog.skins
export const ELEMENT_CYCLE: readonly Element[] = catalog.elementCycle

export function monsterByType(monsterType: number): MonsterEntry | undefined {
  return MONSTERS.find((monster) => monster.monsterType === monsterType)
}

export function monsterByKey(key: string): MonsterEntry | undefined {
  return MONSTERS.find((monster) => monster.key === key)
}

export function skinById(skinId: number): SkinEntry | undefined {
  return SKINS.find((skin) => skin.skinId === skinId)
}

export function skinByKey(key: string): SkinEntry | undefined {
  return SKINS.find((skin) => skin.key === key)
}

export function elementOf(monsterType: number): Element | undefined {
  return monsterByType(monsterType)?.element
}

export function elementMultiplierBps(attackerType: number, defenderType: number): number {
  const attacker = elementOf(attackerType)
  const defender = elementOf(defenderType)
  const { upBps, downBps, neutralBps } = catalog.elementMultipliers
  if (attacker === undefined || defender === undefined) return neutralBps
  const size = ELEMENT_CYCLE.length
  const attackerIndex = ELEMENT_CYCLE.indexOf(attacker)
  const defenderIndex = ELEMENT_CYCLE.indexOf(defender)
  if ((attackerIndex + 1) % size === defenderIndex) return upBps
  if ((defenderIndex + 1) % size === attackerIndex) return downBps
  return neutralBps
}
