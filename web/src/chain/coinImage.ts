export const IMAGE_MAX_SOURCE_BYTES = 5 * 1024 * 1024
export const IMAGE_MAX_DATA_URI_CHARS = 12_000
export const IMAGE_ONCHAIN_MAX_BYTES = 16_384
export const IMAGE_SIZES: readonly number[] = [128, 112, 96]
export const IMAGE_QUALITIES: readonly number[] = [0.82, 0.7, 0.58, 0.46, 0.34, 0.24]
export const IMAGE_ACCEPTED_TYPES: readonly string[] = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']
export const IPFS_GATEWAY = 'https://ipfs.io/ipfs/'

export type EncodeMime = 'image/webp' | 'image/jpeg'

export interface ImageEncoder {
  encode(size: number, mime: EncodeMime, quality: number): Promise<string | null>
}

export type FitResult =
  | { ok: true; dataUri: string; size: number; mime: EncodeMime; quality: number }
  | { ok: false; message: string }

export const IMAGE_TOO_COMPLEX = 'This image is too detailed to store on-chain. Try a simpler picture.'
export const IMAGE_UNREADABLE = 'That file could not be read as an image'

export function validateImageFile(file: { type: string; size: number }): string | null {
  if (!IMAGE_ACCEPTED_TYPES.includes(file.type.toLowerCase())) return 'Use a PNG, JPEG, WebP or GIF image'
  if (file.size <= 0) return IMAGE_UNREADABLE
  if (file.size > IMAGE_MAX_SOURCE_BYTES) return 'That image is larger than 5 MB'
  return null
}

function hasMime(dataUri: string | null, mime: EncodeMime): dataUri is string {
  return dataUri !== null && dataUri.startsWith(`data:${mime};base64,`)
}

export async function fitImageDataUri(
  encoder: ImageEncoder,
  limits: { maxChars?: number; sizes?: readonly number[]; qualities?: readonly number[] } = {}
): Promise<FitResult> {
  const maxChars = limits.maxChars ?? IMAGE_MAX_DATA_URI_CHARS
  const sizes = limits.sizes ?? IMAGE_SIZES
  const qualities = limits.qualities ?? IMAGE_QUALITIES
  const firstSize = sizes[0]
  const firstQuality = qualities[0]
  if (firstSize === undefined || firstQuality === undefined) return { ok: false, message: IMAGE_TOO_COMPLEX }

  const probe = await encoder.encode(firstSize, 'image/webp', firstQuality)
  const mime: EncodeMime = hasMime(probe, 'image/webp') ? 'image/webp' : 'image/jpeg'

  for (const size of sizes) {
    for (const quality of qualities) {
      const dataUri = await encoder.encode(size, mime, quality)
      if (!hasMime(dataUri, mime)) return { ok: false, message: IMAGE_UNREADABLE }
      if (dataUri.length <= maxChars) return { ok: true, dataUri, size, mime, quality }
    }
  }
  return { ok: false, message: IMAGE_TOO_COMPLEX }
}

const DATA_IMAGE = /^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/
const IPFS_PATH = /^[A-Za-z0-9][A-Za-z0-9._~-]*(?:\/[A-Za-z0-9._~%-]+)*$/
const UNSAFE_URL_CHARS = /[\u0000- "'<>\\`]/

export function safeImageSrc(value: unknown): string | null {
  if (typeof value !== 'string' || value === '') return null
  if (value.startsWith('data:')) {
    return value.length <= IMAGE_ONCHAIN_MAX_BYTES && DATA_IMAGE.test(value) ? value : null
  }
  if (value.length > 2048 || UNSAFE_URL_CHARS.test(value)) return null
  if (value.startsWith('ipfs://')) {
    const path = value.slice('ipfs://'.length).replace(/^ipfs\//, '')
    return IPFS_PATH.test(path) ? `${IPFS_GATEWAY}${path}` : null
  }
  if (!value.startsWith('https://')) return null
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || url.username !== '' || url.password !== '' || url.hostname === '') return null
    return url.href
  } catch {
    return null
  }
}

export function escapeAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function coinAvatarHtml(value: unknown, alt: string, className: string): string | null {
  const src = safeImageSrc(value)
  if (src === null) return null
  return `<img src="${escapeAttr(src)}" alt="${escapeAttr(alt)}" class="coin-avatar ${escapeAttr(className)}" referrerpolicy="no-referrer" loading="lazy" decoding="async" draggable="false">`
}
