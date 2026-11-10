import { describe, expect, it } from 'vitest'
import { KeyPair } from 'near-api-js'
import { createDripService, derivedNames } from '../src/drip'
import type { HelperClient, HelperResult } from '../src/helper'
import type { NearAccounts } from '../src/nearAccounts'

const NEAR = 10n ** 24n
const DRIP = 'fera-drip.testnet'

interface Chain {
  accounts: NearAccounts
  balances: Map<string, bigint>
  created: Array<{ id: string; publicKey: string; amount: bigint }>
  transfers: Array<{ to: string; amount: bigint }>
  failNext: boolean
}

function chain(dripBalance = 20n * NEAR): Chain {
  const balances = new Map<string, bigint>([[DRIP, dripBalance]])
  const state: Chain = {
    balances,
    created: [],
    transfers: [],
    failNext: false,
    accounts: {
      accountId: DRIP,
      exists: (id) => Promise.resolve(balances.has(id)),
      balance: (id) => Promise.resolve(balances.get(id) ?? 0n),
      transfer(to, amount) {
        if (state.failNext) return Promise.reject(new Error('rpc down'))
        state.transfers.push({ to, amount })
        balances.set(to, (balances.get(to) ?? 0n) + amount)
        balances.set(DRIP, (balances.get(DRIP) ?? 0n) - amount)
        return Promise.resolve(`T${state.transfers.length}`)
      },
      waitFinal: () => Promise.resolve(),
      createAccount(id, publicKey, amount) {
        if (state.failNext) return Promise.reject(new Error('rpc down'))
        state.created.push({ id, publicKey, amount })
        balances.set(id, amount)
        balances.set(DRIP, (balances.get(DRIP) ?? 0n) - amount)
        return Promise.resolve(`C${state.created.length}`)
      }
    }
  }
  return state
}

function helperOf(chainState: Chain, result: HelperResult): { helper: HelperClient; calls: string[] } {
  const calls: string[] = []
  return {
    calls,
    helper: {
      create(accountId) {
        calls.push(accountId)
        if (result.ok) chainState.balances.set(accountId, 10n * NEAR)
        return Promise.resolve(result)
      }
    }
  }
}

const key = (): string => KeyPair.fromRandom('ed25519').getPublicKey().toString()
const noSleep = (): Promise<void> => Promise.resolve()

