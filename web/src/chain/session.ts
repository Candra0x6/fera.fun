import type { ArenaState } from '@animal/shared'
import { useSyncExternalStore } from 'react'
import type { ArenaBridge, ArenaMode } from '../arena/bridge'
import { readConfig } from './config'
import { createSwitchableStore } from './switchableStore'
import { createStore } from './store'

export const config = readConfig(import.meta.env as Record<string, unknown>)
export const arenaStore = createSwitchableStore()

export const mode: ArenaMode = new URLSearchParams(window.location.search).get('sim') === '1' ? 'sim' : 'chain'

export const replayMode = new URLSearchParams(window.location.search).get('replay') === 'fixture'

export interface UiState {
  selectedId: string | null
  finaleDone: boolean
  championClosed: boolean
  sawLiveRound: boolean
}

export const uiStore = createStore<UiState>({
  selectedId: null,
  finaleDone: false,
  championClosed: false,
  sawLiveRound: false
})

let bridge: ArenaBridge | null = null

export function setBridge(next: ArenaBridge): void {
  bridge = next
  next.on('select', (event) => {
    uiStore.set((previous) => ({ ...previous, selectedId: event.id }))
  })
}

export function getBridge(): ArenaBridge | null {
  return bridge
}

export function useArenaState(): ArenaState {
  return useSyncExternalStore(arenaStore.subscribe, arenaStore.getState)
}

export type FeedNoteHandler = (text: string) => void

let noteHandler: FeedNoteHandler | null = null

export function setFeedNoteHandler(handler: FeedNoteHandler): void {
  noteHandler = handler
}

export function addFeedNote(text: string): void {
  noteHandler?.(text)
}
