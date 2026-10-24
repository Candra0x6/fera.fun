import { describe, expect, it } from 'vitest'
import { createApi } from '../src/api'
import type { HealthBody } from '../src/api'
import { createDripService } from '../src/drip'
import type { DripSender } from '../src/drip'
import type { Hex } from '@animal/shared'

const ORIGIN = 'https://arena.example.test'
const ADDRESS = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'
const ETH = 10n ** 18n

function sender(balance = 100n * ETH) {
  const sent: Array<{ to: Hex; amount: bigint }> = []
  let running = 0
  let peak = 0
  const value: DripSender = {
    address: '0x00000000000000000000000000000000000000dd',
    balance: () => Promise.resolve(balance),
    async send(to, amount) {
      running += 1
      peak = Math.max(peak, running)
      await Promise.resolve()
      sent.push({ to, amount })
      running -= 1
      return `0x${sent.length.toString(16).padStart(64, '0')}`
    }
  }
  return { sender: value, sent, peak: () => peak }
}

function app(options: { balance?: bigint; now?: () => number; ipMax?: number; drip?: boolean } = {}) {
  const s = sender(options.balance)
  const drip =
    options.drip === false
      ? null
      : createDripService({
          sender: s.sender,
          amount: 5n * ETH,
          now: options.now ?? (() => 1_000_000),
          ipMaxPerWindow: options.ipMax ?? 10
        })
  const health: HealthBody = {
    ok: true,
    headBlock: 123,
    lagSeconds: 0.4,
    keeperAddress: '0x00000000000000000000000000000000000000ee',
    roundId: 1,
    round: { phase: 'Leveling', epoch: 2, locked: false }
  }
  const api = createApi({ health: () => health, drip, allowedOrigin: ORIGIN })
  return { api, sent: s.sent, peak: s.peak, health }
}

function post(api: ReturnType<typeof app>['api'], address: string, ip = '203.0.113.5', origin: string = ORIGIN) {
  return api.request('/drip', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip, origin },
    body: JSON.stringify({ address })
  })
}

describe('GET /healthz', () => {
  it('returns the documented body', async () => {
    const { api } = app()
    const response = await api.request('/healthz')
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      ok: true,
      headBlock: 123,
      lagSeconds: 0.4,
      keeperAddress: '0x00000000000000000000000000000000000000ee',
      roundId: 1,
      round: { phase: 'Leveling', epoch: 2, locked: false }
    })
  })

  it('answers 503 when the feed is unhealthy', async () => {
    const api = createApi({
      health: () => ({ ok: false, headBlock: 0, lagSeconds: 12, keeperAddress: '0x0', roundId: null, round: null }),
      drip: null,
      allowedOrigin: null
    })
    expect((await api.request('/healthz')).status).toBe(503)
  })
})

