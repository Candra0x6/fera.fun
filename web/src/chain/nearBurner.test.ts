import { describe, expect, it } from 'vitest'
import { BURNER_ACCOUNT_STORAGE_KEY, BURNER_STORAGE_KEY, createBurner, DripError, LOW_BALANCE_YOCTO, requestDrip, YOCTO_PER_NEAR } from './nearBurner'
import type { BurnerDeps, DripFetch, StorageLike } from './nearBurner'
import { isSecretKey, newBurnerKey, publicKeyOf } from './nearKeys'
import type { ArenaCall } from './nearSigner'

function memoryStorage(): StorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>()
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value)
    },
    removeItem: (key) => {
      data.delete(key)
    }
  }
}

const KEY = await newBurnerKey()
const SECRET = KEY.secretKey

interface Harness {
  deps: BurnerDeps
  storage: ReturnType<typeof memoryStorage>
  posts: Array<{ url: string; body: unknown }>
  calls: ArenaCall[]
  balances: Map<string, bigint | null>
  signers: Array<{ accountId: string }>
}

function harness(reply: Record<string, unknown>, storage = memoryStorage(), balances = new Map<string, bigint | null>()): Harness {
  const posts: Harness['posts'] = []
  const calls: ArenaCall[] = []
  const signers: Harness['signers'] = []
  const fetchImpl: DripFetch = (url, init) => {
    posts.push({ url, body: JSON.parse(init.body) })
    return Promise.resolve({ json: () => Promise.resolve(reply) })
  }
  const deps: BurnerDeps = {
    storage,
    keeperUrl: 'https://keeper.example',
    fetchImpl,
    rpc: {
      viewAccount: (accountId) => {
        const amount = balances.get(accountId)
        return Promise.resolve(amount === undefined || amount === null ? null : { amount, storageUsage: 182, blockHeight: 1 })
      }
    },
    createSigner: (options) => {
      signers.push({ accountId: options.accountId })
      return Promise.resolve({
        send: (call) => {
          calls.push(call)
          return Promise.resolve(`hash-${calls.length}`)
        }
      })
    },
    generateKey: () => Promise.resolve({ secretKey: SECRET, publicKey: KEY.publicKey }),
    now: () => 0,
    sleep: () => Promise.resolve()
  }
  return { deps, storage, posts, calls, balances, signers }
}

