import type { DemoChain } from './demo'
import type { NearAccounts } from './nearAccounts'
import type { NearTransport } from './nearPort'
import { TGAS } from './nearPort'

const CREATE_GAS = 30n * TGAS

export interface NearDemoChainOptions {
  transport: NearTransport
  accounts: NearAccounts
  attempts?: number
  retryDelayMs?: number
  sleep?: (ms: number) => Promise<void>
}

export function createNearDemoChain(options: NearDemoChainOptions): DemoChain {
  const { transport, accounts } = options
  const attempts = options.attempts ?? 3
  const retryDelay = options.retryDelayMs ?? 1500
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => void setTimeout(resolve, ms)))

  async function currentRoundId(): Promise<number> {
    return Number(await transport.view('current_round_id', {}))
  }

  return {
    currentRoundId,
    balance: (accountId) => accounts.balance(accountId),
    async createRound() {
      const before = await currentRoundId()
      let lastError: unknown = new Error('create_round was not attempted')
      for (let attempt = 0; attempt < attempts; attempt += 1) {
        try {
          const result = await transport.call('create_round', {}, CREATE_GAS)
          if (result.kind === 'failure') throw new Error(`create_round failed: ${result.message.slice(0, 160)}`)
          return { roundId: await currentRoundId(), txHash: result.hash }
        } catch (error) {
          if (error instanceof Error && error.message.startsWith('create_round failed')) throw error
          lastError = error
          await sleep(retryDelay)
          const now = await currentRoundId().catch(() => before)
          if (now > before) return { roundId: now, txHash: '' }
        }
      }
      throw lastError
    }
  }
}
