import { describe, expect, it } from 'vitest'
import { canStartLobby, coinCounter, launchDisabledReason, launchEnabled, startLobbyBlocker } from './stage'

describe('lobby helpers', () => {
  it('counts launched coins in the lobby and survivors afterwards', () => {
    expect(coinCounter({ phase: 'Lobby', coinCount: 4, aliveCount: 0 }, 30)).toBe('4 / 30')
    expect(coinCounter({ phase: 'Knockout', coinCount: 30, aliveCount: 7 }, 30)).toBe('7 / 30')
    expect(coinCounter(null, 30)).toBe('0 / 30')
  })
  it('enables launching only in the lobby', () => {
    expect(launchEnabled({ phase: 'Lobby' })).toBe(true)
    expect(launchEnabled({ phase: 'Leveling' })).toBe(false)
    expect(launchEnabled(null)).toBe(false)
  })
  it('offers a new lobby only when there is no live round', () => {
    expect(canStartLobby(null)).toBe(true)
    expect(canStartLobby({ phase: 'Settled' })).toBe(true)
    expect(canStartLobby({ phase: 'Aborted' })).toBe(true)
    expect(canStartLobby({ phase: 'Lobby' })).toBe(false)
    expect(canStartLobby({ phase: 'Knockout' })).toBe(false)
  })
  it('explains why starting a lobby is disabled', () => {
    expect(startLobbyBlocker({ connected: false, chainOk: false, pending: false })).toBe('Connect a wallet first')
    expect(startLobbyBlocker({ connected: true, chainOk: false, pending: false })).toBe('Switch to Monad Testnet')
    expect(startLobbyBlocker({ connected: true, chainOk: true, pending: true })).toBe('Waiting for confirmation')
    expect(startLobbyBlocker({ connected: true, chainOk: true, pending: false })).toBeNull()
  })
  it('explains why launching is disabled', () => {
    expect(launchDisabledReason(null)).toMatch(/No round/)
    expect(launchDisabledReason({ phase: 'Settled' })).toMatch(/over/)
    expect(launchDisabledReason({ phase: 'Leveling' })).toMatch(/lobby is running/)
  })
})
