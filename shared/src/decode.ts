import {
  decodeAbiParameters,
  decodeEventLog,
  decodeFunctionResult,
  encodeFunctionData,
  parseAbi
} from 'viem'
import type { Abi, AbiParameter } from 'viem'
import { arenaAbi } from './abi'
import { envelopeId, isEventName } from './events'
import { isHex } from './args'
import { houseTokenSet } from './houseCoins'
import type {
  ArenaEventEnvelope,
  ArenaSnapshot,
  CoinStatus,
  CoinView,
  CommitState,
  Hex,
  Phase,
  RoundView
} from './types'

export const multicall3Abi: Abi = parseAbi([
  'struct Call3 { address target; bool allowFailure; bytes callData; }',
  'struct Result { bool success; bytes returnData; }',
  'function aggregate3(Call3[] calls) payable returns (Result[] returnData)',
  'function getBlockNumber() view returns (uint256 blockNumber)',
  'function getCurrentBlockTimestamp() view returns (uint256 timestamp)'
])

export interface RawLog {
  address: string
  topics: readonly string[]
  data: string
  blockNumber: string | number
  blockHash?: string | null
  blockId?: string | null
  blockTimestamp?: string | number | null
  commitState?: string | null
  logIndex: string | number
  transactionHash: string
  removed?: boolean
}

export interface DecodedLogContext {
  timestamp: number
  commitState: CommitState
}

const COMMIT_STATES: readonly CommitState[] = ['Proposed', 'Voted', 'Finalized', 'Verified']
const PHASES: readonly (Phase | null)[] = [null, 'Lobby', 'Leveling', 'Knockout', 'Settled', 'Aborted']
const STATUSES: readonly (CoinStatus | null)[] = [null, 'Alive', 'Eliminated', 'Champion', 'Refunded']

export function parseCommitState(value: unknown): CommitState {
  const match = COMMIT_STATES.find((state) => state === value)
  return match ?? 'Proposed'
}

export function toInt(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'number') return Number.isSafeInteger(value) ? value : null
  const parsed = value.startsWith('0x') ? Number.parseInt(value, 16) : Number.parseInt(value, 10)
  return Number.isSafeInteger(parsed) ? parsed : null
}

export function normalizeValue(value: unknown, param: AbiParameter): string | number | boolean {
  const uint = /^uint(\d+)$/.exec(param.type)
  if (uint !== null) {
    const bits = Number(uint[1])
    const big = typeof value === 'bigint' ? value : BigInt(Number(value))
    return bits <= 64 && big <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(big) : big.toString()
  }
  if (param.type === 'bool' && typeof value === 'boolean') return value
  if (param.type === 'address' && typeof value === 'string') return value.toLowerCase()
  if ((param.type === 'string' || param.type.startsWith('bytes')) && typeof value === 'string') return value
  if (param.type === 'tuple' && 'components' in param && typeof value === 'object' && value !== null) {
    const source = Object.fromEntries(Object.entries(value))
    const out: Record<string, string | number | boolean> = {}
    for (const component of param.components) {
      if (component.name === undefined) continue
      out[component.name] = normalizeValue(source[component.name], component)
    }
    return JSON.stringify(out)
  }
  throw new TypeError(`cannot normalise a value of type ${param.type}`)
}

export function decodeArenaLog(raw: RawLog, context: DecodedLogContext): ArenaEventEnvelope | null {
  if (!isHex(raw.data) || !raw.topics.every(isHex)) return null
  const blockNumber = toInt(raw.blockNumber)
  const logIndex = toInt(raw.logIndex)
  const blockId = raw.blockId ?? raw.blockHash
  if (blockNumber === null || logIndex === null || !isHex(blockId) || !isHex(raw.transactionHash)) return null
  const topics = raw.topics.filter(isHex)
  const first = topics[0]
  if (first === undefined) return null
  let decoded
  try {
    decoded = decodeEventLog({ abi: arenaAbi, data: raw.data, topics: [first, ...topics.slice(1)] })
  } catch {
    return null
  }
  const name = decoded.eventName
  if (!isEventName(name)) return null
  const item = arenaAbi.find((entry) => entry.type === 'event' && entry.name === name)
  if (item === undefined || item.type !== 'event') return null
  const values = decoded.args
  if (typeof values !== 'object' || values === null) return null
  const source = Object.fromEntries(Object.entries(values))
  const args: ArenaEventEnvelope['args'] = {}
  for (const input of item.inputs) {
    if (input.name === undefined) return null
    args[input.name] = normalizeValue(source[input.name], input)
  }
  return {
    id: envelopeId(blockNumber, logIndex),
    name,
    blockNumber,
    blockId,
    logIndex,
    txHash: raw.transactionHash,
    timestamp: context.timestamp,
    commitState: context.commitState,
    args
  }
}

