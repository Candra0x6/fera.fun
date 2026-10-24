export interface DemoBalances {
  owner: string
  seeder: string
}

export interface DemoStatus {
  roundId: number
  phase: string
  coinCount: number
  maxCoins: number
  minCoins: number
  lobbyEndsAt: number
  canCreate: boolean
  canSeed: boolean
  freeSlots: number
  busy: boolean
  balances: DemoBalances
}

export class DemoApiError extends Error {
  readonly status: number
  readonly shortfall: string | null

  constructor(status: number, message: string, shortfall: string | null) {
    super(message)
    this.name = 'DemoApiError'
    this.status = status
    this.shortfall = shortfall
  }
}

export interface DemoClient {
  status(): Promise<DemoStatus>
  createRound(): Promise<{ roundId: number }>
  seedHouse(count: number): Promise<{ launched: string[] }>
}

export type DemoFetch = (url: string, init: { method: string; headers: Record<string, string>; body?: string }) => Promise<{
  ok: boolean
  status: number
  json: () => Promise<unknown>
}>

export interface DemoClientOptions {
  baseUrl: string
  token: string
  fetch: DemoFetch
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}
}

function num(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : typeof value === 'number' || typeof value === 'bigint' ? String(value) : ''
}

export function parseDemoStatus(raw: unknown): DemoStatus {
  const body = record(raw)
  const balances = record(body['balances'])
  return {
    roundId: num(body['roundId']),
    phase: text(body['phase']),
    coinCount: num(body['coinCount']),
    maxCoins: num(body['maxCoins']),
    minCoins: num(body['minCoins']),
    lobbyEndsAt: num(body['lobbyEndsAt']),
    canCreate: body['canCreate'] === true,
    canSeed: body['canSeed'] === true,
    freeSlots: num(body['freeSlots']),
    busy: body['busy'] === true,
    balances: { owner: text(balances['owner']), seeder: text(balances['seeder']) }
  }
}

const STATUS_MESSAGES: Readonly<Record<number, string>> = {
  401: 'Demo token rejected',
  402: 'Insufficient funds',
  409: 'Round already in progress',
  429: 'Too many requests, try again shortly'
}

export function createDemoClient(options: DemoClientOptions): DemoClient {
  async function call(method: 'GET' | 'POST', path: string, body?: unknown): Promise<unknown> {
    const headers: Record<string, string> = { 'x-demo-token': options.token }
    const init: { method: string; headers: Record<string, string>; body?: string } = { method, headers }
    if (body !== undefined) {
      headers['content-type'] = 'application/json'
      init.body = JSON.stringify(body)
    }
    let response: Awaited<ReturnType<DemoFetch>>
    try {
      response = await options.fetch(`${options.baseUrl}${path}`, init)
    } catch {
      throw new DemoApiError(0, 'Keeper unreachable', null)
    }
    const payload: unknown = await response.json().catch(() => null)
    if (!response.ok) {
      const fields = record(payload)
      const shortfall = fields['shortfall'] === undefined || fields['shortfall'] === null ? null : text(fields['shortfall'])
      const message = text(fields['error']) || STATUS_MESSAGES[response.status] || `Request failed (${response.status})`
      throw new DemoApiError(response.status, message, shortfall)
    }
    return payload
  }

  return {
    status: async () => parseDemoStatus(await call('GET', '/demo/status')),
    createRound: async () => ({ roundId: num(record(await call('POST', '/demo/create-round', {}))['roundId']) }),
    seedHouse: async (count) => {
      const launched = record(await call('POST', '/demo/seed-house', { count }))['launched']
      return { launched: Array.isArray(launched) ? launched.map(text) : [] }
    }
  }
}

export type DemoAction = 'create' | 'seed'

export function demoEnablement(status: DemoStatus | null, pending: DemoAction | null): { create: boolean; seed: boolean } {
  if (status === null || pending !== null || status.busy) return { create: false, seed: false }
  return { create: status.canCreate, seed: status.canSeed && status.freeSlots > 0 }
}

export function formatDemoBalance(value: string): string {
  if (value === '') return '?'
  if (/^\d{13,}$/.test(value)) {
    const wei = BigInt(value)
    const hundredths = (wei * 100n) / 10n ** 18n
    return `${hundredths / 100n}.${String(hundredths % 100n).padStart(2, '0')}`
  }
  return value
}

export function demoStatusLine(status: DemoStatus | null, error: string | null): string {
  if (status === null) return error ?? 'Loading demo status'
  const round = status.roundId > 0 ? `Round ${status.roundId}` : 'No round'
  const phase = status.phase === '' ? 'None' : status.phase
  return `${round} ${phase} | coins ${status.coinCount}/${status.maxCoins} | owner ${formatDemoBalance(status.balances.owner)} seeder ${formatDemoBalance(status.balances.seeder)} MON`
}

export function describeDemoError(error: unknown): string {
  if (!(error instanceof DemoApiError)) return 'Demo request failed'
  if (error.status === 402) {
    const short = error.shortfall === null ? '' : `, short by ${formatDemoBalance(error.shortfall)} MON`
    return `Insufficient funds${short}`
  }
  if (error.status === 409) return error.message === '' ? 'Round already in progress' : error.message
  return error.message
}

const TOKEN_KEY = 'animal-demo-token'

export function resolveDemoToken(
  search: string,
  storage: Pick<Storage, 'getItem' | 'setItem'> | null,
  fallback: string | null = null
): string | null {
  const fromUrl = new URLSearchParams(search).get('demo')
  if (fromUrl === null) return null
  const trimmed = fromUrl.trim()
  if (trimmed === '') return storage?.getItem(TOKEN_KEY) ?? (fallback !== null && fallback !== '' ? fallback : null)
  storage?.setItem(TOKEN_KEY, trimmed)
  return trimmed
}
