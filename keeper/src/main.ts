import { serve } from '@hono/node-server'
import { MULTICALL3_ADDRESS, GET_LOGS_MAX_RANGE, createArenaStore, createChainFeed } from '@animal/shared'
import type { ChainFeed, FeedStatus } from '@animal/shared'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { createApi } from './api'
import type { HealthBody } from './api'
import { createViemDripSender, managedAccount } from './clients'
import { createDemoAdmin } from './demo'
import { createViemDemoChain } from './demoChain'
import { createDripService } from './drip'
import { followRounds, createSwitchableRelay } from './follow'
import { createViemHouseChain, houseAccountFactory } from './houseChain'
import { createKeeperLoop } from './loop'
import { bootRuntime } from './runtime'
import { createViemArenaPort } from './viemPort'

const STALE_AFTER_SECONDS = 5

async function main(): Promise<void> {
  const rt = await bootRuntime(process.env, ['keeperKey', 'arena'])
  const { config, log, clients } = rt
  if (config.keeperKey === null) throw new Error('KEEPER_PRIVATE_KEY is required')
  const keeper = managedAccount(config.keeperKey)
  const keeperWallet = clients.walletFor(keeper)
  log.info(
    {
      keeperAddress: keeper.address,
      arena: config.arena,
      roundId: rt.roundId,
      chainId: rt.chainId,
      dripEnabled: config.dripKey !== null,
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
    const next = createChainFeed(
      {
        wsUrls: config.wsUrls,
        httpUrls: config.httpUrls,
        arena: config.arena,
        roundId,
        deployBlock: config.deployBlock,
        multicall3: MULTICALL3_ADDRESS,
        getLogsMaxRange: GET_LOGS_MAX_RANGE
      },
      {
        createWebSocket: (url) => new WebSocket(url),
        fetch: (url, init) => fetch(url, init),
        logger: (message, detail) => log.debug({ ...detail }, message)
      }
    )
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

  let drip = null
  if (config.dripKey !== null) {
    const dripAccount = managedAccount(config.dripKey)
    drip = createDripService({
      sender: createViemDripSender(clients.publicClient, clients.walletFor(dripAccount)),
      amount: config.dripAmount
    })
    log.info({ dripAddress: dripAccount.address, amountWei: config.dripAmount.toString() }, 'drip enabled')
  }

  const health = (): HealthBody => {
    const round = store.getState().persisted.round
    return {
      roundId: boundRoundId,
      ok: store.getState().hydrated && status.lagSeconds <= STALE_AFTER_SECONDS,
      headBlock: status.headBlock,
      lagSeconds: status.lagSeconds,
      keeperAddress: keeper.address,
      round: round === null ? null : { phase: round.phase, epoch: round.epoch, locked: round.locked }
    }
  }
  const arenaPort = createViemArenaPort({ publicClient: clients.publicClient, walletClient: keeperWallet, arena: config.arena })
  const seederAccount = config.seederKey === null ? null : managedAccount(config.seederKey)
  const creatorAccount = config.demoCreateKey === 'keeper' ? keeper : (seederAccount ?? keeper)
  const houses = houseAccountFactory(config.houseMnemonic, () => privateKeyToAccount(generatePrivateKey()))
  const demoLog = (message: string, fields?: Record<string, unknown>): void => log.info({ ...fields }, message)
  const demoChain = createViemDemoChain({
    publicClient: clients.publicClient,
    walletFor: clients.walletFor,
    arena: config.arena,
    creator: creatorAccount,
    seeder: seederAccount,
    houseAccount: houses.account,
    log: demoLog
  })
  const demo =
    config.demoAdminToken === null
      ? null
      : {
          token: config.demoAdminToken,
          admin: createDemoAdmin({
            port: arenaPort,
            chain: demoChain,
            houseChainFor: (roundId) =>
              createViemHouseChain({
                publicClient: clients.publicClient,
                walletFor: clients.walletFor,
                arena: config.arena,
                roundId,
                seeder: seederAccount ?? keeper,
                houseAccount: houses.account
              }),
            creatorAddress: creatorAccount.address,
            seederAddress: seederAccount?.address ?? null,
            lobbySeconds: config.lobbySeconds,
            houseGasBuffer: config.houseGasBuffer,
            log: demoLog
          })
        }
  log.info({ demoAdmin: demo !== null, creatorAddress: creatorAccount.address }, 'demo admin api')
  const app = createApi({ health, drip, allowedOrigin: config.allowedOrigin, relay, demo })
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
    readCurrentRoundId: () => demoChain.currentRoundId(),
    bind: bindRound,
    runRound: (roundId, shouldStop) =>
      createKeeperLoop({
        port: arenaPort,
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
