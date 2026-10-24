import { mnemonicToAccount } from 'viem/accounts'
import type { Account, Chain, PublicClient, Transport, WalletClient } from 'viem'
import { arenaAbi } from '@animal/shared'
import type { Hex } from '@animal/shared'
import type { HouseChain, HouseCoinOnChain, LaunchPlanItem } from './house'
import { GAS_CEILING } from './viemPort'

export interface HouseChainOptions {
  publicClient: PublicClient<Transport, Chain>
  walletFor(account: Account): WalletClient<Transport, Chain, Account>
  arena: Hex
  roundId: number
  seeder: Account
  houseAccount(index: number): Account
  sleep?: (ms: number) => Promise<void>
}

export function houseAccountFactory(
  mnemonic: string | null,
  makeEphemeral: () => Account
): { account(index: number): Account; ephemeral: boolean } {
  if (mnemonic !== null) {
    return { account: (index) => mnemonicToAccount(mnemonic, { addressIndex: index }), ephemeral: false }
  }
  const cache = new Map<number, Account>()
  return {
    account(index) {
      const found = cache.get(index)
      if (found !== undefined) return found
      const created = makeEphemeral()
      cache.set(index, created)
      return created
    },
    ephemeral: true
  }
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null) throw new TypeError('expected an object')
  return Object.fromEntries(Object.entries(value))
}

function big(value: unknown): bigint {
  if (typeof value === 'bigint') return value
  if (typeof value === 'number') return BigInt(value)
  throw new TypeError('expected an integer')
}

export function createViemHouseChain(options: HouseChainOptions): HouseChain {
  const { publicClient, arena, roundId } = options
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => void setTimeout(resolve, ms)))

  return {
    async readState() {
      const config = record(
        await publicClient.readContract({ address: arena, abi: arenaAbi, functionName: 'getConfig', args: [BigInt(roundId)] })
      )
      const snapshot = await publicClient.readContract({
        address: arena,
        abi: arenaAbi,
        functionName: 'getArenaSnapshot',
        args: [BigInt(roundId)]
      })
      if (!Array.isArray(snapshot) || !Array.isArray(snapshot[1])) throw new TypeError('unexpected snapshot')
      const coins: HouseCoinOnChain[] = snapshot[1].map((entry: unknown, coinId: number) => {
        const coin = record(entry)
        return { coinId, ticker: String(coin['ticker']), token: String(coin['token']).toLowerCase() as Hex }
      })
      return {
        coins,
        minSeed: big(config['minSeed']),
        maxSeed: big(config['maxSeed']),
        launchFee: big(config['launchFee']),
        maxCoins: Number(config['maxCoins'])
      }
    },
    async ensureReserve() {
      const floor = big(await publicClient.readContract({ address: arena, abi: arenaAbi, functionName: 'reserveFloor' }))
      const round = record(
        await publicClient.readContract({ address: arena, abi: arenaAbi, functionName: 'getRound', args: [BigInt(roundId)] })
      )
      const treasury = big(round['treasury'])
      if (treasury >= floor) return 0n
      const missing = floor - treasury
      const account = options.seeder
      const estimate = await publicClient.estimateContractGas({
        account,
        address: arena,
        abi: arenaAbi,
        functionName: 'fundTreasury',
        args: [BigInt(roundId)],
        value: missing
      })
      const receipt = await options.walletFor(account).writeContractSync({
        account,
        address: arena,
        abi: arenaAbi,
        functionName: 'fundTreasury',
        args: [BigInt(roundId)],
        value: missing,
        gas: (estimate * 115n + 99n) / 100n
      })
      if (receipt.status !== 'success') throw new Error('fundTreasury reverted')
      return missing
    },
    async fund(walletIndex, amount) {
      const target = options.houseAccount(walletIndex)
      const balance = await publicClient.getBalance({ address: target.address })
      if (balance >= amount) return
      const receipt = await options.walletFor(options.seeder).sendTransactionSync({
        to: target.address,
        value: amount - balance,
        gas: 21_000n
      })
      if (receipt.status !== 'success') throw new Error(`funding house wallet ${walletIndex} failed`)
    },
    async launch(item: LaunchPlanItem, launchFee: bigint) {
      const account = options.houseAccount(item.walletIndex)
      const args = [BigInt(roundId), item.name, item.ticker, item.monsterType, item.skinId] as const
      const value = launchFee + item.seed
      const estimate = await publicClient.estimateContractGas({
        account,
        address: arena,
        abi: arenaAbi,
        functionName: 'launchCoin',
        args,
        value
      })
      const padded = (estimate * 115n + 99n) / 100n
      const receipt = await options.walletFor(account).writeContractSync({
        account,
        address: arena,
        abi: arenaAbi,
        functionName: 'launchCoin',
        args,
        value,
        gas: padded > GAS_CEILING ? GAS_CEILING : padded
      })
      if (receipt.status !== 'success') throw new Error(`launch of ${item.ticker} reverted`)
    },
    async waitBlocks(count) {
      const start = await publicClient.getBlockNumber()
      for (let i = 0; i < 100; i += 1) {
        await sleep(150)
        if ((await publicClient.getBlockNumber()) >= start + BigInt(count)) return
      }
    }
  }
}
