import { describe, expect, it } from 'vitest'
import { formatEther, parseEther } from 'viem'
import type { Hex } from '@animal/shared'
import { createApi } from '../src/api'
import { createDemoAdmin } from '../src/demo'
import type { DefaultRoundConfig, DemoChain, DemoDeps } from '../src/demo'
import { plannedEpochs, treasuryTarget } from '../src/demo'
import { HOUSE_ROSTER } from '../src/house'
import type { HouseChain, HouseCoinOnChain, LaunchPlanItem } from '../src/house'
import type { RoundParams, RoundState } from '../src/port'
import { baseRound, DEFAULT_PARAMS } from './fakeArena'

const ETH = 10n ** 18n
const TOKEN = 'demo-token-for-tests'
const CREATOR: Hex = '0x00000000000000000000000000000000000000a1'
const SEEDER: Hex = '0x00000000000000000000000000000000000000b2'
const LITE_PARAMS: RoundParams = {
  ...DEFAULT_PARAMS,
  minCoins: 5,
  maxCoins: 6,
  lobbySeconds: 3600,
  clashesPerEpoch: 3,
  maxEntropyFee: parseEther('0.2')
}

interface World {
  roundId: number
  round: RoundState | null
  coins: HouseCoinOnChain[]
  balances: Map<string, bigint>
  houseBalances: Map<number, bigint>
  journal: string[]
  reserveFloor: bigint
  defaultConfig: DefaultRoundConfig | null
  carry: bigint
  createError: Error | null
}

const LITE_DEFAULT: DefaultRoundConfig = {
  minCoins: 5,
  maxCoins: 6,
  levelingEpochs: 3,
  clashesPerEpoch: 3,
  maxEntropyFee: parseEther('0.2'),
  keeperBounty: parseEther('0.02')
}

function world(patch: Partial<World> = {}): World {
  return {
    roundId: 0,
    round: null,
    coins: [],
    balances: new Map([
      [CREATOR, 100n * ETH],
      [SEEDER, 100n * ETH]
    ]),
    houseBalances: new Map(),
    journal: [],
    reserveFloor: 10n * ETH,
    defaultConfig: LITE_DEFAULT,
    carry: 0n,
    createError: null,
    ...patch
  }
}

function build(w: World, overrides: Partial<DemoDeps> = {}, gate?: { release: () => Promise<void> }) {
  const chain: DemoChain = {
    currentRoundId: () => Promise.resolve(w.roundId),
    balance: (address) => Promise.resolve(w.balances.get(address) ?? 0n),
    houseBalance: (index) => Promise.resolve(w.houseBalances.get(index) ?? 0n),
    estimateCarry: () => Promise.resolve(w.carry),
    recycle: (id) => {
      w.journal.push(`recycle:${id}`)
      return Promise.resolve()
    },
    readDefaultConfig: () => Promise.resolve(w.defaultConfig),
    async createDefaultRound(value) {
      if (gate !== undefined) await gate.release()
      if (w.createError !== null) throw w.createError
      w.journal.push(`createDefault:${value}`)
      w.roundId += 1
      w.coins = []
      w.round = baseRound({ phase: 'Lobby', coinCount: 0, treasury: w.carry + value, createdAt: 5000 })
      return w.roundId
    },
    fundTreasury(id, amount) {
      w.journal.push(`fund:${id}:${amount}`)
      if (w.round !== null) w.round = { ...w.round, treasury: w.round.treasury + amount }
      return Promise.resolve()
    }
  }
  const house: HouseChain = {
    readState: () =>
      Promise.resolve({
        coins: [...w.coins],
        minSeed: parseEther('0.2'),
        maxSeed: parseEther('5'),
        launchFee: parseEther('0.1'),
        maxCoins: 6
      }),
    ensureReserve: () => Promise.resolve(0n),
    fund: (index, amount) => {
      w.journal.push(`house-fund:${index}:${amount}`)
      return Promise.resolve()
    },
    launch(item: LaunchPlanItem) {
      w.journal.push(`launch:${item.ticker}`)
      w.coins.push({ coinId: w.coins.length, ticker: item.ticker, token: `0x${(w.coins.length + 1).toString(16).padStart(40, '0')}` })
      if (w.round !== null) w.round = { ...w.round, coinCount: w.coins.length }
      return Promise.resolve()
    },
    waitBlocks: () => Promise.resolve()
  }
  const admin = createDemoAdmin({
    port: {
      readRound: () => Promise.resolve(w.round === null ? baseRound({ phase: 'None' }) : { ...w.round }),
      readParams: () => Promise.resolve(LITE_PARAMS),
      readReserveFloor: () => Promise.resolve(w.reserveFloor)
    },
    chain,
    houseChainFor: () => house,
    creatorAddress: CREATOR,
    seederAddress: SEEDER,
    lobbySeconds: 3600,
    houseGasBuffer: parseEther('0.05'),
    log: () => undefined,
    ...overrides
  })
  const app = createApi({
    health: () => ({ ok: true, headBlock: 1, lagSeconds: 0, keeperAddress: '0x0', roundId: null, round: null }),
    drip: null,
    allowedOrigin: 'https://arena.example.test',
    demo: { admin, token: TOKEN, writeMax: 6, readMax: 50 }
  })
  return { app, admin }
}

