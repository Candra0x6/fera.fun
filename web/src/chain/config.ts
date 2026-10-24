import { MONAD_TESTNET_HTTP_URLS, MONAD_TESTNET_ID, MONAD_TESTNET_WS_URLS } from '@animal/shared'

export interface WebConfig {
  chainId: number
  httpUrls: string[]
  wsUrls: string[]
  arena: `0x${string}` | null
  roundId: number | null
  keeperUrl: string | null
  deployBlock: number
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null
}

function isAddress(value: string | null): value is `0x${string}` {
  return value !== null && /^0x[0-9a-fA-F]{40}$/.test(value)
}

export function readConfig(env: Record<string, unknown>): WebConfig {
  const chainId = Number(text(env['VITE_CHAIN_ID']) ?? MONAD_TESTNET_ID)
  const http = text(env['VITE_RPC_HTTP_URL'])
  const ws = text(env['VITE_RPC_WS_URL'])
  const arena = text(env['VITE_ARENA_ADDRESS'])
  const roundText = text(env['VITE_ROUND_ID'])
  const round = roundText === null ? Number.NaN : Number(roundText)
  const keeper = text(env['VITE_KEEPER_URL'])
  const deployText = text(env['VITE_DEPLOY_BLOCK'])
  const deploy = deployText === null ? 0 : Number(deployText)
  return {
    chainId: Number.isInteger(chainId) && chainId > 0 ? chainId : MONAD_TESTNET_ID,
    httpUrls: http === null ? [...MONAD_TESTNET_HTTP_URLS] : [http],
    wsUrls: ws === null ? [...MONAD_TESTNET_WS_URLS] : [ws],
    arena: isAddress(arena) ? arena : null,
    roundId: Number.isInteger(round) && round > 0 ? round : null,
    keeperUrl: keeper === null ? null : keeper.replace(/\/+$/, ''),
    deployBlock: Number.isInteger(deploy) && deploy > 0 ? deploy : 0
  }
}
