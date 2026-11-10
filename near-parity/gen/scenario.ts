import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { launchSeedState, quoteBuy, quoteSell } from '../../shared/src/curve.ts'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', '..')
const WORK = join(HERE, '..', 'forge', 'work')
const IN_FILE = join(WORK, 'scenario-in.json')
const STEPS_FILE = join(WORK, 'scenario-steps.json')
const SOL_FILE = join(WORK, 'scenario-sol.txt')
const OUT_FILE = join(HERE, '..', 'scenario.json')
const ARTIFACT = join(process.env.HOME ?? '', '.cache', 'animal-parity-forge', 'out', 'Arena.sol', 'Arena.json')

const req = createRequire(join(ROOT, 'shared', 'package.json'))
const viem = (await import(req.resolve('viem'))) as {
  keccak256: (hex: `0x${string}`) => `0x${string}`
  decodeEventLog: (a: { abi: unknown; topics: `0x${string}`[]; data: `0x${string}` }) => { eventName: string; args: Record<string, unknown> }
}

const E18 = 10n ** 18n
const LABELS = [
  'owner', 'keeper', 'creator_0', 'creator_1', 'creator_2', 'creator_3', 'creator_4', 'creator_5',
  'trader_0', 'trader_1', 'trader_2', 'trader_3'
]
const NACCT = LABELS.length
const OWNER = 0
const KEEPER = 1
const creator = (i: number) => 2 + i
const trader = (i: number) => 8 + i
const PHASES = ['None', 'Lobby', 'Leveling', 'Knockout', 'Settled', 'Aborted']
const STATUSES = ['None', 'Alive', 'Eliminated', 'Champion', 'Refunded']
const OP_NAMES: Record<number, string> = {
  0: 'create_round', 1: 'launch_coin', 2: 'start_round', 3: 'buy', 4: 'sell', 5: 'lock_epoch', 6: 'deliver_seed',
  7: 'resolve_epoch', 9: 'abort_round', 10: 'refund_launch', 11: 'claim_refund', 12: 'claim_consolation', 13: 'redeem',
  14: 'claim_seed'
}
const RETURNS = new Set([1, 3, 4, 11, 12, 13, 14])
const DROPPED_EVENTS = new Set(['TreasurySpent', 'CoinImage', 'EpochCancelled'])

interface Cfg {
  maxCoins: bigint; minCoins: bigint; lobbySeconds: bigint; levelingEpochs: bigint; epochSeconds: bigint
  clashesPerEpoch: bigint; seedTimeoutSeconds: bigint; maxRoundSeconds: bigint; launchFee: bigint; minSeed: bigint
  maxSeed: bigint; tradeFeeBps: bigint; boostBps: bigint; consolationBps: bigint; potBps: bigint; treasuryBps: bigint
  consolationMode: bigint; gammaBps: bigint; poolFactorMinBps: bigint; poolFactorMaxBps: bigint
  levelBonusBps: bigint; elementUpBps: bigint; elementDownBps: bigint; winProbMinBps: bigint
  winProbMaxBps: bigint; huntWinPct: bigint; keeperBounty: bigint; maxEntropyFee: bigint; vMon0: bigint; vTok0: bigint
}

const CFG_KEYS: Array<keyof Cfg> = [
  'maxCoins', 'minCoins', 'lobbySeconds', 'levelingEpochs', 'epochSeconds', 'clashesPerEpoch', 'seedTimeoutSeconds',
  'maxRoundSeconds', 'launchFee', 'minSeed', 'maxSeed', 'tradeFeeBps', 'boostBps', 'consolationBps', 'potBps',
  'treasuryBps', 'consolationMode', 'gammaBps', 'poolFactorMinBps', 'poolFactorMaxBps', 'levelBonusBps',
  'elementUpBps', 'elementDownBps', 'winProbMinBps', 'winProbMaxBps', 'huntWinPct', 'keeperBounty', 'maxEntropyFee',
  'vMon0', 'vTok0'
]

const BLITZ: Cfg = {
  maxCoins: 6n, minCoins: 6n, lobbySeconds: 10800n, levelingEpochs: 1n, epochSeconds: 14n, clashesPerEpoch: 2n,
  seedTimeoutSeconds: 60n, maxRoundSeconds: 3600n, launchFee: E18 / 10n, minSeed: E18 / 10n, maxSeed: E18 / 10n,
  tradeFeeBps: 100n, boostBps: 5000n, consolationBps: 3000n, potBps: 1500n, treasuryBps: 500n, consolationMode: 0n,
  gammaBps: 8800n, poolFactorMinBps: 1000n, poolFactorMaxBps: 100000n, levelBonusBps: 400n, elementUpBps: 11500n,
  elementDownBps: 8700n, winProbMinBps: 1500n, winProbMaxBps: 8500n, huntWinPct: 50n, keeperBounty: 0n,
  maxEntropyFee: 0n, vMon0: 20n * E18, vTok0: 1_000_000_000n * E18
}

const keccakText = (text: string): bigint => BigInt(viem.keccak256(`0x${Buffer.from(text, 'utf8').toString('hex')}`))
const hex32 = (v: bigint): `0x${string}` => `0x${v.toString(16).padStart(64, '0')}`
const tagHex = (name: string) => Buffer.from(name, 'ascii').toString('hex').padEnd(64, '0')
const hashOf = (seed: bigint, tag: string, idx: bigint): bigint =>
  BigInt(viem.keccak256(`0x${hex32(seed).slice(2)}${tagHex(tag)}${hex32(idx).slice(2)}`))
const seedOf = (tag: string, i: number): bigint => keccakText(`${tag}:${i}`)

function tsPairing(seed: bigint, mask: bigint): number[] {
  const perm: number[] = []
  for (let i = 0; i < 32; i++) if ((mask >> BigInt(i)) & 1n) perm.push(i)
  for (let i = perm.length; i > 1; i--) {
    const idx = i - 1
    const j = Number(hashOf(seed, 'PAIR', BigInt(idx)) % BigInt(i))
    const a = perm[idx]
    const b = perm[j]
    if (a === undefined || b === undefined) throw new Error('perm')
    perm[idx] = b
    perm[j] = a
  }
  return perm
}

function knockoutEpochs(coins: number, perEpoch: number): number {
  let n = coins
  let epochs = 0
  while (n > 1) {
    n -= Math.min(Math.floor(n / 2), perEpoch)
    epochs++
  }
  return epochs
}

interface Step {
  scn: number
  op: number
  who: number
  at: number
  a: bigint[]
  s: [string, string]
  args: Record<string, unknown>
  label?: string
  expectRet?: bigint
}

interface Scenario {
  id: string
  description: string
  cfg: Cfg
  steps: Step[]
  marks: Record<string, number>
}