export function encodeSnapshotCall(arena: Hex, multicall3: Hex, roundId: number): Hex {
  const calls = [
    { target: multicall3, allowFailure: false, callData: encodeFunctionData({ abi: multicall3Abi, functionName: 'getBlockNumber' }) },
    { target: multicall3, allowFailure: false, callData: encodeFunctionData({ abi: multicall3Abi, functionName: 'getCurrentBlockTimestamp' }) },
    { target: arena, allowFailure: false, callData: encodeFunctionData({ abi: arenaAbi, functionName: 'getConfig', args: [BigInt(roundId)] }) },
    { target: arena, allowFailure: false, callData: encodeFunctionData({ abi: arenaAbi, functionName: 'getArenaSnapshot', args: [BigInt(roundId)] }) }
  ]
  return encodeFunctionData({ abi: multicall3Abi, functionName: 'aggregate3', args: [calls] })
}

function record(value: unknown, what: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null) throw new TypeError(`${what} is not an object`)
  return Object.fromEntries(Object.entries(value))
}

function func(name: string): Extract<(typeof arenaAbi)[number], { type: 'function' }> {
  const item = arenaAbi.find((entry) => entry.type === 'function' && entry.name === name)
  if (item === undefined || item.type !== 'function') throw new TypeError(`ABI has no function ${name}`)
  return item
}

function normalizeNumber(value: unknown, param: AbiParameter): number | string {
  const out = normalizeValue(value, param)
  if (typeof out === 'boolean') throw new TypeError('unexpected boolean')
  return out
}

function componentsOf(param: AbiParameter | undefined): readonly AbiParameter[] {
  if (param !== undefined && 'components' in param && param.components !== undefined) return param.components
  throw new TypeError('ABI output has no components')
}

function decimalOf(value: unknown, param: AbiParameter): string {
  return String(normalizeNumber(value, param))
}

