import { BaseError, ContractFunctionRevertedError, ExecutionRevertedError } from 'viem'
import type { Account, Chain, PublicClient, Transport, WalletClient } from 'viem'
import { arenaAbi } from '@animal/shared'
import type { Hex } from '@animal/shared'
import type { ArenaPort, KeeperCall, RoundParams, RoundPhase, RoundState, SendResult } from './port'

export const GAS_FALLBACK: Readonly<Record<KeeperCall['fn'], bigint>> = {
  startRound: 400_000n,
  lockEpoch: 640_000n,
  resolveEpoch: 1_870_000n,
  cancelEpoch: 200_000n,
  abortRound: 300_000n
}

export const GAS_CEILING = 30_000_000n
const PHASES: readonly RoundPhase[] = ['None', 'Lobby', 'Leveling', 'Knockout', 'Settled', 'Aborted']

export interface ViemPortOptions {
  publicClient: PublicClient<Transport, Chain>
  walletClient: WalletClient<Transport, Chain, Account>
  arena: Hex
  gasMultiplierPercent?: bigint
  estimateRetryDelayMs?: number
  sleep?: (ms: number) => Promise<void>
}

function record(value: unknown, what: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null) throw new TypeError(`${what} is not an object`)
  return Object.fromEntries(Object.entries(value))
}

function toBigInt(value: unknown): bigint {
  if (typeof value === 'bigint') return value
  if (typeof value === 'number') return BigInt(value)
  throw new TypeError('expected an integer')
}

export function isRevert(error: unknown): boolean {
  if (!(error instanceof BaseError)) return false
  return (
    error.walk((cause) => cause instanceof ContractFunctionRevertedError || cause instanceof ExecutionRevertedError) !==
    null
  )
}

export function revertReason(error: unknown): string {
  if (!(error instanceof BaseError)) return 'reverted'
  const found = error.walk((cause) => cause instanceof ContractFunctionRevertedError)
  if (found instanceof ContractFunctionRevertedError) return found.data?.errorName ?? found.reason ?? 'reverted'
  return error.shortMessage
}

export function createViemArenaPort(options: ViemPortOptions): ArenaPort {
  const { publicClient, walletClient, arena } = options
  const multiplier = options.gasMultiplierPercent ?? 115n
  const retryDelay = options.estimateRetryDelayMs ?? 300
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => void setTimeout(resolve, ms)))
  const account = walletClient.account

  function argsOf(call: KeeperCall): readonly unknown[] {
    if (call.fn === 'resolveEpoch') return [BigInt(call.roundId), call.maxClashes]
    return [BigInt(call.roundId)]
  }

  async function estimate(call: KeeperCall): Promise<{ gas: bigint } | { skipped: string }> {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const units = await publicClient.estimateContractGas({
          account,
          address: arena,
          abi: arenaAbi,
          functionName: call.fn,
          args: argsOf(call)
        })
        const padded = (units * multiplier + 99n) / 100n
        return { gas: padded > GAS_CEILING ? GAS_CEILING : padded }
      } catch (error) {
        if (isRevert(error)) return { skipped: revertReason(error) }
        if (attempt === 0) await sleep(retryDelay)
      }
    }
    return { gas: GAS_FALLBACK[call.fn] }
  }

  return {
    account: account.address,
    async readRound(roundId) {
      const result = record(
        await publicClient.readContract({ address: arena, abi: arenaAbi, functionName: 'getRound', args: [BigInt(roundId)] }),
        'round'
      )
      const phase = PHASES[Number(result['phase'])] ?? 'None'
      const seed = String(result['seed'])
      return {
        phase,
        locked: result['locked'] === true,
        epoch: Number(result['epoch']),
        coinCount: Number(result['coinCount']),
        aliveCount: Number(result['aliveCount']),
        cancelStreak: Number(result['cancelStreak']),
        createdAt: Number(result['createdAt']),
        startedAt: Number(result['startedAt']),
        lockedAt: Number(result['lockedAt']),
        lastEpochResolvedAt: Number(result['lastEpochResolvedAt']),
        entropySeq: toBigInt(result['entropySeq']),
        seed: seed as Hex,
        treasury: toBigInt(result['treasury'])
      } satisfies RoundState
    },
    async readParams(roundId) {
      const result = record(
        await publicClient.readContract({ address: arena, abi: arenaAbi, functionName: 'getConfig', args: [BigInt(roundId)] }),
        'config'
      )
      return {
        minCoins: Number(result['minCoins']),
        maxCoins: Number(result['maxCoins']),
        lobbySeconds: Number(result['lobbySeconds']),
        levelingEpochs: Number(result['levelingEpochs']),
        epochSeconds: Number(result['epochSeconds']),
        seedTimeoutSeconds: Number(result['seedTimeoutSeconds']),
        maxRoundSeconds: Number(result['maxRoundSeconds']),
        clashesPerEpoch: Number(result['clashesPerEpoch']),
        maxEntropyFee: toBigInt(result['maxEntropyFee'])
      } satisfies RoundParams
    },
    async readReserveFloor() {
      return toBigInt(await publicClient.readContract({ address: arena, abi: arenaAbi, functionName: 'reserveFloor' }))
    },
    async latestTimestamp() {
      const block = await publicClient.getBlock({ blockTag: 'latest' })
      return Number(block.timestamp)
    },
    async send(call): Promise<SendResult> {
      const planned = await estimate(call)
      if ('skipped' in planned) return { kind: 'skipped', reason: planned.skipped }
      const receipt = await walletClient.writeContractSync({
        account,
        address: arena,
        abi: arenaAbi,
        functionName: call.fn,
        args: argsOf(call),
        gas: planned.gas
      })
      let blockTimestamp = 0
      try {
        const block = await publicClient.getBlock({ blockNumber: receipt.blockNumber })
        blockTimestamp = Number(block.timestamp)
      } catch {
        blockTimestamp = 0
      }
      return {
        kind: 'mined',
        hash: receipt.transactionHash,
        status: receipt.status === 'success' ? 'success' : 'reverted',
        gasUsed: receipt.gasUsed,
        gasLimit: planned.gas,
        blockTimestamp
      }
    }
  }
}