const auth = { 'x-demo-token': TOKEN, 'content-type': 'application/json' }

function seed(app: ReturnType<typeof build>['app'], body?: unknown, ip = '203.0.113.9') {
  return app.request('/demo/seed-house', {
    method: 'POST',
    headers: { ...auth, 'x-forwarded-for': ip },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  })
}

function create(app: ReturnType<typeof build>['app'], ip = '203.0.113.9') {
  return app.request('/demo/create-round', { method: 'POST', headers: { ...auth, 'x-forwarded-for': ip } })
}

describe('demo admin gating', () => {
  it('is 404 when the token is not configured', async () => {
    const app = createApi({ health: () => ({ ok: true, headBlock: 1, lagSeconds: 0, keeperAddress: '0x0', roundId: null, round: null }), drip: null, allowedOrigin: null })
    expect((await app.request('/demo/status')).status).toBe(404)
    expect((await app.request('/demo/create-round', { method: 'POST' })).status).toBe(404)
  })

  it('rejects a missing or wrong token on every route', async () => {
    const { app } = build(world())
    for (const headers of [{}, { 'x-demo-token': 'nope' }, { 'x-demo-token': `${TOKEN}x` }]) {
      expect((await app.request('/demo/status', { headers })).status).toBe(401)
      expect((await app.request('/demo/create-round', { method: 'POST', headers })).status).toBe(401)
      expect((await app.request('/demo/seed-house', { method: 'POST', headers })).status).toBe(401)
    }
  })

  it('limits CORS to the allowed origin and lets x-demo-token through', async () => {
    const { app } = build(world())
    const ok = await app.request('/demo/status', {
      method: 'OPTIONS',
      headers: { origin: 'https://arena.example.test', 'access-control-request-method': 'POST', 'access-control-request-headers': 'x-demo-token' }
    })
    expect(ok.headers.get('access-control-allow-origin')).toBe('https://arena.example.test')
    expect(ok.headers.get('access-control-allow-headers')).toContain('x-demo-token')
    const bad = await app.request('/demo/status', { headers: { ...auth, origin: 'https://evil.example.test' } })
    expect(bad.headers.get('access-control-allow-origin')).toBeNull()
  })

  it('rate limits per IP', async () => {
    const { app } = build(world({ roundId: 1, round: baseRound({ phase: 'Leveling' }) }))
    const statuses: number[] = []
    for (let i = 0; i < 8; i += 1) statuses.push((await create(app, '198.51.100.1')).status)
    expect(statuses.slice(0, 6).every((s) => s === 409)).toBe(true)
    expect(statuses.slice(6)).toEqual([429, 429])
    expect((await create(app, '198.51.100.2')).status).toBe(409)
  })
})

