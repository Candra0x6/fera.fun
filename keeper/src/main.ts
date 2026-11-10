import { serve } from '@hono/node-server'
import { createArenaStore, createNearFeed, decodeSnapshot, houseTokenSet } from '@animal/shared'
import type { ChainFeed, FeedStatus } from '@animal/shared'
import { createApi } from './api'
import type { DripHandler } from './api'
import type { HealthBody } from './api'
import { createDemoAdmin } from './demo'
import { createNearDemoChain } from './demoChain'
import { createDripService } from './drip'
import { followRounds, createSwitchableRelay } from './follow'
import { createHelperClient } from './helper'
import { createNearHouseChain } from './houseChain'
import { houseAccountId, houseSecretKey } from './houseKeys'
import { createKeeperLoop } from './loop'
import { createNearAccounts } from './nearAccounts'
import type { NearTransport } from './nearPort'
import { createNearTransport } from './nearTransport'
import { bootRuntime } from './runtime'
import { runSnapshotRefresh } from './snapshotRefresh'

const STALE_AFTER_SECONDS = 5
const SNAPSHOT_REFRESH_MS = 4000

async function main(): Promise<void> {
  const { config, log, keeperTransport, port } = bootRuntime(process.env, ['keeperKey'])
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
    const next = createNearFeed({
      rpcUrls: config.rpcUrls,
      arena: config.arena,
      roundId,
      pollMs: config.demoFast ? 500 : 1500
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

  let drip: DripHandler | null = null
  if (config.dripKey !== null) {
    drip = createDripService({
      accounts: createNearAccounts({ rpcUrls: config.rpcUrls, accountId: config.dripAccountId, privateKey: config.dripKey }),
      helper: createHelperClient({ url: config.helperUrl }),
      amount: config.dripAmount,
      onError: (stage, error) => log.warn({ stage, error: error instanceof Error ? error.message.slice(0, 200) : 'unknown' }, 'drip failed')
    })
    log.info({ dripAccount: config.dripAccountId, amountYocto: config.dripAmount.toString() }, 'drip enabled')
  }

  const demoLog = (message: string, fields?: Record<string, unknown>): void => log.info({ ...fields }, message)
  const houseSeed = config.houseSeed
  let demo: { token: string; admin: ReturnType<typeof createDemoAdmin> } | null = null
  if (config.demoAdminToken !== null && config.seederKey !== null) {
    const seederKey = config.seederKey
    const seederAccounts = createNearAccounts({ rpcUrls: config.rpcUrls, accountId: config.seederAccountId, privateKey: seederKey })
    const seederTransport = createNearTransport({
      rpcUrls: config.rpcUrls,
      arena: config.arena,
      accountId: config.seederAccountId,
      privateKey: seederKey
    })
    const houseTransports = new Map<number, NearTransport>()
    const transportFor = (walletIndex: number): NearTransport => {
      if (houseSeed === null) throw new Error('HOUSE_SEED is required')
      const cached = houseTransports.get(walletIndex)
      if (cached !== undefined) return cached
      const created = createNearTransport({
        rpcUrls: config.rpcUrls,
        arena: config.arena,
        accountId: houseAccountId(walletIndex, config.seederAccountId),
        privateKey: houseSecretKey(houseSeed, walletIndex)
      })
      houseTransports.set(walletIndex, created)
      return created
    }
    demo = {
      token: config.demoAdminToken,
      admin: createDemoAdmin({
        port,
        chain: createNearDemoChain({ transport: seederTransport, accounts: seederAccounts }),
        houseChainFor: (roundId) =>
          houseSeed === null
            ? null
            : createNearHouseChain({
                roundId,
                arenaView: (method, args) => seederTransport.view(method, args),
                seederAccounts,
                houseSeed,
                transportFor
              }),
        creatorAccountId: config.seederAccountId,
        seederAccountId: config.seederAccountId,
        houseGasBuffer: config.houseGasBuffer,
        log: demoLog
      })
    }
  }
  log.info({ demoAdmin: demo !== null, houseSeed: houseSeed !== null }, 'demo admin api')

  const app = createApi({ health, drip, allowedOrigins: config.allowedOrigins, relay, demo })
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
  void runSnapshotRefresh({
    boundRound: () => boundRoundId,
    read: async (roundId) =>
      decodeSnapshot(await keeperTransport.view('get_arena_snapshot', { round_id: roundId }), houseTokenSet()),
    rebase: (snapshot) => relay.rebase(snapshot),
    intervalMs: SNAPSHOT_REFRESH_MS,
    sleep,
    shouldStop: () => stopping,
    onError: (error) => log.debug({ error: error instanceof Error ? error.message.slice(0, 160) : 'unknown' }, 'snapshot refresh failed')
  })
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
        pollMs: config.demoFast ? 600 : 1000
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
