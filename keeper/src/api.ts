import { Hono } from 'hono'
import type { Context } from 'hono'
import { cors } from 'hono/cors'
import { z } from 'zod'
import type { DripService } from './drip'
import type { DemoAdmin } from './demo'
import { mountDemo } from './demoRoutes'
import type { RelayHub } from './relay'
import { mountRelay } from './relay'

export interface HealthBody {
  ok: boolean
  headBlock: number
  lagSeconds: number
  keeperAddress: string
  roundId: number | null
  round: { phase: string; epoch: number; locked: boolean } | null
}

export interface ApiDeps {
  health(): HealthBody | Promise<HealthBody>
  drip: DripService | null
  allowedOrigin: string | null
  relay?: RelayHub | null
  demo?: { admin: DemoAdmin; token: string; now?: () => number; writeMax?: number; readMax?: number } | null
  sleep?: (ms: number) => Promise<void>
  pingMs?: number
}

const dripBody = z.object({ address: z.string() })

export function clientIp(c: Context): string {
  const forwarded = c.req.header('x-forwarded-for')
  const first = forwarded?.split(',')[0]?.trim()
  if (first !== undefined && first.length > 0) return first
  return c.req.header('x-real-ip') ?? c.req.header('cf-connecting-ip') ?? 'unknown'
}

export function createApi(deps: ApiDeps): Hono {
  const app = new Hono()
  const allowed = deps.allowedOrigin
  app.use(
    '*',
    cors({
      origin: (origin) => (allowed !== null && origin === allowed ? origin : null),
      allowMethods: ['GET', 'POST', 'OPTIONS'],
      allowHeaders: ['content-type', 'last-event-id', 'x-demo-token'],
      maxAge: 600
    })
  )

  app.get('/healthz', async (c) => {
    const body = await deps.health()
    return c.json(body, body.ok ? 200 : 503)
  })

  app.post('/drip', async (c) => {
    if (deps.drip === null) return c.json({ error: 'drip_disabled' }, 503)
    let json: unknown
    try {
      json = await c.req.json()
    } catch {
      return c.json({ error: 'bad_request' }, 400)
    }
    const parsed = dripBody.safeParse(json)
    if (!parsed.success) return c.json({ error: 'bad_request' }, 400)
    const result = await deps.drip.drip(parsed.data.address, clientIp(c))
    if (result.ok) return c.json({ txHash: result.txHash, amount: result.amount }, 200)
    switch (result.error) {
      case 'bad_address':
        return c.json({ error: 'bad_address' }, 400)
      case 'rate_limited':
        c.header('retry-after', String(result.retryAfterSeconds))
        return c.json({ error: 'rate_limited', retryAfterSeconds: result.retryAfterSeconds }, 429)
      case 'faucet_empty':
        return c.json({ error: 'faucet_empty' }, 503)
      case 'send_failed':
        return c.json({ error: 'send_failed' }, 502)
    }
  })

  if (deps.relay !== undefined && deps.relay !== null) {
    mountRelay(app, deps.relay, { sleep: deps.sleep, pingMs: deps.pingMs })
  }
  if (deps.demo !== undefined && deps.demo !== null) {
    mountDemo(app, { ...deps.demo, clientIp })
  }
  return app
}