interface CoinState {
  status: number; level: number; xp: number; wins: number; seedClaimed: number; monsterType: number; skinId: number
  creator: string; vMon: bigint; vTok: bigint; rMon: bigint; rMonAtLock: bigint; seedMon: bigint; seedTokens: bigint
  consolationPool: bigint; consolationSupply: bigint; poolPaid: bigint; feeAcc: bigint; supply: bigint
  balances: bigint[]
}

interface RoundState {
  id: number
  r: bigint[]
  x: bigint[]
  coins: CoinState[]
}

interface StepOut {
  at: number
  ok: boolean
  value: string
  logs: Array<{ topics: `0x${string}`[]; data: `0x${string}` }>
  native: bigint[]
  rounds: RoundState[]
}

interface Parsed {
  arenas: string[]
  scenarios: StepOut[][]
}

class Builder {
  steps: Step[] = []
  marks: Record<string, number> = {}
  t: number
  lastResolved = 0
  coinsLaunched = 0
  private reserves = new Map<number, { vMon: bigint; vTok: bigint; rMon: bigint }>()

  constructor(readonly scn: number, readonly cfg: Cfg, t0: number) {
    this.t = t0
  }

  push(op: number, who: number, a: bigint[], s: [string, string], args: Record<string, unknown>, label: string | undefined, dt: number): Step {
    this.t += dt
    const step: Step = { scn: this.scn, op, who, at: this.t, a: [a[0] ?? 0n, a[1] ?? 0n, a[2] ?? 0n, a[3] ?? 0n], s, args, label }
    this.steps.push(step)
    return step
  }

  mark(name: string): void {
    this.marks[name] = this.steps.length - 1
  }

  createRound(label?: string, dt = 1): void {
    this.push(0, OWNER, [], ['', ''], {}, label, dt)
  }

  launch(round: number, who: number, deposit: bigint, o: { type?: number; skin?: number; name?: string; ticker?: string; label?: string; valid?: boolean; coin?: number } = {}): void {
    const i = o.coin ?? this.coinsLaunched
    const type = o.type ?? i % 5
    const skin = o.skin ?? i % 5
    const name = o.name ?? `Beast ${i}`
    const ticker = o.ticker ?? `FERA${i}`
    const step = this.push(1, who, [BigInt(round), deposit, BigInt(type), BigInt(skin)], [name, ticker],
      { round_id: round, name, ticker, monster_type: type, skin_id: skin, deposit: deposit.toString() }, o.label, 1)
    if (o.valid !== false) {
      const st = launchSeedState(this.cfg.vMon0, this.cfg.vTok0, deposit - this.cfg.launchFee)
      this.reserves.set(i, { vMon: st.vMon, vTok: st.vTok, rMon: st.rMon })
      step.expectRet = BigInt(i)
      if (o.coin === undefined) this.coinsLaunched++
    }
  }

  startRound(round: number, who: number, label?: string, dt = 1): void {
    this.push(2, who, [BigInt(round)], ['', ''], { round_id: round }, label, dt)
  }

  buy(round: number, who: number, coin: number, deposit: bigint, o: { minOut?: bigint; label?: string; track?: boolean } = {}): bigint {
    const minOut = o.minOut ?? 1n
    const step = this.push(3, who, [BigInt(round), BigInt(coin), deposit, minOut], ['', ''],
      { round_id: round, coin_id: coin, min_tokens_out: minOut.toString(), deposit: deposit.toString() }, o.label, 1)
    const rs = this.reserves.get(coin)
    if (o.track && rs) {
      const q = quoteBuy({ vMon: rs.vMon, vTok: rs.vTok, rMon: rs.rMon }, deposit, this.cfg.tradeFeeBps)
      this.reserves.set(coin, { vMon: q.next.vMon, vTok: q.next.vTok, rMon: q.next.rMon })
      step.expectRet = q.tokensOut
      return q.tokensOut
    }
    return 0n
  }

  sellTracked(round: number, who: number, coin: number, tokens: bigint): void {
    const rs = this.reserves.get(coin)
    if (!rs) throw new Error('untracked coin')
    const step = this.push(4, who, [BigInt(round), BigInt(coin), tokens, 1n], ['', ''],
      { round_id: round, coin_id: coin, tokens: tokens.toString(), min_mon_out: '1' }, undefined, 1)
    const q = quoteSell({ vMon: rs.vMon, vTok: rs.vTok, rMon: rs.rMon }, tokens, this.cfg.tradeFeeBps)
    this.reserves.set(coin, { vMon: q.next.vMon, vTok: q.next.vTok, rMon: q.next.rMon })
    step.expectRet = q.monOut
  }

  sell(round: number, who: number, coin: number, tokens: bigint, minOut: bigint, label?: string): void {
    this.push(4, who, [BigInt(round), BigInt(coin), tokens, minOut], ['', ''],
      { round_id: round, coin_id: coin, tokens: tokens.toString(), min_mon_out: minOut.toString() }, label, 1)
  }

  lock(round: number, who: number, label?: string, dt = 1): void {
    this.push(5, who, [BigInt(round)], ['', ''], { round_id: round }, label, dt)
  }

  resolve(round: number, maxClashes: number, seed: bigint | null, label?: string, dt = 0): void {
    if (seed !== null) {
      this.push(6, KEEPER, [BigInt(round), seed], ['', ''], { round_id: round, seed: hex32(seed) }, undefined, dt)
    }
    this.push(7, KEEPER, [BigInt(round), BigInt(maxClashes)], ['', ''], { round_id: round, max_clashes: maxClashes }, label, 0)
  }

  finishEpoch(): void {
    this.lastResolved = this.t
  }

  epoch(round: number, seed: bigint, o: { maxClashes?: number; preLock?: () => void; whileLocked?: () => void; label?: string } = {}): void {
    o.preLock?.()
    this.t = Math.max(this.t, this.lastResolved + Number(this.cfg.epochSeconds))
    this.lock(round, trader(3), o.label, 1)
    o.whileLocked?.()
    this.resolve(round, o.maxClashes ?? 255, seed, undefined, 3)
    this.finishEpoch()
  }

  act(op: number, who: number, a: bigint[], args: Record<string, unknown>, label?: string, dt = 1): void {
    this.push(op, who, a, ['', ''], args, label, dt)
  }
}

function stateAt(prev: Parsed | undefined, scn: number, idx: number): StepOut | undefined {
  return prev?.scenarios[scn]?.[idx]
}

function floatPf(rLock: bigint, sumR: bigint, n: bigint, c: Cfg): number {
  const minF = Number(c.poolFactorMinBps) / 1e4
  const maxF = Number(c.poolFactorMaxBps) / 1e4
  if (sumR === 0n || n === 0n) return Math.min(Math.max(1, minF), maxF)
  if (rLock === 0n) return minF
  const ratio = Number((rLock * n * E18) / sumR) / 1e18
  return Math.min(Math.max(Math.pow(ratio, Number(c.gammaBps) / 1e4), minF), maxF)
}

