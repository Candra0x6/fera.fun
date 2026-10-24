import { fitImageDataUri, IMAGE_UNREADABLE, validateImageFile } from './coinImage'
import type { EncodeMime, FitResult, ImageEncoder } from './coinImage'

function bitmapEncoder(bitmap: ImageBitmap): ImageEncoder {
  const side = Math.min(bitmap.width, bitmap.height)
  const sx = (bitmap.width - side) / 2
  const sy = (bitmap.height - side) / 2
  return {
    async encode(size: number, mime: EncodeMime, quality: number): Promise<string | null> {
      const canvas = document.createElement('canvas')
      canvas.width = size
      canvas.height = size
      const context = canvas.getContext('2d')
      if (context === null) return null
      if (mime === 'image/jpeg') {
        context.fillStyle = '#ffffff'
        context.fillRect(0, 0, size, size)
      }
      context.imageSmoothingQuality = 'high'
      context.drawImage(bitmap, sx, sy, side, side, 0, 0, size, size)
      return canvas.toDataURL(mime, quality)
    }
  }
}

export async function prepareImageFile(file: File): Promise<FitResult> {
  const problem = validateImageFile(file)
  if (problem !== null) return { ok: false, message: problem }
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    return { ok: false, message: IMAGE_UNREADABLE }
  }
  try {
    if (bitmap.width < 1 || bitmap.height < 1) return { ok: false, message: IMAGE_UNREADABLE }
    return await fitImageDataUri(bitmapEncoder(bitmap))
  } finally {
    bitmap.close()
  }
}
