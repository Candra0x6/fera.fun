import { createServer } from 'node:http'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import { KeyPair } from 'near-api-js'
import type { KeyPairString } from 'near-api-js'
import { createNearArenaPort } from '../src/nearPort'
import { createNearTransport, interpretOutcome } from '../src/nearTransport'

const ARENA = 'fera-arena.testnet'
const BLOCK_HASH = '11111111111111111111111111111111'
const EXEC_HASH = '22222222222222222222222222222222'

function outcome(status: unknown, receiptExecutor = ARENA) {
  return {
    final_execution_status: 'EXECUTED_OPTIMISTIC',
    status,
    transaction: { hash: 'TXHASH' },
    transaction_outcome: { id: 'TXHASH', block_hash: BLOCK_HASH, outcome: { gas_burnt: 2_000_000_000_000 } },
    receipts_outcome: [
      { block_hash: EXEC_HASH, outcome: { gas_burnt: 40_000_000_000_000, executor_id: receiptExecutor } },
      { block_hash: BLOCK_HASH, outcome: { gas_burnt: 4_000_000_000_000, executor_id: 'fera-keeper.testnet' } }
    ]
  }
}

describe('interpretOutcome', () => {
  it('reads a success value, the summed gas and the arena receipt block', () => {
    const parsed = interpretOutcome(outcome({ SuccessValue: '' }), ARENA)
    expect(parsed).toEqual({
      ok: true,
      hash: 'TXHASH',
      gasBurnt: 46_000_000_000_000n,
      executionBlockHash: EXEC_HASH,
      message: ''
    })
  })

  it('keeps the panic text of a failed call', () => {
    const failure = { Failure: { ActionError: { index: 0, kind: { FunctionCallError: { ExecutionError: 'Smart contract panicked: ArenaError:Locked' } } } } }
    const parsed = interpretOutcome(outcome(failure), ARENA)
    expect(parsed.ok).toBe(false)
    expect(parsed.message).toContain('ArenaError:Locked')
  })

  it('treats an unfinished status as not ok and falls back to the transaction block', () => {
    const parsed = interpretOutcome(outcome('Started', 'someone.testnet'), ARENA)
    expect(parsed.ok).toBe(false)
    expect(parsed.executionBlockHash).toBe(BLOCK_HASH)
  })

  it('rejects a response that is not an outcome', () => {
    expect(() => interpretOutcome({ status: { SuccessValue: '' } }, ARENA)).toThrow()
  })
})

interface FakeRpc {
  url: string
  requests: string[]
  close(): Promise<void>
}

async function fakeRpc(handlers: {
  view?: (method: string) => unknown
  sendTx?: () => unknown
  height?: () => number
}): Promise<FakeRpc> {
  const requests: string[] = []
  const server: Server = createServer((req, res) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => {
      const body: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'))
      const request = body as { id: number | string; method: string; params: Record<string, unknown> }
      requests.push(request.method)
      const reply = (result: unknown): void => {
        res.setHeader('content-type', 'application/json')
        res.end(JSON.stringify({ jsonrpc: '2.0', id: request.id, result }))
      }
      if (request.method === 'block') {
        const blockId = request.params['block_id']
        const nanos = blockId === EXEC_HASH ? '1760000007000000000' : '1760000009000000000'
        reply({ author: 'v.testnet', chunks: [], header: { height: handlers.height?.() ?? 9100, hash: BLOCK_HASH, timestamp_nanosec: nanos } })
      } else if (request.method === 'query' && request.params['request_type'] === 'call_function') {
        const text = JSON.stringify(handlers.view?.(String(request.params['method_name'])) ?? {})
        reply({ result: [...Buffer.from(text)], logs: [], block_height: 9100, block_hash: BLOCK_HASH })
      } else if (request.method === 'query' && request.params['request_type'] === 'view_access_key') {
        reply({ nonce: 10, permission: 'FullAccess', block_height: 9100, block_hash: BLOCK_HASH })
      } else if (request.method === 'send_tx') {
        reply(handlers.sendTx?.() ?? outcome({ SuccessValue: '' }))
      } else {
        res.statusCode = 500
        res.end('unsupported')
      }
    })
  })
  await new Promise<void>((resolve) => void server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo
  return {
    url: `http://127.0.0.1:${port}`,
    requests,
    close: () => new Promise<void>((resolve) => void server.close(() => resolve()))
  }
}

const open: FakeRpc[] = []
afterEach(async () => {
  await Promise.all(open.splice(0).map((rpc) => rpc.close()))
})

function keyOf(): KeyPairString {
  return KeyPair.fromRandom('ed25519').toString()
}

describe('createNearTransport against a fake JSON-RPC', () => {
  it('reads views and the optimistic head, failing over from a dead endpoint', async () => {
    const rpc = await fakeRpc({ view: (method) => (method === 'get_config' ? { minCoins: 6 } : {}), height: () => 9100 })
    open.push(rpc)
    const transport = createNearTransport({
      rpcUrls: ['http://127.0.0.1:1', rpc.url],
      arena: ARENA,
      accountId: 'fera-keeper.testnet',
      privateKey: keyOf()
    })
    expect(await transport.view('get_config', {})).toEqual({ minCoins: 6 })
    expect(await transport.head()).toEqual({ height: 9100, timestampSec: 1_760_000_009 })
  })

  it('signs and sends a call, then reports gas and the execution block time', async () => {
    const rpc = await fakeRpc({})
    open.push(rpc)
    const transport = createNearTransport({ rpcUrls: [rpc.url], arena: ARENA, accountId: 'fera-keeper.testnet', privateKey: keyOf() })
    const result = await transport.call('lock_epoch', { round_id: 1 }, 30_000_000_000_000n)
    expect(result).toEqual({
      kind: 'success',
      hash: 'TXHASH',
      gasBurnt: 46_000_000_000_000n,
      blockTimestampSec: 1_760_000_007
    })
    expect(rpc.requests).toContain('send_tx')
  })

  it('turns a contract panic into a skipped call through the port', async () => {
    const failure = { Failure: { ActionError: { index: 0, kind: { FunctionCallError: { ExecutionError: 'Smart contract panicked: ArenaError:EpochTooEarly' } } } } }
    const rpc = await fakeRpc({ sendTx: () => outcome(failure) })
    open.push(rpc)
    const transport = createNearTransport({ rpcUrls: [rpc.url], arena: ARENA, accountId: 'fera-keeper.testnet', privateKey: keyOf() })
    const port = createNearArenaPort({ transport })
    expect(await port.send({ fn: 'lockEpoch', roundId: 1 })).toEqual({ kind: 'skipped', reason: 'EpochTooEarly' })
  })
})