function floatPower(c: Cfg, ta: number, la: number, tb: number, r: bigint, sum: bigint, n: bigint): number {
  const lvl = 1 + (Number(c.levelBonusBps) / 1e4) * (la - 1)
  const elem = (ta + 1) % 5 === tb ? Number(c.elementUpBps) / 1e4 : (tb + 1) % 5 === ta ? Number(c.elementDownBps) / 1e4 : 1
  return floatPf(r, sum, n, c) * lvl * elem
}

function pickUnderdogSeed(prev: Parsed | undefined, scn: number, idx: number, c: Cfg, tag: string): bigint {
  const round = stateAt(prev, scn, idx)?.rounds[0]
  if (!round) return seedOf(tag, 0)
  const alive = round.coins.map((k, i) => ({ k, i })).filter((e) => e.k.status === 1)
  let mask = 0n
  let sum = 0n
  for (const e of alive) {
    mask |= 1n << BigInt(e.i)
    sum += e.k.rMon
  }
  const n = BigInt(alive.length)
  const clashId = round.r[17] ?? 0n
  for (let j = 0; j < 200000; j++) {
    const seed = seedOf(tag, j)
    const perm = tsPairing(seed, mask)
    const a = round.coins[perm[0] ?? 0]
    const b = round.coins[perm[1] ?? 0]
    if (!a || !b) continue
    const pa = floatPower(c, a.monsterType, a.level, b.monsterType, a.rMon, sum, n)
    const pb = floatPower(c, b.monsterType, b.level, a.monsterType, b.rMon, sum, n)
    const wp = Math.min(Math.max((pa / (pa + pb)) * 1e4, Number(c.winProbMinBps)), Number(c.winProbMaxBps))
    if (Math.abs(wp - 5000) < 1500) continue
    const roll = Number(hashOf(seed, 'CLASH', clashId) % 10000n)
    if (Math.abs(roll - wp) < 250) continue
    if ((roll < wp) === (wp < 5000)) return seed
  }
  throw new Error('no underdog seed')
}

function creatorIndex(addr: string): number {
  return LABELS.findIndex((_, a) => `0x${(0x1000 + a).toString(16).padStart(40, '0')}` === addr.toLowerCase())
}

function claims(b: Builder, prev: Parsed | undefined, idx: number, round: number): void {
  const rs = stateAt(prev, b.scn, idx)?.rounds[round - 1]
  if (!rs) return
  const champion = Number(rs.r[6] ?? 0n)
  b.act(3, trader(0), [BigInt(round), BigInt(champion), E18, 1n], { round_id: round, coin_id: champion, min_tokens_out: '1', deposit: E18.toString() }, 'buy_after_settle')
  b.act(12, trader(0), [BigInt(round), BigInt(champion), 1n], { round_id: round, coin_id: champion, tokens: '1' }, 'consolation_on_champion')
  const champ = rs.coins[champion]
  let first = true
  champ?.balances.slice(0, NACCT).forEach((bal, acct) => {
    if (bal === 0n) return
    if (first && bal > 1n) {
      const half = bal / 2n
      b.act(13, acct, [BigInt(round), half], { round_id: round, tokens: half.toString() }, 'redeem_partial')
      b.act(13, acct, [BigInt(round), bal - half], { round_id: round, tokens: (bal - half).toString() }, 'redeem_rest')
      first = false
    } else {
      b.act(13, acct, [BigInt(round), bal], { round_id: round, tokens: bal.toString() }, 'redeem_all')
    }
  })
  rs.coins.forEach((k, coin) => {
    if (k.status !== 2) return
    k.balances.slice(0, NACCT).forEach((bal, acct) => {
      if (bal === 0n) return
      b.act(12, acct, [BigInt(round), BigInt(coin), bal], { round_id: round, coin_id: coin, tokens: bal.toString() }, 'claim_consolation')
    })
  })
  rs.coins.forEach((k, coin) => {
    const who = creatorIndex(k.creator)
    if (who >= 0) b.act(14, who, [BigInt(round), BigInt(coin)], { round_id: round, coin_id: coin }, 'claim_seed')
  })
  const w0 = creatorIndex(rs.coins[0]?.creator ?? '')
  if (w0 >= 0) b.act(14, w0, [BigInt(round), 0n], { round_id: round, coin_id: 0 }, 'claim_seed_twice')
}

function lockedProbes(b: Builder, round: number, coin: number): () => void {
  return () => {
    b.buy(round, trader(0), coin, E18, { label: 'buy_while_locked' })
    b.sell(round, trader(1), coin, 1n, 1n, 'sell_while_locked')
    b.lock(round, trader(2), 'lock_while_locked')
  }
}

function koBuys(b: Builder, round: number, tag: string, e: number): () => void {
  return () => {
    for (let i = 0; i < 3; i++) {
      const coin = Number(seedOf(tag, e * 7 + i) % 6n)
      b.buy(round, trader(i), coin, ((BigInt(i) + 1n) * E18) / 2n)
    }
  }
}

function launchesFull(b: Builder, seeds: bigint[]): void {
  seeds.forEach((s, i) => b.launch(1, creator(i), b.cfg.launchFee + s))
}

function runToSettle(b: Builder, tag: string, leveling: number, o: { maxClashes?: number; underdog?: Parsed | null; scn?: number } = {}): void {
  const n = Number(b.cfg.maxCoins)
  const knock = knockoutEpochs(n, Number(b.cfg.clashesPerEpoch))
  for (let e = 0; e < leveling; e++) {
    b.epoch(1, seedOf(`${tag}:lvl`, e), { whileLocked: e === 0 ? lockedProbes(b, 1, 0) : undefined })
  }
  b.mark('pre_knockout')
  for (let e = 0; e < knock; e++) {
    const seed = e === 0 && o.underdog !== undefined ? pickUnderdogSeed(o.underdog ?? undefined, b.scn, b.marks.pre_knockout ?? 0, b.cfg, `${tag}:underdog`) : seedOf(`${tag}:ko`, e)
    b.epoch(1, seed, { maxClashes: o.maxClashes, preLock: e === 0 && o.underdog !== undefined ? undefined : koBuys(b, 1, `${tag}:buys`, e) })
  }
}

