import { createPublicClient, createWalletClient, fallback, http } from 'viem'
import type { Account, Chain, PublicClient, Transport, WalletClient } from 'viem'
import { nonceManager, privateKeyToAccount } from 'viem/accounts'
import { createMonadChain } from '@animal/shared'
import type { Hex } from '@animal/shared'
import type { DripSender } from './drip'
import type { KeeperConfig } from './config'

export type FetchFn = (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{
  ok: boolean
  json(): Promise<unknown>
}>

export async function detectChainId(httpUrl: string, fetchFn: FetchFn): Promise<number> {
  const response = await fetchFn(httpUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] })
  })
  if (!response.ok) throw new Error(`eth_chainId failed against ${httpUrl}`)
  const body: unknown = await response.json()
  const result = typeof body === 'object' && body !== null ? Object.fromEntries(Object.entries(body))['result'] : null
  if (typeof result !== 'string') throw new Error('eth_chainId returned no result')
  return Number.parseInt(result, 16)
}

export interface Clients {
  chain: Chain
  publicClient: PublicClient<Transport, Chain>
  walletFor(account: Account): WalletClient<Transport, Chain, Account>
}

export function buildClients(config: Pick<KeeperConfig, 'httpUrls' | 'wsUrls'>, chainId: number): Clients {
  const chain = createMonadChain({ id: chainId, httpUrls: config.httpUrls, wsUrls: config.wsUrls })
  const urls = config.httpUrls.map((url) => http(url, { batch: false, retryCount: 2 }))
  const transport: Transport = urls.length > 1 ? fallback(urls) : (urls[0] ?? http())
  const publicClient = createPublicClient({ chain, transport })
  return {
    chain,
    publicClient,
    walletFor: (account) => createWalletClient({ chain, transport, account })
  }
}

export function managedAccount(key: Hex): Account {
  return privateKeyToAccount(key, { nonceManager })
}

export function createViemDripSender(
  publicClient: PublicClient<Transport, Chain>,
  walletClient: WalletClient<Transport, Chain, Account>
): DripSender {
  return {
    address: walletClient.account.address,
    balance: () => publicClient.getBalance({ address: walletClient.account.address }),
    async send(to, amount) {
      const receipt = await walletClient.sendTransactionSync({ to, value: amount, gas: 21_000n })
      if (receipt.status !== 'success') throw new Error('drip transfer reverted')
      return receipt.transactionHash
    }
  }
}
