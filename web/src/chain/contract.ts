import { arenaAbi, createMonadChain, monsterCoinAbi } from '@animal/shared'
import { createPublicClient, fallback, http } from 'viem'
import type { Hex } from 'viem'
import { config } from './session'

export const chain = createMonadChain({ id: config.chainId, httpUrls: config.httpUrls, wsUrls: config.wsUrls })

export const publicClient = createPublicClient({
  chain,
  transport: fallback(config.httpUrls.map((url) => http(url)))
})

export function arenaAddress(): Hex {
  if (config.arena === null) throw new Error('VITE_ARENA_ADDRESS is not set')
  return config.arena
}

export async function readArena(functionName: string, args: readonly unknown[]): Promise<unknown> {
  return publicClient.readContract({ address: arenaAddress(), abi: arenaAbi, functionName, args })
}

export async function readCoin(token: Hex, functionName: string, args: readonly unknown[]): Promise<unknown> {
  return publicClient.readContract({ address: token, abi: monsterCoinAbi, functionName, args })
}

export function asBigInt(value: unknown): bigint {
  if (typeof value === 'bigint') return value
  if (typeof value === 'number' || typeof value === 'string') return BigInt(value)
  return 0n
}

export const GAS = {
  launchCoin: 570_000n,
  buy: 210_000n,
  sell: 170_000n,
  claim: 260_000n,
  redeem: 260_000n,
  createDefaultRound: 500_000n
} as const

export const GAS_PER_IMAGE_BYTE = 25n

export function launchGas(imageUri: string | null): bigint {
  return imageUri === null ? GAS.launchCoin : GAS.launchCoin + GAS_PER_IMAGE_BYTE * BigInt(new TextEncoder().encode(imageUri).length)
}
