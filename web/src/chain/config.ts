export const DEFAULT_ARENA_ACCOUNT = 'fera-arena.testnet'
export const DEFAULT_RPC_URLS: readonly string[] = [
  'https://test.rpc.fastnear.com',
  'https://rpc.testnet.fastnear.com',
  'https://near-testnet.drpc.org',
  'https://rpc.testnet.near.org'
]

export type NearNetwork = 'testnet' | 'mainnet'

export interface WebConfig {
  network: NearNetwork
  arena: string
  rpcUrls: string[]
  roundId: number | null
  keeperUrl: string | null
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null
}

function isAccountId(value: string | null): value is string {
  return value !== null && /^[a-z0-9][a-z0-9._-]{1,62}[a-z0-9]$/.test(value)
}

function urlList(value: string | null): string[] {
  if (value === null) return []
  return value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => /^https?:\/\//.test(item))
}

export function readConfig(env: Record<string, unknown>): WebConfig {
  const network = text(env['VITE_NEAR_NETWORK']) === 'mainnet' ? 'mainnet' : 'testnet'
  const arena = text(env['VITE_ARENA_ACCOUNT'])
  const urls = urlList(text(env['VITE_RPC_URLS']))
  const roundText = text(env['VITE_ROUND_ID'])
  const round = roundText === null ? Number.NaN : Number(roundText)
  const keeper = text(env['VITE_KEEPER_URL'])
  return {
    network,
    arena: isAccountId(arena) ? arena : DEFAULT_ARENA_ACCOUNT,
    rpcUrls: urls.length > 0 ? urls : [...DEFAULT_RPC_URLS],
    roundId: Number.isInteger(round) && round > 0 ? round : null,
    keeperUrl: keeper === null ? null : keeper.replace(/\/+$/, '')
  }
}
