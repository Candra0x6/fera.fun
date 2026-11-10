import { describe, expect, it } from 'vitest'
import { createApi } from '../src/api'
import { createDemoAdmin, formatNear } from '../src/demo'
import type { DemoChain, DemoDeps } from '../src/demo'
import type { HouseChain, HouseState } from '../src/house'
import type { RoundState } from '../src/port'
import { DEFAULT_PARAMS, FakeArena, baseRound } from './fakeArena'

const NEAR = 10n ** 24n
const TENTH = NEAR / 10n
const TOKEN = 'demo-token-abcdef'

interface World {
  arena: FakeArena
  roundId: number
  created: number
  balances: Map<string, bigint>
  launches: string[]
  funded: Array<[number, bigint]>
  deps: DemoDeps
  failCreate: boolean
}

function world(round: RoundState | null, options: { houseHeld?: bigint; houseSeed?: boolean } = {}): World {
  const arena = new FakeArena(round ?? baseRound({ phase: 'None', coinCount: 0 }), DEFAULT_PARAMS)
  const state: World = {
    arena,
    roundId: round === null ? 0 : 1,
    created: 0,
    balances: new Map([
      ['fera-seeder.testnet', 10n * NEAR]
    ]),
    launches: [],
    funded: [],
    failCreate: false,
    deps: undefined as unknown as DemoDeps
  }
  const chain: DemoChain = {
    currentRoundId: () => Promise.resolve(state.roundId),
    balance: (id) => Promise.resolve(state.balances.get(id) ?? 0n),
    createRound() {
      if (state.failCreate) return Promise.reject(new Error('rpc down'))
      state.created += 1
      state.roundId += 1
      arena.round = baseRound({ phase: 'Lobby', coinCount: 0, createdAt: arena.now })
      return Promise.resolve({ roundId: state.roundId, txHash: `CREATE${state.created}` })
    }
  }
  const houseState = (): HouseState => ({
    coins: arena.round.coinCount === 0 ? [] : HOUSE_TICKERS.slice(0, arena.round.coinCount).map((ticker, coinId) => ({ coinId, ticker, creator: 'h.fera-seeder.testnet' })),
    minSeed: TENTH,
    maxSeed: TENTH,
    launchFee: TENTH,
    maxCoins: 6
  })
  const house: HouseChain = {
    readState: () => Promise.resolve(houseState()),
    houseBalance: () => Promise.resolve(options.houseHeld ?? 0n),
    fund(walletIndex, target) {
      state.funded.push([walletIndex, target])
      return Promise.resolve()
    },
    launch(item) {
      state.launches.push(item.ticker)
      arena.round = { ...arena.round, coinCount: arena.round.coinCount + 1 }
      return Promise.resolve(`LAUNCH-${item.ticker}`)
    }
  }
  state.deps = {
    port: arena,
    chain,
    houseChainFor: () => (options.houseSeed === false ? null : house),
    creatorAccountId: 'fera-seeder.testnet',
    seederAccountId: 'fera-seeder.testnet',
    houseGasBuffer: TENTH,
    log: () => undefined
  }
  return state
}

const HOUSE_TICKERS = ['MOOND', 'FIRECAT', 'AQUA', 'TITAN', 'VOLT', 'SHADE']

describe('formatNear', () => {
  it('prints at most four decimals without trailing zeros', () => {
    expect(formatNear(10n * NEAR)).toBe('10')
    expect(formatNear(NEAR + NEAR / 4n)).toBe('1.25')
    expect(formatNear(NEAR / 3n)).toBe('0.3333')
    expect(formatNear(0n)).toBe('0')
  })
})

