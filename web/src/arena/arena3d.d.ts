import type { ArenaBridge, ArenaMode, LaunchPreview } from './bridge'

export function start(mode: ArenaMode): ArenaBridge
export function mountLaunchPreview(container: HTMLElement, opts?: { monsterId?: string; skinId?: string }): LaunchPreview
