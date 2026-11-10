import { describe, expect, it } from 'vitest'
import { createNearDemoChain } from '../src/demoChain'
import type { NearAccounts } from '../src/nearAccounts'
import type { NearCallResult, NearTransport } from '../src/nearPort'

const accounts: NearAccounts = {
  accountId: 'fera-seeder.testnet',
  exists: () => Promise.resolve(true),
  balance: () => Promise.resolve(0n),
  transfer: () => Promise.resolve('T'),
  createAccount: () => Promise.resolve('C'),
  waitFinal: () => Promise.resolve()
}

function build(script: Array<NearCallResult | Error>, roundIds: number[]) {
  const calls: string[] = []
  let reads = 0
  const transport: NearTransport = {
    accountId: 'fera-seeder.testnet',
    view() {
      const value = roundIds[Math.min(reads, roundIds.length - 1)] ?? 0
      reads += 1
      return Promise.resolve(value)
    },
    head: () => Promise.reject(new Error('not used')),
    call(method) {
      calls.push(method)
      const next = script.shift()
      if (next === undefined) return Promise.reject(new Error('script exhausted'))
      return next instanceof Error ? Promise.reject(next) : Promise.resolve(next)
    }
  }
  return { chain: createNearDemoChain({ transport, accounts, retryDelayMs: 0, sleep: () => Promise.resolve() }), calls }
}

const ok: NearCallResult = { kind: 'success', hash: 'CREATED', gasBurnt: 1n, blockTimestampSec: 1 }

describe('demo chain create_round', () => {
  it('returns the new round id and hash', async () => {
    const { chain } = build([ok], [3, 4])
    expect(await chain.createRound()).toEqual({ roundId: 4, txHash: 'CREATED' })
  })

  it('retries a network failure and sends again when no round appeared', async () => {
    const { chain, calls } = build([new Error('Exceeded 4 providers to execute request'), ok], [3, 3, 4])
    expect(await chain.createRound()).toEqual({ roundId: 4, txHash: 'CREATED' })
    expect(calls).toEqual(['create_round', 'create_round'])
  })

  it('does not send twice when the first attempt had already created the round', async () => {
    const { chain, calls } = build([new Error('Exceeded 4 providers to execute request')], [3, 4])
    expect(await chain.createRound()).toEqual({ roundId: 4, txHash: '' })
    expect(calls).toEqual(['create_round'])
  })

  it('surfaces a contract refusal immediately without retrying', async () => {
    const refusal: NearCallResult = { kind: 'failure', hash: 'F', gasBurnt: 1n, blockTimestampSec: 1, message: 'ArenaError:RoundInProgress' }
    const { chain, calls } = build([refusal], [3])
    await expect(chain.createRound()).rejects.toThrow('RoundInProgress')
    expect(calls).toHaveLength(1)
  })

  it('gives up after the attempts with the last network error', async () => {
    const { chain, calls } = build([new Error('rpc down'), new Error('rpc down'), new Error('rpc down')], [3])
    await expect(chain.createRound()).rejects.toThrow('rpc down')
    expect(calls).toHaveLength(3)
  })
})
