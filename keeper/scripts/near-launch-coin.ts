import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { z } from 'zod'
import type { KeyPairString } from 'near-api-js'
import { createNearTransport, DEFAULT_TESTNET_RPC_URLS } from '../src/nearTransport'
import { TGAS } from '../src/nearPort'

const keyFile = z.object({ private_key: z.string() })

async function main(): Promise<void> {
  const [accountId, ticker, name, roundText] = process.argv.slice(2)
  if (accountId === undefined || ticker === undefined || name === undefined) throw new Error('usage: accountId ticker name [roundId]')
  const file = keyFile.parse(JSON.parse(readFileSync(join(homedir(), '.config', 'animal-near', `${accountId}.json`), 'utf8')))
  const transport = createNearTransport({
    rpcUrls: DEFAULT_TESTNET_RPC_URLS,
    arena: 'fera-arena.testnet',
    accountId,
    privateKey: file.private_key as KeyPairString
  })
  const roundId = roundText === undefined ? Number(await transport.view('current_round_id', {})) : Number(roundText)
  const result = await transport.call(
    'launch_coin',
    { round_id: roundId, name, ticker, monster_type: 2, skin_id: 0 },
    30n * TGAS,
    200_000_000_000_000_000_000_000n
  )
  process.stdout.write(`${result.kind} ${result.hash}${result.kind === 'failure' ? ` ${result.message.slice(0, 200)}` : ''}\n`)
}

main().catch((error: unknown) => {
  process.stderr.write(`launch failed: ${error instanceof Error ? error.message : 'unknown error'}\n`)
  process.exit(1)
})
