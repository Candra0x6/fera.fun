import type { StatusKind } from '../chain/status'

export const STRINGS = {
  status: {
    live: 'Live',
    syncing: 'Syncing...',
    lagging: 'Lagging',
    disconnected: 'Disconnected • retrying',
    replay: 'Replay',
    sandbox: 'Sandbox simulation • 4 Connected Biomes'
  } satisfies Record<StatusKind, string>
}