describe('demo admin', () => {
  it('reports the lobby status with free slots and the seeder balance', async () => {
    const w = world(baseRound({ phase: 'Lobby', coinCount: 2, createdAt: 1000 }))
    const status = await createDemoAdmin(w.deps).status()
    expect(status).toMatchObject({
      roundId: 1,
      phase: 'Lobby',
      coinCount: 2,
      maxCoins: 6,
      minCoins: 6,
      lobbyEndsAt: 1000 + DEFAULT_PARAMS.lobbySeconds,
      canCreate: false,
      canSeed: true,
      freeSlots: 4,
      busy: false,
      balances: { owner: '10', creator: '10', seeder: '10' }
    })
  })

  it('creates a round only when the previous one has ended', async () => {
    const running = world(baseRound({ phase: 'Leveling', startedAt: 1000 }))
    const refused = await createDemoAdmin(running.deps).createRound()
    expect(refused).toMatchObject({ ok: false, status: 409, body: { error: 'round in progress' } })
    expect(running.created).toBe(0)
    const settled = world(baseRound({ phase: 'Settled' }))
    expect(await createDemoAdmin(settled.deps).createRound()).toEqual({ ok: true, value: { ok: true, roundId: 2, txHash: 'CREATE1' } })
    const fresh = world(null)
    expect(await createDemoAdmin(fresh.deps).createRound()).toMatchObject({ ok: true, value: { roundId: 1 } })
  })

  it('maps a failing chain call to operation_failed and stays usable afterwards', async () => {
    const w = world(baseRound({ phase: 'Settled' }))
    w.failCreate = true
    const admin = createDemoAdmin(w.deps)
    expect(await admin.createRound()).toMatchObject({ ok: false, status: 502, body: { error: 'operation_failed' } })
    expect(admin.isBusy()).toBe(false)
    w.failCreate = false
    expect((await admin.createRound()).ok).toBe(true)
  })

  it('seeds five house coins into an empty lobby and leaves one free slot', async () => {
    const w = world(baseRound({ phase: 'Lobby', coinCount: 0 }))
    const result = await createDemoAdmin(w.deps).seedHouse(5)
    expect(result).toEqual({ ok: true, value: { ok: true, launched: ['MOOND', 'FIRECAT', 'AQUA', 'TITAN', 'VOLT'], txHash: 'LAUNCH-VOLT' } })
    expect(w.arena.round.coinCount).toBe(5)
    expect(w.funded).toHaveLength(5)
  })

  it('never seeds more than five and never more than the free slots', async () => {
    const big = world(baseRound({ phase: 'Lobby', coinCount: 0 }))
    const result = await createDemoAdmin(big.deps).seedHouse(99)
    expect(result).toMatchObject({ ok: true, value: { launched: expect.arrayContaining(['MOOND']) } })
    expect(big.launches).toHaveLength(5)
    const tight = world(baseRound({ phase: 'Lobby', coinCount: 4 }))
    expect(await createDemoAdmin(tight.deps).seedHouse(5)).toMatchObject({ ok: true, value: { launched: ['VOLT', 'SHADE'] } })
  })

  it('refuses outside the lobby, with a full lobby, with a bad count and without a house seed', async () => {
    expect(await createDemoAdmin(world(baseRound({ phase: 'Leveling' })).deps).seedHouse(5)).toMatchObject({ ok: false, status: 409, body: { error: 'not in lobby' } })
    expect(await createDemoAdmin(world(baseRound({ phase: 'Lobby', coinCount: 6 })).deps).seedHouse(5)).toMatchObject({ ok: false, status: 409, body: { error: 'lobby full' } })
    expect(await createDemoAdmin(world(baseRound({ phase: 'Lobby', coinCount: 0 })).deps).seedHouse(0)).toMatchObject({ ok: false, status: 400 })
    expect(
      await createDemoAdmin(world(baseRound({ phase: 'Lobby', coinCount: 0 }), { houseSeed: false }).deps).seedHouse(5)
    ).toMatchObject({ ok: false, status: 503, body: { error: 'house_seed_missing' } })
  })

  it('answers 402 with the shortfall when the seeder cannot cover the house wallets', async () => {
    const w = world(baseRound({ phase: 'Lobby', coinCount: 0 }))
    w.balances.set('fera-seeder.testnet', NEAR)
    const result = await createDemoAdmin(w.deps).seedHouse(5)
    expect(result).toMatchObject({ ok: false, status: 402, body: { error: 'insufficient funds', shortfall: '3.5', account: 'fera-seeder.testnet' } })
    expect(w.launches).toHaveLength(0)
  })

  it('does not count what a house wallet already holds toward the shortfall', async () => {
    const w = world(baseRound({ phase: 'Lobby', coinCount: 0 }), { houseHeld: 3n * TENTH })
    w.balances.set('fera-seeder.testnet', 0n)
    expect(await createDemoAdmin(w.deps).seedHouse(5)).toMatchObject({ ok: true })
  })

  it('refuses a second operation while one is running', async () => {
    const w = world(baseRound({ phase: 'Settled' }))
    let release: () => void = () => undefined
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const original = w.deps.chain.createRound
    w.deps.chain.createRound = async () => {
      await gate
      return original()
    }
    const admin = createDemoAdmin(w.deps)
    const first = admin.createRound()
    expect(admin.isBusy()).toBe(true)
    expect(await admin.createRound()).toMatchObject({ ok: false, status: 409, body: { error: 'busy' } })
    release()
    expect((await first).ok).toBe(true)
  })
})

describe('demo routes', () => {
  function app(w: World) {
    return createApi({
      health: () => ({ ok: true, headBlock: 1, lagSeconds: 0, keeperAccount: 'k.testnet', roundId: 1, round: null }),
      drip: null,
      allowedOrigins: [],
      demo: { admin: createDemoAdmin(w.deps), token: TOKEN }
    })
  }

  const headers = { 'x-demo-token': TOKEN, 'content-type': 'application/json' }

  it('rejects a missing or wrong token', async () => {
    const api = app(world(baseRound({ phase: 'Settled' })))
    expect((await api.request('/demo/status')).status).toBe(401)
    expect((await api.request('/demo/create-round', { method: 'POST', headers: { 'x-demo-token': 'nope' } })).status).toBe(401)
  })

  it('creates a round then seeds the house and leaves a lobby with five coins and one free slot', async () => {
    const w = world(baseRound({ phase: 'Settled' }))
    const api = app(w)
    const created = await api.request('/demo/create-round', { method: 'POST', headers, body: '{}' })
    expect(created.status).toBe(200)
    expect(await created.json()).toEqual({ ok: true, roundId: 2, txHash: 'CREATE1' })
    const seeded = await api.request('/demo/seed-house', { method: 'POST', headers, body: JSON.stringify({ count: 5 }) })
    expect(seeded.status).toBe(200)
    expect(await seeded.json()).toMatchObject({ ok: true, launched: ['MOOND', 'FIRECAT', 'AQUA', 'TITAN', 'VOLT'] })
    const status = await (await api.request('/demo/status', { headers })).json()
    expect(status).toMatchObject({ phase: 'Lobby', coinCount: 5, freeSlots: 1, canSeed: true })
  })

  it('answers 409 when creating during a round and 400 for a malformed seed body', async () => {
    const api = app(world(baseRound({ phase: 'Leveling', startedAt: 1000 })))
    expect((await api.request('/demo/create-round', { method: 'POST', headers })).status).toBe(409)
    expect((await api.request('/demo/seed-house', { method: 'POST', headers, body: 'nope' })).status).toBe(400)
  })
})
