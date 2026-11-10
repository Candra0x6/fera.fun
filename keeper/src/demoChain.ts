import type { DemoChain } from './demo'
import type { NearAccounts } from './nearAccounts'
import type { NearTransport } from './nearPort'
import { TGAS } from './nearPort'

const CREATE_GAS = 30n * TGAS

export interface NearDemoChainOptions {
  transport: NearTransport
  accounts: NearAccounts
}

export function createNearDemoChain(options: NearDemoChainOptions): DemoChain {
  const { transport, accounts } = options

  async function currentRoundId(): Promise<number> {
    return Number(await transport.view('current_round_id', {}))
  }

  return {
    currentRoundId,
    balance: (accountId) => accounts.balance(accountId),
    async createRound() {
      const result = await transport.call('create_round', {}, CREATE_GAS)
      if (result.kind === 'failure') throw new Error(`create_round failed: ${result.message.slice(0, 160)}`)
      return { roundId: await currentRoundId(), txHash: result.hash }
    }
  }
}
