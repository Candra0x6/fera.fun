import { z } from 'zod'
import { topUpTarget } from './house'
import type { HouseChain, HouseState } from './house'
import { houseAccountId, housePublicKey } from './houseKeys'
import type { NearAccounts } from './nearAccounts'
import type { NearTransport } from './nearPort'
import { TGAS } from './nearPort'

const LAUNCH_GAS = 30n * TGAS

const stateSchema = z.object({
  config: z.object({
    minSeed: z.string().regex(/^\d+$/),
    maxSeed: z.string().regex(/^\d+$/),
    launchFee: z.string().regex(/^\d+$/),
    maxCoins: z.number().int().positive()
  }),
  coins: z.array(z.object({ coinId: z.number().int().nonnegative(), ticker: z.string(), creator: z.string() }))
})

export interface HouseChainOptions {
  roundId: number
  arenaView: NearTransport['view']
  seederAccounts: NearAccounts
  houseSeed: string
  transportFor(walletIndex: number): NearTransport
  attempts?: number
  retryDelayMs?: number
  sleep?: (ms: number) => Promise<void>
}

class LaunchRefused extends Error {}

export function createNearHouseChain(options: HouseChainOptions): HouseChain {
  const { seederAccounts } = options
  const attempts = options.attempts ?? 3
  const retryDelay = options.retryDelayMs ?? 1500
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => void setTimeout(resolve, ms)))
  const idOf = (walletIndex: number): string => houseAccountId(walletIndex, seederAccounts.accountId)

  return {
    async readState(): Promise<HouseState> {
      const parsed = stateSchema.parse(await options.arenaView('get_arena_snapshot', { round_id: options.roundId }))
      return {
        coins: parsed.coins,
        minSeed: BigInt(parsed.config.minSeed),
        maxSeed: BigInt(parsed.config.maxSeed),
        launchFee: BigInt(parsed.config.launchFee),
        maxCoins: parsed.config.maxCoins
      }
    },
    houseBalance(walletIndex) {
      return seederAccounts.balance(idOf(walletIndex))
    },
    async fund(walletIndex, minimum) {
      const id = idOf(walletIndex)
      const target = topUpTarget(minimum)
      if (!(await seederAccounts.exists(id))) {
        await seederAccounts.createAccount(id, housePublicKey(options.houseSeed, walletIndex), target)
        await seederAccounts.waitFinal(id)
        return
      }
      const held = await seederAccounts.balance(id)
      if (held < minimum) await seederAccounts.transfer(id, target - held)
    },
    async launch(item, launchFee) {
      const args = {
        round_id: options.roundId,
        name: item.name,
        ticker: item.ticker,
        monster_type: item.monsterType,
        skin_id: item.skinId
      }
      let lastError: unknown = new Error('launch was not attempted')
      for (let attempt = 0; attempt < attempts; attempt += 1) {
        try {
          const result = await options.transportFor(item.walletIndex).call('launch_coin', args, LAUNCH_GAS, launchFee + item.seed)
          if (result.kind === 'failure') throw new LaunchRefused(`launch ${item.ticker} failed: ${result.message.slice(0, 160)}`)
          return result.hash
        } catch (error) {
          if (error instanceof LaunchRefused) throw error
          lastError = error
          await sleep(retryDelay)
          const state = await this.readState().catch(() => null)
          if (state !== null && state.coins.some((coin) => coin.ticker === item.ticker)) return ''
        }
      }
      throw lastError
    }
  }
}
