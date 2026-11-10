export const EXPLORER_BASE_URL = 'https://testnet.nearblocks.io'

export function explorerTxUrl(txHash: string): string {
  return `${EXPLORER_BASE_URL}/txns/${txHash}`
}

export function explorerAddressUrl(account: string): string {
  return `${EXPLORER_BASE_URL}/address/${account}`
}

export function explorerEventUrl(txHash: string, arena: string): string {
  return txHash === '' ? explorerAddressUrl(arena) : explorerTxUrl(txHash)
}
