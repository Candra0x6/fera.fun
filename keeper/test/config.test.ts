import { describe, expect, it } from 'vitest'
import { generatePrivateKey } from 'viem/accounts'
import { ConfigError, loadConfig, secretsOf } from '../src/config'

const ARENA = '0x5fbdb2315678afecb367f032d93f642f64180aa3'

describe('loadConfig', () => {
  it('applies the documented defaults', () => {
    const config = loadConfig({})
    expect(config.port).toBe(8787)
    expect(config.clashMaxPerResolve).toBe(255)
    expect(config.dripAmount).toBe(5n * 10n ** 18n)
    expect(config.demoFast).toBe(false)
    expect(config.httpUrls).toEqual(['https://testnet-rpc.monad.xyz', 'https://rpc-testnet.monadinfra.com'])
    expect(config.wsUrls[0]).toBe('wss://testnet-rpc.monad.xyz')
    expect(config.keeperKey).toBeNull()
    expect(config.roundId).toBeNull()
  })

  it('reads the demo admin variables and scrubs their secrets', () => {
    const owner = generatePrivateKey()
    const config = loadConfig({ DEMO_ADMIN_TOKEN: 'tok-abcdefgh', OWNER_PRIVATE_KEY: owner, LOBBY_SECONDS: '90', HOUSE_GAS_BUFFER: '0.05' })
    expect(config).toMatchObject({ demoAdminToken: 'tok-abcdefgh', ownerKey: owner, lobbySeconds: 90, houseGasBuffer: 5n * 10n ** 16n })
    expect(secretsOf(config)).toEqual(expect.arrayContaining([owner, 'tok-abcdefgh']))
    expect(config.demoCreateKey).toBe('seeder')
    expect(loadConfig({ DEMO_CREATE_KEY: 'keeper' }).demoCreateKey).toBe('keeper')
    expect(() => loadConfig({ DEMO_CREATE_KEY: 'owner' })).toThrow()
    const defaults = loadConfig({})
    expect(defaults).toMatchObject({ demoAdminToken: null, ownerKey: null, lobbySeconds: 3600, houseGasBuffer: 5n * 10n ** 17n })
  })

  it('reads every documented variable', () => {
    const keeper = generatePrivateKey()
    const config = loadConfig(
      {
        RPC_HTTP_URL: 'https://rpc.example.test',
        RPC_WS_URL: 'wss://rpc.example.test',
        ARENA_ADDRESS: ARENA,
        DEPLOY_BLOCK: '1234',
        ROUND_ID: '3',
        KEEPER_PRIVATE_KEY: keeper,
        ALLOWED_ORIGIN: 'https://arena.example.test',
        PORT: '9000',
        CLASH_MAX_PER_RESOLVE: '4',
        DEMO_FAST: 'true',
        DRIP_AMOUNT_MON: '2.5'
      },
      ['keeperKey', 'arena']
    )
    expect(config).toMatchObject({
      httpUrls: ['https://rpc.example.test'],
      wsUrls: ['wss://rpc.example.test'],
      arena: ARENA,
      deployBlock: 1234,
      roundId: 3,
      keeperKey: keeper,
      allowedOrigin: 'https://arena.example.test',
      port: 9000,
      clashMaxPerResolve: 4,
      demoFast: true,
      dripAmount: 2_500_000_000_000_000_000n
    })
  })

  it('falls back to the deployments file for the arena address', () => {
    const config = loadConfig({}, ['arena'], { arena: ARENA, deployBlock: 77 })
    expect(config.arena).toBe(ARENA)
    expect(config.deployBlock).toBe(77)
  })

  it('names the missing requirement without printing a value', () => {
    expect(() => loadConfig({}, ['keeperKey', 'arena'])).toThrow(/KEEPER_PRIVATE_KEY is required; ARENA_ADDRESS is required/)
    expect(() => loadConfig({}, ['seederKey'])).toThrow(ConfigError)
  })

  it('rejects malformed values and never echoes a secret in the error', () => {
    const bad = `0x${'z'.repeat(64)}`
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
    expect(() => loadConfig({ DRIP_AMOUNT_MON: '1.2.3' })).toThrow(ConfigError)
    expect(() => loadConfig({ ARENA_ADDRESS: 'nope' })).toThrow(ConfigError)
  })

  it('lists the secrets to redact', () => {
    const keeper = generatePrivateKey()
    const seeder = generatePrivateKey()
    const config = loadConfig({ KEEPER_PRIVATE_KEY: keeper, SEEDER_PRIVATE_KEY: seeder, HOUSE_MNEMONIC: 'one two three four five six seven eight nine ten eleven twelve' })
    expect(secretsOf(config).sort()).toEqual([keeper, seeder, 'one two three four five six seven eight nine ten eleven twelve'].sort())
  })
})
