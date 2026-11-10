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
}

export function createNearHouseChain(options: HouseChainOptions): HouseChain {
  const { seederAccounts } = options
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
      const result = await options.transportFor(item.walletIndex).call(
        'launch_coin',
        {
          round_id: options.roundId,
          name: item.name,
          ticker: item.ticker,
          monster_type: item.monsterType,
          skin_id: item.skinId
        },
        LAUNCH_GAS,
        launchFee + item.seed
      )
      if (result.kind === 'failure') throw new Error(`launch ${item.ticker} failed: ${result.message.slice(0, 160)}`)
      return result.hash
    }
  }
}
