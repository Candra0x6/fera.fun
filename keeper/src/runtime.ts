import { loadConfig, secretsOf } from './config'
import type { KeeperConfig, Requirement } from './config'
import { readDeployment } from './deployment'
import { createLogger } from './logger'
import type { KeeperLogger } from './logger'
import { createNearArenaPort } from './nearPort'
import type { GasTable, NearTransport } from './nearPort'
import { createNearTransport } from './nearTransport'
import type { ArenaPort } from './port'

export interface Runtime {
  config: KeeperConfig
  log: KeeperLogger
  keeperTransport: NearTransport
  port: ArenaPort
}

export function keeperGas(gas: Readonly<Record<string, bigint>>): Partial<GasTable> {
  const mapped: Partial<Record<keyof GasTable, bigint | undefined>> = {
    startRound: gas['start_round'],
    lockEpoch: gas['lock_epoch'],
    resolveEpoch: gas['resolve_epoch'],
    abortRound: gas['abort_round']
  }
  return Object.fromEntries(Object.entries(mapped).filter(([, value]) => value !== undefined))
}

export function bootRuntime(env: Readonly<Record<string, string | undefined>>, required: readonly Requirement[]): Runtime {
  const first = loadConfig(env, [])
  const deployment = readDeployment(first.network)
  const config = loadConfig(env, required, deployment)
  const log = createLogger({ secrets: secretsOf(config) })
  if (config.keeperKey === null) throw new Error('KEEPER_PRIVATE_KEY is required')
  const keeperTransport = createNearTransport({
    rpcUrls: config.rpcUrls,
    arena: config.arena,
    accountId: config.keeperAccountId,
    privateKey: config.keeperKey
  })
  return { config, log, keeperTransport, port: createNearArenaPort({ transport: keeperTransport, gas: keeperGas(config.gas) }) }
}
