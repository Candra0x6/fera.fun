// Pure display data for the two launch modals (chain React island and sim DOM modal).
// Keyed by the catalog keys (fire_dragon, ...). No three.js here so the React island can import it eagerly.
// Values mirror MONSTER_CATALOG / SKIN_MODIFIERS in arena3d.js (sizeClass, attackName, description, skin tint/accent).

export interface MonsterBlurb {
  size: string
  move: string
  attack: string
  blurb: string
}

export const MONSTER_BLURB: Readonly<Record<string, MonsterBlurb>> = {
  fire_dragon: { size: 'Medium', move: 'Winged', attack: 'Fire Breath', blurb: 'Brave winged dragon with golden belly plates.' },
  ice_wolf: { size: 'Medium', move: 'Quadruped', attack: 'Ice Slash', blurb: 'Nimble frost wolf with cyan back crystals.' },
  earth_golem: { size: 'Large', move: 'Heavy biped', attack: 'Ground Slam', blurb: 'Chunky stone colossus with mossy shoulders.' },
  electric_fox: { size: 'Medium', move: 'Agile', attack: 'Thunder Dash', blurb: 'Spirited kitsune with tiered tails and a voltage dash.' },
  dark_spirit: { size: 'Small', move: 'Floating', attack: 'Dark Orb', blurb: 'Playful shadow spirit with glowing eyes.' }
}

export const ELEMENT_STYLE: Readonly<Record<string, { bg: string; fg: string; label: string }>> = {
  fire: { bg: '#ffd9c6', fg: '#9a3412', label: 'Fire' },
  ice: { bg: '#cdeefc', fg: '#075985', label: 'Ice' },
  earth: { bg: '#ecd7b8', fg: '#7c4a21', label: 'Earth' },
  electric: { bg: '#fff0b8', fg: '#8a5a00', label: 'Electric' },
  dark: { bg: '#e4d4fb', fg: '#5b21b6', label: 'Dark' }
}

export interface SkinSwatch {
  base: string
  accent: string
}

export const SKIN_SWATCH: Readonly<Record<string, SkinSwatch>> = {
  default: { base: '#f7edd6', accent: '#c9b684' },
  obsidian: { base: '#1e293b', accent: '#f97316' },
  royal: { base: '#fbbf24', accent: '#fef08a' },
  crystal: { base: '#0ea5e9', accent: '#7dd3fc' },
  celestial: { base: '#c026d3', accent: '#f472b6' }
}

export function skinSwatchCss(key: string): string {
  const swatch = SKIN_SWATCH[key] ?? SKIN_SWATCH['default']
  if (swatch === undefined) return '#f7edd6'
  return `linear-gradient(135deg, ${swatch.base} 0 58%, ${swatch.accent} 58% 100%)`
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

// Keeps Tab inside a modal. Radios of one group count once (the checked one, or the first).
export function trapTab(event: { key: string; shiftKey: boolean; preventDefault(): void }, root: HTMLElement): void {
  if (event.key !== 'Tab') return
  const seen = new Set<string>()
  const items = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => {
    if (el.offsetParent === null && getComputedStyle(el).position !== 'fixed') return false
    if (el instanceof HTMLInputElement && el.type === 'radio') {
      const group = root.querySelectorAll<HTMLInputElement>(`input[type="radio"][name="${el.name}"]`)
      const keeper = Array.from(group).find((r) => r.checked) ?? group[0]
      if (keeper !== el || seen.has(el.name)) return false
      seen.add(el.name)
    }
    return true
  })
  const first = items[0]
  const last = items[items.length - 1]
  if (first === undefined || last === undefined) return
  const active = document.activeElement
  if (event.shiftKey && (active === first || !root.contains(active))) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && (active === last || !root.contains(active))) {
    event.preventDefault()
    first.focus()
  }
}
