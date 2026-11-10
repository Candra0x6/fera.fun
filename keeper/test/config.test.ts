import { describe, expect, it } from 'vitest'
import { KeyPair } from 'near-api-js'
import { ConfigError, loadConfig, nearToYoctoAmount, secretsOf } from '../src/config'

const secret = (): string => KeyPair.fromRandom('ed25519').toString()

describe('loadConfig', () => {
  it('applies the documented defaults', () => {
    const config = loadConfig({})
    expect(config.network).toBe('testnet')
    expect(config.port).toBe(8787)
    expect(config.clashMaxPerResolve).toBe(255)
    expect(config.dripAmount).toBe(2n * 10n ** 24n)
    expect(config.demoFast).toBe(false)
    expect(config.rpcUrls).toEqual([
      'https://test.rpc.fastnear.com',
      'https://rpc.testnet.fastnear.com',
      'https://rpc.testnet.near.org'
    ])
    expect(config.arena).toBe('fera-arena.testnet')
    expect(config.keeperAccountId).toBe('fera-keeper.testnet')
    expect(config.dripAccountId).toBe('fera-drip.testnet')
    expect(config.seederAccountId).toBe('fera-seeder.testnet')
    expect(config.helperUrl).toBe('https://helper.nearprotocol.com')
    expect(config.houseGasBuffer).toBe(10n ** 23n)
    expect(config.keeperKey).toBeNull()
    expect(config.roundId).toBeNull()
  })

  it('reads every documented variable', () => {
    const keeper = secret()
    const config = loadConfig(
      {
        NEAR_NETWORK: 'testnet',
        NEAR_RPC_URLS: 'https://a.example.test, https://b.example.test',
        ARENA_ACCOUNT_ID: 'arena-x.testnet',
        KEEPER_ACCOUNT_ID: 'keeper-x.testnet',
        KEEPER_PRIVATE_KEY: keeper,
        ROUND_ID: '3',
        ALLOWED_ORIGIN: 'https://arena.example.test',
        PORT: '9000',
        CLASH_MAX_PER_RESOLVE: '4',
        DEMO_FAST: 'true',
        DRIP_AMOUNT_NEAR: '2.5',
        HELPER_URL: 'https://helper.example.test',
        HOUSE_GAS_BUFFER: '0.25'
      },
      ['keeperKey']
    )
    expect(config).toMatchObject({
      rpcUrls: ['https://a.example.test', 'https://b.example.test'],
      arena: 'arena-x.testnet',
      keeperAccountId: 'keeper-x.testnet',
      keeperKey: keeper,
      roundId: 3,
      allowedOrigin: 'https://arena.example.test',
      port: 9000,
      clashMaxPerResolve: 4,
      demoFast: true,
      dripAmount: 2_500_000_000_000_000_000_000_000n,
      helperUrl: 'https://helper.example.test',
      houseGasBuffer: 25n * 10n ** 22n
    })
  })

  it('reads the demo admin token and the house seed and scrubs them', () => {
    const config = loadConfig({ DEMO_ADMIN_TOKEN: 'tok-abcdefgh', HOUSE_SEED: 'house-seed-secret' })
    expect(config).toMatchObject({ demoAdminToken: 'tok-abcdefgh', houseSeed: 'house-seed-secret' })
    expect(secretsOf(config)).toEqual(expect.arrayContaining(['tok-abcdefgh', 'house-seed-secret']))
  })

  it('falls back to the deployments file for the arena account', () => {
    const config = loadConfig({}, [], { arena: 'fera-arena-2.testnet', deployHeight: 77 })
    expect(config.arena).toBe('fera-arena-2.testnet')
    expect(config.deployHeight).toBe(77)
    expect(loadConfig({ ARENA_ACCOUNT_ID: 'env.testnet' }, [], { arena: 'file.testnet' }).arena).toBe('env.testnet')
  })

  it('names the missing requirement without printing a value', () => {
    expect(() => loadConfig({}, ['keeperKey', 'dripKey'])).toThrow(/KEEPER_PRIVATE_KEY is required; DRIP_PRIVATE_KEY is required/)
    expect(() => loadConfig({}, ['seederKey'])).toThrow(ConfigError)
  })

  it('rejects malformed values and never echoes a secret in the error', () => {
    const bad = `ed25519:${'0'.repeat(60)}`
    let message = ''
    try {
      loadConfig({ KEEPER_PRIVATE_KEY: bad, PORT: 'abc', CLASH_MAX_PER_RESOLVE: '0' })
    } catch (error) {
      message = error instanceof Error ? error.message : ''
    }
    expect(message).toContain('KEEPER_PRIVATE_KEY')
    expect(message).toContain('PORT')
    expect(message).not.toContain(bad)
    expect(() => loadConfig({ CLASH_MAX_PER_RESOLVE: '300' })).toThrow(/between 1 and 255/)
    expect(() => loadConfig({ DRIP_AMOUNT_NEAR: '1.2.3' })).toThrow(ConfigError)
    expect(() => loadConfig({ ARENA_ACCOUNT_ID: 'NOT VALID' })).toThrow(ConfigError)
    expect(() => loadConfig({ NEAR_NETWORK: 'mainnet' })).toThrow(ConfigError)
  })

  it('lists the secrets to redact', () => {
    const keeper = secret()
    const seeder = secret()
    const config = loadConfig({ KEEPER_PRIVATE_KEY: keeper, SEEDER_PRIVATE_KEY: seeder, HOUSE_SEED: 'one two three four five six' })
    expect(secretsOf(config).sort()).toEqual([keeper, seeder, 'one two three four five six'].sort())
  })
})

describe('nearToYoctoAmount', () => {
  it('converts decimal NEAR to yocto exactly', () => {
    expect(nearToYoctoAmount('1')).toBe(10n ** 24n)
    expect(nearToYoctoAmount('0.000000000000000000000001')).toBe(1n)
    expect(nearToYoctoAmount('2.5')).toBe(25n * 10n ** 23n)
  })
})
