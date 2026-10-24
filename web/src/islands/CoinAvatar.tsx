import { safeImageSrc } from '../chain/coinImage'
import { monsterIcon, monsterIconImage } from '../chain/monsters'

interface Props {
  imageUri?: string
  monsterType: number
  label: string
  className?: string
}

export function CoinAvatar({ imageUri, monsterType, label, className = 'w-16 h-16' }: Props) {
  const src = safeImageSrc(imageUri)
  const icon = monsterIconImage(monsterType)
  if (src !== null) {
    return <img src={src} alt={`${label} token image`} className={`coin-avatar ${className}`} referrerPolicy="no-referrer" loading="lazy" decoding="async" draggable={false} />
  }
  if (icon !== null && icon !== '') return <img src={icon} alt="" className={className} draggable={false} />
  return <span aria-hidden="true">{monsterIcon(monsterType)}</span>
}
