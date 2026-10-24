import type { ArenaSnapshot, CoinView } from '@animal/shared'

export function stressSnapshot(base: ArenaSnapshot, count: number): ArenaSnapshot {
  const coins: CoinView[] = Array.from({ length: count }, (_, index) => {
    const reserve = (8 + ((index * 7) % 23)) * 10 ** 18
    const hex = index.toString(16).padStart(40, '0')
    return {
      roundId: base.round.roundId,
      coinId: index,
      token: `0x${hex}`,
      creator: `0x${hex}`,
      name: `Stress Coin ${index}`,
      ticker: `ST${index}`,
      monsterType: index % 5,
      skinId: (index * 3) % 5,
      status: 'Alive',
      level: 1 + (index % 4),
      xp: 0,
      wins: 0,
      vMon: String(BigInt(Math.round(reserve)) + 20n * 10n ** 18n),
      vTok: '500000000000000000000000000',
      rMon: String(BigInt(Math.round(reserve))),
      rMonAtLock: '0',
      seedMon: String(BigInt(Math.round(reserve))),
      consolationPool: '0',
      consolationSupply: '0',
      supply: '500000000000000000000000000',
      isHouse: index % 3 === 0
    }
  })
  return {
    ...base,
    round: { ...base.round, phase: 'Leveling', coinCount: count, aliveCount: count },
    coins
  }
}
