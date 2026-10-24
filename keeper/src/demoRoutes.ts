import { createHash, timingSafeEqual } from 'node:crypto'
import type { Context, Hono } from 'hono'
import { z } from 'zod'
import type { DemoAdmin, DemoResult } from './demo'

export interface DemoRoutesOptions {
  admin: DemoAdmin
  token: string
  clientIp(c: Context): string
  now?: () => number
  writeMax?: number
  readMax?: number
  windowMs?: number
}

const seedBody = z.object({ count: z.number().int().min(1).optional() })

export function tokenMatches(expected: string, given: string | undefined): boolean {
  if (given === undefined) return false
  const a = createHash('sha256').update(expected).digest()
  const b = createHash('sha256').update(given).digest()
  return timingSafeEqual(a, b)
}

function createLimiter(max: number, windowMs: number, now: () => number) {
  const hits = new Map<string, number[]>()
  return (ip: string): number | null => {
    const at = now()
    const recent = (hits.get(ip) ?? []).filter((time) => at - time < windowMs)
    const oldest = recent[0]
    if (recent.length >= max && oldest !== undefined) {
      hits.set(ip, recent)
      return Math.max(1, Math.ceil((windowMs - (at - oldest)) / 1000))
    }
    recent.push(at)
    hits.set(ip, recent)
    return null
  }
}

export function mountDemo(app: Hono, options: DemoRoutesOptions): void {
  const now = options.now ?? (() => Date.now())
  const windowMs = options.windowMs ?? 60_000
  const writeLimit = createLimiter(options.writeMax ?? 10, windowMs, now)
  const readLimit = createLimiter(options.readMax ?? 120, windowMs, now)

  function guard(c: Context, limit: (ip: string) => number | null): Response | null {
    if (!tokenMatches(options.token, c.req.header('x-demo-token'))) return c.json({ error: 'unauthorized' }, 401)
    const wait = limit(options.clientIp(c))
    if (wait !== null) {
      c.header('retry-after', String(wait))
      return c.json({ error: 'rate_limited', retryAfterSeconds: wait }, 429)
    }
    return null
  }

  function respond<T>(c: Context, result: DemoResult<T>): Response {
    return result.ok ? c.json(result.value, 200) : c.json(result.body, result.status)
  }

  app.get('/demo/status', async (c) => {
    const blocked = guard(c, readLimit)
    if (blocked !== null) return blocked
    try {
      return c.json(await options.admin.status(), 200)
    } catch {
      return c.json({ error: 'status_unavailable' }, 502)
    }
  })

  app.post('/demo/create-round', async (c) => {
    const blocked = guard(c, writeLimit)
    if (blocked !== null) return blocked
    return respond(c, await options.admin.createRound())
  })

  app.post('/demo/seed-house', async (c) => {
    const blocked = guard(c, writeLimit)
    if (blocked !== null) return blocked
    let json: unknown = {}
    const text = await c.req.text()
    if (text.trim().length > 0) {
      try {
        json = JSON.parse(text)
      } catch {
        return c.json({ error: 'bad_request' }, 400)
      }
    }
    const parsed = seedBody.safeParse(json)
    if (!parsed.success) return c.json({ error: 'bad_request' }, 400)
    return respond(c, await options.admin.seedHouse(parsed.data.count))
  })
}