describe('GET /demo/status', () => {
  async function statusOf(w: World) {
    const { app } = build(w)
    const response = await app.request('/demo/status', { headers: auth })
    expect(response.status).toBe(200)
    return (await response.json()) as Record<string, unknown>
  }

  it('with no default config and no round: canCreate still reflects the phase, limits are 0', async () => {
    expect(await statusOf(world({ defaultConfig: null }))).toMatchObject({ canCreate: true, maxCoins: 0, minCoins: 0 })
  })

  it('with no round yet: canCreate, nothing to seed, lite limits, creator and seeder balances', async () => {
    expect(await statusOf(world())).toEqual({
      roundId: 0,
      phase: 'None',
      coinCount: 0,
      maxCoins: 6,
      minCoins: 5,
      lobbyEndsAt: null,
      canCreate: true,
      canSeed: false,
      freeSlots: 0,
      busy: false,
      balances: { owner: '100', creator: '100', seeder: '100' }
    })
  })

  it('lobby with room: canSeed, not canCreate, lobbyEndsAt = createdAt + lobbySeconds', async () => {
    const status = await statusOf(world({ roundId: 2, round: baseRound({ phase: 'Lobby', coinCount: 4, createdAt: 5000 }) }))
    expect(status).toMatchObject({ roundId: 2, phase: 'Lobby', coinCount: 4, freeSlots: 2, canSeed: true, canCreate: false, lobbyEndsAt: 8600 })
  })

  it('full lobby: no seeding', async () => {
    const status = await statusOf(world({ roundId: 2, round: baseRound({ phase: 'Lobby', coinCount: 6 }) }))
    expect(status).toMatchObject({ freeSlots: 0, canSeed: false, canCreate: false })
  })

  it.each(['Leveling', 'Knockout'] as const)('%s: neither', async (phase) => {
    const status = await statusOf(world({ roundId: 2, round: baseRound({ phase }) }))
    expect(status).toMatchObject({ canCreate: false, canSeed: false, freeSlots: 0, lobbyEndsAt: null })
  })

  it.each(['Settled', 'Aborted'] as const)('%s: canCreate', async (phase) => {
    const status = await statusOf(world({ roundId: 2, round: baseRound({ phase }) }))
    expect(status).toMatchObject({ canCreate: true, canSeed: false })
  })
})

