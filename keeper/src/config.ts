import { isAddress, parseEther } from 'viem'
import { z } from 'zod'
import { MONAD_TESTNET_HTTP_URLS, MONAD_TESTNET_WS_URLS } from '@animal/shared'
import type { Hex } from '@animal/shared'

const privateKey = z.string().regex(/^0x[0-9a-fA-F]{64}$/, 'must be a 32-byte hex string')
const address = z.string().refine((value) => isAddress(value, { strict: false }), 'must be an address')
const wholeNumber = z.string().regex(/^\d+$/, 'must be a non-negative integer')
const decimalAmount = z.string().regex(/^\d+(\.\d{1,18})?$/, 'must be a decimal amount of MON')

const envSchema = z.object({
  RPC_HTTP_URL: z.url().optional(),
  RPC_WS_URL: z.string().regex(/^wss?:\/\//, 'must be a ws or wss url').optional(),
  ARENA_ADDRESS: address.optional(),
  DEPLOY_BLOCK: wholeNumber.optional(),
  ROUND_ID: wholeNumber.optional(),
  KEEPER_PRIVATE_KEY: privateKey.optional(),
  DRIP_PRIVATE_KEY: privateKey.optional(),
  SEEDER_PRIVATE_KEY: privateKey.optional(),
  HOUSE_MNEMONIC: z.string().min(1).optional(),
  ALLOWED_ORIGIN: z.string().min(1).optional(),
  PORT: wholeNumber.optional(),
  CLASH_MAX_PER_RESOLVE: wholeNumber.optional(),
  DEMO_FAST: z.string().optional(),
  DRIP_AMOUNT_MON: decimalAmount.optional(),
  DEMO_ADMIN_TOKEN: z.string().min(1).optional(),
  OWNER_PRIVATE_KEY: privateKey.optional(),
  DEMO_CREATE_KEY: z.enum(['seeder', 'keeper']).optional(),
  LOBBY_SECONDS: wholeNumber.optional(),
  HOUSE_GAS_BUFFER: decimalAmount.optional()
})

export interface Deployment {
  arena?: string
  deployBlock?: number
}

export interface KeeperConfig {
  httpUrls: string[]
  wsUrls: string[]
  arena: Hex
  deployBlock: number
  roundId: number | null
  keeperKey: Hex | null
  dripKey: Hex | null
  seederKey: Hex | null
  houseMnemonic: string | null
  allowedOrigin: string | null
  port: number
  clashMaxPerResolve: number
  demoFast: boolean
  dripAmount: bigint
  demoAdminToken: string | null
  ownerKey: Hex | null
  demoCreateKey: 'seeder' | 'keeper'
  lobbySeconds: number
  houseGasBuffer: bigint
}

export class ConfigError extends Error {
  readonly problems: string[]

  constructor(problems: string[]) {
    super(`invalid configuration: ${problems.join('; ')}`)
    this.name = 'ConfigError'
    this.problems = problems
  }
}

export type Requirement = 'keeperKey' | 'dripKey' | 'seederKey' | 'arena'

function truthy(value: string | undefined): boolean {
  return value !== undefined && ['1', 'true', 'yes', 'on'].includes(value.toLowerCase())
}

export function loadConfig(
  env: Readonly<Record<string, string | undefined>>,
  required: readonly Requirement[] = [],
  deployment: Deployment | null = null
): KeeperConfig {
  const picked = Object.fromEntries(
    Object.keys(envSchema.shape).flatMap((name) => {
      const value = env[name]
      return value === undefined || value === '' ? [] : [[name, value]]
    })
  )
  const parsed = envSchema.safeParse(picked)
  if (!parsed.success) {
    throw new ConfigError(parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`))
  }
  const v = parsed.data
  const problems: string[] = []
  const arenaText = v.ARENA_ADDRESS ?? deployment?.arena
  const keys: Record<Exclude<Requirement, 'arena'>, string | undefined> = {
    keeperKey: v.KEEPER_PRIVATE_KEY,
    dripKey: v.DRIP_PRIVATE_KEY,
    seederKey: v.SEEDER_PRIVATE_KEY
  }
  const names: Record<Requirement, string> = {
    keeperKey: 'KEEPER_PRIVATE_KEY',
    dripKey: 'DRIP_PRIVATE_KEY',
    seederKey: 'SEEDER_PRIVATE_KEY',
    arena: 'ARENA_ADDRESS'
  }
  for (const need of required) {
    const present = need === 'arena' ? arenaText !== undefined : keys[need] !== undefined
    if (!present) problems.push(`${names[need]} is required`)
  }
  const clash = v.CLASH_MAX_PER_RESOLVE === undefined ? 255 : Number(v.CLASH_MAX_PER_RESOLVE)
  if (clash < 1 || clash > 255) problems.push('CLASH_MAX_PER_RESOLVE: must be between 1 and 255')
  const lobbySeconds = v.LOBBY_SECONDS === undefined ? 3600 : Number(v.LOBBY_SECONDS)
  if (lobbySeconds < 1 || lobbySeconds > 4_294_967_295) problems.push('LOBBY_SECONDS: must be between 1 and 4294967295')
  if (problems.length > 0) throw new ConfigError(problems)
  const asKey = (value: string | undefined): Hex | null => (value === undefined ? null : (value as Hex))
  const httpUrls = v.RPC_HTTP_URL === undefined ? [...MONAD_TESTNET_HTTP_URLS] : [v.RPC_HTTP_URL]
  const wsUrls = v.RPC_WS_URL === undefined ? [...MONAD_TESTNET_WS_URLS] : [v.RPC_WS_URL]
  return {
    httpUrls,
    wsUrls,
    arena: (arenaText ?? '0x0000000000000000000000000000000000000000') as Hex,
    deployBlock: v.DEPLOY_BLOCK !== undefined ? Number(v.DEPLOY_BLOCK) : (deployment?.deployBlock ?? 0),
    roundId: v.ROUND_ID === undefined ? null : Number(v.ROUND_ID),
    keeperKey: asKey(v.KEEPER_PRIVATE_KEY),
    dripKey: asKey(v.DRIP_PRIVATE_KEY),
    seederKey: asKey(v.SEEDER_PRIVATE_KEY),
    houseMnemonic: v.HOUSE_MNEMONIC ?? null,
    allowedOrigin: v.ALLOWED_ORIGIN ?? null,
    port: v.PORT === undefined ? 8787 : Number(v.PORT),
    clashMaxPerResolve: clash,
    demoFast: truthy(v.DEMO_FAST),
    dripAmount: parseEther(v.DRIP_AMOUNT_MON ?? '5'),
    demoAdminToken: v.DEMO_ADMIN_TOKEN ?? null,
    ownerKey: asKey(v.OWNER_PRIVATE_KEY),
    demoCreateKey: v.DEMO_CREATE_KEY ?? 'seeder',
    lobbySeconds: lobbySeconds,
    houseGasBuffer: parseEther(v.HOUSE_GAS_BUFFER ?? '0.5')
  }
}

export function secretsOf(config: KeeperConfig): string[] {
  return [
    config.keeperKey,
    config.dripKey,
    config.seederKey,
    config.ownerKey,
    config.houseMnemonic,
    config.demoAdminToken
  ].filter(
    (value): value is string => value !== null
  )
}
