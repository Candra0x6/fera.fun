import { createPublicClient, createWalletClient, custom, decodeFunctionData, encodeFunctionResult, parseTransaction, toFunctionSelector } from 'viem'
import { generatePrivateKey, nonceManager, privateKeyToAccount } from 'viem/accounts'
import { describe, expect, it } from 'vitest'
import { arenaAbi, createMonadChain } from '@animal/shared'
import type { Hex } from '@animal/shared'
import { GAS_CEILING, GAS_FALLBACK, createViemArenaPort } from '../src/viemPort'

const ARENA: Hex = '0x5fbdb2315678afecb367f032d93f642f64180aa3'
const WEI = 10n ** 18n

interface Behaviour {
  estimate: 'ok' | 'revert' | 'fail'
  estimateUnits: bigint
  receiptStatus: '0x1' | '0x0'
}

function block(number: number, timestamp: number): Record<string, unknown> {
  return {
    number: `0x${number.toString(16)}`,
    hash: `0x${number.toString(16).padStart(64, '0')}`,
    parentHash: `0x${'0'.repeat(64)}`,
    timestamp: `0x${timestamp.toString(16)}`,
    baseFeePerGas: '0x174876e800',
    gasLimit: '0x8f0d180',
    gasUsed: '0x0',
    miner: `0x${'0'.repeat(40)}`,
    transactions: [],
    uncles: [],
    sha3Uncles: `0x${'0'.repeat(64)}`,
    logsBloom: `0x${'0'.repeat(512)}`,
    transactionsRoot: `0x${'0'.repeat(64)}`,
    stateRoot: `0x${'0'.repeat(64)}`,
    receiptsRoot: `0x${'0'.repeat(64)}`,
    difficulty: '0x0',
    totalDifficulty: '0x0',
    extraData: '0x',
    size: '0x1',
    nonce: '0x0000000000000000',
    mixHash: `0x${'0'.repeat(64)}`
  }
}

function setup(behaviour: Partial<Behaviour> = {}) {
  const b: Behaviour = { estimate: 'ok', estimateUnits: 100_000n, receiptStatus: '0x1', ...behaviour }
  const methods: string[] = []
  const rawTransactions: Hex[] = []
  let estimates = 0
  const account = privateKeyToAccount(generatePrivateKey(), { nonceManager })
  const chain = createMonadChain({ id: 31337, httpUrls: ['http://local'], wsUrls: [] })
  const transport = custom(
    {
    request: async ({ method, params }: { method: string; params?: unknown }) => {
      methods.push(method)
      const list = Array.isArray(params) ? params : []
      switch (method) {
        case 'eth_chainId':
          return '0x7a69'
        case 'eth_call': {
          const call = list[0] as { data: Hex }
          const decoded = decodeFunctionData({ abi: arenaAbi, data: call.data })
          if (decoded.functionName === 'getRound') {
            return encodeFunctionResult({
              abi: arenaAbi,
              functionName: 'getRound',
              result: {
                phase: 2,
                locked: true,
                epoch: 3,
                coinCount: 12,
                aliveCount: 9,
                cancelStreak: 1,
                winnerCoinId: 0,
                createdAt: 1000,
                startedAt: 1200,
                lockedAt: 1300,
                lastEpochResolvedAt: 1250,
                entropySeq: 77n,
                seed: `0x${'cd'.repeat(32)}`,
                prizePot: 5n * WEI,
                treasury: 33n * WEI,
                redeemPool: 0n,
                redeemSupply: 0n,
                clashesPlayed: 4
              }
            })
          }
          return encodeFunctionResult({
            abi: arenaAbi,
            functionName: 'getConfig',
            result: {
              maxCoins: 30, minCoins: 8, lobbySeconds: 120, levelingEpochs: 3, epochSeconds: 20, clashesPerEpoch: 6,
              seedTimeoutSeconds: 60, maxRoundSeconds: 3600, launchFee: WEI, minSeed: 2n * WEI, maxSeed: 50n * WEI,
              tradeFeeBps: 100, boostBps: 5000, consolationBps: 3000, potBps: 1500, treasuryBps: 500, consolationMode: 0,
              gammaBps: 8500, poolFactorMinBps: 1000, poolFactorMaxBps: 100000, levelBonusBps: 400, elementUpBps: 11500,
              elementDownBps: 8700, winProbMinBps: 1500, winProbMaxBps: 8500, huntWinPct: 50, keeperBounty: WEI / 5n,
              maxEntropyFee: WEI, vMon0: 20n * WEI, vTok0: 1_000_000_000n * WEI
            }
          })
        }
        case 'eth_getBlockByNumber':
          return block(16, 1_760_000_042)
        case 'eth_estimateGas': {
          estimates += 1
          if (b.estimate === 'revert') throw Object.assign(new Error('execution reverted'), { code: 3, data: '0x' })
          if (b.estimate === 'fail') throw Object.assign(new Error('upstream unavailable'), { code: -32000 })
          return `0x${b.estimateUnits.toString(16)}`
        }
        case 'eth_getTransactionCount':
          return '0x5'
        case 'eth_gasPrice':
          return '0x174876e800'
        case 'eth_maxPriorityFeePerGas':
          return '0x3b9aca00'
        case 'eth_blockNumber':
          return '0x10'
        case 'eth_sendRawTransactionSync': {
          rawTransactions.push(list[0] as Hex)
          return {
            transactionHash: `0x${'11'.repeat(32)}`,
            transactionIndex: '0x0',
            blockHash: `0x${'10'.padStart(64, '0')}`,
            blockNumber: '0x10',
            from: account.address,
            to: ARENA,
            cumulativeGasUsed: '0x5208',
            gasUsed: '0x4e20',
            effectiveGasPrice: '0x174876e800',
            logs: [],
            logsBloom: `0x${'0'.repeat(512)}`,
            status: b.receiptStatus,
            type: '0x2'
          }
        }
        default:
          throw new Error(`unexpected rpc method ${method}`)
      }
    }
    },
    { retryCount: 0 }
  )
  const publicClient = createPublicClient({ chain, transport })
  const walletClient = createWalletClient({ chain, transport, account })
  const port = createViemArenaPort({
    publicClient,
    walletClient,
    arena: ARENA,
    sleep: () => Promise.resolve()
  })
  return { port, methods, rawTransactions, estimates: () => estimates, account }
}

