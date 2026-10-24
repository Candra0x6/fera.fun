import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { arenaAbi } from '@animal/shared'
import type { Hex } from '@animal/shared'
import { buildClients, detectChainId, managedAccount } from './clients'
import type { Clients } from './clients'
import { loadConfig, secretsOf } from './config'
import type { KeeperConfig, Requirement } from './config'
import { readDeployment } from './deployment'
import type { DeploymentFile } from './deployment'
import { createLogger } from './logger'
import type { KeeperLogger } from './logger'

export interface Runtime {
  config: KeeperConfig
  log: KeeperLogger
  chainId: number
  clients: Clients
  deployment: DeploymentFile | null
  roundId: number
}

export async function bootRuntime(
  env: Readonly<Record<string, string | undefined>>,
  required: readonly Requirement[]
): Promise<Runtime> {
  const first = loadConfig(
    env,
    required.filter((need) => need !== 'arena')
  )
  const chainId = await detectChainId(first.httpUrls[0] ?? '', (url, init) => fetch(url, init))
  const deployment = readDeployment(chainId)
  const config = loadConfig(env, required, deployment)
  const log = createLogger({ secrets: secretsOf(config) })
  const clients = buildClients(config, chainId)
  const roundId =
    config.roundId ??
    Number(
      await clients.publicClient.readContract({
        address: config.arena,
        abi: arenaAbi,
        functionName: 'currentRoundId'
      })
    )
  return { config, log, chainId, clients, deployment, roundId }
}

export function addressOfKey(key: Hex): Hex {
  return privateKeyToAccount(key).address
}

export { generatePrivateKey, managedAccount, privateKeyToAccount }
