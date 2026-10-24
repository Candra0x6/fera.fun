import { elementMultiplierBps } from '@animal/shared'
import { createSeededRandom, hashString } from './seeded'

export type DuelSide = 'A' | 'B'

export interface DuelStrike {
  index: number
  attacker: DuelSide
  defender: DuelSide
  damage: number
  hpA: number
  hpB: number
  final: boolean
}

export interface DuelScript {
  clashId: string
  winner: DuelSide
  loser: DuelSide
  salt: number
  forced: boolean
  strikes: DuelStrike[]
}

export interface ScriptDuelOptions {
  maxResalts?: number
}

export const DUEL_STRIKE_COUNT = 6
export const DUEL_MAX_RESALTS = 32
export const DUEL_START_HP = 100

const WINNER_MAX_DAMAGE_TAKEN = 88
const BASE_DAMAGE_MIN = 18
const BASE_DAMAGE_SPAN = 22

function opposite(side: DuelSide): DuelSide {
  return side === 'A' ? 'B' : 'A'
}

function rawDamages(clashId: string, salt: number, attackers: readonly DuelSide[], typeA: number, typeB: number): number[] {
  const rng = createSeededRandom(hashString(`${clashId}:${salt}`))
  return attackers.map((attacker) => {
    const attackerType = attacker === 'A' ? typeA : typeB
    const defenderType = attacker === 'A' ? typeB : typeA
    const multiplier = elementMultiplierBps(attackerType, defenderType) / 10000
    return Math.max(1, Math.round((BASE_DAMAGE_MIN + rng() * BASE_DAMAGE_SPAN) * multiplier))
  })
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0)
}

function limitWinnerDamage(damages: readonly number[]): number[] {
  const total = sum(damages)
  if (total <= WINNER_MAX_DAMAGE_TAKEN) return [...damages]
  const factor = WINNER_MAX_DAMAGE_TAKEN / total
  const scaled = damages.map((damage) => Math.max(1, Math.floor(damage * factor)))
  while (sum(scaled) > WINNER_MAX_DAMAGE_TAKEN) {
    const largest = scaled.indexOf(Math.max(...scaled))
    scaled[largest] = Math.max(1, (scaled[largest] ?? 1) - 1)
  }
  return scaled
}

function assemble(
  clashId: string,
  winner: DuelSide,
  salt: number,
  forced: boolean,
  attackers: readonly DuelSide[],
  damages: readonly number[]
): DuelScript {
  const loser = opposite(winner)
  const winnerTaken: number[] = []
  const loserTaken: number[] = []
  attackers.forEach((attacker, index) => {
    const damage = damages[index] ?? 1
    if (attacker === winner) loserTaken.push(damage)
    else winnerTaken.push(damage)
  })
  const limitedWinnerTaken = limitWinnerDamage(winnerTaken)
  let hpWinner = DUEL_START_HP
  let hpLoser = DUEL_START_HP
  let winnerHit = 0
  let loserHit = 0
  const strikes: DuelStrike[] = attackers.map((attacker, index) => {
    const final = index === attackers.length - 1
    let damage: number
    if (attacker === winner) {
      const planned = loserTaken[loserHit] ?? 1
      loserHit += 1
      damage = final ? hpLoser : Math.min(planned, hpLoser - 1)
      hpLoser -= damage
    } else {
      damage = limitedWinnerTaken[winnerHit] ?? 1
      winnerHit += 1
      hpWinner -= damage
    }
    return {
      index,
      attacker,
      defender: opposite(attacker),
      damage,
      hpA: winner === 'A' ? hpWinner : hpLoser,
      hpB: winner === 'A' ? hpLoser : hpWinner,
      final
    }
  })
  return { clashId, winner, loser, salt, forced, strikes }
}

export function scriptDuel(
  clashId: string,
  typeA: number,
  typeB: number,
  winner: DuelSide,
  options: ScriptDuelOptions = {}
): DuelScript {
  const maxResalts = options.maxResalts ?? DUEL_MAX_RESALTS
  const loser = opposite(winner)
  const attackers: DuelSide[] = Array.from({ length: DUEL_STRIKE_COUNT }, (_, index) =>
    index % 2 === 0 ? loser : winner
  )
  for (let salt = 0; salt < maxResalts; salt++) {
    const damages = rawDamages(clashId, salt, attackers, typeA, typeB)
    const takenByWinner = sum(damages.filter((_, index) => attackers[index] === loser))
    const takenByLoser = sum(damages.filter((_, index) => attackers[index] === winner))
    if (takenByLoser > takenByWinner) return assemble(clashId, winner, salt, false, attackers, damages)
  }
  const forcedDamages = rawDamages(clashId, maxResalts, attackers, typeA, typeB)
  return assemble(clashId, winner, maxResalts, true, attackers, forcedDamages)
}
