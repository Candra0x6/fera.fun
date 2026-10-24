import { getAddress, isAddress, parseEther } from 'viem'
import type { Hex } from '@animal/shared'

export interface DripSender {
  readonly address: Hex
  balance(): Promise<bigint>
  send(to: Hex, amount: bigint): Promise<Hex>
}

export interface DripOptions {
  sender: DripSender
  amount: bigint
  balanceFloor?: bigint
  addressWindowMs?: number
  ipWindowMs?: number
  ipMaxPerWindow?: number
  now?: () => number
}

export type DripResult =
  | { ok: true; txHash: Hex; amount: string }
  | { ok: false; error: 'bad_address' }
  | { ok: false; error: 'rate_limited'; retryAfterSeconds: number }
  | { ok: false; error: 'faucet_empty' }
  | { ok: false; error: 'send_failed' }

export interface DripService {
  drip(address: string, ip: string): Promise<DripResult>
}

const HOUR_MS = 3_600_000

export function createDripService(options: DripOptions): DripService {
  const now = options.now ?? (() => Date.now())
  const floor = options.balanceFloor ?? parseEther('10')
  const addressWindow = options.addressWindowMs ?? HOUR_MS
  const ipWindow = options.ipWindowMs ?? HOUR_MS
  const ipMax = options.ipMaxPerWindow ?? 10
  const lastByAddress = new Map<string, number>()
  const hitsByIp = new Map<string, number[]>()
  let queue: Promise<unknown> = Promise.resolve()

  function limited(ms: number): DripResult {
    return { ok: false, error: 'rate_limited', retryAfterSeconds: Math.max(1, Math.ceil(ms / 1000)) }
  }

  function checkLimits(address: string, ip: string, at: number): DripResult | null {
    const last = lastByAddress.get(address)
    if (last !== undefined && at - last < addressWindow) return limited(addressWindow - (at - last))
    const hits = (hitsByIp.get(ip) ?? []).filter((time) => at - time < ipWindow)
    hitsByIp.set(ip, hits)
    const oldest = hits[0]
    if (hits.length >= ipMax && oldest !== undefined) return limited(ipWindow - (at - oldest))
    return null
  }

  async function serve(address: Hex, ip: string): Promise<DripResult> {
    const key = address.toLowerCase()
    const at = now()
    const blocked = checkLimits(key, ip, at)
    if (blocked !== null) return blocked
    const balance = await options.sender.balance()
    if (balance < options.amount + floor) return { ok: false, error: 'faucet_empty' }
    lastByAddress.set(key, at)
    const hits = hitsByIp.get(ip) ?? []
    hits.push(at)
    hitsByIp.set(ip, hits)
    try {
      const txHash = await options.sender.send(address, options.amount)
      return { ok: true, txHash, amount: options.amount.toString() }
    } catch {
      lastByAddress.delete(key)
      hits.pop()
      return { ok: false, error: 'send_failed' }
    }
  }

  return {
    drip(address, ip) {
      if (!isAddress(address, { strict: false })) return Promise.resolve({ ok: false, error: 'bad_address' })
      const normalised = getAddress(address.toLowerCase())
      const key = normalised.toLowerCase()
      const early = checkLimits(key, ip, now())
      if (early !== null) return Promise.resolve(early)
      const run = queue.then(() => serve(normalised as Hex, ip))
      queue = run.catch(() => undefined)
      return run
    }
  }
}
