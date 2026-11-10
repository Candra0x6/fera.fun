import type { NearRpc } from '@animal/shared'
import { createStore } from './store'
import type { ExternalStore } from './store'
import { isSecretKey, newBurnerKey, publicKeyOf } from './nearKeys'
import type { BurnerKey } from './nearKeys'
import type { ArenaCall, ArenaSigner, SignerOptions } from './nearSigner'
import { createTxQueue } from './txQueue'

export const BURNER_STORAGE_KEY = 'fera.burner.near'
export const BURNER_ACCOUNT_STORAGE_KEY = 'fera.burner.near.account'
export const YOCTO_PER_NEAR = 10n ** 24n
export const LOW_BALANCE_YOCTO = YOCTO_PER_NEAR
export const BLOCK_MS = 600
const MIN_GAP_BLOCKS = 4

export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export type DripFailure = 'bad_key' | 'rate_limited' | 'faucet_empty' | 'send_failed' | 'unreachable' | 'no_keeper'

export class DripError extends Error {
  readonly code: DripFailure
  readonly retryAfterSeconds: number | null

  constructor(code: DripFailure, retryAfterSeconds: number | null = null) {
    super(`drip refused: ${code}`)
    this.name = 'DripError'
    this.code = code
    this.retryAfterSeconds = retryAfterSeconds
  }
}

export interface DripFetchResponse {
  json(): Promise<unknown>
}

export type DripFetch = (
  url: string,
  init: { method: 'POST'; headers: Record<string, string>; body: string }
) => Promise<DripFetchResponse>

export interface DripResult {
  accountId: string
  amount: bigint
}

const DRIP_ERRORS: readonly DripFailure[] = ['bad_key', 'rate_limited', 'faucet_empty', 'send_failed']

function record(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  return Object.fromEntries(Object.entries(value))
}

export async function requestDrip(keeperUrl: string | null, publicKey: string, fetchImpl: DripFetch): Promise<DripResult> {
  if (keeperUrl === null) throw new DripError('no_keeper')
  let body: Record<string, unknown> | null
  try {
    const response = await fetchImpl(`${keeperUrl}/drip`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ publicKey })
    })
    body = record(await response.json())
  } catch {
    throw new DripError('unreachable')
  }
  if (body === null) throw new DripError('unreachable')
  if (body['ok'] === true && typeof body['accountId'] === 'string') {
    const amount = body['amount']
    return { accountId: body['accountId'], amount: typeof amount === 'string' && /^\d+$/.test(amount) ? BigInt(amount) : 0n }
  }
  const failure = DRIP_ERRORS.find((code) => code === body['error']) ?? 'send_failed'
  const retry = body['retryAfterSeconds']
  throw new DripError(failure, typeof retry === 'number' ? retry : null)
}

export interface BurnerState {
  status: 'idle' | 'connecting' | 'ready' | 'failed'
  accountId: string | null
  publicKey: string | null
  balance: bigint | null
  dripping: boolean
  failure: DripFailure | null
}

export interface BurnerDeps {
  storage: StorageLike
  keeperUrl: string | null
  fetchImpl: DripFetch
  rpc: Pick<NearRpc, 'viewAccount'>
  createSigner: (options: Pick<SignerOptions, 'secretKey' | 'accountId'>) => Promise<ArenaSigner>
  generateKey?: () => Promise<BurnerKey>
  now?: () => number
  sleep?: (ms: number) => Promise<void>
}

export interface Burner {
  store: ExternalStore<BurnerState>
  connect(): Promise<void>
  refreshBalance(): Promise<void>
  drip(): Promise<void>
  send(call: ArenaCall): Promise<string>
  disconnect(): void
}

const INITIAL: BurnerState = {
  status: 'idle',
  accountId: null,
  publicKey: null,
  balance: null,
  dripping: false,
  failure: null
}

