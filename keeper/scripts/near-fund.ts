import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { Account, JsonRpcProvider, KeyPair, actions, nearToYocto, yoctoToNear } from 'near-api-js'
import type { KeyPairString } from 'near-api-js'
import { z } from 'zod'

const HELPER_URL = process.env['HELPER_URL'] ?? 'https://helper.nearprotocol.com'
const RPC_URL = process.env['NEAR_RPC_URL'] ?? 'https://test.rpc.fastnear.com'
const DIR = join(homedir(), '.config', 'animal-near')
const ARENA = 'fera-arena.testnet'
const DRIP = 'fera-drip.testnet'

const keyFile = z.object({ account_id: z.string(), public_key: z.string(), private_key: z.string() })

const provider = new JsonRpcProvider({ url: RPC_URL })

function pathOf(accountId: string): string {
  return join(DIR, `${accountId}.json`)
}

function loadKey(accountId: string): KeyPairString {
  const parsed = keyFile.parse(JSON.parse(readFileSync(pathOf(accountId), 'utf8')))
  return parsed.private_key as KeyPairString
}

async function exists(accountId: string): Promise<boolean> {
  try {
    await provider.viewAccount({ accountId, blockQuery: { finality: 'final' } })
    return true
  } catch {
    return false
  }
}

async function balance(accountId: string): Promise<string> {
  const state = await new Account(accountId, provider).getState()
  return yoctoToNear(state.balance.total, 4)
}

async function ensureThrowaway(accountId: string): Promise<void> {
  if (await exists(accountId)) {
    process.stdout.write(`${accountId} already exists\n`)
    return
  }
  if (!existsSync(pathOf(accountId))) {
    mkdirSync(DIR, { recursive: true, mode: 0o700 })
    const pair = KeyPair.fromRandom('ed25519')
    writeFileSync(
      pathOf(accountId),
      JSON.stringify({ account_id: accountId, public_key: pair.getPublicKey().toString(), private_key: pair.toString() }),
      { mode: 0o600 }
    )
    chmodSync(pathOf(accountId), 0o600)
  }
  const stored = keyFile.parse(JSON.parse(readFileSync(pathOf(accountId), 'utf8')))
  const response = await fetch(`${HELPER_URL}/account`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ newAccountId: accountId, newAccountPublicKey: stored.public_key })
  })
  process.stdout.write(
    `helper ${accountId} status=${response.status} ratelimit-remaining=${response.headers.get('x-ratelimit-remaining') ?? 'n/a'}\n`
  )
  if (!response.ok) throw new Error(`helper refused ${accountId}: ${response.status}`)
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (await exists(accountId)) return
    await new Promise<void>((resolve) => void setTimeout(resolve, 1000))
  }
  throw new Error(`${accountId} did not appear on chain`)
}

async function transfer(from: string, to: string, near: `${number}`): Promise<void> {
  const account = new Account(from, provider, loadKey(from))
  await account.signAndSendTransaction({
    receiverId: to,
    actions: [actions.transfer(nearToYocto(near))],
    waitUntil: 'EXECUTED_OPTIMISTIC'
  })
  process.stdout.write(`transferred ${near} NEAR ${from} -> ${to}\n`)
}

async function sweep(from: string, beneficiary: string): Promise<void> {
  const account = new Account(from, provider, loadKey(from))
  await account.signAndSendTransaction({
    receiverId: from,
    actions: [actions.deleteAccount(beneficiary)],
    waitUntil: 'EXECUTED_OPTIMISTIC'
  })
  process.stdout.write(`swept ${from} -> ${beneficiary}\n`)
}

async function main(): Promise<void> {
  const command = process.argv[2] ?? 'balances'
  if (command === 'fund') {
    for (const name of ['fera-fund1.testnet', 'fera-fund2.testnet', 'fera-fund3.testnet']) await ensureThrowaway(name)
    await sweep('fera-fund1.testnet', ARENA)
    await transfer('fera-fund2.testnet', ARENA, '5.1')
    await sweep('fera-fund2.testnet', DRIP)
    await sweep('fera-fund3.testnet', DRIP)
  }
  for (const name of [ARENA, DRIP, 'fera-keeper.testnet', 'fera-seeder.testnet']) {
    process.stdout.write(`${name} ${await balance(name)} NEAR\n`)
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`near-fund failed: ${error instanceof Error ? error.message : 'unknown error'}\n`)
  process.exit(1)
})
