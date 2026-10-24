import type { MonsterEntry, SkinEntry } from '@animal/shared'
import { useEffect, useRef } from 'react'
import { mountLaunchPreview } from '../arena/bridge'
import type { LaunchPreview } from '../arena/bridge'
import { ELEMENT_STYLE, MONSTER_BLURB, skinSwatchCss } from '../arena/launchInfo'
import { monsterIcon, monsterIconImage } from '../chain/monsters'
import { LABEL } from './shared'

interface PreviewProps {
  monster: MonsterEntry
  skin: SkinEntry
}

// Owns one WebGL renderer for as long as the modal is open: mounted with the modal, disposed on unmount.
export function LaunchPreviewPane({ monster, skin }: PreviewProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const handleRef = useRef<LaunchPreview | null>(null)
  const latest = useRef({ monsterKey: monster.key, skinKey: skin.key })
  latest.current = { monsterKey: monster.key, skinKey: skin.key }

  useEffect(() => {
    const host = hostRef.current
    if (host === null) return undefined
    let cancelled = false
    let mounted: LaunchPreview | null = null
    void mountLaunchPreview(host, { monsterId: latest.current.monsterKey, skinId: latest.current.skinKey })
      .then((preview) => {
        if (cancelled) {
          preview.dispose()
          return
        }
        mounted = preview
        handleRef.current = preview
        preview.setMonster(latest.current.monsterKey)
        preview.setSkin(latest.current.skinKey)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
      handleRef.current = null
      mounted?.dispose()
    }
  }, [])
  useEffect(() => {
    handleRef.current?.setMonster(monster.key)
  }, [monster.key])
  useEffect(() => {
    handleRef.current?.setSkin(skin.key)
  }, [skin.key])

  const blurb = MONSTER_BLURB[monster.key]
  const element = ELEMENT_STYLE[monster.element]
  return (
    <div className="launch-left">
      <div
        ref={hostRef}
        data-testid="launch-preview"
        className="launch-stage"
        tabIndex={0}
        role="img"
        aria-label={`3D preview of ${skin.name} ${monster.name}. Drag or use the left and right arrow keys to rotate.`}
      />
      <div className="launch-info" aria-live="polite">
        <div className="flex items-center gap-2 flex-wrap">
          <strong className="text-sm font-extrabold text-[#2a4a57]">{monster.name}</strong>
          {element !== undefined ? <span className="el-pill" style={{ background: element.bg, color: element.fg }}>{element.label}</span> : null}
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#4d6670]">{skin.name} skin</span>
        </div>
        {blurb !== undefined ? (
          <>
            <p className="text-[11px] font-extrabold text-[#1f566b]">{blurb.size} · {blurb.move} · {blurb.attack}</p>
            <p className="text-[11px] text-[#4d6670] font-semibold">{blurb.blurb}</p>
          </>
        ) : null}
      </div>
    </div>
  )
}

interface PickerProps<T> {
  items: readonly T[]
  value: number
  disabled: boolean
  onChange: (value: number) => void
}

export function MonsterPicker({ items, value, disabled, onChange }: PickerProps<MonsterEntry>) {
  return (
    <fieldset className="launch-fieldset">
      <legend className={LABEL} id="launch-monster-label">Choose Monster</legend>
      <div id="launch-monster" className="pick-grid pick-grid-monsters" role="radiogroup" aria-labelledby="launch-monster-label">
        {items.map((monster) => {
          const element = ELEMENT_STYLE[monster.element]
          const url = monsterIconImage(monster.monsterType)
          return (
            <label key={monster.monsterType} className="pick-card">
              <input
                type="radio"
                name="launch-monster"
                value={monster.monsterType}
                checked={value === monster.monsterType}
                disabled={disabled}
                aria-label={`${monster.name}, ${monster.element}`}
                onChange={() => onChange(monster.monsterType)}
              />
              <span className="pick-body">
                {url !== null && url !== '' ? <img src={url} alt="" className="pick-icon" draggable={false} /> : <span className="pick-icon" aria-hidden="true">{monsterIcon(monster.monsterType)}</span>}
                <span>{monster.name}</span>
                {element !== undefined ? <span className="el-pill" style={{ background: element.bg, color: element.fg }}>{element.label}</span> : null}
              </span>
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}

export function SkinPicker({ items, value, disabled, onChange }: PickerProps<SkinEntry>) {
  return (
    <fieldset className="launch-fieldset">
      <legend className={LABEL} id="launch-skin-label">Choose Skin</legend>
      <div id="launch-skin" className="pick-grid pick-grid-skins" role="radiogroup" aria-labelledby="launch-skin-label">
        {items.map((skin) => (
          <label key={skin.skinId} className="pick-card">
            <input
              type="radio"
              name="launch-skin"
              value={skin.skinId}
              checked={value === skin.skinId}
              disabled={disabled}
              aria-label={skin.name}
              onChange={() => onChange(skin.skinId)}
            />
            <span className="pick-body">
              <span className="pick-swatch" style={{ background: skinSwatchCss(skin.key) }} />
              <span>{skin.name}</span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}