describe('drip service', () => {
  it('rejects anything that is not an ed25519 public key', async () => {
    const c = chain()
    const service = createDripService({ accounts: c.accounts, helper: null, amount: 2n * NEAR })
    expect(await service.drip('nope', '1.1.1.1')).toEqual({ ok: false, error: 'bad_key' })
    expect(await service.drip(KeyPair.fromRandom('secp256k1').getPublicKey().toString(), '1.1.1.1')).toEqual({ ok: false, error: 'bad_key' })
    expect(c.created).toHaveLength(0)
  })

  it('uses the helper first and does not move treasury funds', async () => {
    const c = chain()
    const { helper, calls } = helperOf(c, { ok: true })
    const publicKey = key()
    const service = createDripService({ accounts: c.accounts, helper, amount: 2n * NEAR, sleep: noSleep })
    const result = await service.drip(publicKey, '1.1.1.1')
    const { helperId } = derivedNames(publicKey, DRIP)
    expect(result).toEqual({ ok: true, accountId: helperId, amount: (10n * NEAR).toString(), via: 'helper' })
    expect(calls).toEqual([helperId])
    expect(c.created).toHaveLength(0)
    expect(c.balances.get(DRIP)).toBe(20n * NEAR)
  })

  it('falls back to a sub-account of the drip account when the helper refuses, and pauses the helper', async () => {
    const c = chain()
    const { helper, calls } = helperOf(c, { ok: false, status: 429, retryAfterSeconds: null })
    const service = createDripService({ accounts: c.accounts, helper, amount: 2n * NEAR, sleep: noSleep })
    const first = key()
    const result = await service.drip(first, '1.1.1.1')
    const { subId } = derivedNames(first, DRIP)
    expect(result).toEqual({ ok: true, accountId: subId, amount: (2n * NEAR).toString(), via: 'transfer', txHash: 'C1' })
    expect(c.created).toEqual([{ id: subId, publicKey: first, amount: 2n * NEAR }])
    await service.drip(key(), '1.1.1.2')
    expect(calls).toHaveLength(1)
    expect(c.created).toHaveLength(2)
  })

  it('works without a helper at all', async () => {
    const c = chain()
    const service = createDripService({ accounts: c.accounts, helper: null, amount: 2n * NEAR })
    const result = await service.drip(key(), '1.1.1.1')
    expect(result).toMatchObject({ ok: true, via: 'transfer', amount: (2n * NEAR).toString() })
  })

  it('returns the same account for the same key without spending again', async () => {
    const c = chain()
    const service = createDripService({ accounts: c.accounts, helper: null, amount: 2n * NEAR })
    const publicKey = key()
    const first = await service.drip(publicKey, '1.1.1.1')
    const second = await service.drip(publicKey, '1.1.1.1')
    expect(second).toMatchObject({ ok: true, accountId: first.ok ? first.accountId : '', amount: '0' })
    expect(c.created).toHaveLength(1)
    expect(c.transfers).toHaveLength(0)
  })

  it('recognises an existing account after a restart by its derived name', async () => {
    const c = chain()
    const publicKey = key()
    const { subId } = derivedNames(publicKey, DRIP)
    c.balances.set(subId, 5n * NEAR)
    const service = createDripService({ accounts: c.accounts, helper: null, amount: 2n * NEAR })
    expect(await service.drip(publicKey, '1.1.1.1')).toMatchObject({ ok: true, accountId: subId, amount: '0' })
    expect(c.created).toHaveLength(0)
  })

  it('tops up a drained account by transfer at most once per hour', async () => {
    const c = chain()
    let now = 1_000_000
    const service = createDripService({ accounts: c.accounts, helper: null, amount: 2n * NEAR, now: () => now })
    const publicKey = key()
    const first = await service.drip(publicKey, '1.1.1.1')
    const id = first.ok ? first.accountId : ''
    c.balances.set(id, NEAR / 2n)
    expect(await service.drip(publicKey, '1.1.1.1')).toMatchObject({ ok: true, amount: '0' })
    now += 3_600_001
    const topped = await service.drip(publicKey, '1.1.1.1')
    expect(topped).toMatchObject({ ok: true, amount: (2n * NEAR).toString(), via: 'transfer', txHash: 'T1' })
    expect(c.transfers).toEqual([{ to: id, amount: 2n * NEAR }])
  })

  it('limits new accounts per IP and keeps other IPs working', async () => {
    const c = chain(100n * NEAR)
    const service = createDripService({ accounts: c.accounts, helper: null, amount: NEAR, ipMaxPerWindow: 2 })
    expect((await service.drip(key(), '9.9.9.9')).ok).toBe(true)
    expect((await service.drip(key(), '9.9.9.9')).ok).toBe(true)
    const blocked = await service.drip(key(), '9.9.9.9')
    expect(blocked).toEqual({ ok: false, error: 'rate_limited', retryAfterSeconds: 3600 })
    expect((await service.drip(key(), '8.8.8.8')).ok).toBe(true)
  })

  it('answers faucet_empty below the balance floor without spending', async () => {
    const c = chain(4n * NEAR)
    const service = createDripService({ accounts: c.accounts, helper: null, amount: 2n * NEAR })
    expect(await service.drip(key(), '1.1.1.1')).toEqual({ ok: false, error: 'faucet_empty' })
    expect(c.created).toHaveLength(0)
  })

  it('does not burn the IP budget when the transfer fails', async () => {
    const c = chain()
    c.failNext = true
    const service = createDripService({ accounts: c.accounts, helper: null, amount: NEAR, ipMaxPerWindow: 1 })
    const publicKey = key()
    expect(await service.drip(publicKey, '1.1.1.1')).toEqual({ ok: false, error: 'send_failed' })
    c.failNext = false
    expect((await service.drip(publicKey, '1.1.1.1')).ok).toBe(true)
  })

  it('serves concurrent calls for one key with a single account creation', async () => {
    const c = chain()
    const service = createDripService({ accounts: c.accounts, helper: null, amount: NEAR })
    const publicKey = key()
    const results = await Promise.all([service.drip(publicKey, '1.1.1.1'), service.drip(publicKey, '1.1.1.1')])
    expect(results[0]).toEqual(results[1])
    expect(c.created).toHaveLength(1)
  })
})