export function decodeSnapshotResult(
  returned: Hex,
  roundId: number,
  houseTokens: ReadonlySet<string> = houseTokenSet()
): { snapshot: Omit<ArenaSnapshot, 'blockId'> } {
  const results = decodeFunctionResult({ abi: multicall3Abi, functionName: 'aggregate3', data: returned })
  if (!Array.isArray(results) || results.length !== 4) throw new TypeError('unexpected aggregate3 result')
  const returnData = results.map((entry: unknown, index: number): Hex => {
    const item = record(entry, `result ${index}`)
    const data = item['returnData']
    if (item['success'] !== true || !isHex(data)) throw new TypeError(`snapshot call ${index} failed`)
    return data
  })
  const [numberData, timestampData, configData, snapshotData] = returnData
  if (numberData === undefined || timestampData === undefined || configData === undefined || snapshotData === undefined) {
    throw new TypeError('snapshot call data missing')
  }
  const [blockNumberValue] = decodeAbiParameters([{ type: 'uint256' }], numberData)
  const [timestampValue] = decodeAbiParameters([{ type: 'uint256' }], timestampData)

  const configFn = func('getConfig')
  const configParam = configFn.outputs[0]
  const configDecoded = record(
    decodeFunctionResult({ abi: arenaAbi, functionName: 'getConfig', data: configData }),
    'config'
  )
  const config: ArenaSnapshot['config'] = {}
  for (const component of componentsOf(configParam)) {
    if (component.name === undefined) continue
    config[component.name] = normalizeValue(configDecoded[component.name], component)
  }

  const snapshotFn = func('getArenaSnapshot')
  const roundParam = snapshotFn.outputs[0]
  const coinsParam = snapshotFn.outputs[1]
  const decoded = decodeFunctionResult({ abi: arenaAbi, functionName: 'getArenaSnapshot', data: snapshotData })
  if (!Array.isArray(decoded)) throw new TypeError('unexpected getArenaSnapshot result')
  const roundRaw = record(decoded[0], 'round')
  const coinsRaw = decoded[1]
  if (!Array.isArray(coinsRaw)) throw new TypeError('coins is not an array')

  const roundFields = new Map(componentsOf(roundParam).map((c) => [c.name, c]))
  const rf = (name: string): AbiParameter => {
    const found = roundFields.get(name)
    if (found === undefined) throw new TypeError(`round field ${name} missing from the ABI`)
    return found
  }
  const phase = PHASES[Number(roundRaw['phase'])]
  if (phase === null || phase === undefined) throw new TypeError('round does not exist')
  const round: RoundView = {
    roundId,
    phase,
    locked: roundRaw['locked'] === true,
    epoch: Number(normalizeNumber(roundRaw['epoch'], rf('epoch'))),
    coinCount: Number(roundRaw['coinCount']),
    aliveCount: Number(roundRaw['aliveCount']),
    cancelStreak: Number(roundRaw['cancelStreak']),
    winnerCoinId: Number(roundRaw['winnerCoinId']),
    createdAt: Number(roundRaw['createdAt']),
    startedAt: Number(roundRaw['startedAt']),
    lockedAt: Number(roundRaw['lockedAt']),
    lastEpochResolvedAt: Number(roundRaw['lastEpochResolvedAt']),
    prizePot: decimalOf(roundRaw['prizePot'], rf('prizePot')),
    treasury: decimalOf(roundRaw['treasury'], rf('treasury')),
    redeemPool: decimalOf(roundRaw['redeemPool'], rf('redeemPool')),
    redeemSupply: decimalOf(roundRaw['redeemSupply'], rf('redeemSupply')),
    clashesPlayed: Number(roundRaw['clashesPlayed'])
  }

  const coinFields = new Map(componentsOf(coinsParam).map((c) => [c.name, c]))
  const cf = (name: string): AbiParameter => {
    const found = coinFields.get(name)
    if (found === undefined) throw new TypeError(`coin field ${name} missing from the ABI`)
    return found
  }
  const coins: CoinView[] = coinsRaw.map((entry: unknown, coinId: number): CoinView => {
    const c = record(entry, `coin ${coinId}`)
    const status = STATUSES[Number(c['status'])]
    if (status === null || status === undefined) throw new TypeError(`coin ${coinId} has no status`)
    const token = String(c['token']).toLowerCase()
    if (!isHex(token)) throw new TypeError(`coin ${coinId} token is not hex`)
    const creator = String(c['creator']).toLowerCase()
    if (!isHex(creator)) throw new TypeError(`coin ${coinId} creator is not hex`)
    return {
      roundId,
      coinId,
      token,
      creator,
      name: String(c['name']),
      ticker: String(c['ticker']),
      monsterType: Number(c['monsterType']),
      skinId: Number(c['skinId']),
      status,
      level: Number(c['level']),
      xp: Number(c['xp']),
      wins: Number(c['wins']),
      vMon: decimalOf(c['vMon'], cf('vMon')),
      vTok: decimalOf(c['vTok'], cf('vTok')),
      rMon: decimalOf(c['rMon'], cf('rMon')),
      rMonAtLock: decimalOf(c['rMonAtLock'], cf('rMonAtLock')),
      seedMon: decimalOf(c['seedMon'], cf('seedMon')),
      consolationPool: decimalOf(c['consolationPool'], cf('consolationPool')),
      consolationSupply: decimalOf(c['consolationSupply'], cf('consolationSupply')),
      supply: decimalOf(c['supply'], cf('supply')),
      isHouse: houseTokens.has(token)
    }
  })

  return {
    snapshot: {
      config,
      round,
      coins,
      blockNumber: Number(blockNumberValue),
      serverTime: Number(timestampValue)
    }
  }
}