export function createBurner(deps: BurnerDeps): Burner {
  const store = createStore<BurnerState>(INITIAL)
  const now = deps.now ?? (() => Date.now())
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)))
  const generate = deps.generateKey ?? newBurnerKey
  const queue = createTxQueue({ minGapMs: MIN_GAP_BLOCKS * BLOCK_MS, lowBalanceWei: LOW_BALANCE_YOCTO, now, sleep })
  let key: BurnerKey | null = null
  let signer: ArenaSigner | null = null
  let dripInFlight: Promise<void> | null = null

  async function loadKey(): Promise<BurnerKey> {
    const stored = deps.storage.getItem(BURNER_STORAGE_KEY)
    if (isSecretKey(stored)) return { secretKey: stored, publicKey: await publicKeyOf(stored) }
    const fresh = await generate()
    deps.storage.setItem(BURNER_STORAGE_KEY, fresh.secretKey)
    deps.storage.removeItem(BURNER_ACCOUNT_STORAGE_KEY)
    return fresh
  }

  async function readBalance(accountId: string): Promise<bigint | null> {
    const view = await deps.rpc.viewAccount(accountId)
    return view === null ? null : view.amount
  }

  async function dripNow(): Promise<void> {
    if (key === null) return
    const publicKey = key.publicKey
    store.set((previous) => ({ ...previous, dripping: true, failure: null }))
    try {
      const result = await requestDrip(deps.keeperUrl, publicKey, deps.fetchImpl)
      deps.storage.setItem(BURNER_ACCOUNT_STORAGE_KEY, result.accountId)
      store.set((previous) => ({ ...previous, accountId: result.accountId }))
      signer = null
    } catch (error) {
      const failure = error instanceof DripError ? error.code : 'send_failed'
      store.set((previous) => ({ ...previous, failure }))
      throw error
    } finally {
      store.set((previous) => ({ ...previous, dripping: false }))
    }
  }

  function drip(): Promise<void> {
    if (dripInFlight === null) {
      dripInFlight = dripNow().finally(() => {
        dripInFlight = null
      })
    }
    return dripInFlight
  }

  async function refreshBalance(): Promise<void> {
    const accountId = store.get().accountId
    if (accountId === null) return
    try {
      const balance = await readBalance(accountId)
      store.set((previous) => (previous.accountId === accountId ? { ...previous, balance } : previous))
    } catch {
      return
    }
  }

  async function ensureSigner(): Promise<ArenaSigner> {
    const accountId = store.get().accountId
    if (key === null || accountId === null) throw new Error('Burner wallet is not connected')
    if (signer === null) signer = await deps.createSigner({ secretKey: key.secretKey, accountId })
    return signer
  }

  return {
    store,
    refreshBalance,
    drip,
    async connect() {
      store.set({ ...INITIAL, status: 'connecting' })
      try {
        key = await loadKey()
        const storedAccount = deps.storage.getItem(BURNER_ACCOUNT_STORAGE_KEY)
        store.set((previous) => ({ ...previous, publicKey: key?.publicKey ?? null, accountId: storedAccount }))
        let balance = storedAccount === null ? null : await readBalance(storedAccount).catch(() => null)
        if (storedAccount === null || balance === null) {
          await drip()
          const accountId = store.get().accountId
          balance = accountId === null ? null : await readBalance(accountId).catch(() => null)
        }
        store.set((previous) => ({ ...previous, status: 'ready', balance }))
        if (balance !== null && balance < LOW_BALANCE_YOCTO) await drip().catch(() => undefined)
        await refreshBalance()
      } catch {
        store.set((previous) => ({ ...previous, status: 'failed' }))
      }
    },
    async send(call) {
      const active = await ensureSigner()
      const hash = await queue.run(() => active.send(call), call.deposit ?? 0n, store.get().balance)
      void refreshBalance()
      return hash
    },
    disconnect() {
      key = null
      signer = null
      store.set(INITIAL)
    }
  }
}
