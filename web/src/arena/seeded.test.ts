import { describe, expect, it } from 'vitest'
import { createSeededRandom, hashString, spawnAnchor } from './seeded'

describe('seeded helpers', () => {
  it('hashes identical strings to identical numbers', () => {
    expect(hashString('1:7')).toBe(hashString('1:7'))
    expect(hashString('1:7')).not.toBe(hashString('1:8'))
  })

  it('produces a repeatable sequence in the unit interval', () => {
    const first = createSeededRandom(42)
    const second = createSeededRandom(42)
    for (let index = 0; index < 50; index++) {
      const value = first()
      expect(value).toBe(second())
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThan(1)
    }
  })

  it('places the same coin at the same anchor on every client', () => {
    const input = { roundId: 1, coinId: 5, monsterType: 0, worldRadius: 135, isBlocked: () => false }
    expect(spawnAnchor(input)).toEqual(spawnAnchor(input))
    expect(spawnAnchor({ ...input, coinId: 6 })).not.toEqual(spawnAnchor(input))
  })

  it('keeps anchors inside the island and away from blocked ground', () => {
    const blocked = (x: number, z: number): boolean => Math.hypot(x, z) < 60
    for (let coinId = 0; coinId < 30; coinId++) {
      for (let monsterType = 0; monsterType < 5; monsterType++) {
        const anchor = spawnAnchor({ roundId: 3, coinId, monsterType, worldRadius: 135, isBlocked: blocked })
        const distance = Math.hypot(anchor.x, anchor.z)
        expect(distance).toBeLessThan(135)
        expect(distance).toBeGreaterThanOrEqual(60)
      }
    }
  })

  it('maps each element to its home biome sector', () => {
    const open = (): boolean => false
    const lava = spawnAnchor({ roundId: 1, coinId: 1, monsterType: 0, worldRadius: 135, isBlocked: open })
    const ice = spawnAnchor({ roundId: 1, coinId: 1, monsterType: 1, worldRadius: 135, isBlocked: open })
    const earth = spawnAnchor({ roundId: 1, coinId: 1, monsterType: 2, worldRadius: 135, isBlocked: open })
    const dark = spawnAnchor({ roundId: 1, coinId: 1, monsterType: 4, worldRadius: 135, isBlocked: open })
    expect(lava.z).toBeGreaterThan(Math.abs(lava.x) * 0.1)
    expect(ice.z).toBeLessThan(-Math.abs(ice.x) * 0.1)
    expect(earth.x).toBeLessThan(0)
    expect(dark.x).toBeGreaterThan(0)
  })
})
