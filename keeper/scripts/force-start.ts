import { createViemArenaPort } from '../src/viemPort'
import { bootRuntime, managedAccount } from '../src/runtime'

async function main(): Promise<void> {
  const rt = await bootRuntime(process.env, ['keeperKey', 'arena'])
  const { config, log, clients } = rt
  if (config.keeperKey === null) throw new Error('KEEPER_PRIVATE_KEY is required')
  const port = createViemArenaPort({
    publicClient: clients.publicClient,
    walletClient: clients.walletFor(managedAccount(config.keeperKey)),
    arena: config.arena
  })
  const round = await port.readRound(rt.roundId)
  const params = await port.readParams(rt.roundId)
  if (round.phase !== 'Lobby') {
    log.warn({ phase: round.phase }, 'the round is not in the lobby, nothing to start')
    return
  }
  if (round.coinCount < params.minCoins) {
    throw new Error(`only ${round.coinCount} of ${params.minCoins} minimum coins are in the lobby`)
  }
  const result = await port.send({ fn: 'startRound', roundId: rt.roundId })
  if (result.kind === 'skipped') {
    const now = await port.latestTimestamp()
    const wait = Math.max(0, round.createdAt + params.lobbySeconds - now)
    log.warn(
      { reason: result.reason, secondsUntilLobbyDeadline: wait },
      'startRound was refused by the contract; it opens at maxCoins or after the lobby deadline'
    )
    process.exitCode = 1
    return
  }
  log.info({ txHash: result.hash, status: result.status }, 'startRound sent')
}

main().catch((error: unknown) => {
  process.stderr.write(`force-start failed: ${error instanceof Error ? error.message : 'unknown error'}\n`)
  process.exit(1)
})