describe('POST /demo/create-round', () => {
  const lite = () => treasuryTarget(LITE_DEFAULT, 10n * ETH)

  it('calls createDefaultRound with the full treasury target when nothing carries over', async () => {
    const w = world({ roundId: 1, round: baseRound({ phase: 'Settled' }) })
    const { app } = build(w)
    const response = await create(app)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ roundId: 2 })
    expect(w.journal).toEqual(['recycle:1', `createDefault:${lite()}`])
    expect(lite()).toBe(10n * ETH + BigInt(plannedEpochs(LITE_DEFAULT)) * parseEther('0.22'))
  })

  it('subtracts the carry-over from the value sent', async () => {
    const w = world({ roundId: 1, round: baseRound({ phase: 'Settled' }), carry: 4n * ETH })
    const { app } = build(w)
    expect(((await (await create(app)).json()) as { roundId: number }).roundId).toBe(2)
    expect(w.journal).toEqual(['recycle:1', `createDefault:${lite() - 4n * ETH}`])
  })

  it('sends value 0 when the carry already covers the target', async () => {
    const w = world({ roundId: 1, round: baseRound({ phase: 'Aborted' }), carry: 1000n * ETH })
    const { app } = build(w)
    expect((await create(app)).status).toBe(200)
    expect(w.journal).toEqual(['recycle:1', 'createDefault:0'])
  })

  it('reads the config from chain instead of hardcoding it', async () => {
    const w = world({ defaultConfig: { ...LITE_DEFAULT, keeperBounty: parseEther('1') } })
    const { app } = build(w)
    expect((await create(app)).status).toBe(200)
    expect(w.journal).toEqual([`createDefault:${treasuryTarget({ ...LITE_DEFAULT, keeperBounty: parseEther('1') }, 10n * ETH)}`])
  })

  it('creates the first round without recycling', async () => {
    const w = world()
    const { app } = build(w)
    expect((await (await create(app)).json())).toEqual({ roundId: 1 })
    expect(w.journal).toEqual([`createDefault:${lite()}`])
  })

  it.each(['Lobby', 'Leveling', 'Knockout'] as const)('409 while a %s round is live', async (phase) => {
    const w = world({ roundId: 1, round: baseRound({ phase }) })
    const { app } = build(w)
    const response = await create(app)
    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ error: 'round in progress' })
    expect(w.journal).toEqual([])
  })

  it('402 with the shortfall before touching the chain', async () => {
    const w = world({ roundId: 1, round: baseRound({ phase: 'Aborted' }) })
    w.balances.set(CREATOR, 5n * ETH)
    const { app } = build(w)
    const response = await create(app)
    expect(response.status).toBe(402)
    const shortfall = lite() + parseEther('0.1') - 5n * ETH
    expect(await response.json()).toEqual({ error: 'insufficient funds', shortfall: formatEther(shortfall), address: CREATOR })
    expect(w.journal).toEqual([])
  })

  it('503 without a creator key', async () => {
    const { app } = build(world(), { creatorAddress: null })
    const response = await create(app)
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ error: 'creator_key_missing' })
  })

  it('409 no_default_config when the owner has not set one (read)', async () => {
    const w = world({ defaultConfig: null })
    const { app } = build(w)
    const response = await create(app)
    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ error: 'no_default_config' })
    expect(w.journal).toEqual([])
  })

  it('409 no_default_config when the contract reverts NoDefaultConfig', async () => {
    const w = world({ createError: new Error('reverted with custom error NoDefaultConfig()') })
    const { app } = build(w)
    const response = await create(app)
    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ error: 'no_default_config' })
  })

  it('an unexpected create failure is a 502 and releases the lock', async () => {
    const w = world({ createError: new Error('boom') })
    const { app, admin } = build(w)
    expect((await create(app)).status).toBe(502)
    expect(admin.isBusy()).toBe(false)
  })

  it('a recycle failure never blocks creation (recycle is best effort)', async () => {
    const w = world({ roundId: 1, round: baseRound({ phase: 'Settled' }) })
    const { app } = build(w)
    expect((await create(app)).status).toBe(200)
  })
})

