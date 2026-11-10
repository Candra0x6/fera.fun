import { z } from 'zod'
import type { KeyPairString } from 'near-api-js'
import { DEFAULT_TESTNET_RPC_URLS } from './nearTransport'

const secretKey = z.string().regex(/^ed25519:[1-9A-HJ-NP-Za-km-z]{80,90}$/, 'must be an ed25519 secret key')
const accountId = z.string().regex(/^[a-z0-9._-]{2,64}$/, 'must be a NEAR account id')
const wholeNumber = z.string().regex(/^\d+$/, 'must be a non-negative integer')
const decimalAmount = z.string().regex(/^\d+(\.\d{1,24})?$/, 'must be a decimal amount of NEAR')

const envSchema = z.object({
  NEAR_NETWORK: z.literal('testnet').optional(),
  NEAR_RPC_URLS: z.string().min(1).optional(),
  ARENA_ACCOUNT_ID: accountId.optional(),
  KEEPER_ACCOUNT_ID: accountId.optional(),
  KEEPER_PRIVATE_KEY: secretKey.optional(),
  DRIP_ACCOUNT_ID: accountId.optional(),
  DRIP_PRIVATE_KEY: secretKey.optional(),
  SEEDER_ACCOUNT_ID: accountId.optional(),
  SEEDER_PRIVATE_KEY: secretKey.optional(),
  HOUSE_SEED: z.string().min(8).optional(),
  HELPER_URL: z.url().optional(),
  DRIP_AMOUNT_NEAR: decimalAmount.optional(),
  ALLOWED_ORIGIN: z.string().min(1).optional(),
  PORT: wholeNumber.optional(),
  CLASH_MAX_PER_RESOLVE: wholeNumber.optional(),
  DEMO_FAST: z.string().optional(),
  DEMO_ADMIN_TOKEN: z.string().min(1).optional(),
  HOUSE_GAS_BUFFER: decimalAmount.optional(),
  ROUND_ID: wholeNumber.optional()
})

export interface Deployment {
  arena?: string
  deployHeight?: number
  gas?: Record<string, bigint>
}

export interface KeeperConfig {
  network: 'testnet'
  rpcUrls: string[]
  arena: string
  deployHeight: number
  roundId: number | null
  keeperAccountId: string
  keeperKey: KeyPairString | null
  dripAccountId: string
  dripKey: KeyPairString | null
  seederAccountId: string
  seederKey: KeyPairString | null
  houseSeed: string | null
  helperUrl: string
  dripAmount: bigint
  allowedOrigin: string | null
  port: number
  clashMaxPerResolve: number
  demoFast: boolean
  demoAdminToken: string | null
  houseGasBuffer: bigint
  gas: Record<string, bigint>
}

export class ConfigError extends Error {
  readonly problems: string[]

  constructor(problems: string[]) {
    super(`invalid configuration: ${problems.join('; ')}`)
    this.name = 'ConfigError'
    this.problems = problems
  }
}

export type Requirement = 'keeperKey' | 'dripKey' | 'seederKey'

const YOCTO_DECIMALS = 24

export function nearToYoctoAmount(text: string): bigint {
  const [whole = '0', fraction = ''] = text.split('.')
  return BigInt(whole) * 10n ** BigInt(YOCTO_DECIMALS) + BigInt(fraction.padEnd(YOCTO_DECIMALS, '0'))
}

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
  const keys: Record<Requirement, string | undefined> = {
    keeperKey: v.KEEPER_PRIVATE_KEY,
    dripKey: v.DRIP_PRIVATE_KEY,
    seederKey: v.SEEDER_PRIVATE_KEY
  }
  const names: Record<Requirement, string> = {
    keeperKey: 'KEEPER_PRIVATE_KEY',
    dripKey: 'DRIP_PRIVATE_KEY',
    seederKey: 'SEEDER_PRIVATE_KEY'
  }
  for (const need of required) {
    if (keys[need] === undefined) problems.push(`${names[need]} is required`)
  }
  const clash = v.CLASH_MAX_PER_RESOLVE === undefined ? 255 : Number(v.CLASH_MAX_PER_RESOLVE)
  if (clash < 1 || clash > 255) problems.push('CLASH_MAX_PER_RESOLVE: must be between 1 and 255')
  if (problems.length > 0) throw new ConfigError(problems)
  const asKey = (value: string | undefined): KeyPairString | null => (value === undefined ? null : (value as KeyPairString))
  const rpcUrls =
    v.NEAR_RPC_URLS === undefined
      ? [...DEFAULT_TESTNET_RPC_URLS]
      : v.NEAR_RPC_URLS.split(',').map((url) => url.trim()).filter((url) => url.length > 0)
  return {
    network: v.NEAR_NETWORK ?? 'testnet',
    rpcUrls,
    arena: v.ARENA_ACCOUNT_ID ?? deployment?.arena ?? 'fera-arena.testnet',
    deployHeight: deployment?.deployHeight ?? 0,
    roundId: v.ROUND_ID === undefined ? null : Number(v.ROUND_ID),
    keeperAccountId: v.KEEPER_ACCOUNT_ID ?? 'fera-keeper.testnet',
    keeperKey: asKey(v.KEEPER_PRIVATE_KEY),
    dripAccountId: v.DRIP_ACCOUNT_ID ?? 'fera-drip.testnet',
    dripKey: asKey(v.DRIP_PRIVATE_KEY),
    seederAccountId: v.SEEDER_ACCOUNT_ID ?? 'fera-seeder.testnet',
    seederKey: asKey(v.SEEDER_PRIVATE_KEY),
    houseSeed: v.HOUSE_SEED ?? null,
    helperUrl: v.HELPER_URL ?? 'https://helper.nearprotocol.com',
    dripAmount: nearToYoctoAmount(v.DRIP_AMOUNT_NEAR ?? '2'),
    allowedOrigin: v.ALLOWED_ORIGIN ?? null,
    port: v.PORT === undefined ? 8787 : Number(v.PORT),
    clashMaxPerResolve: clash,
    demoFast: truthy(v.DEMO_FAST),
    demoAdminToken: v.DEMO_ADMIN_TOKEN ?? null,
    houseGasBuffer: nearToYoctoAmount(v.HOUSE_GAS_BUFFER ?? '0.1'),
    gas: deployment?.gas ?? {}
  }
}

export function secretsOf(config: KeeperConfig): string[] {
  return [config.keeperKey, config.dripKey, config.seederKey, config.houseSeed, config.demoAdminToken].filter(
    (value): value is string => value !== null
  )
}
