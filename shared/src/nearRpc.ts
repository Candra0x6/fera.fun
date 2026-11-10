export interface NearFetchResponse {
  ok: boolean
  status: number
  json(): Promise<unknown>
}

export type NearFetch = (
  url: string,
  init: { method: 'POST'; headers: Record<string, string>; body: string }
) => Promise<NearFetchResponse>

export type NearFinality = 'optimistic' | 'final'

export type NearRpcErrorKind = 'http' | 'rpc' | 'contract' | 'unknown_account' | 'malformed'

export class NearRpcError extends Error {
  readonly kind: NearRpcErrorKind
  readonly retryable: boolean

  constructor(kind: NearRpcErrorKind, message: string, retryable = false) {
    super(message)
    this.name = 'NearRpcError'
    this.kind = kind
    this.retryable = retryable
  }
}

export interface NearViewResult {
  value: unknown
  blockHeight: number
  blockHash: string
}

export interface NearAccountView {
  amount: bigint
  storageUsage: number
  blockHeight: number
}

export interface NearBlockHeader {
  height: number
  hash: string
  timestampMs: number
}

export interface NearRpc {
  callView(contractId: string, method: string, args: Record<string, unknown>): Promise<NearViewResult>
  viewAccount(accountId: string): Promise<NearAccountView | null>
  blockHeader(finality: NearFinality): Promise<NearBlockHeader>
}

export interface NearRpcOptions {
  urls: readonly string[]
  fetchImpl?: NearFetch
  timeoutMs?: number
}

const RETRYABLE_CAUSES: ReadonlySet<string> = new Set([
  'UNKNOWN_BLOCK',
  'UNAVAILABLE_SHARD',
  'NOT_SYNCED_YET',
  'TIMEOUT_ERROR',
  'INTERNAL_ERROR'
])

const DEFAULT_TIMEOUT_MS = 8000

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  return Object.fromEntries(Object.entries(value))
}

function textOf(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

export function encodeViewArgs(args: Record<string, unknown>): string {
  return bytesToBase64(new TextEncoder().encode(JSON.stringify(args)))
}

function defaultFetch(timeoutMs: number): NearFetch {
  return async (url, init) => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const response = await fetch(url, { ...init, signal: controller.signal })
      return { ok: response.ok, status: response.status, json: () => response.json() as Promise<unknown> }
    } finally {
      clearTimeout(timer)
    }
  }
}

function classifyError(error: Record<string, unknown>): NearRpcError {
  const cause = asRecord(error['cause'])
  const name = textOf(cause?.['name']) ?? textOf(error['name']) ?? ''
  const info = asRecord(cause?.['info'])
  const detail = textOf(info?.['error_message']) ?? textOf(error['data']) ?? textOf(error['message']) ?? 'rpc error'
  if (name === 'UNKNOWN_ACCOUNT') return new NearRpcError('unknown_account', detail)
  if (name === 'CONTRACT_EXECUTION_ERROR' || name === 'NO_CONTRACT_CODE') return new NearRpcError('contract', detail)
  return new NearRpcError('rpc', `${name === '' ? 'RPC_ERROR' : name}: ${detail}`, RETRYABLE_CAUSES.has(name))
}

function decodeBytes(bytes: unknown): unknown {
  if (!Array.isArray(bytes)) throw new NearRpcError('malformed', 'call_function result is not a byte array')
  const array = new Uint8Array(bytes.length)
  for (let i = 0; i < bytes.length; i += 1) {
    const item = bytes[i]
    if (typeof item !== 'number') throw new NearRpcError('malformed', 'call_function result has a non-numeric byte')
    array[i] = item
  }
  const text = new TextDecoder().decode(array)
  if (text === '') return null
  try {
    return JSON.parse(text)
  } catch {
    throw new NearRpcError('malformed', 'call_function result is not JSON')
  }
}

export function createNearRpc(options: NearRpcOptions): NearRpc {
  const fetchImpl = options.fetchImpl ?? defaultFetch(options.timeoutMs ?? DEFAULT_TIMEOUT_MS)
  const urls = [...options.urls]
  let cursor = 0
  let nextId = 1

  async function request(method: string, params: Record<string, unknown>): Promise<Record<string, unknown>> {
    if (urls.length === 0) throw new NearRpcError('http', 'no rpc urls configured')
    let last: unknown = new NearRpcError('http', 'no rpc endpoint answered', true)
    for (let attempt = 0; attempt < urls.length; attempt += 1) {
      const index = (cursor + attempt) % urls.length
      const url = urls[index]
      if (url === undefined) continue
      nextId += 1
      try {
        const response = await fetchImpl(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: nextId, method, params })
        })
        if (!response.ok) throw new NearRpcError('http', `http ${response.status} from ${url}`, true)
        const body = asRecord(await response.json())
        if (body === null) throw new NearRpcError('malformed', `malformed json-rpc response from ${url}`, true)
        const error = asRecord(body['error'])
        if (error !== null) throw classifyError(error)
        const result = asRecord(body['result'])
        if (result === null) throw new NearRpcError('malformed', `json-rpc response from ${url} has no result`, true)
        const inline = textOf(result['error'])
        if (inline !== null) {
          throw inline.includes('does not exist while viewing')
            ? new NearRpcError('unknown_account', inline)
            : new NearRpcError('contract', inline)
        }
        cursor = index
        return result
      } catch (error) {
        last = error
        if (error instanceof NearRpcError && !error.retryable) throw error
        if (!(error instanceof NearRpcError)) last = new NearRpcError('http', String(error), true)
      }
    }
    throw last
  }

  return {
    async callView(contractId, method, args) {
      const result = await request('query', {
        request_type: 'call_function',
        finality: 'optimistic',
        account_id: contractId,
        method_name: method,
        args_base64: encodeViewArgs(args)
      })
      const height = result['block_height']
      const hash = textOf(result['block_hash'])
      if (typeof height !== 'number' || hash === null) throw new NearRpcError('malformed', 'view result has no block reference')
      return { value: decodeBytes(result['result']), blockHeight: height, blockHash: hash }
    },
    async viewAccount(accountId) {
      try {
        const result = await request('query', {
          request_type: 'view_account',
          finality: 'optimistic',
          account_id: accountId
        })
        const amount = textOf(result['amount'])
        const usage = result['storage_usage']
        const height = result['block_height']
        if (amount === null || !/^\d+$/.test(amount) || typeof usage !== 'number' || typeof height !== 'number') {
          throw new NearRpcError('malformed', 'view_account result is malformed')
        }
        return { amount: BigInt(amount), storageUsage: usage, blockHeight: height }
      } catch (error) {
        if (error instanceof NearRpcError && error.kind === 'unknown_account') return null
        throw error
      }
    },
    async blockHeader(finality) {
      const result = await request('block', { finality })
      const header = asRecord(result['header'])
      const height = header?.['height']
      const hash = textOf(header?.['hash'])
      const nanos = header?.['timestamp_nanosec']
      if (typeof height !== 'number' || hash === null) throw new NearRpcError('malformed', 'block result has no header')
      const timestampMs = typeof nanos === 'string' && /^\d+$/.test(nanos) ? Number(BigInt(nanos) / 1_000_000n) : 0
      return { height, hash, timestampMs }
    }
  }
}
