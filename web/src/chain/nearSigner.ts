import type { KeyPairString } from 'near-api-js'

export interface ArenaCall {
  method: string
  args: Record<string, unknown>
  deposit?: bigint
  gas?: bigint
}

export interface ArenaSigner {
  send(call: ArenaCall): Promise<string>
}

export interface SignerOptions {
  secretKey: KeyPairString
  accountId: string
  arena: string
  rpcUrls: readonly string[]
}

export const PLAYER_CALL_GAS = 30_000_000_000_000n

export async function createNearSigner(options: SignerOptions): Promise<ArenaSigner> {
  const { Account, FailoverRpcProvider, JsonRpcProvider, KeyPairSigner } = await import('near-api-js')
  const provider = new FailoverRpcProvider(options.rpcUrls.map((url) => new JsonRpcProvider({ url })))
  const account = new Account(options.accountId, provider, KeyPairSigner.fromSecretKey(options.secretKey))
  return {
    async send(call) {
      const outcome = await account.callFunctionRaw({
        contractId: options.arena,
        methodName: call.method,
        args: call.args,
        deposit: call.deposit ?? 0n,
        gas: call.gas ?? PLAYER_CALL_GAS,
        waitUntil: 'EXECUTED_OPTIMISTIC'
      })
      return outcome.transaction.hash
    }
  }
}
