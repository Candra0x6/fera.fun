import { serve } from '@hono/node-server'
import { createArenaStore } from '@animal/shared'
import type { ChainFeed, FeedStatus } from '@animal/shared'
import { createApi } from './api'
import type { HealthBody } from './api'
import { resolveNearFeedFactory } from './feed'
import { followRounds, createSwitchableRelay } from './follow'
import { createKeeperLoop } from './loop'
import { bootRuntime } from './runtime'

const STALE_AFTER_SECONDS = 5

async function main(): Promise<void> {
  const { config, log, keeperTransport, port } = bootRuntime(process.env, ['keeperKey'])
  const createFeed = resolveNearFeedFactory()
  log.info(
    {
      keeperAccount: config.keeperAccountId,
      arena: config.arena,
      network: config.network,
      roundId: config.roundId,
      demoFast: config.demoFast
    },
    'keeper starting'
  )

  let store = createArenaStore()
  let feed: ChainFeed | null = null
  let boundRoundId: number | null = null
  let status: FeedStatus = { upstream: 'reconnecting', headBlock: 0, lagSeconds: 0 }
  const relay = createSwitchableRelay()
  const bindRound = (roundId: number): void => {
    feed?.stop()
    store = createArenaStore()
    status = { upstream: 'reconnecting', headBlock: 0, lagSeconds: 0 }
    const target = store
    const next = createFeed({
      rpcUrls: config.rpcUrls,
      arena: config.arena,
      roundId,
      pollMs: config.demoFast ? 500 : 1000
    })
    next.onSnapshot((snapshot) => target.hydrate(snapshot))
    next.onEnvelope((envelope) => target.apply(envelope))
    next.onCommit((commit) => target.commit(commit))
    next.onRetract((retract) => target.retract(retract))
    next.onStatus((value) => {
      if (feed === next) status = value
    })
    relay.bind(next)
    feed = next
    boundRoundId = roundId
    void next.start()
  }

  const health = (): HealthBody => {
    const round = store.getState().persisted.round
    return {
      roundId: boundRoundId,
      ok: store.getState().hydrated && status.lagSeconds <= STALE_AFTER_SECONDS,
      headBlock: status.headBlock,
      lagSeconds: status.lagSeconds,
      keeperAccount: keeperTransport.accountId,
      round: round === null ? null : { phase: round.phase, epoch: round.epoch, locked: round.locked }
    }
  }

  const app = createApi({ health, drip: null, allowedOrigin: config.allowedOrigin, relay })
  const server = serve({ fetch: app.fetch, port: config.port }, (info) => {
    log.info({ port: info.port }, 'api listening')
  })

  let stopping = false
  const shutdown = (signal: string): void => {
    if (stopping) return
    stopping = true
    log.info({ signal }, 'shutting down')
    feed?.stop()
    server.close()
  }
  process.on('SIGINT', () => shutdown('SIGINT'))
  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('unhandledRejection', (reason) => {
    log.error({ error: reason instanceof Error ? reason.message : String(reason) }, 'unhandled rejection')
  })

  const sleep = (ms: number): Promise<void> => new Promise<void>((resolve) => void setTimeout(resolve, ms))
  await followRounds({
    fixedRoundId: config.roundId,
    readCurrentRoundId: async () => Number(await keeperTransport.view('current_round_id', {})),
    bind: bindRound,
    runRound: (roundId, shouldStop) =>
      createKeeperLoop({
        port,
        roundId,
        maxClashes: config.clashMaxPerResolve,
        log,
        sleep,
        pollMs: config.demoFast ? 300 : 1000
      }).run(shouldStop),
    sleep,
    pollMs: config.demoFast ? 500 : 2000,
    shouldStop: () => stopping,
    log: (message, fields) => log.info(fields, message)
  })
  log.info({}, 'keeper stopped')
}

main().catch((error: unknown) => {
  process.stderr.write(`keeper failed to start: ${error instanceof Error ? error.message : 'unknown error'}\n`)
  process.exit(1)
})