function buildS1(prev: Parsed | undefined, scn: number, withClaims: boolean): Scenario {
  const cfg = BLITZ
  const b = new Builder(scn, cfg, 1_700_000_000)
  b.createRound('create_round')
  b.launch(1, creator(0), cfg.launchFee + cfg.minSeed)
  b.launch(1, creator(1), cfg.launchFee + cfg.minSeed)
  b.launch(1, creator(2), cfg.launchFee + cfg.minSeed - 1n, { label: 'seed_below_min', valid: false })
  b.launch(1, creator(2), cfg.launchFee + cfg.minSeed + 1n, { label: 'seed_above_max', valid: false })
  b.launch(1, creator(2), cfg.launchFee - 1n, { label: 'deposit_below_launch_fee', valid: false })
  b.launch(1, creator(2), cfg.launchFee + cfg.minSeed, { type: 5, label: 'bad_monster_type', valid: false })
  b.launch(1, creator(2), cfg.launchFee + cfg.minSeed, { name: '', label: 'bad_name', valid: false })
  b.launch(1, creator(2), cfg.launchFee + cfg.minSeed, { ticker: 'ab', label: 'bad_ticker', valid: false })
  b.launch(1, creator(2), cfg.launchFee + cfg.minSeed)
  b.startRound(1, trader(0), 'lobby_not_ready_with_3_coins')
  for (let i = 3; i < 6; i++) b.launch(1, creator(i), cfg.launchFee + cfg.minSeed)
  b.launch(1, trader(3), cfg.launchFee + cfg.minSeed, { label: 'round_full', valid: false })
  b.startRound(1, trader(0), 'start_full_lobby')
  b.lastResolved = b.t
  const t0c0 = b.buy(1, trader(0), 0, 2n * E18, { track: true })
  b.buy(1, trader(1), 1, E18 / 2n, { track: true })
  b.buy(1, trader(2), 2, 5n * E18, { track: true })
  const t3c4 = b.buy(1, trader(3), 4, E18, { track: true })
  b.buy(1, trader(1), 3, E18, { minOut: 10n ** 40n, label: 'slippage' })
  b.buy(1, trader(1), 3, E18, { minOut: 0n, label: 'min_out_required' })
  b.sellTracked(1, trader(0), 0, t0c0 / 2n)
  b.sellTracked(1, trader(3), 4, t3c4)
  b.lock(1, trader(2), 'epoch_too_early')
  b.act(9, trader(2), [1n], { round_id: 1 }, 'abort_not_open')
  b.epoch(1, seedOf('s1:lvl', 0), { whileLocked: lockedProbes(b, 1, 0) })
  b.buy(1, trader(3), 5, 3n * E18, { track: true })
  b.buy(1, trader(1), 0, E18, { track: true })
  b.mark('pre_knockout')
  const knock = knockoutEpochs(6, 2)
  for (let e = 0; e < knock; e++) b.epoch(1, seedOf('s1:ko', e), { preLock: e === 0 ? undefined : koBuys(b, 1, 's1:buys', e) })
  if (withClaims) {
    claims(b, prev, b.steps.length - 1, 1)
    b.createRound('create_next_round_carries_treasury', 100)
  }
  return {
    id: 'blitz_6coin_full',
    description:
      'Blitz preset, 6 coins, full lobby starts at once, 1 leveling epoch (hunts only) then 3 knockout epochs (6 to 4 to 2 to 1). Launch validation reverts, trades before and between epochs, trades rejected while locked, early lock, settle, redeem (partial and full), consolation claims, seed claims, creation of the next round carrying the treasury.',
    cfg, steps: b.steps, marks: b.marks
  }
}

function buildS2(prev: Parsed | undefined, scn: number, withClaims: boolean): Scenario {
  const cfg: Cfg = { ...BLITZ, minCoins: 5n, maxCoins: 6n, lobbySeconds: 3600n, epochSeconds: 30n, minSeed: E18 / 5n, maxSeed: 5n * E18, launchFee: E18 / 10n }
  const b = new Builder(scn, cfg, 1_700_100_000)
  b.createRound('create_round')
  const created = b.t
  b.launch(1, creator(0), cfg.launchFee + E18 / 5n)
  b.launch(1, creator(1), cfg.launchFee + E18 / 2n)
  b.launch(1, creator(2), cfg.launchFee + E18)
  b.launch(1, creator(2), cfg.launchFee + 2n * E18)
  b.launch(1, creator(2), cfg.launchFee + E18, { label: 'creator_cap_reached', valid: false })
  b.launch(1, creator(3), cfg.launchFee + 5n * E18)
  b.startRound(1, trader(0), 'lobby_not_ready_before_deadline')
  b.t = created + 3600
  b.startRound(1, trader(0), 'start_at_deadline_with_5_coins', 0)
  b.lastResolved = b.t
  const k = b.buy(1, trader(0), 3, 4n * E18, { track: true })
  b.buy(1, trader(1), 0, E18 / 4n, { track: true })
  b.sellTracked(1, trader(0), 3, k / 3n)
  runToSettle(b, 's2', 1)
  if (withClaims) claims(b, prev, b.steps.length - 1, 1)
  return {
    id: 'lite_5coin_bye',
    description:
      'Five coins, lobby deadline start (minCoins 5 of maxCoins 6), one creator with two coins and a third launch rejected, 1 leveling epoch then knockout 5 to 3 to 2 to 1 with a bye in the first two knockout epochs (odd alive count), settle and claims.',
    cfg, steps: b.steps, marks: b.marks
  }
}

function buildS3(prev: Parsed | undefined, scn: number, withClaims: boolean): Scenario {
  const cfg = BLITZ
  const b = new Builder(scn, cfg, 1_700_200_000)
  b.createRound('create_round')
  launchesFull(b, Array.from({ length: 6 }, () => cfg.minSeed))
  b.startRound(1, trader(0), 'start_full_lobby')
  b.lastResolved = b.t
  b.buy(1, trader(0), 0, 30n * E18, { track: true })
  b.buy(1, trader(1), 3, 12n * E18, { track: true })
  b.buy(1, trader(2), 5, 3n * E18, { track: true })
  b.epoch(1, seedOf('s3:lvl', 0))
  b.mark('pre_knockout')
  const seed = pickUnderdogSeed(prev, scn, b.marks.pre_knockout ?? 0, cfg, 's3:underdog')
  b.epoch(1, seed, { label: 'underdog_epoch_lock' })
  for (let e = 1; e < knockoutEpochs(6, 2); e++) b.epoch(1, seedOf('s3:ko', e), { preLock: koBuys(b, 1, 's3:buys', e) })
  if (withClaims) claims(b, prev, b.steps.length - 1, 1)
  return {
    id: 'underdog_clash',
    description:
      'Blitz preset with very unequal pools (coin 0 at 30 vs about 0.1 for most others). The knockout seed is searched so the first clash is won by the coin with the LOWER win probability (win_prob_bps at least 1500 away from 5000 and the roll at least 250 away from the threshold); the generator asserts it from the Solidity event.',
    cfg, steps: b.steps, marks: b.marks
  }
}