describe('POST /drip', () => {
  it('sends the configured amount and answers with the transaction hash', async () => {
    const { api, sent } = app()
    const response = await post(api, ADDRESS)
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toEqual({ txHash: `0x${'1'.padStart(64, '0')}`, amount: (5n * ETH).toString() })
    expect(sent).toEqual([{ to: ADDRESS, amount: 5n * ETH }])
  })

  it('answers 400 for a bad address and for a bad body', async () => {
    const { api } = app()
    const bad = await post(api, '0x1234')
    expect(bad.status).toBe(400)
    expect(await bad.json()).toEqual({ error: 'bad_address' })
    const notJson = await api.request('/drip', { method: 'POST', body: 'nope' })
    expect(notJson.status).toBe(400)
    const wrongShape = await api.request('/drip', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ wallet: ADDRESS })
    })
    expect(wrongShape.status).toBe(400)
  })

  it('answers 429 with retryAfterSeconds for a repeated address', async () => {
    let now = 1_000_000
    const { api, sent } = app({ now: () => now })
    expect((await post(api, ADDRESS)).status).toBe(200)
    now += 60_000
    const limited = await post(api, ADDRESS.toLowerCase(), '198.51.100.9')
    expect(limited.status).toBe(429)
    expect(await limited.json()).toEqual({ error: 'rate_limited', retryAfterSeconds: 3540 })
    expect(limited.headers.get('retry-after')).toBe('3540')
    expect(sent).toHaveLength(1)
    now += 3_540_000
    expect((await post(api, ADDRESS)).status).toBe(200)
  })

  it('answers 429 per IP across different addresses', async () => {
    const { api, sent } = app({ ipMax: 2 })
    expect((await post(api, `0x${'1'.repeat(40)}`, '192.0.2.1')).status).toBe(200)
    expect((await post(api, `0x${'2'.repeat(40)}`, '192.0.2.1')).status).toBe(200)
    const limited = await post(api, `0x${'3'.repeat(40)}`, '192.0.2.1')
    expect(limited.status).toBe(429)
    expect(await limited.json()).toEqual({ error: 'rate_limited', retryAfterSeconds: 3600 })
    expect((await post(api, `0x${'3'.repeat(40)}`, '192.0.2.2')).status).toBe(200)
    expect(sent).toHaveLength(3)
  })

  it('refuses below the balance floor and when the faucet is disabled', async () => {
    const { api, sent } = app({ balance: 14n * ETH })
    const empty = await post(api, ADDRESS)
    expect(empty.status).toBe(503)
    expect(await empty.json()).toEqual({ error: 'faucet_empty' })
    expect(sent).toHaveLength(0)
    const off = app({ drip: false })
    expect((await post(off.api, ADDRESS)).status).toBe(503)
  })

  it('serialises concurrent drips so one account never has two sends in flight', async () => {
    const { api, sent, peak } = app()
    const responses = await Promise.all(
      [1, 2, 3, 4].map((n) => post(api, `0x${String(n).repeat(40)}`, `192.0.2.${n}`))
    )
    expect(responses.map((r) => r.status)).toEqual([200, 200, 200, 200])
    expect(sent).toHaveLength(4)
    expect(peak()).toBe(1)
  })

  it('does not burn the rate limit when the transfer fails', async () => {
    const failing: DripSender = {
      address: '0x00000000000000000000000000000000000000dd',
      balance: () => Promise.resolve(100n * ETH),
      send: () => Promise.reject(new Error('rpc down'))
    }
    const api = createApi({
      health: () => ({ ok: true, headBlock: 1, lagSeconds: 0, keeperAddress: '0x0', roundId: null, round: null }),
      drip: createDripService({ sender: failing, amount: ETH }),
      allowedOrigin: ORIGIN
    })
    expect((await post(api, ADDRESS)).status).toBe(502)
    expect((await post(api, ADDRESS)).status).toBe(502)
  })
})

describe('CORS', () => {
  it('allows only the configured origin', async () => {
    const { api } = app()
    const allowed = await api.request('/healthz', { headers: { origin: ORIGIN } })
    expect(allowed.headers.get('access-control-allow-origin')).toBe(ORIGIN)
    const other = await api.request('/healthz', { headers: { origin: 'https://evil.example.test' } })
    expect(other.headers.get('access-control-allow-origin')).toBeNull()
    const preflight = await api.request('/drip', {
      method: 'OPTIONS',
      headers: { origin: ORIGIN, 'access-control-request-method': 'POST', 'access-control-request-headers': 'content-type' }
    })
    expect(preflight.headers.get('access-control-allow-origin')).toBe(ORIGIN)
    expect(preflight.headers.get('access-control-allow-methods')).toContain('POST')
    const denied = await api.request('/drip', {
      method: 'OPTIONS',
      headers: { origin: 'https://evil.example.test', 'access-control-request-method': 'POST' }
    })
    expect(denied.headers.get('access-control-allow-origin')).toBeNull()
  })

  it('sets no cross-origin header when no origin is configured', async () => {
    const api = createApi({
      health: () => ({ ok: true, headBlock: 1, lagSeconds: 0, keeperAddress: '0x0', roundId: null, round: null }),
      drip: null,
      allowedOrigin: null
    })
    const response = await api.request('/healthz', { headers: { origin: ORIGIN } })
    expect(response.headers.get('access-control-allow-origin')).toBeNull()
  })
})
