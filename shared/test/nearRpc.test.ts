import { describe, expect, it } from 'vitest'
import { decodeEventPage, decodeSnapshot, NearDecodeError } from '../src/nearDecode'
import { createNearRpc, encodeViewArgs, NearRpcError } from '../src/nearRpc'
import type { NearFetch } from '../src/nearRpc'

function reply(body: unknown, status = 200): ReturnType<NearFetch> {
  return Promise.resolve({ ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) })
}

function bytesOf(value: unknown): number[] {
  return [...new TextEncoder().encode(JSON.stringify(value))]
}

describe('createNearRpc', () => {
  it('encodes view arguments as utf-8 base64', () => {
    expect(JSON.parse(atob(encodeViewArgs({ round_id: 3 })))).toEqual({ round_id: 3 })
    const bytes = Uint8Array.from(atob(encodeViewArgs({ name: 'é' })), (c) => c.charCodeAt(0))
    expect(JSON.parse(new TextDecoder().decode(bytes))).toEqual({ name: 'é' })
  })

  it('calls call_function on optimistic finality and decodes the json result', async () => {
    const seen: unknown[] = []
    const rpc = createNearRpc({
      urls: ['https://a'],
      fetchImpl: (url, init) => {
        seen.push(JSON.parse(init.body))
        return reply({ jsonrpc: '2.0', id: 1, result: { result: bytesOf(7), block_height: 55, block_hash: 'h' } })
      }
    })
    const out = await rpc.callView('arena.testnet', 'current_round_id', {})
    expect(out).toEqual({ value: 7, blockHeight: 55, blockHash: 'h' })
    expect(seen[0]).toMatchObject({ method: 'query', params: { request_type: 'call_function', finality: 'optimistic', account_id: 'arena.testnet', method_name: 'current_round_id' } })
  })

  it('fails over to the next url on http errors and remembers the good one', async () => {
    const hits: string[] = []
    const rpc = createNearRpc({
      urls: ['https://bad', 'https://good'],
      fetchImpl: (url) => {
        hits.push(url)
        return url === 'https://bad' ? reply({}, 500) : reply({ result: { result: bytesOf(1), block_height: 1, block_hash: 'h' } })
      }
    })
    await rpc.callView('a', 'm', {})
    await rpc.callView('a', 'm', {})
    expect(hits).toEqual(['https://bad', 'https://good', 'https://good'])
  })

  it('fails over on network failures and on retryable rpc errors but not on contract panics', async () => {
    const hits: string[] = []
    const rpc = createNearRpc({
      urls: ['https://one', 'https://two', 'https://three'],
      fetchImpl: (url) => {
        hits.push(url)
        if (url === 'https://one') return Promise.reject(new Error('offline'))
        if (url === 'https://two') return reply({ error: { name: 'HANDLER_ERROR', cause: { name: 'UNAVAILABLE_SHARD' } } })
        return reply({ error: { name: 'HANDLER_ERROR', cause: { name: 'CONTRACT_EXECUTION_ERROR', info: { error_message: 'Smart contract panicked: ArenaError:UnknownRound' } } } })
      }
    })
    const error = await rpc.callView('a', 'm', {}).catch((e: unknown) => e)
    expect(hits).toEqual(['https://one', 'https://two', 'https://three'])
    expect(error).toBeInstanceOf(NearRpcError)
    expect((error as NearRpcError).kind).toBe('contract')
    expect((error as NearRpcError).message).toContain('ArenaError:UnknownRound')
  })

  it('maps an unknown account to null and reads the balance', async () => {
    const missing = createNearRpc({
      urls: ['https://a'],
      fetchImpl: () => reply({ error: { cause: { name: 'UNKNOWN_ACCOUNT' } } })
    })
    expect(await missing.viewAccount('nope.testnet')).toBeNull()
    const present = createNearRpc({
      urls: ['https://a'],
      fetchImpl: () => reply({ result: { amount: '2000000000000000000000000', storage_usage: 182, block_height: 9 } })
    })
    expect(await present.viewAccount('yes.testnet')).toEqual({ amount: 2_000_000_000_000_000_000_000_000n, storageUsage: 182, blockHeight: 9 })
  })

  it('reads block headers', async () => {
    const rpc = createNearRpc({
      urls: ['https://a'],
      fetchImpl: () => reply({ result: { header: { height: 12, hash: 'x', timestamp_nanosec: '1760000000123456789' } } })
    })
    expect(await rpc.blockHeader('final')).toEqual({ height: 12, hash: 'x', timestampMs: 1_760_000_000_123 })
  })

  it('treats an inline result error as a contract error', async () => {
    const rpc = createNearRpc({ urls: ['https://a'], fetchImpl: () => reply({ result: { error: 'wasm execution failed: ArenaError:Locked', logs: [] } }) })
    await expect(rpc.callView('a', 'm', {})).rejects.toMatchObject({ kind: 'contract' })
  })
})