function buildS4(prev: Parsed | undefined, scn: number, withClaims: boolean): Scenario {
  const cfg: Cfg = { ...BLITZ, levelingEpochs: 4n }
  const b = new Builder(scn, cfg, 1_700_300_000)
  b.createRound('create_round')
  launchesFull(b, Array.from({ length: 6 }, () => cfg.minSeed))
  b.startRound(1, trader(0), 'start_full_lobby')
  b.lastResolved = b.t
  b.buy(1, trader(0), 2, 3n * E18, { track: true })
  runToSettle(b, 's4', 4)
  if (withClaims) claims(b, prev, b.steps.length - 1, 1)
  return {
    id: 'hunt_levels',
    description:
      'Blitz preset with 4 leveling epochs: 24 hunts (successes give 10 xp, failures 0), level ups from hunt xp at 15 and 35 xp, then three knockout epochs where clash wins add 20 xp and can level the winner; hunts also run for knockout survivors and byes.',
    cfg, steps: b.steps, marks: b.marks
  }
}

function buildS5(prev: Parsed | undefined, scn: number, withClaims: boolean): Scenario {
  const cfg: Cfg = { ...BLITZ, clashesPerEpoch: 3n }
  const b = new Builder(scn, cfg, 1_700_400_000)
  b.createRound('create_round')
  launchesFull(b, Array.from({ length: 6 }, () => cfg.minSeed))
  b.startRound(1, trader(0), 'start_full_lobby')
  b.lastResolved = b.t
  b.buy(1, trader(1), 1, 2n * E18, { track: true })
  b.epoch(1, seedOf('s5:lvl', 0))
  b.mark('pre_knockout')
  b.t = Math.max(b.t, b.lastResolved + Number(cfg.epochSeconds))
  b.lock(1, trader(3))
  b.resolve(1, 1, seedOf('s5:ko', 0), 'first_batch_one_clash', 3)
  b.buy(1, trader(0), 1, E18, { label: 'buy_while_resolving' })
  b.lock(1, trader(2), 'lock_while_resolving')
  b.act(7, KEEPER, [1n, 0n], { round_id: 1, max_clashes: 0 }, 'zero_max_clashes')
  b.resolve(1, 1, null, 'second_batch_one_clash')
  b.resolve(1, 1, null, 'third_batch_finishes_epoch')
  b.finishEpoch()
  b.epoch(1, seedOf('s5:ko', 1), { maxClashes: 1, preLock: koBuys(b, 1, 's5:buys', 1) })
  b.epoch(1, seedOf('s5:ko', 2), { maxClashes: 1 })
  if (withClaims) claims(b, prev, b.steps.length - 1, 1)
  return {
    id: 'batched_resolve',
    description:
      'Six coins, clashesPerEpoch 3. The first knockout epoch is resolved in three calls of max_clashes 1 (the seed is delivered once, with the first call): the epoch stays locked, trades and locks are rejected, max_clashes 0 is rejected, hunts and the fee sweep run only in the last call. Then 3 alive coins (1 clash plus a bye) and the final clash.',
    cfg, steps: b.steps, marks: b.marks
  }
}

function buildS6(_prev: Parsed | undefined, scn: number, _withClaims: boolean): Scenario {
  const cfg = BLITZ
  const b = new Builder(scn, cfg, 1_700_500_000)
  b.createRound('create_round')
  const created = b.t
  b.launch(1, creator(0), cfg.launchFee + cfg.minSeed)
  b.launch(1, creator(1), cfg.launchFee + cfg.minSeed)
  b.launch(1, creator(2), cfg.launchFee + cfg.minSeed)
  b.act(9, trader(0), [1n], { round_id: 1 }, 'abort_lobby_still_open')
  b.startRound(1, trader(0), 'start_with_3_coins_before_deadline')
  b.t = created + 10800
  b.startRound(1, trader(0), 'start_with_3_coins_at_deadline', 0)
  b.act(9, trader(0), [1n], { round_id: 1 }, 'abort_underfilled_lobby', 0)
  b.act(9, trader(0), [1n], { round_id: 1 }, 'abort_twice')
  b.launch(1, creator(3), cfg.launchFee + cfg.minSeed, { label: 'launch_after_abort', valid: false })
  b.act(10, creator(1), [1n, 0n], { round_id: 1, coin_id: 0 }, 'refund_by_wrong_creator')
  b.act(10, creator(0), [1n, 0n], { round_id: 1, coin_id: 0 }, 'refund_launch')
  b.act(10, creator(0), [1n, 0n], { round_id: 1, coin_id: 0 }, 'refund_twice')
  b.act(10, creator(1), [1n, 1n], { round_id: 1, coin_id: 1 }, 'refund_launch')
  b.act(10, creator(2), [1n, 2n], { round_id: 1, coin_id: 2 }, 'refund_launch')
  b.createRound('create_next_round_after_abort', 50)
  b.launch(2, creator(0), cfg.launchFee + cfg.minSeed, { coin: 0 })
  return {
    id: 'lobby_abort',
    description:
      'Lobby underfilled (3 of 6 coins) past the lobby deadline: start rejected, abort_round succeeds (phase Aborted, launch fees owed recorded), a second abort and a late launch are rejected, each creator refunds seed plus launch fee through refund_launch (wrong creator and double refund rejected), the next round can then be created and a coin launched in it. Round 1 treasury ends at 0 and nothing is carried.',
    cfg, steps: b.steps, marks: b.marks
  }
}

const BUILDERS = [buildS1, buildS2, buildS3, buildS4, buildS5, buildS6]

function buildAll(prev: Parsed | undefined, withClaims: boolean): Scenario[] {
  return BUILDERS.map((f, i) => f(prev, i, withClaims))
}

function writeInputs(list: Scenario[]): void {
  const steps = list.flatMap((s) => s.steps)
  const body: Record<string, unknown> = {
    nscn: list.length,
    scn: steps.map((s) => s.scn),
    op: steps.map((s) => s.op),
    who: steps.map((s) => s.who),
    at: steps.map((s) => s.at),
    s1: steps.map((s) => s.s[0]),
    s2: steps.map((s) => s.s[1])
  }
  for (let k = 0; k < 4; k++) body[`a${k}`] = steps.map((s) => (s.a[k] ?? 0n).toString())
  list.forEach((s, k) => {
    body[`cfg${k}`] = CFG_KEYS.map((key) => s.cfg[key].toString())
  })
  writeFileSync(IN_FILE, JSON.stringify(body))
  const saved = list.map((s) => ({
    id: s.id,
    description: s.description,
    cfg: Object.fromEntries(CFG_KEYS.map((k) => [k, s.cfg[k].toString()])),
    marks: s.marks,
    steps: s.steps.map((st) => ({
      op: st.op, who: st.who, at: st.at, args: st.args, label: st.label, seed: st.op === 6 ? st.a[1].toString() : undefined,
      expectRet: st.expectRet?.toString()
    }))
  }))
  writeFileSync(STEPS_FILE, JSON.stringify(saved))
}