describe('viem arena port over a mocked transport', () => {
  it('reads the round and the immutable parameters', async () => {
    const { port } = setup()
    const round = await port.readRound(1)
    expect(round).toMatchObject({
      phase: 'Leveling',
      locked: true,
      epoch: 3,
      aliveCount: 9,
      cancelStreak: 1,
      lockedAt: 1300,
      lastEpochResolvedAt: 1250,
      entropySeq: 77n,
      treasury: 33n * WEI
    })
    expect(round.seed).toBe(`0x${'cd'.repeat(32)}`)
    expect(await port.readParams(1)).toEqual({
      minCoins: 8,
      maxCoins: 30,
      lobbySeconds: 120,
      levelingEpochs: 3,
      epochSeconds: 20,
      seedTimeoutSeconds: 60,
      maxRoundSeconds: 3600,
      clashesPerEpoch: 6,
      maxEntropyFee: WEI
    })
    expect(await port.latestTimestamp()).toBe(1_760_000_042)
  })

  it('sends with an explicit gas limit of estimateGas times 1.15 and reports the receipt', async () => {
    const { port, rawTransactions, account } = setup({ estimateUnits: 100_000n })
    const result = await port.send({ fn: 'lockEpoch', roundId: 1 })
    expect(result).toMatchObject({ kind: 'mined', status: 'success', gasUsed: 20_000n, gasLimit: 115_000n, blockTimestamp: 1_760_000_042 })
    expect(rawTransactions).toHaveLength(1)
    const tx = parseTransaction(rawTransactions[0] as Hex)
    expect(tx.gas).toBe(115_000n)
    expect(tx.to?.toLowerCase()).toBe(ARENA)
    expect(tx.data?.slice(0, 10)).toBe(toFunctionSelector('lockEpoch(uint64)'))
    expect(account.address).toMatch(/^0x/)
  })

  it('encodes resolveEpoch with the batch size', async () => {
    const { port, rawTransactions } = setup()
    await port.send({ fn: 'resolveEpoch', roundId: 1, maxClashes: 6 })
    const tx = parseTransaction(rawTransactions[0] as Hex)
    const decoded = decodeFunctionData({ abi: arenaAbi, data: tx.data as Hex })
    expect(decoded.functionName).toBe('resolveEpoch')
    expect(decoded.args).toEqual([1n, 6])
  })

  it('does not send anything when the estimate reverts, because a state guard refused the call', async () => {
    const { port, rawTransactions, estimates } = setup({ estimate: 'revert' })
    const result = await port.send({ fn: 'cancelEpoch', roundId: 1 })
    expect(result.kind).toBe('skipped')
    expect(rawTransactions).toHaveLength(0)
    expect(estimates()).toBe(1)
  })

  it('retries a failing estimate once and then falls back to the conservative default gas', async () => {
    const { port, rawTransactions, estimates } = setup({ estimate: 'fail' })
    const result = await port.send({ fn: 'startRound', roundId: 1 })
    expect(estimates()).toBe(2)
    expect(result).toMatchObject({ kind: 'mined', gasLimit: GAS_FALLBACK.startRound })
    expect(parseTransaction(rawTransactions[0] as Hex).gas).toBe(GAS_FALLBACK.startRound)
  })

  it('clamps the gas limit to the per-transaction ceiling', async () => {
    const { port } = setup({ estimateUnits: 29_000_000n })
    const result = await port.send({ fn: 'resolveEpoch', roundId: 1, maxClashes: 6 })
    expect(result).toMatchObject({ kind: 'mined', gasLimit: GAS_CEILING })
  })

  it('reports a reverted receipt', async () => {
    const { port } = setup({ receiptStatus: '0x0' })
    const result = await port.send({ fn: 'abortRound', roundId: 1 })
    expect(result).toMatchObject({ kind: 'mined', status: 'reverted' })
  })
})
