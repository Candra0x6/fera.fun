import { arenaAbi } from '@animal/shared'
import { createWalletClient, custom, fallback, http, toHex } from 'viem'
import type { Hex } from 'viem'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { arenaAddress, chain, publicClient } from './contract'
import { describeError } from './errors'
import { config, replayMode } from './session'
import { createStore } from './store'
import { pushToast, updateToast } from './toasts'
import { createTxQueue } from './txQueue'

export interface Eip1193Provider {
  request(args: { method: string; params?: unknown }): Promise<unknown>
  on?(event: string, listener: (...args: unknown[]) => void): void
}

export interface DiscoveredWallet {
  uuid: string
  name: string
  icon: string
  rdns: string
  provider: Eip1193Provider
}

export type WalletKind = 'burner' | 'injected'

export interface WalletState {
  status: 'disconnected' | 'connecting' | 'connected'
  kind: WalletKind | null
  address: Hex | null
  chainId: number | null
  balance: bigint | null
  providers: DiscoveredWallet[]
  dripping: boolean
}

export const BURNER_STORAGE_KEY = 'monster-arena.burner'
export const LOW_BALANCE_WEI = 10n * 10n ** 18n
export const BLOCK_MS = 300
const MIN_GAP_BLOCKS = 4

export const walletStore = createStore<WalletState>({
  status: 'disconnected',
  kind: null,
  address: null,
  chainId: null,
  balance: null,
  providers: [],
  dripping: false
})

let injected: Eip1193Provider | null = null
let burnerKey: Hex | null = null
let balanceTimer = 0

const queue = createTxQueue({
  minGapMs: MIN_GAP_BLOCKS * BLOCK_MS,
  lowBalanceWei: LOW_BALANCE_WEI,
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => window.setTimeout(resolve, ms))
})

function isHexKey(value: string | null): value is Hex {
  return value !== null && /^0x[0-9a-fA-F]{64}$/.test(value)
}

export function discoverWallets(): () => void {
  const onAnnounce = (event: Event): void => {
    const detail = (event as CustomEvent<{ info: Omit<DiscoveredWallet, 'provider'>; provider: Eip1193Provider }>).detail
    if (!detail) return
    walletStore.set((previous) =>
      previous.providers.some((wallet) => wallet.uuid === detail.info.uuid)
        ? previous
        : { ...previous, providers: [...previous.providers, { ...detail.info, provider: detail.provider }] }
    )
  }
  window.addEventListener('eip6963:announceProvider', onAnnounce)
  window.dispatchEvent(new Event('eip6963:requestProvider'))
  return () => window.removeEventListener('eip6963:announceProvider', onAnnounce)
}

export async function refreshBalance(): Promise<void> {
  const { address } = walletStore.get()
  if (address === null) return
  try {
    const balance = await publicClient.getBalance({ address })
    walletStore.set((previous) => (previous.address === address ? { ...previous, balance } : previous))
  } catch {
    return
  }
}

function startBalancePolling(): void {
  window.clearInterval(balanceTimer)
  void refreshBalance()
  balanceTimer = window.setInterval(() => void refreshBalance(), 3000)
}

export async function requestDrip(): Promise<void> {
  const { address } = walletStore.get()
  if (address === null || config.keeperUrl === null) {
    pushToast('failed', 'Faucet unavailable', 'No keeper URL is configured')
    return
  }
  walletStore.set((previous) => ({ ...previous, dripping: true }))
  const toast = pushToast('pending', 'Requesting test MON')
  try {
    const response = await fetch(`${config.keeperUrl}/drip`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ address })
    })
    const body = (await response.json()) as { txHash?: string; error?: string; retryAfterSeconds?: number }
    if (!response.ok) {
      const wait = body.retryAfterSeconds === undefined ? '' : ` Try again in ${body.retryAfterSeconds}s.`
      updateToast(toast, 'failed', 'Faucet refused', `${body.error ?? 'request failed'}.${wait}`, null)
    } else {
      updateToast(toast, 'confirmed', 'Test MON sent', null, body.txHash ?? null)
      window.setTimeout(() => void refreshBalance(), 1500)
    }
  } catch (error) {
    updateToast(toast, 'failed', 'Faucet unreachable', describeError(error), null)
  } finally {
    walletStore.set((previous) => ({ ...previous, dripping: false }))
  }
}

export async function connectBurner(): Promise<void> {
  walletStore.set((previous) => ({ ...previous, status: 'connecting' }))
  const stored = window.localStorage.getItem(BURNER_STORAGE_KEY)
  burnerKey = isHexKey(stored) ? stored : generatePrivateKey()
  window.localStorage.setItem(BURNER_STORAGE_KEY, burnerKey)
  injected = null
  const account = privateKeyToAccount(burnerKey)
  walletStore.set((previous) => ({
    ...previous,
    status: 'connected',
    kind: 'burner',
    address: account.address,
    chainId: config.chainId,
    balance: null
  }))
  startBalancePolling()
  const balance = await publicClient.getBalance({ address: account.address }).catch(() => null)
  if (!replayMode && balance !== null && balance < 10n ** 18n) await requestDrip()
}

