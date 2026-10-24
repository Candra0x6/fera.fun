import { describe, expect, it } from 'vitest'
import {
  ELEMENT_CYCLE,
  MONSTERS,
  SKINS,
  catalog,
  elementMultiplierBps,
  elementOf,
  monsterByKey,
  monsterByType,
  parseCatalog,
  skinByKey,
  skinById
} from '../src/catalog'
import { houseCoins, houseTokenSet, parseHouseCoins } from '../src/houseCoins'

describe('catalog', () => {
  it('matches the contracts.md mapping table', () => {
    expect(MONSTERS.map((m) => [m.monsterType, m.key, m.element])).toEqual([
      [0, 'fire_dragon', 'fire'],
      [1, 'ice_wolf', 'ice'],
      [2, 'earth_golem', 'earth'],
      [3, 'electric_fox', 'electric'],
      [4, 'dark_spirit', 'dark']
    ])
    expect(SKINS.map((s) => [s.skinId, s.key, s.name])).toEqual([
      [0, 'default', 'Default'],
      [1, 'obsidian', 'Obsidian'],
      [2, 'royal', 'Gold'],
      [3, 'crystal', 'Azure'],
      [4, 'celestial', 'Mythic']
    ])
    expect(MONSTERS.every((m) => m.baseStat === 10000)).toBe(true)
    expect(catalog.elementMultipliers).toEqual({ upBps: 11500, downBps: 8700, neutralBps: 10000 })
  })

  it('looks entries up in both directions', () => {
    expect(monsterByType(3)?.key).toBe('electric_fox')
    expect(monsterByKey('dark_spirit')?.monsterType).toBe(4)
    expect(monsterByType(9)).toBeUndefined()
    expect(skinById(2)?.name).toBe('Gold')
    expect(skinByKey('celestial')?.skinId).toBe(4)
    expect(elementOf(1)).toBe('ice')
    expect(elementOf(9)).toBeUndefined()
  })

  it('applies the element cycle fire, ice, earth, electric, dark, fire', () => {
    expect(ELEMENT_CYCLE).toEqual(['fire', 'ice', 'earth', 'electric', 'dark'])
    for (let i = 0; i < 5; i += 1) {
      const next = (i + 1) % 5
      expect(elementMultiplierBps(i, next)).toBe(11500)
      expect(elementMultiplierBps(next, i)).toBe(8700)
      expect(elementMultiplierBps(i, i)).toBe(10000)
      expect(elementMultiplierBps(i, (i + 2) % 5)).toBe(10000)
    }
    expect(elementMultiplierBps(4, 0)).toBe(11500)
    expect(elementMultiplierBps(0, 4)).toBe(8700)
    expect(elementMultiplierBps(0, 9)).toBe(10000)
  })

  it('rejects a malformed catalog', () => {
    expect(() => parseCatalog(null)).toThrow(TypeError)
    expect(() => parseCatalog({ ...catalog, monsters: [{ monsterType: 0 }] })).toThrow(TypeError)
    expect(() => parseCatalog({ ...catalog, elementCycle: ['fire', 'plasma'] })).toThrow(TypeError)
  })
})

describe('house coins', () => {
  it('starts as an empty list of public addresses', () => {
    expect(houseCoins).toEqual([])
    expect(houseTokenSet().size).toBe(0)
  })

  it('parses entries and rejects bad ones', () => {
    const entries = parseHouseCoins([{ roundId: 1, coinId: 0, ticker: 'MOOND', token: '0xAbC0000000000000000000000000000000000001' }])
    expect(houseTokenSet(entries).has('0xabc0000000000000000000000000000000000001')).toBe(true)
    expect(() => parseHouseCoins({})).toThrow(TypeError)
    expect(() => parseHouseCoins([{ roundId: 1, coinId: 0, ticker: 'X', token: 'nope' }])).toThrow(TypeError)
  })
})