function parseSol(text: string): Parsed {
  const out: Parsed = { arenas: [], scenarios: [] }
  let cur: StepOut | undefined
  let round: RoundState | undefined
  const big = (v: string[]) => v.map((x) => BigInt(x))
  for (const line of text.split('\n')) {
    if (line.length === 0) continue
    const p = line.split('|')
    const kind = p[0]
    if (kind === 'SCN') {
      out.arenas.push((p[2] ?? '').toLowerCase())
      out.scenarios.push([])
    } else if (kind === 'STEP') {
      cur = { at: Number(p[2]), ok: p[3] === 'ok', value: p[4] ?? '', logs: [], native: [], rounds: [] }
      out.scenarios[out.scenarios.length - 1]?.push(cur)
    } else if (!cur) {
      throw new Error('line before STEP')
    } else if (kind === 'L') {
      cur.logs.push({ topics: (p[1] ?? '').split(',') as `0x${string}`[], data: (p[2] ?? '0x') as `0x${string}` })
    } else if (kind === 'N') {
      cur.native = big(p.slice(1))
    } else if (kind === 'R') {
      round = { id: Number(p[1]), r: big(p.slice(2)), x: [], coins: [] }
      cur.rounds.push(round)
    } else if (kind === 'X') {
      if (round) round.x = big(p.slice(2))
    } else if (kind === 'C') {
      const f = p.slice(3)
      round?.coins.push({
        status: Number(f[0]), level: Number(f[1]), xp: Number(f[2]), wins: Number(f[3]), seedClaimed: Number(f[4]),
        monsterType: Number(f[5]), skinId: Number(f[6]), creator: (f[7] ?? '').toLowerCase(), vMon: BigInt(f[8] ?? 0),
        vTok: BigInt(f[9] ?? 0), rMon: BigInt(f[10] ?? 0), rMonAtLock: BigInt(f[11] ?? 0), seedMon: BigInt(f[12] ?? 0),
        seedTokens: BigInt(f[13] ?? 0), consolationPool: BigInt(f[14] ?? 0), consolationSupply: BigInt(f[15] ?? 0),
        poolPaid: BigInt(f[16] ?? 0), feeAcc: BigInt(f[17] ?? 0), supply: BigInt(f[18] ?? 0), balances: []
      })
    } else if (kind === 'B') {
      const coin = round?.coins[Number(p[2])]
      if (coin) coin.balances = big(p.slice(3))
    } else {
      throw new Error(`bad line ${line}`)
    }
  }
  return out
}

interface AbiItem { type: string; name?: string; inputs?: Array<{ name: string; type: string; components?: Array<{ name: string; type: string }> }> }

function convert(type: string, v: unknown, comps: Array<{ name: string; type: string }> | undefined, addr: (a: string) => string): unknown {
  if (type === 'address') return addr(String(v))
  if (type === 'bool' || type === 'string') return v
  if (type === 'bytes32') return String(v)
  if (type === 'tuple' && comps) {
    const o = v as Record<string, unknown>
    return Object.fromEntries(comps.map((c) => [c.name, convert(c.type, o[c.name], undefined, addr)]))
  }
  const m = /^uint(\d+)$/.exec(type)
  if (m) return Number(m[1]) <= 64 ? Number(v) : String(v)
  return String(v)
}

function liabilities(s: StepOut): bigint {
  let total = 0n
  for (const r of s.rounds) {
    total += (r.r[14] ?? 0n) + (r.r[13] ?? 0n)
    for (const c of r.coins) {
      total += c.rMon + c.feeAcc
      if (c.status === 2 || c.status === 4) total += c.consolationPool - c.poolPaid
    }
    if (r.r[0] === 4n) total += (r.r[15] ?? 0n) - (r.x[5] ?? 0n)
  }
  return total
}

function git(args: string[]): string {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim()
}

