import type { Abi } from 'viem'
import arenaJson from './Arena.json'
import monsterCoinJson from './MonsterCoin.json'
import seedSourceJson from './ISeedSource.json'

function asAbi(value: unknown, name: string): Abi {
  if (!Array.isArray(value)) throw new TypeError(`${name} ABI json must be an array`)
  return value as Abi
}

export const arenaAbi: Abi = asAbi(arenaJson, 'Arena')
export const monsterCoinAbi: Abi = asAbi(monsterCoinJson, 'MonsterCoin')
export const seedSourceAbi: Abi = asAbi(seedSourceJson, 'ISeedSource')
