import { randomBytes } from 'node:crypto'
import { parseAbi } from 'viem'
import { arenaAbi } from '@animal/shared'
import type { Hex } from '@animal/shared'
import { seedArrived } from '../src/port'
import { createViemArenaPort } from '../src/viemPort'
import { bootRuntime, managedAccount } from '../src/runtime'

const mockSeedAbi = parseAbi(['function deliver(uint64 id, bytes32 seed)'])

async function main(): Promise<void> {
  const rt = await bootRuntime(process.env, ['seederKey', 'arena'])
  const { config, log, clients } = rt
  if (config.seederKey === null) throw new Error('SEEDER_PRIVATE_KEY is required')
  const source = rt.deployment?.seedSource
  if (source === undefined) throw new Error('deployments file has no seedSource for this chain')
  const account = managedAccount(config.seederKey)
  const wallet = clients.walletFor(account)
  const reader = createViemArenaPort({ publicClient: clients.publicClient, walletClient: wallet, arena: config.arena })
  log.info({ seedSource: source, delivering: 'mock seeds for local rehearsal only' }, 'mock seed delivery started')
  let lastDelivered = 0n
  for (;;) {
    const roundId =
      rt.config.roundId ??
      Number(await clients.publicClient.readContract({ address: config.arena, abi: arenaAbi, functionName: 'currentRoundId' }))
    if (roundId === 0) {
      await new Promise<void>((resolve) => void setTimeout(resolve, 400))
      continue
    }
    const round = await reader.readRound(roundId)
    if (round.phase === 'Settled' || round.phase === 'Aborted') {
      if (rt.config.roundId !== null) break
      lastDelivered = 0n
    } else if (round.locked && !seedArrived(round) && round.entropySeq > lastDelivered) {
      const seed = `0x${randomBytes(32).toString('hex')}` as Hex
      const args = [round.entropySeq, seed] as const
      const gas = await clients.publicClient.estimateContractGas({
        account,
        address: source,
        abi: mockSeedAbi,
        functionName: 'deliver',
        args
      })
      const receipt = await wallet.writeContractSync({
        account,
        address: source,
        abi: mockSeedAbi,
        functionName: 'deliver',
        args,
        gas: (gas * 115n) / 100n
      })
      lastDelivered = round.entropySeq
      log.info({ entropySeq: round.entropySeq.toString(), txHash: receipt.transactionHash }, 'mock seed delivered')
    }
    await new Promise<void>((resolve) => void setTimeout(resolve, 400))
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`deliver-mock-seed failed: ${error instanceof Error ? error.message : 'unknown error'}\n`)
  process.exit(1)
})
