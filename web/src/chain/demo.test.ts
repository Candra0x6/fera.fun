import { describe, expect, it } from 'vitest'
import {
  DemoApiError,
  createDemoClient,
  demoEnablement,
  demoStatusLine,
  describeDemoError,
  parseDemoStatus,
  resolveDemoToken
} from './demo'
import type { DemoFetch, DemoStatus } from './demo'

const base: DemoStatus = {
  roundId: 3,
  phase: 'Lobby',
  coinCount: 2,
  maxCoins: 30,
  minCoins: 8,
  lobbyEndsAt: 1000,
  canCreate: false,
  canSeed: true,
  freeSlots: 28,
  busy: false,
  balances: { owner: '12500000000000000000', seeder: '4' }
}

function mockFetch(status: number, body: unknown) {
  const calls: Array<{ url: string; method: string; headers: Record<string, string>; body?: string }> = []
  const fn: DemoFetch = (url, init) => {
    calls.push({ url, ...init })
    return Promise.resolve({ ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) })
  }
  return { fn, calls }
}

describe('demoEnablement', () => {
  it('follows the server flags', () => {
    expect(demoEnablement(base, null)).toEqual({ create: false, seed: true })
    expect(demoEnablement({ ...base, canCreate: true, canSeed: false }, null)).toEqual({ create: true, seed: false })
  })
  it('disables everything while pending, busy or unknown', () => {
    expect(demoEnablement(null, null)).toEqual({ create: false, seed: false })
    expect(demoEnablement({ ...base, canCreate: true }, 'create')).toEqual({ create: false, seed: false })
    expect(demoEnablement({ ...base, canCreate: true, busy: true }, null)).toEqual({ create: false, seed: false })
  })
  it('needs a free slot to seed', () => {
    expect(demoEnablement({ ...base, freeSlots: 0 }, null).seed).toBe(false)
  })
})

describe('status line', () => {
  it('shows round, phase, coins and balances', () => {
    expect(demoStatusLine(base, null)).toBe('Round 3 Lobby | coins 2/30 | owner 12.50 seeder 4 MON')
  })
  it('falls back to the error or a loading note', () => {
    expect(demoStatusLine(null, 'Keeper unreachable')).toBe('Keeper unreachable')
    expect(demoStatusLine(null, null)).toBe('Loading demo status')
  })
})

describe('createDemoClient', () => {
  it('sends the token header and parses status', async () => {
    const { fn, calls } = mockFetch(200, base)
    const client = createDemoClient({ baseUrl: 'http://k', token: 'secret', fetch: fn })
    expect(await client.status()).toEqual(base)
    expect(calls[0]).toMatchObject({ url: 'http://k/demo/status', method: 'GET' })
    expect(calls[0]?.headers['x-demo-token']).toBe('secret')
  })
  it('posts create-round and seed-house', async () => {
    const created = mockFetch(200, { roundId: 4 })
    expect(await createDemoClient({ baseUrl: 'http://k', token: 't', fetch: created.fn }).createRound()).toEqual({ roundId: 4 })
    expect(created.calls[0]).toMatchObject({ url: 'http://k/demo/create-round', method: 'POST' })
    const seeded = mockFetch(200, { launched: ['0xa', '0xb'] })
    expect(await createDemoClient({ baseUrl: 'http://k', token: 't', fetch: seeded.fn }).seedHouse(5)).toEqual({ launched: ['0xa', '0xb'] })
    expect(seeded.calls[0]?.body).toBe('{"count":5}')
  })
  it.each([
    [401, { error: 'bad token' }, 'bad token'],
    [409, { error: 'round in progress' }, 'round in progress'],
    [429, {}, 'Too many requests, try again shortly']
  ])('maps %i errors', async (status, body, message) => {
    const { fn } = mockFetch(status, body)
    const error = await createDemoClient({ baseUrl: 'http://k', token: 't', fetch: fn }).createRound().catch((e: unknown) => e)
    expect(error).toBeInstanceOf(DemoApiError)
    expect(describeDemoError(error)).toBe(message)
  })
  it('reports the shortfall on 402', async () => {
    const { fn } = mockFetch(402, { error: 'insufficient funds', shortfall: '1500000000000000000' })
    const error = await createDemoClient({ baseUrl: 'http://k', token: 't', fetch: fn }).seedHouse(5).catch((e: unknown) => e)
    expect(describeDemoError(error)).toBe('Insufficient funds, short by 1.50 MON')
  })
  it('reports network failure', async () => {
    const client = createDemoClient({ baseUrl: 'http://k', token: 't', fetch: () => Promise.reject(new Error('down')) })
    expect(describeDemoError(await client.status().catch((e: unknown) => e))).toBe('Keeper unreachable')
  })
})

describe('parseDemoStatus', () => {
  it('tolerates garbage', () => {
    expect(parseDemoStatus(null).canCreate).toBe(false)
    expect(parseDemoStatus({ roundId: '7', canSeed: true }).roundId).toBe(7)
  })
})

describe('resolveDemoToken', () => {
  it('requires the demo param and remembers it', () => {
    const memory = new Map<string, string>()
    const storage = { getItem: (k: string) => memory.get(k) ?? null, setItem: (k: string, v: string) => void memory.set(k, v) }
    expect(resolveDemoToken('?x=1', storage)).toBeNull()
    expect(resolveDemoToken('?demo=abc', storage)).toBe('abc')
    expect(memory.size).toBe(1)
    expect(resolveDemoToken('?demo=', storage)).toBe('abc')
    expect(resolveDemoToken('?demo', { getItem: () => null, setItem: () => undefined }, 'built-in')).toBe('built-in')
    expect(resolveDemoToken('?x=1', { getItem: () => null, setItem: () => undefined }, 'built-in')).toBeNull()
  })
})
