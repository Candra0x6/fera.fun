import { describe, expect, it } from 'vitest'
import { createApi } from '../src/api'
import type { DripHandler, DripResponse, HealthBody } from '../src/api'

const ORIGIN = 'https://arena.example.test'
const KEY = 'ed25519:6E8sCci9badyRkXb3JoRpBj5p8C6Tw41ELDZoiihKEtp'

const HEALTH: HealthBody = {
  ok: true,
  headBlock: 123,
  lagSeconds: 0.4,
  keeperAccount: 'fera-keeper.testnet',
  roundId: 1,
  round: { phase: 'Leveling', epoch: 2, locked: false }
}

function handler(result: DripResponse): { handler: DripHandler; seen: Array<{ publicKey: string; ip: string }> } {
  const seen: Array<{ publicKey: string; ip: string }> = []
  return {
    handler: {
      drip(publicKey, ip) {
        seen.push({ publicKey, ip })
        return Promise.resolve(result)
      }
    },
    seen
  }
}

function app(drip: DripHandler | null) {
  return createApi({ health: () => HEALTH, drip, allowedOrigins: [ORIGIN] })
}

function post(api: ReturnType<typeof app>, body: unknown, ip = '203.0.113.5', origin: string = ORIGIN) {
  return api.request('/drip', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip, origin },
    body: typeof body === 'string' ? body : JSON.stringify(body)
  })
}

describe('GET /healthz', () => {
  it('returns the documented body', async () => {
    const response = await app(null).request('/healthz')
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual(HEALTH)
  })

  it('answers 503 when the feed is unhealthy', async () => {
    const api = createApi({
      health: () => ({ ok: false, headBlock: 0, lagSeconds: 12, keeperAccount: 'k.testnet', roundId: null, round: null }),
      drip: null,
      allowedOrigins: []
    })
    expect((await api.request('/healthz')).status).toBe(503)
  })
})

describe('POST /drip', () => {
  it('answers with the account, amount and path of the funding', async () => {
    const ok: DripResponse = { ok: true, accountId: 'fera-0123456789.testnet', amount: '10000000000000000000000000', via: 'helper' }
    const { handler: h, seen } = handler(ok)
    const response = await post(app(h), { publicKey: KEY })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual(ok)
    expect(seen).toEqual([{ publicKey: KEY, ip: '203.0.113.5' }])
  })

  it('includes the transaction hash on the transfer path', async () => {
    const ok: DripResponse = { ok: true, accountId: 'a'.repeat(64), amount: '2000000000000000000000000', via: 'transfer', txHash: 'H1' }
    const response = await post(app(handler(ok).handler), { publicKey: KEY })
    expect(await response.json()).toEqual(ok)
  })

  it('maps each error to its status and body', async () => {
    const cases: Array<[DripResponse, number]> = [
      [{ ok: false, error: 'bad_key' }, 400],
      [{ ok: false, error: 'faucet_empty' }, 503],
      [{ ok: false, error: 'send_failed' }, 502]
    ]
    for (const [result, status] of cases) {
      const response = await post(app(handler(result).handler), { publicKey: KEY })
      expect(response.status).toBe(status)
      expect(await response.json()).toEqual(result)
    }
    const limited: DripResponse = { ok: false, error: 'rate_limited', retryAfterSeconds: 3540 }
    const response = await post(app(handler(limited).handler), { publicKey: KEY })
    expect(response.status).toBe(429)
    expect(response.headers.get('retry-after')).toBe('3540')
    expect(await response.json()).toEqual(limited)
  })

  it('answers 400 for a body that is not JSON or has the wrong shape', async () => {
    const { handler: h, seen } = handler({ ok: false, error: 'bad_key' })
    const api = app(h)
    expect((await post(api, 'nope')).status).toBe(400)
    expect((await post(api, { address: KEY })).status).toBe(400)
    expect(seen).toHaveLength(0)
  })

  it('answers 503 when the faucet is disabled', async () => {
    const response = await post(app(null), { publicKey: KEY })
    expect(response.status).toBe(503)
  })
})

describe('CORS', () => {
  it('allows only the configured origin', async () => {
    const api = app(null)
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

  it('allows every origin of a configured list and nothing else', async () => {
    const second = 'http://localhost:5173'
    const api = createApi({ health: () => HEALTH, drip: null, allowedOrigins: [ORIGIN, second] })
    for (const origin of [ORIGIN, second]) {
      const response = await api.request('/healthz', { headers: { origin } })
      expect(response.headers.get('access-control-allow-origin')).toBe(origin)
    }
    const preflight = await api.request('/drip', {
      method: 'OPTIONS',
      headers: { origin: second, 'access-control-request-method': 'POST', 'access-control-request-headers': 'content-type,x-demo-token' }
    })
    expect(preflight.headers.get('access-control-allow-origin')).toBe(second)
    const other = await api.request('/healthz', { headers: { origin: 'http://localhost:5174' } })
    expect(other.headers.get('access-control-allow-origin')).toBeNull()
  })

  it('sets no cross-origin header when no origin is configured', async () => {
    const api = createApi({
      health: () => ({ ok: true, headBlock: 1, lagSeconds: 0, keeperAccount: 'k.testnet', roundId: null, round: null }),
      drip: null,
      allowedOrigins: []
    })
    const response = await api.request('/healthz', { headers: { origin: ORIGIN } })
    expect(response.headers.get('access-control-allow-origin')).toBeNull()
  })
})
