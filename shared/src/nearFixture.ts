import type { FixtureBody, FixtureMessage } from './fixture'
import { HOUSE_CREATOR_SUFFIX } from './houseCoins'
import type { ArenaEventEnvelope, ArenaSnapshot, CoinView, RoundView } from './types'

const NATIVE_SCALE = 10n ** 6n
const DROPPED_EVENTS: ReadonlySet<string> = new Set(['EpochCancelled', 'CoinImage', 'TreasurySpent', 'CoinRefundRate'])
const NATIVE_ARGS: ReadonlySet<string> = new Set([
  'monAmount', 'rMon', 'vMon', 'seedMon', 'boostMon', 'boost', 'consolation', 'toPot', 'toTreasury', 'consolationPool',
  'monPaid', 'redeemPool', 'prizePotAfter', 'treasuryAfter', 'amount'
])
const NATIVE_CONFIG: ReadonlySet<string> = new Set(['launchFee', 'minSeed', 'maxSeed', 'vMon0', 'keeperBounty'])
const DROPPED_CONFIG: ReadonlySet<string> = new Set(['seedTimeoutSeconds', 'maxEntropyFee', 'reserveFloor', 'callbackGasLimit', 'consolationMode'])
const ACCOUNT_ARGS: ReadonlySet<string> = new Set(['trader', 'holder', 'creator', 'funder'])

function scale(value: string): string {
  return /^\d+$/.test(value) ? (BigInt(value) * NATIVE_SCALE).toString() : value
}

export function toNearFixture(messages: readonly FixtureMessage[]): FixtureMessage[] {
  const snapshot = messages.map((m) => m.message).find((b): b is Extract<FixtureBody, { kind: 'snapshot' }> => b.kind === 'snapshot')
  const houseCreators = new Set<string>()
  const tokenOf = new Map<string, string>()
  const blockIds = new Map<string, string>()
  for (const coin of snapshot?.data.coins ?? []) {
    tokenOf.set(coin.token, `${coin.roundId}:${coin.coinId}`)
    if (coin.isHouse) houseCreators.add(coin.creator)
  }
  for (const { message } of messages) {
    if (message.kind === 'event') {
      blockIds.set(message.data.blockId, String(message.data.blockNumber))
      if (message.data.name === 'CoinLaunched') {
        tokenOf.set(String(message.data.args['token']), `${message.data.args['roundId']}:${message.data.args['coinId']}`)
      }
    }
    if (message.kind === 'commit') blockIds.set(message.data.blockId, String(message.data.blockNumber))
    if (message.kind === 'snapshot') blockIds.set(message.data.blockId, String(message.data.blockNumber))
  }

  const accounts = new Map<string, string>()
  let players = 0
  let houses = 0
  function accountFor(address: string): string {
    const known = accounts.get(address)
    if (known !== undefined) return known
    const name = houseCreators.has(address) ? `h${houses++}${HOUSE_CREATOR_SUFFIX}` : `player${players++}.testnet`
    accounts.set(address, name)
    return name
  }
  const blockOf = (id: string): string => blockIds.get(id) ?? id

  function coin(source: CoinView): CoinView {
    return {
      ...source,
      token: tokenOf.get(source.token) ?? `${source.roundId}:${source.coinId}`,
      creator: accountFor(source.creator),
      vMon: scale(source.vMon),
      rMon: scale(source.rMon),
      rMonAtLock: scale(source.rMonAtLock),
      seedMon: scale(source.seedMon),
      consolationPool: scale(source.consolationPool)
    }
  }

  function round(source: RoundView): RoundView {
    return { ...source, prizePot: scale(source.prizePot), treasury: scale(source.treasury), redeemPool: scale(source.redeemPool) }
  }

  function config(source: ArenaSnapshot['config']): ArenaSnapshot['config'] {
    const out: ArenaSnapshot['config'] = {}
    for (const [key, value] of Object.entries(source)) {
      if (DROPPED_CONFIG.has(key)) continue
      out[key] = NATIVE_CONFIG.has(key) && typeof value === 'string' ? scale(value) : value
    }
    return out
  }

  function envelope(source: ArenaEventEnvelope): ArenaEventEnvelope {
    const args: ArenaEventEnvelope['args'] = {}
    for (const [key, value] of Object.entries(source.args)) {
      if (source.name === 'EpochLocked' && key === 'entropySeq') {
        args['lockHeight'] = source.blockNumber
      } else if (NATIVE_ARGS.has(key) && typeof value === 'string') {
        args[key] = scale(value)
      } else if (ACCOUNT_ARGS.has(key) && typeof value === 'string') {
        args[key] = accountFor(value)
      } else if (key === 'token' && typeof value === 'string') {
        args[key] = tokenOf.get(value) ?? value
      } else {
        args[key] = value
      }
    }
    return { ...source, blockId: blockOf(source.blockId), txHash: '', args }
  }

  const out: FixtureMessage[] = []
  for (const item of messages) {
    const { message } = item
    if (message.kind === 'event') {
      if (DROPPED_EVENTS.has(message.data.name)) continue
      out.push({ atMs: item.atMs, message: { kind: 'event', data: envelope(message.data) } })
    } else if (message.kind === 'snapshot') {
      const data = message.data
      out.push({
        atMs: item.atMs,
        message: {
          kind: 'snapshot',
          data: { ...data, config: config(data.config), round: round(data.round), coins: data.coins.map(coin), blockId: blockOf(data.blockId) }
        }
      })
    } else if (message.kind === 'commit') {
      out.push({ atMs: item.atMs, message: { kind: 'commit', data: { ...message.data, blockId: blockOf(message.data.blockId) } } })
    } else if (message.kind === 'retract') {
      out.push({ atMs: item.atMs, message: { kind: 'retract', data: { blockId: blockOf(message.data.blockId) } } })
    } else {
      out.push(item)
    }
  }
  return out
}