describe('createBurner', () => {
  it('creates a key, asks the keeper to fund it, and keeps both in storage', async () => {
    const h = harness({ ok: true, accountId: 'fera-abc.testnet', amount: '10000000000000000000000000', via: 'helper' })
    h.balances.set('fera-abc.testnet', 10n * YOCTO_PER_NEAR)
    const burner = createBurner(h.deps)
    await burner.connect()
    const state = burner.store.get()
    expect(state.status).toBe('ready')
    expect(state.accountId).toBe('fera-abc.testnet')
    expect(state.balance).toBe(10n * YOCTO_PER_NEAR)
    expect(h.posts).toEqual([{ url: 'https://keeper.example/drip', body: { publicKey: KEY.publicKey } }])
    expect(h.storage.data.get(BURNER_STORAGE_KEY)).toBe(SECRET)
    expect(h.storage.data.get(BURNER_ACCOUNT_STORAGE_KEY)).toBe('fera-abc.testnet')
  })

  it('restores the same account after a reload without asking for funds again', async () => {
    const storage = memoryStorage()
    storage.setItem(BURNER_STORAGE_KEY, SECRET)
    storage.setItem(BURNER_ACCOUNT_STORAGE_KEY, 'fera-abc.testnet')
    const balances = new Map<string, bigint | null>([['fera-abc.testnet', 5n * YOCTO_PER_NEAR]])
    const h = harness({ ok: false, error: 'rate_limited' }, storage, balances)
    const burner = createBurner(h.deps)
    await burner.connect()
    expect(burner.store.get().accountId).toBe('fera-abc.testnet')
    expect(burner.store.get().status).toBe('ready')
    expect(h.posts).toHaveLength(0)
  })

  it('tops up below one NEAR and tolerates a rate-limited answer', async () => {
    const storage = memoryStorage()
    storage.setItem(BURNER_STORAGE_KEY, SECRET)
    storage.setItem(BURNER_ACCOUNT_STORAGE_KEY, 'fera-abc.testnet')
    const balances = new Map<string, bigint | null>([['fera-abc.testnet', LOW_BALANCE_YOCTO - 1n]])
    const h = harness({ ok: false, error: 'rate_limited', retryAfterSeconds: 90 }, storage, balances)
    const burner = createBurner(h.deps)
    await burner.connect()
    expect(h.posts).toHaveLength(1)
    expect(burner.store.get().status).toBe('ready')
    expect(burner.store.get().failure).toBe('rate_limited')
  })

  it('fails when no account exists and the keeper refuses', async () => {
    const h = harness({ ok: false, error: 'faucet_empty' })
    const burner = createBurner(h.deps)
    await burner.connect()
    expect(burner.store.get().status).toBe('failed')
    expect(burner.store.get().failure).toBe('faucet_empty')
  })

  it('signs every call locally, one transaction in flight at a time', async () => {
    const h = harness({ ok: true, accountId: 'fera-abc.testnet', amount: '1' })
    h.balances.set('fera-abc.testnet', 10n * YOCTO_PER_NEAR)
    const order: string[] = []
    let release: () => void = () => undefined
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    h.deps.createSigner = () =>
      Promise.resolve({
        send: async (call) => {
          order.push(`start ${call.method}`)
          if (call.method === 'buy') await gate
          order.push(`end ${call.method}`)
          return `hash-${call.method}`
        }
      })
    const burner = createBurner(h.deps)
    await burner.connect()
    const first = burner.send({ method: 'buy', args: { coin_id: 0 }, deposit: 1n })
    const second = burner.send({ method: 'sell', args: { coin_id: 0 } })
    await Promise.resolve()
    await new Promise<void>((resolve) => setTimeout(resolve, 5))
    expect(order).toEqual(['start buy'])
    release()
    expect(await first).toBe('hash-buy')
    expect(await second).toBe('hash-sell')
    expect(order).toEqual(['start buy', 'end buy', 'start sell', 'end sell'])
  })

  it('waits for the new account to be final before it reports ready', async () => {
    const h = harness({ ok: true, accountId: 'fera-abc.testnet', amount: '1' })
    const finalities: string[] = []
    let visible = 0
    h.deps.rpc = {
      viewAccount: (_accountId, finality) => {
        finalities.push(finality ?? 'optimistic')
        visible += 1
        return Promise.resolve(visible < 4 ? null : { amount: 2n * YOCTO_PER_NEAR, storageUsage: 182, blockHeight: 1 })
      }
    }
    const burner = createBurner(h.deps)
    await burner.connect()
    expect(burner.store.get().balance).toBe(2n * YOCTO_PER_NEAR)
    expect(finalities.filter((f) => f === 'final').length).toBeGreaterThanOrEqual(3)
  })

  it('warms the signer up on connect and ignores a failing warm-up', async () => {
    const h = harness({ ok: true, accountId: 'fera-abc.testnet', amount: '1' })
    h.balances.set('fera-abc.testnet', 10n * YOCTO_PER_NEAR)
    let warmed = 0
    h.deps.createSigner = () =>
      Promise.resolve({
        send: () => Promise.resolve('hash'),
        warmUp: () => {
          warmed += 1
          return Promise.reject(new Error('rpc down'))
        }
      })
    const burner = createBurner(h.deps)
    await burner.connect()
    await new Promise<void>((resolve) => setTimeout(resolve, 5))
    expect(warmed).toBe(1)
    expect(burner.store.get().status).toBe('ready')
  })

  it('refuses to send before it is connected', async () => {
    const h = harness({ ok: true, accountId: 'x.testnet', amount: '1' })
    const burner = createBurner(h.deps)
    await expect(burner.send({ method: 'buy', args: {} })).rejects.toThrow('not connected')
  })
})

describe('requestDrip', () => {
  const reply = (body: unknown): DripFetch => () => Promise.resolve({ json: () => Promise.resolve(body) })

  it('parses success and failure bodies', async () => {
    const ok = await requestDrip('https://k', 'ed25519:P', reply({ ok: true, accountId: 'a.testnet', amount: '2000000000000000000000000' }))
    expect(ok).toEqual({ accountId: 'a.testnet', amount: 2n * YOCTO_PER_NEAR })
    await expect(requestDrip('https://k', 'ed25519:P', reply({ ok: false, error: 'bad_key' }))).rejects.toMatchObject({ code: 'bad_key' })
    await expect(requestDrip('https://k', 'ed25519:P', reply({ ok: false, error: 'rate_limited', retryAfterSeconds: 30 }))).rejects.toMatchObject({
      code: 'rate_limited',
      retryAfterSeconds: 30
    })
    await expect(requestDrip('https://k', 'ed25519:P', reply({ ok: false, error: 'something' }))).rejects.toMatchObject({ code: 'send_failed' })
  })

  it('reports an unreachable or absent keeper', async () => {
    await expect(requestDrip(null, 'ed25519:P', reply({}))).rejects.toBeInstanceOf(DripError)
    await expect(requestDrip('https://k', 'ed25519:P', () => Promise.reject(new Error('offline')))).rejects.toMatchObject({ code: 'unreachable' })
    await expect(requestDrip('https://k', 'ed25519:P', reply('nope'))).rejects.toMatchObject({ code: 'unreachable' })
  })
})

describe('burner keys', () => {
  it('generates an ed25519 key whose public half is recoverable from the secret', async () => {
    const key = await newBurnerKey()
    expect(isSecretKey(key.secretKey)).toBe(true)
    expect(key.publicKey.startsWith('ed25519:')).toBe(true)
    expect(await publicKeyOf(key.secretKey)).toBe(key.publicKey)
    expect(isSecretKey('0xabc')).toBe(false)
    expect(isSecretKey(null)).toBe(false)
  })
})
