import { createNearRpc } from '@animal/shared'
import { config } from './session'

export const nearRpc = createNearRpc({ urls: config.rpcUrls })

export async function readArena(method: string, args: Record<string, unknown>): Promise<unknown> {
  const view = await nearRpc.callView(config.arena, method, args)
  return view.value
}

export function asBigInt(value: unknown): bigint {
  if (typeof value === 'bigint') return value
  if (typeof value === 'number' || typeof value === 'string') return BigInt(value)
  return 0n
}

export async function balanceOfCoin(roundId: number, coinId: number, account: string): Promise<bigint> {
  return asBigInt(await readArena('balance_of', { round_id: roundId, coin_id: coinId, account_id: account }))
}