function merge(): void {
  const saved = JSON.parse(readFileSync(STEPS_FILE, 'utf8')) as Array<{
    id: string; description: string; cfg: Record<string, string>; marks: Record<string, number>
    steps: Array<{ op: number; who: number; at: number; args: Record<string, unknown>; label?: string; seed?: string; expectRet?: string }>
  }>
  const parsed = parseSol(readFileSync(SOL_FILE, 'utf8'))
  const abi = (JSON.parse(readFileSync(ARTIFACT, 'utf8')) as { abi: AbiItem[] }).abi
  const eventAbi = new Map(abi.filter((i) => i.type === 'event').map((i) => [i.name ?? '', i]))
  const scenariosOut: unknown[] = []
  const summary: string[] = []
  const eventCounts: Record<string, number> = {}
  let totalSteps = 0

  saved.forEach((sc, k) => {
    const outs = parsed.scenarios[k] ?? []
    if (outs.length !== sc.steps.length) throw new Error(`${sc.id}: ${outs.length} outputs for ${sc.steps.length} steps`)
    const arena = parsed.arenas[k] ?? ''
    const addrMap = new Map<string, string>()
    LABELS.forEach((l, i) => addrMap.set(`0x${(0x1000 + i).toString(16).padStart(40, '0')}`, l))
    addrMap.set(arena, 'arena')
    const tokenMap = new Map<string, string>()
    const decodeLog = (log: { topics: `0x${string}`[]; data: `0x${string}` }) => viem.decodeEventLog({ abi, topics: log.topics, data: log.data })
    for (const o of outs) {
      for (const log of o.logs) {
        const d = decodeLog(log)
        if (d.eventName === 'CoinLaunched') tokenMap.set(String(d.args.token).toLowerCase(), `${String(d.args.roundId)}:${String(d.args.coinId)}`)
      }
    }
    const label = (a: string) => addrMap.get(a.toLowerCase()) ?? tokenMap.get(a.toLowerCase()) ?? a.toLowerCase()
    const labelOf = (a: string) => addrMap.get(a.toLowerCase()) ?? tokenMap.get(a.toLowerCase()) ?? a

    const stepsOut: unknown[] = []
    const check = { seed: 0n, mask: 0n, perm: [] as number[], clashIdx: 0, epochs: 0, lockedMask: 0n }
    let pendingEvents: Array<{ name: string; args: Record<string, unknown> }> = []
    let pendingSeed: string | undefined
    const counts: Record<string, number> = {}
    let underdog = false
    let hasHuntSuccess = false
    let hasHuntFail = false
    let hasLevelUp = false
    let bye = 0
    let maxCursor = 0
    let finalPhase = ''

    sc.steps.forEach((st, i) => {
      const o = outs[i]
      if (!o) throw new Error('missing output')
      const bal = o.native[NACCT] ?? 0n
      if (bal < liabilities(o)) throw new Error(`${sc.id} step ${i}: contract balance ${bal} below liabilities ${liabilities(o)}`)
      const events: Array<{ name: string; args: Record<string, unknown> }> = []
      for (const log of o.logs) {
        const d = decodeLog(log)
        const item = eventAbi.get(d.eventName)
        if (!item?.inputs) throw new Error(`unknown event ${d.eventName}`)
        if (d.eventName === 'EpochLocked') {
          check.lockedMask = BigInt(String(d.args.aliveMask))
        }
        if (d.eventName === 'SeedReady') {
          check.seed = BigInt(String(d.args.seed))
          check.mask = check.lockedMask
          check.perm = tsPairing(check.seed, check.mask)
          check.clashIdx = 0
        }
        if (d.eventName === 'ClashResolved') {
          const c = check.clashIdx++
          const a = check.perm[2 * c]
          const bb = check.perm[2 * c + 1]
          const winner = Number(d.args.winner)
          const loser = Number(d.args.loser)
          const roll = Number(d.args.roll)
          const wp = Number(d.args.winProbBps)
          if (a === undefined || bb === undefined) throw new Error(`${sc.id} step ${i}: clash beyond pairing`)
          if (!((winner === a && loser === bb) || (winner === bb && loser === a))) throw new Error(`${sc.id} step ${i}: clash pair differs from pairing`)
          if (BigInt(roll) !== hashOf(check.seed, 'CLASH', BigInt(String(d.args.clashId))) % 10000n) throw new Error(`${sc.id} step ${i}: roll`)
          if ((roll < wp ? a : bb) !== winner) throw new Error(`${sc.id} step ${i}: winner rule`)
          if (c === 0 && sc.id === 'underdog_clash' && Number(d.args.clashId) === 0) {
            underdog = (winner === a && wp < 5000) || (winner === bb && wp > 5000)
          }
        }
        if (d.eventName === 'HuntResolved') {
          const ok = hashOf(check.seed, 'HUNT', BigInt(String(d.args.coinId))) % 100n < BigInt(sc.cfg.huntWinPct ?? '50')
          if (ok !== Boolean(d.args.success)) throw new Error(`${sc.id} step ${i}: hunt roll`)
          if (d.args.success) hasHuntSuccess = true
          else hasHuntFail = true
        }
        if (d.eventName === 'LevelUp') hasLevelUp = true
        if (d.eventName === 'ByeGranted') {
          bye++
          const n = check.perm.length
          if (Number(d.args.coinId) !== check.perm[n - 1]) throw new Error(`${sc.id} step ${i}: bye coin`)
        }
        counts[d.eventName] = (counts[d.eventName] ?? 0) + 1
        if (DROPPED_EVENTS.has(d.eventName)) continue
        const args: Record<string, unknown> = {}
        for (const inp of item.inputs) {
          if (d.eventName === 'EpochLocked' && inp.name === 'entropySeq') continue
          args[inp.name] = convert(inp.type, d.args[inp.name], inp.components, label)
        }
        events.push({ name: d.eventName, args })
      }
      for (const r of o.rounds) maxCursor = Math.max(maxCursor, Number(r.x[2] ?? 0n))
      finalPhase = PHASES[Number(o.rounds[0]?.r[0] ?? 0n)] ?? ''

      if (st.expectRet !== undefined) {
        if (!o.ok) throw new Error(`${sc.id} step ${i}: tracked step reverted ${o.value}`)
        if (o.value !== st.expectRet) throw new Error(`${sc.id} step ${i}: return ${o.value} differs from curve.ts ${st.expectRet}`)
      }
      if (st.op === 13 && o.ok) {
        const r = o.rounds[0]
        const tokens = BigInt(String(st.args.tokens))
        if (r && BigInt(o.value) !== (tokens * (r.r[15] ?? 0n)) / (r.r[16] ?? 1n)) throw new Error(`${sc.id} step ${i}: redeem formula`)
      }
      if (st.op === 6) {
        pendingEvents = events
        pendingSeed = String(st.args.seed)
        return
      }
      const name = OP_NAMES[st.op] ?? 'unknown'
      const args = { ...st.args }
      const allEvents = [...pendingEvents, ...events]
      pendingEvents = []
      if (st.op === 7 && pendingSeed !== undefined) {
        args.seed = pendingSeed
        pendingSeed = undefined
      }
      const caller = LABELS[st.who] ?? 'unknown'
      const result: Record<string, unknown> = o.ok ? { ok: true } : { ok: false, revert: o.value }
      if (o.ok && RETURNS.has(st.op)) result.return = o.value
      const state = stateJson(o, label, labelOf)
      stepsOut.push({ i: stepsOut.length, op: name, at: st.at, caller, ...(st.label ? { case: st.label } : {}), args, result, events: allEvents, state })
    })
    for (const [n, v] of Object.entries(counts)) eventCounts[n] = (eventCounts[n] ?? 0) + v
    const lastOut = outs[outs.length - 1]
    if (sc.id !== 'lobby_abort' && finalPhase !== 'Settled') throw new Error(`${sc.id}: ends in ${finalPhase}`)
    if (sc.id === 'lobby_abort' && PHASES[Number(lastOut?.rounds[0]?.r[0] ?? 0n)] !== 'Aborted') throw new Error('lobby_abort not aborted')
    if (sc.id === 'underdog_clash' && !underdog) throw new Error('underdog_clash: first clash not won by the lower-power coin')
    if (sc.id === 'lite_5coin_bye' && bye < 2) throw new Error('lite_5coin_bye: fewer than two byes')
    if (sc.id === 'batched_resolve' && (maxCursor < 2 || bye < 1)) throw new Error('batched_resolve: no partial resolution or bye')
    if (sc.id === 'hunt_levels' && !(hasHuntSuccess && hasHuntFail && hasLevelUp)) throw new Error('hunt_levels: missing hunt success, failure or level up')
    totalSteps += stepsOut.length
    summary.push(`${sc.id}: ${stepsOut.length} steps, final ${finalPhase}, byes ${bye}`)
    const finalState = (stepsOut[stepsOut.length - 1] as { state: unknown }).state
    scenariosOut.push({
      id: sc.id,
      description: sc.description,
      config: sc.cfg,
      accounts: LABELS,
      steps: stepsOut,
      final_state: finalState,
      marks: sc.marks
    })
  })

  const meta = {
    format:
      'scenarios[]: {id, description, config, accounts, steps[], final_state}. config is the Solidity RoundConfig in raw Monad units (camelCase, decimal strings); the NEAR-relevant subset is used: keeperBounty 0, maxEntropyFee 0, seed fee 0 and reserveFloor 0 in the Solidity run, so no Entropy fee and no bounty ever touch the treasury. steps[]: {i, op, at, caller, case?, args, result, events, state}. op is the Rust method name (create_round, launch_coin, start_round, buy, sell, lock_epoch, resolve_epoch, abort_round, refund_launch, claim_consolation, redeem, claim_seed). at is the block timestamp in seconds the step runs at (the engine must be fed this clock). args use the Rust parameter names; buy and launch_coin carry deposit (raw units attached); deadline is unlimited. resolve_epoch.args.seed is the test seed for the epoch (0x hex, 32 bytes); it appears on the first resolve_epoch call of an epoch only (continuation calls reuse the stored seed) and the SeedReady event is listed in that same step. result is {ok:true, return?} (return is a decimal string: coin id for launch_coin, tokens for buy, mon out for sell, mon paid for claims and redeem) or {ok:false, revert:<Solidity error name, same as the Rust ArenaError name>}; a reverted step leaves the state unchanged and must leave the engine state unchanged. events are the Solidity events of the step in emission order with Rust-shaped args (uint8/16/32/64 as numbers, wider as decimal strings, addresses as account labels, token as "<roundId>:<coinId>"); TreasurySpent, CoinImage and EpochCancelled are dropped and EpochLocked has no entropySeq (the Rust event carries lockHeight instead). state is the full state AFTER the step: now, contract_balance, native balances per account, and for every round: all RoundView and RoundExtra fields and per coin all Coin fields plus token balances per holder (nonzero only; arena holds the seed tokens until claim_seed).',
    scenarios: summary,
    scenario_ids: saved.map((s) => s.id),
    steps_total: totalSteps,
    event_counts: Object.fromEntries(Object.entries(eventCounts).sort()),
    authority: 'Arena.sol (monad-final) deployed by near-parity/forge/script/GenScenario.s.sol with MockSeedSource, driven step by step; no mocks of the engine',
    cross_check:
      'every non-reverting tracked buy, sell and launch matches shared/src/curve.ts; every clash pair, clash roll, winner rule, hunt roll and bye coin is recomputed from the seed with an independent keccak256 and pairing implementation; redeem payouts recomputed; contract balance at least all liabilities after every step; scenario-specific assertions (underdog clash, byes, partial resolves, hunt successes, failures and level ups, final phase) hold. The generator fails otherwise',
    seeds: 'epoch seeds are keccak256 of ASCII "<scenario tag>:<phase>:<epoch>" except the underdog seed which is the first "s3:underdog:<j>" that satisfies the underdog condition',
    generator: 'bash near-parity/run.sh scenario',
    source_ref: 'monad-final',
    source: git(['rev-parse', 'monad-final']),
    contracts_src_clean_vs_source: git(['diff', '--stat', 'monad-final', '--', 'contracts/src']) === '',
    solc: '0.8.31 (evm osaka, optimizer 200 runs, as contracts/foundry.toml)',
    forge: execFileSync('forge', ['--version'], { encoding: 'utf8' }).split('\n')[0]
  }
  const lines = scenariosOut.map((s) => {
    const sc = s as { steps: unknown[]; [k: string]: unknown }
    const head = JSON.stringify({ ...sc, steps: undefined, final_state: undefined })
    const headPart = head.slice(0, -1)
    return `${headPart},"steps":[\n${sc.steps.map((x) => JSON.stringify(x)).join(',\n')}\n],"final_state":${JSON.stringify(sc.final_state)}}`
  })
  writeFileSync(OUT_FILE, `{\n"schema": 1,\n"source": ${JSON.stringify(meta.source)},\n"meta": ${JSON.stringify(meta, null, 1)},\n"scenarios": [\n${lines.join(',\n')}\n]\n}\n`)
  console.log(summary.join('\n'))
  console.log(`steps_total=${totalSteps}`)
}