async function readChainId(provider: Eip1193Provider): Promise<number> {
  const raw = await provider.request({ method: 'eth_chainId' })
  return typeof raw === 'string' ? Number.parseInt(raw, 16) : 0
}

export async function connectInjected(wallet: DiscoveredWallet): Promise<void> {
  walletStore.set((previous) => ({ ...previous, status: 'connecting' }))
  try {
    const accounts = await wallet.provider.request({ method: 'eth_requestAccounts' })
    const first = Array.isArray(accounts) ? accounts[0] : undefined
    if (typeof first !== 'string') throw new Error('No account returned')
    injected = wallet.provider
    burnerKey = null
    const chainId = await readChainId(wallet.provider)
    walletStore.set((previous) => ({
      ...previous,
      status: 'connected',
      kind: 'injected',
      address: first.toLowerCase() as Hex,
      chainId,
      balance: null
    }))
    wallet.provider.on?.('chainChanged', (raw) => {
      if (typeof raw === 'string') walletStore.set((previous) => ({ ...previous, chainId: Number.parseInt(raw, 16) }))
    })
    wallet.provider.on?.('accountsChanged', (list) => {
      const next = Array.isArray(list) ? list[0] : undefined
      if (typeof next === 'string') walletStore.set((previous) => ({ ...previous, address: next.toLowerCase() as Hex }))
      else disconnect()
    })
    startBalancePolling()
  } catch (error) {
    walletStore.set((previous) => ({ ...previous, status: 'disconnected' }))
    pushToast('failed', 'Could not connect', describeError(error))
  }
}

export function disconnect(): void {
  window.clearInterval(balanceTimer)
  injected = null
  burnerKey = null
  walletStore.set((previous) => ({
    ...previous,
    status: 'disconnected',
    kind: null,
    address: null,
    chainId: null,
    balance: null
  }))
}

export async function switchNetwork(): Promise<void> {
  if (injected === null) return
  const chainIdHex = toHex(config.chainId)
  try {
    await injected.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: chainIdHex }] })
  } catch {
    try {
      await injected.request({
        method: 'wallet_addEthereumChain',
        params: [
          {
            chainId: chainIdHex,
            chainName: chain.name,
            nativeCurrency: chain.nativeCurrency,
            rpcUrls: chain.rpcUrls.default.http,
            blockExplorerUrls: chain.blockExplorers ? [chain.blockExplorers.default.url] : []
          }
        ]
      })
    } catch (error) {
      pushToast('failed', 'Could not switch network', describeError(error))
      return
    }
  }
  walletStore.set((previous) => ({ ...previous, chainId: config.chainId }))
}

export function isChainOk(state: WalletState): boolean {
  return state.chainId === config.chainId
}

export interface ArenaWrite {
  functionName: string
  args: readonly unknown[]
  valueWei?: bigint
  gas: bigint
}

async function sendWrite(write: ArenaWrite): Promise<Hex> {
  const state = walletStore.get()
  if (state.address === null) throw new Error('Connect a wallet first')
  const common = {
    address: arenaAddress(),
    abi: arenaAbi,
    functionName: write.functionName,
    args: write.args,
    value: write.valueWei ?? 0n,
    gas: write.gas
  }
  if (state.kind === 'burner' && burnerKey !== null) {
    const client = createWalletClient({
      account: privateKeyToAccount(burnerKey),
      chain,
      transport: fallback(config.httpUrls.map((url) => http(url)))
    })
    const receipt = await client.writeContractSync(common)
    if (receipt.status !== 'success') throw new Error('Transaction reverted')
    return receipt.transactionHash
  }
  if (injected === null) throw new Error('Wallet not connected')
  const client = createWalletClient({ account: state.address, chain, transport: custom(injected) })
  const hash = await client.writeContract(common)
  const receipt = await publicClient.waitForTransactionReceipt({ hash })
  if (receipt.status !== 'success') throw new Error('Transaction reverted')
  return hash
}

export async function runArenaTx(
  titles: { pending: string; done: string },
  write: ArenaWrite,
  onStep?: (step: 'wallet' | 'sent' | 'done' | 'failed') => void
): Promise<boolean> {
  if (replayMode) {
    pushToast('info', titles.done, 'Replay mode: no transaction was sent')
    onStep?.('done')
    return true
  }
  const toast = pushToast('pending', titles.pending, 'Confirm in your wallet')
  onStep?.('wallet')
  try {
    const hash = await queue.run(
      async () => {
        onStep?.('sent')
        return sendWrite(write)
      },
      write.valueWei ?? 0n,
      walletStore.get().balance
    )
    updateToast(toast, 'confirmed', titles.done, null, hash)
    onStep?.('done')
    void refreshBalance()
    return true
  } catch (error) {
    updateToast(toast, 'failed', 'Transaction failed', describeError(error), null)
    onStep?.('failed')
    return false
  }
}
