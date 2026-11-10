import { createBurner } from './nearBurner'
import type { BurnerState, StorageLike } from './nearBurner'
import { nearRpc } from './contract'
import { describeError } from './errors'
import { createNearSigner } from './nearSigner'
import type { ArenaCall } from './nearSigner'
import { config, replayMode } from './session'
import { pushToast, updateToast } from './toasts'

const BALANCE_POLL_MS = 3000

function browserStorage(): StorageLike {
  const memory = new Map<string, string>()
  const fallback: StorageLike = {
    getItem: (key) => memory.get(key) ?? null,
    setItem: (key, value) => {
      memory.set(key, value)
    },
    removeItem: (key) => {
      memory.delete(key)
    }
  }
  try {
    const probe = '__fera_probe__'
    window.localStorage.setItem(probe, '1')
    window.localStorage.removeItem(probe)
    return window.localStorage
  } catch {
    return fallback
  }
}

const burner = createBurner({
  storage: browserStorage(),
  keeperUrl: config.keeperUrl,
  fetchImpl: (url, init) => fetch(url, init),
  rpc: nearRpc,
  createSigner: (options) => createNearSigner({ ...options, arena: config.arena, rpcUrls: config.rpcUrls })
})

export type WalletState = BurnerState

export const walletStore = burner.store

let balanceTimer = 0

export function isConnected(state: WalletState): boolean {
  return state.status === 'ready'
}

function startBalancePolling(): void {
  window.clearInterval(balanceTimer)
  balanceTimer = window.setInterval(() => void burner.refreshBalance(), BALANCE_POLL_MS)
}

export async function connectBurner(): Promise<void> {
  await burner.connect()
  if (burner.store.get().status === 'ready') startBalancePolling()
  else pushToast('failed', 'Could not set up the burner wallet', dripFailureText(burner.store.get().failure))
}

export function disconnect(): void {
  window.clearInterval(balanceTimer)
  burner.disconnect()
}

export async function refreshBalance(): Promise<void> {
  await burner.refreshBalance()
}

function dripFailureText(failure: BurnerState['failure']): string {
  switch (failure) {
    case 'rate_limited':
      return 'The faucet is rate limited. Try again in a minute.'
    case 'faucet_empty':
      return 'The faucet is empty. Ask the host to refill it.'
    case 'no_keeper':
      return 'No keeper URL is configured'
    case 'bad_key':
      return 'The faucet rejected the burner key'
    case 'unreachable':
      return 'The faucet is unreachable'
    default:
      return 'The faucet could not fund the burner'
  }
}

export async function requestDrip(): Promise<void> {
  const toast = pushToast('pending', 'Requesting test NEAR')
  try {
    await burner.drip()
    updateToast(toast, 'confirmed', 'Test NEAR requested', null, null)
    window.setTimeout(() => void burner.refreshBalance(), 1500)
  } catch {
    updateToast(toast, 'failed', 'Faucet refused', dripFailureText(burner.store.get().failure), null)
  }
}

export async function runArenaTx(
  titles: { pending: string; done: string },
  call: ArenaCall,
  onStep?: (step: 'wallet' | 'sent' | 'done' | 'failed') => void
): Promise<boolean> {
  if (replayMode) {
    pushToast('info', titles.done, 'Replay mode: no transaction was sent')
    onStep?.('done')
    return true
  }
  const toast = pushToast('pending', titles.pending, 'Signing with the burner wallet')
  onStep?.('wallet')
  try {
    onStep?.('sent')
    const hash = await burner.send(call)
    updateToast(toast, 'confirmed', titles.done, null, hash)
    onStep?.('done')
    return true
  } catch (error) {
    updateToast(toast, 'failed', 'Transaction failed', describeError(error), null)
    onStep?.('failed')
    return false
  }
}
