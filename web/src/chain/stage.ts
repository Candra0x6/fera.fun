export type RoundPhaseName = 'Lobby' | 'Leveling' | 'Knockout' | 'Settled' | 'Aborted'

export type StageNumber = 0 | 1 | 2 | 3 | 4

export function stageForPhase(phase: string): StageNumber {
  switch (phase) {
    case 'Lobby':
      return 1
    case 'Leveling':
      return 2
    case 'Knockout':
      return 3
    case 'Settled':
      return 4
    default:
      return 0
  }
}

export function coinCounter(round: { phase: string; coinCount: number; aliveCount: number } | null, maxCoins: number): string {
  if (round === null) return `0 / ${maxCoins}`
  const shown = round.phase === 'Lobby' ? round.coinCount : round.aliveCount
  return `${shown} / ${maxCoins}`
}

export function launchEnabled(round: { phase: string } | null): boolean {
  return round !== null && round.phase === 'Lobby'
}

export function canStartLobby(round: { phase: string } | null): boolean {
  return round === null || round.phase === 'Settled' || round.phase === 'Aborted'
}

export function startLobbyBlocker(input: { connected: boolean; chainOk: boolean; pending: boolean }): string | null {
  if (!input.connected) return 'Connect a wallet first'
  if (!input.chainOk) return 'Switch to Monad Testnet'
  if (input.pending) return 'Waiting for confirmation'
  return null
}

export function launchDisabledReason(round: { phase: string } | null): string {
  if (round === null) return 'No round yet: start a new lobby first'
  if (round.phase === 'Settled' || round.phase === 'Aborted') return 'Round is over: start a new lobby first'
  return 'Launching opens when a lobby is running'
}
