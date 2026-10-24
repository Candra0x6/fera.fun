import { defineChain } from 'viem'
import type { Chain } from 'viem'
import type { Hex } from './types'

export const MULTICALL3_ADDRESS: Hex = '0xcA11bde05977b3631167028862bE2a173976CA11'
export const MONAD_TESTNET_ID = 10143
export const MONAD_TESTNET_HTTP_URLS: readonly string[] = [
  'https://testnet-rpc.monad.xyz',
  'https://rpc-testnet.monadinfra.com'
]
export const MONAD_TESTNET_WS_URLS: readonly string[] = [
  'wss://testnet-rpc.monad.xyz',
  'wss://rpc-testnet.monadinfra.com'
]
export const GET_LOGS_MAX_RANGE = 100

export interface ChainEndpoints {
  id?: number
  httpUrls?: readonly string[]
  wsUrls?: readonly string[]
}

export function createMonadChain(endpoints: ChainEndpoints = {}): Chain {
  const http = [...(endpoints.httpUrls ?? MONAD_TESTNET_HTTP_URLS)]
  const webSocket = [...(endpoints.wsUrls ?? MONAD_TESTNET_WS_URLS)]
  return defineChain({
    id: endpoints.id ?? MONAD_TESTNET_ID,
    name: 'Monad Testnet',
    nativeCurrency: { name: 'Monad', symbol: 'MON', decimals: 18 },
    blockTime: 300,
    rpcUrls: { default: { http, webSocket } },
    blockExplorers: { default: { name: 'MonadVision', url: 'https://testnet.monadvision.com' } },
    contracts: { multicall3: { address: MULTICALL3_ADDRESS } },
    testnet: true
  })
}

export const monadTestnet: Chain = createMonadChain()