describe('POST /demo/seed-house', () => {
  const lobby = () => world({ roundId: 1, round: baseRound({ phase: 'Lobby', coinCount: 0, treasury: 20n * ETH }) })

  it('launches 5 by default and answers the tickers', async () => {
    const w = lobby()
    const { app } = build(w)
    const response = await seed(app)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ launched: HOUSE_ROSTER.slice(0, 5).map((e) => e.ticker) })
  })

  it('honours count and clamps it to 5', async () => {
    const w = lobby()
    const { app } = build(w)
    expect(await (await seed(app, { count: 2 })).json()).toEqual({ launched: ['MOOND', 'FIRECAT'] })
    expect(((await (await seed(app, { count: 99 })).json()) as { launched: string[] }).launched).toEqual(['AQUA', 'TITAN', 'VOLT', 'SHADE'])
    expect(w.coins.length).toBe(6)
  })

  it('caps by free slots and is idempotent once full', async () => {
    const w = lobby()
    w.coins = [0, 1, 2, 3].map((i) => ({ coinId: i, ticker: `P${i}`, token: `0x${(i + 1).toString(16).padStart(40, '0')}` as Hex }))
    w.round = baseRound({ phase: 'Lobby', coinCount: 4, treasury: 20n * ETH })
    const { app } = build(w)
    expect(await (await seed(app)).json()).toEqual({ launched: ['MOOND', 'FIRECAT'] })
    const again = await seed(app)
    expect(again.status).toBe(409)
    expect(await again.json()).toEqual({ error: 'lobby full' })
    expect(w.journal.filter((e) => e.startsWith('launch:'))).toHaveLength(2)
  })

  it('never relaunches a ticker that already exists', async () => {
    const w = lobby()
    w.coins = [{ coinId: 0, ticker: 'MOOND', token: `0x${'1'.padStart(40, '0')}` }]
    w.round = baseRound({ phase: 'Lobby', coinCount: 1, treasury: 20n * ETH })
    const { app } = build(w)
    const launched = ((await (await seed(app, { count: 3 })).json()) as { launched: string[] }).launched
    expect(launched).toEqual(['FIRECAT', 'AQUA', 'TITAN'])
  })

  it('409 outside the lobby, 400 on a bad body', async () => {
    const { app } = build(world({ roundId: 1, round: baseRound({ phase: 'Leveling' }) }))
    const response = await seed(app)
    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ error: 'not in lobby' })
    expect((await seed(app, { count: 0 })).status).toBe(400)
    expect((await seed(app, { count: 'five' })).status).toBe(400)
  })

  it('402 with a shortfall when the seeder cannot fund the wallets', async () => {
    const w = lobby()
    w.balances.set(SEEDER, 2n * ETH)
    const { app } = build(w)
    const response = await seed(app)
    expect(response.status).toBe(402)
    const body = (await response.json()) as { error: string; shortfall: string; address: string }
    expect(body.error).toBe('insufficient funds')
    expect(body.address).toBe(SEEDER)
    expect(Number(body.shortfall)).toBeGreaterThan(0)
    expect(w.journal).toEqual([])
  })

  it('counts existing house wallet balances against the shortfall', async () => {
    const w = lobby()
    w.balances.set(SEEDER, 0n)
    for (let i = 0; i < 6; i += 1) w.houseBalances.set(i, 100n * ETH)
    const { app } = build(w)
    expect((await seed(app)).status).toBe(200)
  })
})

describe('serialization', () => {
  it('answers 409 busy to a second operation while one is running, then recovers', async () => {
    const w = world()
    let open!: () => void
    const wait = new Promise<void>((resolve) => {
      open = resolve
    })
    const { app, admin } = build(w, {}, { release: () => wait })
    const first = create(app, '203.0.113.20')
    await Promise.resolve()
    await new Promise((resolve) => setTimeout(resolve, 5))
    expect(admin.isBusy()).toBe(true)
    const status = (await (await app.request('/demo/status', { headers: auth })).json()) as { busy: boolean }
    expect(status.busy).toBe(true)
    const second = await create(app, '203.0.113.21')
    expect(second.status).toBe(409)
    expect(await second.json()).toEqual({ error: 'busy' })
    const seedWhileBusy = await seed(app, undefined, '203.0.113.22')
    expect(seedWhileBusy.status).toBe(409)
    open()
    expect((await first).status).toBe(200)
    expect(admin.isBusy()).toBe(false)
  })

  it('releases the lock and answers 502 when the chain throws', async () => {
    const w = world()
    const { app, admin } = build(w, {
      chain: {
        currentRoundId: () => Promise.reject(new Error('rpc down')),
        balance: () => Promise.resolve(0n),
        houseBalance: () => Promise.resolve(0n),
        estimateCarry: () => Promise.resolve(0n),
        recycle: () => Promise.resolve(),
        readDefaultConfig: () => Promise.resolve(LITE_DEFAULT),
        createDefaultRound: () => Promise.reject(new Error('x')),
        fundTreasury: () => Promise.resolve()
      }
    })
    expect((await create(app)).status).toBe(502)
    expect(admin.isBusy()).toBe(false)
  })
})
