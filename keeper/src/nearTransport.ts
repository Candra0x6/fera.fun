import { Account, FailoverRpcProvider, JsonRpcProvider, actions } from 'near-api-js'
import type { KeyPairString } from 'near-api-js'
import { z } from 'zod'
import { createReadProviders, isDefinitiveReadError } from './rpcReads'
import type { NearCallResult, NearHead, NearTransport } from './nearPort'

export const DEFAULT_TESTNET_RPC_URLS: readonly string[] = [
  'https://test.rpc.fastnear.com',
  'https://rpc.testnet.fastnear.com',
  'https://rpc.testnet.near.org'
]

export interface NearTransportOptions {
  rpcUrls: readonly string[]
  arena: string
  accountId: string
  privateKey: KeyPairString
}

const outcomeSchema = z.object({
  status: z.unknown(),
  transaction_outcome: z.object({
    id: z.string(),
    block_hash: z.string(),
    outcome: z.object({ gas_burnt: z.number() })
  }),
  receipts_outcome: z.array(
    z.object({
      block_hash: z.string(),
      outcome: z.object({ gas_burnt: z.number(), executor_id: z.string() })
    })
  )
})

export interface ParsedOutcome {
  ok: boolean
  hash: string
  gasBurnt: bigint
  executionBlockHash: string
  message: string
}

export function interpretOutcome(response: unknown, arena: string): ParsedOutcome {
  const parsed = outcomeSchema.parse(response)
  const status = parsed.status
  const failed = typeof status === 'object' && status !== null && 'Failure' in status
  const succeeded = typeof status === 'object' && status !== null && 'SuccessValue' in status
  const receipt = parsed.receipts_outcome.find((entry) => entry.outcome.executor_id === arena)
  const burnt = parsed.receipts_outcome.reduce(
    (sum, entry) => sum + BigInt(entry.outcome.gas_burnt),
    BigInt(parsed.transaction_outcome.outcome.gas_burnt)
  )
  return {
    ok: succeeded && !failed,
    hash: parsed.transaction_outcome.id,
    gasBurnt: burnt,
    executionBlockHash: receipt?.block_hash ?? parsed.transaction_outcome.block_hash,
    message: failed || !succeeded ? JSON.stringify(status) : ''
  }
}

const NANOS = 1_000_000_000

export function createNearTransport(options: NearTransportOptions): NearTransport {
  const provider = new FailoverRpcProvider(options.rpcUrls.map((url) => new JsonRpcProvider({ url })))
  const account = new Account(options.accountId, provider, options.privateKey)
  const reads = createReadProviders(options.rpcUrls)

  async function blockTimestamp(blockId: string, fallback: () => Promise<number>): Promise<number> {
    try {
      const block = await reads.read((p) => p.viewBlock({ blockId }), isDefinitiveReadError)
      return Math.floor(Number(BigInt(block.header.timestamp_nanosec) / BigInt(NANOS)))
    } catch {
      return fallback()
    }
  }

  async function head(): Promise<NearHead> {
    const block = await reads.read((p) => p.viewBlock({ finality: 'optimistic' }), isDefinitiveReadError)
    return { height: block.header.height, timestampSec: Math.floor(Number(BigInt(block.header.timestamp_nanosec) / BigInt(NANOS))) }
  }

  return {
    accountId: options.accountId,
    async view(method, args) {
      return reads.read(
        (p) => p.callFunction({ contractId: options.arena, method, args, blockQuery: { finality: 'optimistic' } }),
        isDefinitiveReadError
      )
    },
    head,
    async call(method, args, gas, deposit = 0n): Promise<NearCallResult> {
      const response = await account.signAndSendTransaction({
        receiverId: options.arena,
        actions: [actions.functionCall(method, args, gas, deposit)],
        waitUntil: 'EXECUTED_OPTIMISTIC',
        throwOnFailure: false
      })
      const outcome = interpretOutcome(response, options.arena)
      const at = await blockTimestamp(outcome.executionBlockHash, async () => (await head()).timestampSec)
      if (outcome.ok) return { kind: 'success', hash: outcome.hash, gasBurnt: outcome.gasBurnt, blockTimestampSec: at }
      return { kind: 'failure', hash: outcome.hash, gasBurnt: outcome.gasBurnt, blockTimestampSec: at, message: outcome.message }
    }
  }
}
