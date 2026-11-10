import { Account, FailoverRpcProvider, JsonRpcProvider, PublicKey, actions } from 'near-api-js'
import type { KeyPairString } from 'near-api-js'
import { createReadProviders, isDefinitiveReadError } from './rpcReads'

export interface NearAccounts {
  readonly accountId: string
  exists(accountId: string): Promise<boolean>
  balance(accountId: string): Promise<bigint>
  transfer(to: string, amount: bigint): Promise<string>
  createAccount(newAccountId: string, publicKey: string, amount: bigint): Promise<string>
  waitFinal(accountId: string, timeoutMs?: number): Promise<void>
}

export interface NearAccountsOptions {
  rpcUrls: readonly string[]
  accountId: string
  privateKey: KeyPairString
}

function isMissing(error: unknown): boolean {
  return error instanceof Error && error.name === 'AccountDoesNotExistError'
}

export function isEd25519PublicKey(value: string): boolean {
  try {
    return PublicKey.from(value).keyType === 0 && value.startsWith('ed25519:')
  } catch {
    return false
  }
}

export function createNearAccounts(options: NearAccountsOptions): NearAccounts {
  const provider = new FailoverRpcProvider(options.rpcUrls.map((url) => new JsonRpcProvider({ url })))
  const account = new Account(options.accountId, provider, options.privateKey)
  const reads = createReadProviders(options.rpcUrls)
  let queue: Promise<unknown> = Promise.resolve()

  function serial<T>(run: () => Promise<T>): Promise<T> {
    const next = queue.then(run)
    queue = next.catch(() => undefined)
    return next
  }

  async function view(accountId: string): Promise<bigint | null> {
    try {
      const state = await reads.read((p) => p.viewAccount({ accountId, blockQuery: { finality: 'optimistic' } }), isDefinitiveReadError)
      return state.amount
    } catch (error) {
      if (isMissing(error)) return null
      throw error
    }
  }

  async function send(receiverId: string, list: ReturnType<typeof actions.transfer>[]): Promise<string> {
    const response = await account.signAndSendTransaction({
      receiverId,
      actions: list,
      waitUntil: 'EXECUTED_OPTIMISTIC'
    })
    return response.transaction_outcome.id
  }

  return {
    accountId: options.accountId,
    async exists(accountId) {
      return (await view(accountId)) !== null
    },
    async balance(accountId) {
      return (await view(accountId)) ?? 0n
    },
    async waitFinal(accountId, timeoutMs = 20_000) {
      const deadline = Date.now() + timeoutMs
      for (;;) {
        try {
          await reads.read((p) => p.viewAccount({ accountId, blockQuery: { finality: 'final' } }), isDefinitiveReadError)
          return
        } catch (error) {
          if (!isMissing(error) || Date.now() >= deadline) throw error
        }
        await new Promise<void>((resolve) => void setTimeout(resolve, 500))
      }
    },
    transfer(to, amount) {
      return serial(() => send(to, [actions.transfer(amount)]))
    },
    createAccount(newAccountId, publicKey, amount) {
      return serial(() =>
        send(newAccountId, [actions.createAccount(), actions.transfer(amount), actions.addFullAccessKey(PublicKey.from(publicKey))])
      )
    }
  }
}
