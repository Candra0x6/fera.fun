import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { EVENT_ARG_NAMES } from '../src/events'
import { parseFixture, replayFixture } from '../src/fixture'
import type { FixtureMessage } from '../src/fixture'
import { toNearFixture } from '../src/nearFixture'
import { createArenaStore } from '../src/store'

function load(name: string): FixtureMessage[] {
  return parseFixture(JSON.parse(readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8')))
}

describe('NEAR replay fixture', () => {
  const source = load('arena-replay.json')
  const committed = load('arena-near-replay.json')

  it('is exactly what the generator produces from the Monad fixture', () => {
    expect(committed).toEqual(toNearFixture(source))
  })

  it('carries no EVM addresses, hashes or Entropy leftovers', () => {
    const text = JSON.stringify(committed).replace(/"seed":"0x[0-9a-f]{64}"/g, '')
    expect(text).not.toMatch(/0x[0-9a-fA-F]{8,}/)
    expect(text).not.toMatch(/entropySeq|seedTimeoutSeconds|maxEntropyFee|reserveFloor/)
    const names = new Set<string>(committed.flatMap((m) => (m.message.kind === 'event' ? [m.message.data.name] : [])))
    for (const dropped of ['TreasurySpent', 'EpochCancelled', 'CoinImage']) expect(names.has(dropped)).toBe(false)
  })

  it('keeps the documented argument names, with lockHeight on EpochLocked', () => {
    for (const { message } of committed) {
      if (message.kind !== 'event') continue
      expect(Object.keys(message.data.args).sort(), message.data.name).toEqual([...EVENT_ARG_NAMES[message.data.name]].sort())
      expect(message.data.txHash).toBe('')
    }
  })

  it('scales native amounts to 24 decimals and leaves token amounts alone', () => {
    const before = source.find((m) => m.message.kind === 'snapshot')?.message
    const after = committed.find((m) => m.message.kind === 'snapshot')?.message
    if (before?.kind !== 'snapshot' || after?.kind !== 'snapshot') throw new Error('no snapshot')
    expect(after.data.coins[0]?.rMon).toBe(`${before.data.coins[0]?.rMon}000000`)
    expect(after.data.coins[0]?.supply).toBe(before.data.coins[0]?.supply)
    expect(after.data.coins[0]?.token).toBe('1:0')
  })

  it('labels house coins by the seeder suffix after a full replay through the store', async () => {
    const store = createArenaStore()
    await replayFixture(store, committed, { sleep: () => Promise.resolve() })
    const state = store.getState()
    expect(state.optimistic.round?.phase).toBe('Settled')
    expect(state.optimistic.coins.some((c) => c.isHouse)).toBe(true)
    expect(state.optimistic.coins.every((c) => /^(h\d+\.fera-seeder|player\d+)\.testnet$/.test(c.creator))).toBe(true)
    const champion = state.optimistic.coins.find((c) => c.status === 'Champion')
    expect(champion).toBeDefined()
  })
})