describe('createNearRpc rate limits and head cache', () => {
  const ok = (): ReturnType<NearFetch> => reply({ result: { result: bytesOf(1), block_height: 1, block_hash: 'h' } })

  it('skips an endpoint for the cooldown after it answers 429 and tries it again afterwards', async () => {
    let clock = 0
    const hits: string[] = []
    let limited = true
    const rpc = createNearRpc({
      urls: ['https://one', 'https://two'],
      now: () => clock,
      cooldownMs: 20_000,
      fetchImpl: (url) => {
        hits.push(url)
        return url === 'https://one' && limited ? reply({}, 429) : ok()
      }
    })
    await rpc.callView('a', 'm', {})
    await rpc.callView('a', 'm', {})
    await rpc.callView('a', 'm', {})
    expect(hits).toEqual(['https://one', 'https://two', 'https://two', 'https://two'])
    clock = 21_000
    limited = false
    await rpc.callView('a', 'm', {})
    await rpc.callView('a', 'm', {})
    expect(hits.slice(4)).toEqual(['https://two', 'https://two'])
  })

  it('still tries a cooling endpoint when every endpoint is cooling', async () => {
    const hits: string[] = []
    const rpc = createNearRpc({
      urls: ['https://one'],
      now: () => 0,
      fetchImpl: (url) => {
        hits.push(url)
        return hits.length === 1 ? reply({}, 429) : ok()
      }
    })
    await expect(rpc.callView('a', 'm', {})).rejects.toBeInstanceOf(NearRpcError)
    await rpc.callView('a', 'm', {})
    expect(hits).toHaveLength(2)
  })

  it('serves the same head from cache within the window and shares an in-flight read', async () => {
    let clock = 0
    let reads = 0
    const rpc = createNearRpc({
      urls: ['https://one'],
      now: () => clock,
      headCacheMs: 400,
      fetchImpl: () => {
        reads += 1
        return reply({ result: { header: { height: reads, hash: 'x', timestamp_nanosec: '1000000000' } } })
      }
    })
    const [a, b] = await Promise.all([rpc.blockHeader('final'), rpc.blockHeader('final')])
    expect(a.height).toBe(1)
    expect(b.height).toBe(1)
    clock = 399
    expect((await rpc.blockHeader('final')).height).toBe(1)
    clock = 401
    expect((await rpc.blockHeader('final')).height).toBe(2)
    expect((await rpc.blockHeader('optimistic')).height).toBe(3)
    expect(reads).toBe(3)
  })

  it('does not cache a failed head read', async () => {
    let calls = 0
    const rpc = createNearRpc({
      urls: ['https://one'],
      fetchImpl: () => {
        calls += 1
        return calls === 1 ? Promise.reject(new Error('offline')) : reply({ result: { header: { height: 7, hash: 'x', timestamp_nanosec: '0' } } })
      }
    })
    await expect(rpc.blockHeader('final')).rejects.toBeInstanceOf(NearRpcError)
    expect((await rpc.blockHeader('final')).height).toBe(7)
  })
})

describe('decoders', () => {
  it('rejects malformed pages and snapshots', () => {
    expect(() => decodeEventPage({ events: 'x' })).toThrow(NearDecodeError)
    expect(() => decodeSnapshot({})).toThrow(NearDecodeError)
  })

  it('accepts numeric phase and status codes and flags house tokens', () => {
    const round = {
      roundId: 1, phase: 2, locked: false, epoch: 0, coinCount: 1, aliveCount: 1, cancelStreak: 0, winnerCoinId: 0,
      createdAt: 1, startedAt: 1, lockedAt: 0, lastEpochResolvedAt: 0, prizePot: '0', treasury: '0', redeemPool: '0',
      redeemSupply: '0', clashesPlayed: 0, lockHeight: 0
    }
    const coin = {
      roundId: 1, coinId: 0, token: '1:0', creator: 'h.testnet', name: 'n', ticker: 't', monsterType: 0, skinId: 0, status: 1,
      level: 1, xp: 0, wins: 0, vMon: '1', vTok: '1', rMon: '1', rMonAtLock: '0', seedMon: '1', consolationPool: '0',
      consolationSupply: '0', supply: '1', isHouse: false
    }
    const snapshot = decodeSnapshot({ config: { epochSeconds: 14 }, round, coins: [coin], blockHeight: 9, tsMs: 5000 }, new Set(['1:0']))
    expect(snapshot.round.phase).toBe('Leveling')
    expect(snapshot.coins[0]?.status).toBe('Alive')
    expect(snapshot.coins[0]?.isHouse).toBe(true)
    expect(snapshot.serverTime).toBe(5)
  })
})