function stateJson(o: StepOut, label: (a: string) => string, labelOf: (a: string) => string): unknown {
  const native: Record<string, string> = {}
  LABELS.forEach((l, i) => {
    native[l] = (o.native[i] ?? 0n).toString()
  })
  return {
    now: o.at,
    contract_balance: (o.native[NACCT] ?? 0n).toString(),
    native,
    rounds: o.rounds.map((r) => ({
      roundId: r.id,
      phase: PHASES[Number(r.r[0])],
      locked: r.r[1] === 1n,
      epoch: Number(r.r[2]),
      coinCount: Number(r.r[3]),
      aliveCount: Number(r.r[4]),
      cancelStreak: Number(r.r[5]),
      winnerCoinId: Number(r.r[6]),
      createdAt: Number(r.r[7]),
      startedAt: Number(r.r[8]),
      lockedAt: Number(r.r[9]),
      lastEpochResolvedAt: Number(r.r[10]),
      seed: r.r[12] === 0n ? null : hex32(r.r[12] ?? 0n),
      prizePot: (r.r[13] ?? 0n).toString(),
      treasury: (r.r[14] ?? 0n).toString(),
      redeemPool: (r.r[15] ?? 0n).toString(),
      redeemSupply: (r.r[16] ?? 0n).toString(),
      clashesPlayed: Number(r.r[17]),
      aliveMask: Number(r.x[0] ?? 0n),
      aliveAtLock: Number(r.x[1] ?? 0n),
      resolveCursor: Number(r.x[2] ?? 0n),
      lobbyAbort: r.x[3] === 1n,
      sumRMonAtLock: (r.x[4] ?? 0n).toString(),
      redeemPaid: (r.x[5] ?? 0n).toString(),
      launchFeesOwed: (r.x[6] ?? 0n).toString(),
      coins: r.coins.map((c, id) => {
        const balances: Record<string, string> = {}
        c.balances.forEach((v, j) => {
          if (v !== 0n) balances[j === NACCT ? 'arena' : (LABELS[j] ?? `acct_${j}`)] = v.toString()
        })
        return {
          coinId: id,
          token: `${r.id}:${id}`,
          creator: labelOf(c.creator),
          monsterType: c.monsterType,
          skinId: c.skinId,
          status: STATUSES[c.status],
          level: c.level,
          xp: c.xp,
          wins: c.wins,
          vMon: c.vMon.toString(),
          vTok: c.vTok.toString(),
          rMon: c.rMon.toString(),
          rMonAtLock: c.rMonAtLock.toString(),
          seedMon: c.seedMon.toString(),
          seedTokens: c.seedTokens.toString(),
          seedClaimed: c.seedClaimed === 1,
          consolationPool: c.consolationPool.toString(),
          consolationSupply: c.consolationSupply.toString(),
          poolPaid: c.poolPaid.toString(),
          feeAcc: c.feeAcc.toString(),
          supply: c.supply.toString(),
          balances
        }
      })
    }))
  }
  void label
}

const mode = process.argv[2]
const pass = Number(process.argv[3] ?? '0')
if (mode === 'inputs') {
  const prev = pass > 0 && existsSync(SOL_FILE) ? parseSol(readFileSync(SOL_FILE, 'utf8')) : undefined
  const list = buildAll(prev, pass >= 2)
  writeInputs(list)
  console.log(`pass ${pass}: ${list.reduce((n, s) => n + s.steps.length, 0)} steps in ${list.length} scenarios`)
} else if (mode === 'merge') {
  merge()
} else {
  throw new Error('usage: scenario.ts inputs <pass>|merge')
}
