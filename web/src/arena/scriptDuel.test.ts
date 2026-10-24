import { describe, expect, it } from 'vitest'
import { DUEL_MAX_RESALTS, DUEL_START_HP, DUEL_STRIKE_COUNT, scriptDuel } from './scriptDuel'
import type { DuelSide } from './scriptDuel'

const SIDES: readonly DuelSide[] = ['A', 'B']
const TYPES = [0, 1, 2, 3, 4]

function everyScript(visit: (script: ReturnType<typeof scriptDuel>, winner: DuelSide) => void): void {
  for (let clash = 0; clash < 120; clash++) {
    for (const typeA of TYPES) {
      for (const typeB of TYPES) {
        for (const winner of SIDES) visit(scriptDuel(`clash-${clash}`, typeA, typeB, winner), winner)
      }
    }
  }
}

describe('scriptDuel', () => {
  it('returns an identical script for the same inputs', () => {
    for (let clash = 0; clash < 40; clash++) {
      const first = scriptDuel(`id-${clash}`, 0, 3, 'A')
      const second = scriptDuel(`id-${clash}`, 0, 3, 'A')
      expect(second).toEqual(first)
    }
  })

  it('produces different strike scripts for different clash ids', () => {
    const scripts = new Set<string>()
    for (let clash = 0; clash < 30; clash++) {
      scripts.add(JSON.stringify(scriptDuel(`vary-${clash}`, 1, 2, 'B').strikes.map((strike) => strike.damage)))
    }
    expect(scripts.size).toBeGreaterThan(20)
  })

  it('always lets the chain winner survive and finishes the loser on the last strike', () => {
    everyScript((script, winner) => {
      const last = script.strikes[DUEL_STRIKE_COUNT - 1]
      expect(script.strikes).toHaveLength(DUEL_STRIKE_COUNT)
      expect(last?.final).toBe(true)
      expect(last?.attacker).toBe(winner)
      const winnerHp = winner === 'A' ? last?.hpA : last?.hpB
      const loserHp = winner === 'A' ? last?.hpB : last?.hpA
      expect(winnerHp).toBeGreaterThan(0)
      expect(loserHp).toBe(0)
    })
  })

  it('never lets either health bar reach zero before the final strike', () => {
    everyScript((script) => {
      for (const strike of script.strikes) {
        if (strike.final) continue
        expect(strike.hpA).toBeGreaterThan(0)
        expect(strike.hpB).toBeGreaterThan(0)
        expect(strike.hpA).toBeLessThanOrEqual(DUEL_START_HP)
        expect(strike.hpB).toBeLessThanOrEqual(DUEL_START_HP)
      }
    })
  })

  it('terminates within the re-salt limit or forces the final strike', () => {
    let forcedCount = 0
    let total = 0
    everyScript((script) => {
      total += 1
      expect(script.salt).toBeLessThanOrEqual(DUEL_MAX_RESALTS)
      if (script.forced) {
        forcedCount += 1
        expect(script.salt).toBe(DUEL_MAX_RESALTS)
      }
    })
    expect(forcedCount / total).toBeLessThan(0.06)
  })

  it('forces the final strike when no re-salt is allowed and still keeps the invariants', () => {
    for (let clash = 0; clash < 60; clash++) {
      for (const winner of SIDES) {
        const script = scriptDuel(`forced-${clash}`, 2, 4, winner, { maxResalts: 0 })
        const last = script.strikes[DUEL_STRIKE_COUNT - 1]
        expect(script.forced).toBe(true)
        expect(last?.attacker).toBe(winner)
        expect(winner === 'A' ? last?.hpB : last?.hpA).toBe(0)
        expect(winner === 'A' ? last?.hpA : last?.hpB).toBeGreaterThan(0)
      }
    }
  })

  it('keeps every strike damage a positive integer', () => {
    everyScript((script) => {
      for (const strike of script.strikes) {
        expect(Number.isInteger(strike.damage)).toBe(true)
        expect(strike.damage).toBeGreaterThan(0)
      }
    })
  })
})
