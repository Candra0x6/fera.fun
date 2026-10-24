import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { parseEther } from 'viem'
import { parseHouseCoins } from '@animal/shared'
import type { HouseCoinEntry } from '@animal/shared'
import { houseAccountFactory, createViemHouseChain } from '../src/houseChain'
import { HOUSE_ROSTER, runSeedHouse } from '../src/house'
import { REPO_ROOT } from '../src/deployment'
import { bootRuntime, managedAccount } from '../src/runtime'

async function main(): Promise<void> {
  const rt = await bootRuntime(process.env, ['seederKey', 'arena'])
  const { config, log, clients } = rt
  if (config.seederKey === null) throw new Error('SEEDER_PRIVATE_KEY is required')
  const houses = houseAccountFactory(config.houseMnemonic, () => privateKeyToAccount(generatePrivateKey()))
  if (houses.ephemeral) {
    log.warn(
      {},
      'HOUSE_MNEMONIC is not set: house wallets are ephemeral, held in memory only, and their creator seeds are not reclaimable'
    )
  }
  const chain = createViemHouseChain({
    publicClient: clients.publicClient,
    walletFor: clients.walletFor,
    arena: config.arena,
    roundId: rt.roundId,
    seeder: managedAccount(config.seederKey),
    houseAccount: houses.account
  })
  const result = await runSeedHouse({
    chain,
    roundId: rt.roundId,
    roster: HOUSE_ROSTER.slice(0, Number(process.env['HOUSE_COUNT'] ?? HOUSE_ROSTER.length)),
    gasBuffer: parseEther(process.env['HOUSE_GAS_BUFFER'] ?? '0.5'),
    log: (message, fields) => log.info({ ...fields }, message)
  })
  const target = join(REPO_ROOT, 'shared', 'house-coins.json')
  let previous: HouseCoinEntry[] = []
  try {
    previous = parseHouseCoins(JSON.parse(readFileSync(target, 'utf8')))
  } catch {
    previous = []
  }
  const kept = previous.filter((entry) => entry.roundId !== rt.roundId)
  const merged = [...kept, ...result.entries].sort((a, b) => a.roundId - b.roundId || a.coinId - b.coinId)
  writeFileSync(target, `${JSON.stringify(merged, null, 2)}\n`)
  log.info(
    { launched: result.launched, skipped: result.skipped, houseCoins: result.entries.length },
    'house roster seeded, public addresses written to shared/house-coins.json'
  )
}

main().catch((error: unknown) => {
  process.stderr.write(`seed-house failed: ${error instanceof Error ? error.message : 'unknown error'}\n`)
  process.exit(1)
})
