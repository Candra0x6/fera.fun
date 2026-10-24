import type { Account, Chain, PublicClient, Transport, WalletClient } from 'viem'
import { arenaAbi, monsterCoinAbi } from '@animal/shared'
import type { Hex } from '@animal/shared'
import type { DefaultRoundConfig, DemoChain } from './demo'
import { COINS_PER_HOUSE_WALLET, HOUSE_ROSTER } from './house'
import { GAS_CEILING } from './viemPort'

export interface DemoChainOptions {
  publicClient: PublicClient<Transport, Chain>
  walletFor(account: Account): WalletClient<Transport, Chain, Account>
  arena: Hex
  creator: Account | null
  seeder: Account | null
  houseAccount(index: number): Account
  log: (message: string, fields?: Record<string, unknown>) => void
}

const HOUSE_WALLETS = Math.ceil(HOUSE_ROSTER.length / COINS_PER_HOUSE_WALLET)

function pad(gas: bigint): bigint {
  const padded = (gas * 115n + 99n) / 100n
  return padded > GAS_CEILING ? GAS_CEILING : padded
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

export function createViemDemoChain(options: DemoChainOptions): DemoChain {
  const { publicClient, arena, log } = options

  async function send(account: Account, functionName: string, args: readonly unknown[], value?: bigint): Promise<void> {
    const request = { account, address: arena, abi: arenaAbi, functionName, args, ...(value === undefined ? {} : { value }) }
    const estimate = await publicClient.estimateContractGas(request)
    const receipt = await options.walletFor(account).writeContractSync({ ...request, gas: pad(estimate) })
    if (receipt.status !== 'success') throw new Error(`${functionName} reverted`)
  }

  async function currentRoundId(): Promise<number> {
    return Number(await publicClient.readContract({ address: arena, abi: arenaAbi, functionName: 'currentRoundId' }))
  }

  return {
    currentRoundId,
    balance: (address) => publicClient.getBalance({ address }),
    houseBalance: (index) => publicClient.getBalance({ address: options.houseAccount(index).address }),
    async estimateCarry(previous) {
      const round = record(
        await publicClient.readContract({ address: arena, abi: arenaAbi, functionName: 'getRound', args: [BigInt(previous)] })
      )
      if (round['phase'] !== 4 && round['phase'] !== 5) return 0n
      const config = record(
        await publicClient.readContract({ address: arena, abi: arenaAbi, functionName: 'getConfig', args: [BigInt(previous)] })
      )
      const owed = big(round['coinCount']) * big(config['launchFee'])
      const treasury = big(round['treasury'])
      return treasury > owed ? treasury - owed : 0n
    },
    async recycle(roundId) {
      const seeder = options.seeder
      try {
        const snapshot = await publicClient.readContract({
          address: arena,
          abi: arenaAbi,
          functionName: 'getArenaSnapshot',
          args: [BigInt(roundId)]
        })
        const round = Array.isArray(snapshot) ? record(snapshot[0]) : {}
        const aborted = round['phase'] === 5
        const coins: unknown[] = Array.isArray(snapshot) && Array.isArray(snapshot[1]) ? snapshot[1] : []
        const wallets = Array.from({ length: HOUSE_WALLETS }, (_, index) => options.houseAccount(index))
        for (const [coinId, entry] of coins.entries()) {
          const coin = record(entry)
          const creator = String(coin['creator']).toLowerCase()
          const account = wallets.find((wallet) => wallet.address.toLowerCase() === creator)
          if (account === undefined) continue
          try {
            await send(account, 'claimSeed', [BigInt(roundId), coinId])
          } catch (error) {
            log('recycle: claimSeed skipped', { roundId, coinId, error: error instanceof Error ? error.name : 'unknown' })
          }
          if (!aborted) continue
          try {
            const tokens = big(
              await publicClient.readContract({
                address: coin['token'] as Hex,
                abi: monsterCoinAbi,
                functionName: 'balanceOf',
                args: [account.address]
              })
            )
            if (tokens > 0n) await send(account, 'claimRefund', [BigInt(roundId), coinId, tokens])
          } catch (error) {
            log('recycle: claimRefund skipped', { roundId, coinId, error: error instanceof Error ? error.name : 'unknown' })
          }
        }
        if (seeder === null) return
        const gasPrice = await publicClient.getGasPrice()
        const dust = 21_000n * gasPrice * 2n
        for (const wallet of wallets) {
          try {
            const balance = await publicClient.getBalance({ address: wallet.address })
            if (balance <= dust) continue
            const receipt = await options
              .walletFor(wallet)
              .sendTransactionSync({ account: wallet, to: seeder.address, value: balance - dust, gas: 21_000n })
            if (receipt.status !== 'success') throw new Error('sweep reverted')
          } catch (error) {
            log('recycle: sweep skipped', { error: error instanceof Error ? error.name : 'unknown' })
          }
        }
      } catch (error) {
        log('recycle failed, continuing', { roundId, error: error instanceof Error ? error.name : 'unknown' })
      }
    },
    async readDefaultConfig() {
      const set = await publicClient.readContract({ address: arena, abi: arenaAbi, functionName: 'defaultConfigSet' })
      if (set !== true) return null
      const config = record(await publicClient.readContract({ address: arena, abi: arenaAbi, functionName: 'getDefaultConfig' }))
      return {
        minCoins: Number(config['minCoins']),
        maxCoins: Number(config['maxCoins']),
        levelingEpochs: Number(config['levelingEpochs']),
        clashesPerEpoch: Number(config['clashesPerEpoch']),
        maxEntropyFee: big(config['maxEntropyFee']),
        keeperBounty: big(config['keeperBounty'])
      } satisfies DefaultRoundConfig
    },
    async createDefaultRound(value) {
      const creator = options.creator
      if (creator === null) throw new Error('creator key missing')
      await send(creator, 'createDefaultRound', [], value)
      return currentRoundId()
    },
    async fundTreasury(roundId, amount) {
      const creator = options.creator
      if (creator === null) throw new Error('creator key missing')
      await send(creator, 'fundTreasury', [BigInt(roundId)], amount)
    }
  }
}
