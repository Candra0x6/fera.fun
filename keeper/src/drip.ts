import { createHash } from 'node:crypto'
import type { DripHandler, DripResponse } from './api'
import type { HelperClient } from './helper'
import { isEd25519PublicKey } from './nearAccounts'
import type { NearAccounts } from './nearAccounts'

const NEAR = 10n ** 24n
const HOUR_MS = 3_600_000
const HELPER_AMOUNT = 10n * NEAR

export interface DripOptions {
  accounts: NearAccounts
  helper: HelperClient | null
  amount: bigint
  balanceFloor?: bigint
  topUpBelow?: bigint
  keyWindowMs?: number
  ipWindowMs?: number
  ipMaxPerWindow?: number
  helperPauseMs?: number
  helperWaitMs?: number
  now?: () => number
  sleep?: (ms: number) => Promise<void>
}

export function derivedNames(publicKey: string, dripAccountId: string): { helperId: string; subId: string } {
  const digest = createHash('sha256').update(publicKey).digest('hex').slice(0, 10)
  return { helperId: `fera-${digest}.testnet`, subId: `${digest}.${dripAccountId}` }
}

function limited(ms: number): DripResponse {
  return { ok: false, error: 'rate_limited', retryAfterSeconds: Math.max(1, Math.ceil(ms / 1000)) }
}

export function createDripService(options: DripOptions): DripHandler {
  const { accounts, helper } = options
  const now = options.now ?? (() => Date.now())
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => void setTimeout(resolve, ms)))
  const floor = options.balanceFloor ?? 3n * NEAR
  const topUpBelow = options.topUpBelow ?? NEAR
  const keyWindow = options.keyWindowMs ?? HOUR_MS
  const ipWindow = options.ipWindowMs ?? HOUR_MS
  const ipMax = options.ipMaxPerWindow ?? 10
  const helperPause = options.helperPauseMs ?? 300_000
  const helperWait = options.helperWaitMs ?? 5000
  const known = new Map<string, { accountId: string; via: 'helper' | 'transfer' }>()
  const lastTopUp = new Map<string, number>()
  const hitsByIp = new Map<string, number[]>()
  const inflight = new Map<string, Promise<DripResponse>>()
  let helperBlockedUntil = 0

  function ipBlocked(ip: string, at: number): DripResponse | null {
    const hits = (hitsByIp.get(ip) ?? []).filter((time) => at - time < ipWindow)
    hitsByIp.set(ip, hits)
    const oldest = hits[0]
    if (hits.length >= ipMax && oldest !== undefined) return limited(ipWindow - (at - oldest))
    return null
  }

  function recordHit(ip: string, at: number): () => void {
    const hits = hitsByIp.get(ip) ?? []
    hits.push(at)
    hitsByIp.set(ip, hits)
    return () => {
      const index = hits.lastIndexOf(at)
      if (index >= 0) hits.splice(index, 1)
    }
  }

  async function findExisting(publicKey: string): Promise<{ accountId: string; via: 'helper' | 'transfer' } | null> {
    const cached = known.get(publicKey)
    if (cached !== undefined) return cached
    const { helperId, subId } = derivedNames(publicKey, accounts.accountId)
    if (await accounts.exists(helperId)) return { accountId: helperId, via: 'helper' }
    if (await accounts.exists(subId)) return { accountId: subId, via: 'transfer' }
    return null
  }

  async function waitForAccount(accountId: string): Promise<boolean> {
    const deadline = now() + helperWait
    for (;;) {
      if (await accounts.exists(accountId)) return true
      if (now() >= deadline) return false
      await sleep(400)
    }
  }

  async function funded(): Promise<boolean> {
    return (await accounts.balance(accounts.accountId)) >= options.amount + floor
  }

  async function existingAccount(
    publicKey: string,
    ip: string,
    found: { accountId: string; via: 'helper' | 'transfer' }
  ): Promise<DripResponse> {
    known.set(publicKey, found)
    const at = now()
    const idle: DripResponse = { ok: true, accountId: found.accountId, amount: '0', via: found.via }
    const last = lastTopUp.get(publicKey)
    if (last !== undefined && at - last < keyWindow) return idle
    if ((await accounts.balance(found.accountId)) >= topUpBelow) return idle
    if (ipBlocked(ip, at) !== null) return idle
    if (!(await funded())) return { ok: false, error: 'faucet_empty' }
    const undo = recordHit(ip, at)
    try {
      const txHash = await accounts.transfer(found.accountId, options.amount)
      lastTopUp.set(publicKey, at)
      return { ok: true, accountId: found.accountId, amount: options.amount.toString(), via: 'transfer', txHash }
    } catch {
      undo()
      return { ok: false, error: 'send_failed' }
    }
  }

  async function newAccount(publicKey: string, ip: string): Promise<DripResponse> {
    const at = now()
    const blocked = ipBlocked(ip, at)
    if (blocked !== null) return blocked
    const undo = recordHit(ip, at)
    const { helperId, subId } = derivedNames(publicKey, accounts.accountId)
    if (helper !== null && at >= helperBlockedUntil) {
      const result = await helper.create(helperId, publicKey)
      if (result.ok && (await waitForAccount(helperId))) {
        known.set(publicKey, { accountId: helperId, via: 'helper' })
        return { ok: true, accountId: helperId, amount: HELPER_AMOUNT.toString(), via: 'helper' }
      }
      const advised = result.ok ? 0 : (result.retryAfterSeconds ?? 0) * 1000
      helperBlockedUntil = at + (advised > 0 ? advised : helperPause)
    }
    if (!(await funded())) {
      undo()
      return { ok: false, error: 'faucet_empty' }
    }
    try {
      const txHash = await accounts.createAccount(subId, publicKey, options.amount)
      known.set(publicKey, { accountId: subId, via: 'transfer' })
      lastTopUp.set(publicKey, at)
      return { ok: true, accountId: subId, amount: options.amount.toString(), via: 'transfer', txHash }
    } catch {
      undo()
      return { ok: false, error: 'send_failed' }
    }
  }

  async function serve(publicKey: string, ip: string): Promise<DripResponse> {
    try {
      const found = await findExisting(publicKey)
      return found === null ? await newAccount(publicKey, ip) : await existingAccount(publicKey, ip, found)
    } catch {
      return { ok: false, error: 'send_failed' }
    }
  }

  return {
    drip(publicKey, ip) {
      if (!isEd25519PublicKey(publicKey)) return Promise.resolve({ ok: false, error: 'bad_key' })
      const pending = inflight.get(publicKey)
      if (pending !== undefined) return pending
      const run = serve(publicKey, ip).finally(() => {
        inflight.delete(publicKey)
      })
      inflight.set(publicKey, run)
      return run
    }
  }
}
