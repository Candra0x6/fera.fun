export const MONSTER_ICONS: readonly string[] = ['🐉', '🐺', '🗿', '🦊', '👾']

let iconImages: readonly string[] = []

export function setMonsterIconImages(urls: readonly string[]): void {
  iconImages = urls
}

export function monsterIconImage(monsterType: number): string | null {
  return iconImages[monsterType] ?? null
}

export function monsterIcon(monsterType: number): string {
  return MONSTER_ICONS[monsterType] ?? '❔'
}
