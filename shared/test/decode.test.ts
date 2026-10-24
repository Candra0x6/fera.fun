import { getAddress } from 'viem'
import { describe, expect, it } from 'vitest'
import { arenaAbi } from '../src/abi'
import { decodeArenaLog, decodeSnapshotResult, encodeSnapshotCall, normalizeValue } from '../src/decode'
import { EVENT_ARG_NAMES, EVENT_NAMES } from '../src/events'
import {
  ARENA,
  MULTICALL,
  addr,
  coinTuple,
  encodeSnapshotReturn,
  eventAbi,
  hex32,
  makeRawLog,
  roundTuple,
  sampleArgs
} from './chainHelpers'

describe('ABI and event surface', () => {
  it('has exactly the 25 events of EVENT_ARG_NAMES with the same parameter order', () => {
    const fromAbi = arenaAbi.flatMap((item) => (item.type === 'event' ? [item.name] : []))
    expect([...fromAbi].sort()).toEqual([...EVENT_NAMES].sort())
    expect(EVENT_NAMES).toHaveLength(25)
    for (const name of EVENT_NAMES) {
      expect(eventAbi(name).inputs.map((i) => i.name)).toEqual([...EVENT_ARG_NAMES[name]])
    }
  })
})

describe('envelope decoding', () => {
  for (const name of EVENT_NAMES) {
    it(`decodes ${name} into the envelope shape`, () => {
      const raw = makeRawLog(name, sampleArgs(name), { block: 1234, logIndex: 3, commitState: 'Voted' })
      const envelope = decodeArenaLog(raw, { timestamp: 1_760_001_234, commitState: 'Voted' })
      expect(envelope).not.toBeNull()
      expect(envelope?.name).toBe(name)
      expect(envelope?.id).toBe('000000001234-000003')
      expect(envelope?.blockNumber).toBe(1234)
      expect(envelope?.logIndex).toBe(3)
      expect(envelope?.blockId).toBe(hex32(1234 * 1000))
      expect(envelope?.commitState).toBe('Voted')
      expect(envelope?.timestamp).toBe(1_760_001_234)
      expect(Object.keys(envelope?.args ?? {})).toEqual([...EVENT_ARG_NAMES[name]])
    })
  }

  it('applies the number and decimal-string convention', () => {
    const trade = decodeArenaLog(
      makeRawLog(
        'Trade',
        {
          roundId: 1n,
          coinId: 4,
          trader: getAddress('0xabcdef0000000000000000000000000000000001'),
          isBuy: false,
          monAmount: 12n * 10n ** 18n,
          tokenAmount: 5n,
          rMon: 3n * 10n ** 18n,
          vMon: 1n,
          vTok: 2n
        },
        { block: 9 }
      ),
      { timestamp: 1, commitState: 'Proposed' }
    )
    expect(trade?.args).toEqual({
      roundId: 1,
      coinId: 4,
      trader: '0xabcdef0000000000000000000000000000000001',
      isBuy: false,
      monAmount: '12000000000000000000',
      tokenAmount: '5',
      rMon: '3000000000000000000',
      vMon: '1',
      vTok: '2'
    })
  })

  it('encodes RoundCreated.config as a JSON string with numbers and decimal strings', () => {
    const created = decodeArenaLog(makeRawLog('RoundCreated', sampleArgs('RoundCreated'), { block: 2 }), {
      timestamp: 1,
      commitState: 'Finalized'
    })
    const config = JSON.parse(String(created?.args['config']))
    expect(config.maxCoins).toBe(7)
    expect(config.poolFactorMaxBps).toBe(100000)
    expect(config.launchFee).toBe('100000000000000000005')
    expect(Object.keys(config)).toHaveLength(30)
  })

  it('maps TreasurySpent.kind to a number and keeps bytes32 as hex', () => {
    const spent = decodeArenaLog(
      makeRawLog('TreasurySpent', { roundId: 1n, kind: 1, amount: 5n, treasuryAfter: 10n ** 20n }, { block: 3 }),
      { timestamp: 1, commitState: 'Proposed' }
    )
    expect(spent?.args).toEqual({ roundId: 1, kind: 1, amount: '5', treasuryAfter: '100000000000000000000' })
    const seed = decodeArenaLog(makeRawLog('SeedReady', { roundId: 1n, epoch: 2, seed: hex32(99) }, { block: 3 }), {
      timestamp: 1,
      commitState: 'Proposed'
    })
    expect(seed?.args['seed']).toBe(hex32(99))
  })

  it('falls back to blockHash and rejects foreign or malformed logs', () => {
    const base = makeRawLog('LevelUp', { roundId: 1n, coinId: 2, level: 3 }, { block: 5 })
    const noBlockId = { ...base, blockId: null, blockHash: hex32(77) }
    expect(decodeArenaLog(noBlockId, { timestamp: 1, commitState: 'Proposed' })?.blockId).toBe(hex32(77))
    expect(decodeArenaLog({ ...base, topics: [hex32(5)] }, { timestamp: 1, commitState: 'Proposed' })).toBeNull()
    expect(decodeArenaLog({ ...base, data: '0xzz' }, { timestamp: 1, commitState: 'Proposed' })).toBeNull()
    expect(decodeArenaLog({ ...base, blockNumber: 'abc' }, { timestamp: 1, commitState: 'Proposed' })).toBeNull()
  })

  it('refuses a type it cannot normalise', () => {
    expect(() => normalizeValue(1, { type: 'int256', name: 'x' })).toThrow(TypeError)
  })
})

describe('snapshot decoding', () => {
  it('rebuilds the snapshot from one aggregate3 result', () => {
    const encoded = encodeSnapshotReturn({
      snapshotBlock: 777,
      snapshotTimestamp: 1_760_000_777,
      round: roundTuple({ phase: 3, locked: true, epoch: 4 }),
      coins: [coinTuple(0), coinTuple(1, { status: 2, rMon: 0n, wins: 3, xp: 80, level: 2 })]
    })
    const { snapshot } = decodeSnapshotResult(encoded, 1, new Set([addr(0xa0)]))
    expect(snapshot.blockNumber).toBe(777)
    expect(snapshot.serverTime).toBe(1_760_000_777)
    expect(snapshot.round).toMatchObject({
      roundId: 1,
      phase: 'Knockout',
      locked: true,
      epoch: 4,
      createdAt: 1_760_000_000,
      prizePot: '5000000000000000000',
      treasury: '40000000000000000000'
    })
    expect(snapshot.config['maxCoins']).toBe(30)
    expect(snapshot.config['launchFee']).toBe('1000000000000000000')
    expect(snapshot.config['poolFactorMaxBps']).toBe(100000)
    expect(snapshot.coins).toHaveLength(2)
    expect(snapshot.coins[0]).toMatchObject({ coinId: 0, status: 'Alive', isHouse: true, ticker: 'C0', rMon: '5000000000000000000' })
    expect(snapshot.coins[1]).toMatchObject({ coinId: 1, status: 'Eliminated', isHouse: false, wins: 3, xp: 80, level: 2, rMon: '0' })
  })

  it('rejects a round that does not exist', () => {
    const encoded = encodeSnapshotReturn({
      snapshotBlock: 1,
      snapshotTimestamp: 1,
      round: roundTuple({ phase: 0 }),
      coins: []
    })
    expect(() => decodeSnapshotResult(encoded, 1)).toThrow(/does not exist/)
  })

  it('builds a single aggregate3 call carrying all four reads', () => {
    const data = encodeSnapshotCall(ARENA, MULTICALL, 1)
    expect(data.startsWith('0x82ad56cb')).toBe(true)
  })
})
