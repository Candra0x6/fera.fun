import { describe, expect, it } from 'vitest'
import { coinAvatarHtml, fitImageDataUri, IMAGE_TOO_COMPLEX, IMAGE_UNREADABLE, safeImageSrc, validateImageFile } from './coinImage'
import type { EncodeMime, ImageEncoder } from './coinImage'

function fakeEncoder(options: { webp: boolean; charsFor: (size: number, quality: number) => number }): ImageEncoder & { calls: Array<[number, EncodeMime, number]> } {
  const calls: Array<[number, EncodeMime, number]> = []
  return {
    calls,
    async encode(size, mime, quality) {
      calls.push([size, mime, quality])
      const actual: EncodeMime = mime === 'image/webp' && !options.webp ? 'image/jpeg' : mime
      const prefix = options.webp || mime === 'image/jpeg' ? `data:${actual};base64,` : 'data:image/png;base64,'
      return prefix + 'A'.repeat(Math.max(0, options.charsFor(size, quality) - prefix.length))
    }
  }
}

describe('validateImageFile', () => {
  it('accepts png jpeg webp gif', () => {
    for (const type of ['image/png', 'image/jpeg', 'image/webp', 'image/gif']) expect(validateImageFile({ type, size: 1000 })).toBeNull()
  })
  it('rejects svg and other types', () => {
    expect(validateImageFile({ type: 'image/svg+xml', size: 100 })).toMatch(/PNG, JPEG/)
    expect(validateImageFile({ type: 'text/html', size: 100 })).not.toBeNull()
    expect(validateImageFile({ type: '', size: 100 })).not.toBeNull()
  })
  it('enforces the 5 MB source limit and empty files', () => {
    expect(validateImageFile({ type: 'image/png', size: 5 * 1024 * 1024 })).toBeNull()
    expect(validateImageFile({ type: 'image/png', size: 5 * 1024 * 1024 + 1 })).toMatch(/5 MB/)
    expect(validateImageFile({ type: 'image/png', size: 0 })).toBe(IMAGE_UNREADABLE)
  })
})

describe('fitImageDataUri', () => {
  it('keeps the first attempt when it already fits', async () => {
    const encoder = fakeEncoder({ webp: true, charsFor: () => 5000 })
    const result = await fitImageDataUri(encoder)
    expect(result).toMatchObject({ ok: true, size: 128, mime: 'image/webp', quality: 0.82 })
  })
  it('lowers quality before size', async () => {
    const encoder = fakeEncoder({ webp: true, charsFor: (_size, quality) => (quality > 0.5 ? 20_000 : 9000) })
    const result = await fitImageDataUri(encoder)
    expect(result).toMatchObject({ ok: true, size: 128, quality: 0.46 })
  })
  it('shrinks the canvas when quality alone is not enough', async () => {
    const encoder = fakeEncoder({ webp: true, charsFor: (size) => (size === 96 ? 8000 : 30_000) })
    const result = await fitImageDataUri(encoder)
    expect(result).toMatchObject({ ok: true, size: 96, quality: 0.82 })
  })
  it('falls back to jpeg when webp is unsupported', async () => {
    const encoder = fakeEncoder({ webp: false, charsFor: () => 4000 })
    const result = await fitImageDataUri(encoder)
    expect(result).toMatchObject({ ok: true, mime: 'image/jpeg' })
    if (result.ok) expect(result.dataUri.startsWith('data:image/jpeg;base64,')).toBe(true)
  })
  it('never returns more than the character budget', async () => {
    const encoder = fakeEncoder({ webp: true, charsFor: () => 12_000 })
    const result = await fitImageDataUri(encoder)
    expect(result.ok && result.dataUri.length).toBe(12_000)
    const tight = await fitImageDataUri(fakeEncoder({ webp: true, charsFor: () => 12_001 }))
    expect(tight).toEqual({ ok: false, message: IMAGE_TOO_COMPLEX })
  })
  it('fails with a clear message after the smallest size', async () => {
    const encoder = fakeEncoder({ webp: true, charsFor: () => 50_000 })
    const result = await fitImageDataUri(encoder)
    expect(result).toEqual({ ok: false, message: IMAGE_TOO_COMPLEX })
    expect(encoder.calls.at(-1)?.[0]).toBe(96)
  })
  it('fails when the encoder returns nothing', async () => {
    const result = await fitImageDataUri({ encode: async () => null })
    expect(result).toEqual({ ok: false, message: IMAGE_UNREADABLE })
  })
})

describe('safeImageSrc', () => {
  const png = 'data:image/png;base64,iVBORw0KGgo='
  it('accepts raster data uris', () => {
    for (const type of ['png', 'jpeg', 'webp', 'gif']) expect(safeImageSrc(`data:image/${type};base64,AAAA`)).toBe(`data:image/${type};base64,AAAA`)
    expect(safeImageSrc(png)).toBe(png)
  })
  it('rejects svg and non-image data', () => {
    expect(safeImageSrc('data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=')).toBeNull()
    expect(safeImageSrc('data:image/svg+xml,<svg onload=alert(1)>')).toBeNull()
    expect(safeImageSrc('data:text/html;base64,PGgxPg==')).toBeNull()
    expect(safeImageSrc('data:image/png,AAAA')).toBeNull()
    expect(safeImageSrc('data:image/png;base64,AA"onerror="x')).toBeNull()
  })
  it('rejects script and plain schemes', () => {
    expect(safeImageSrc('javascript:alert(1)')).toBeNull()
    expect(safeImageSrc('JaVaScRiPt:alert(1)')).toBeNull()
    expect(safeImageSrc('http://example.com/a.png')).toBeNull()
    expect(safeImageSrc('//example.com/a.png')).toBeNull()
    expect(safeImageSrc('blob:https://example.com/x')).toBeNull()
    expect(safeImageSrc('file:///etc/passwd')).toBeNull()
  })
  it('accepts clean https urls and rejects tricks', () => {
    expect(safeImageSrc('https://example.com/a.png?x=1')).toBe('https://example.com/a.png?x=1')
    expect(safeImageSrc('https://user:pw@example.com/a.png')).toBeNull()
    expect(safeImageSrc('https://example.com/a".png')).toBeNull()
    expect(safeImageSrc('https://example.com/a b.png')).toBeNull()
    expect(safeImageSrc('https://')).toBeNull()
  })
  it('maps ipfs to the public gateway', () => {
    expect(safeImageSrc('ipfs://bafybeigdyrzt/pic.png')).toBe('https://ipfs.io/ipfs/bafybeigdyrzt/pic.png')
    expect(safeImageSrc('ipfs://ipfs/QmHash')).toBe('https://ipfs.io/ipfs/QmHash')
    expect(safeImageSrc('ipfs://')).toBeNull()
    expect(safeImageSrc('ipfs://../etc')).toBeNull()
    expect(safeImageSrc('ipfs://Qm"x')).toBeNull()
  })
  it('rejects non-strings, empties and oversized data', () => {
    expect(safeImageSrc(undefined)).toBeNull()
    expect(safeImageSrc(42)).toBeNull()
    expect(safeImageSrc('')).toBeNull()
    expect(safeImageSrc(`data:image/png;base64,${'A'.repeat(16_400)}`)).toBeNull()
  })
})

describe('coinAvatarHtml', () => {
  it('builds a hardened img and escapes alt text', () => {
    const html = coinAvatarHtml('data:image/png;base64,AAAA', 'a"><script>', 'w-8')
    expect(html).toContain('referrerpolicy="no-referrer"')
    expect(html).toContain('loading="lazy"')
    expect(html).toContain('decoding="async"')
    expect(html).not.toContain('<script>')
  })
  it('returns null for unsafe sources', () => {
    expect(coinAvatarHtml('javascript:alert(1)', 'x', 'w-8')).toBeNull()
  })
})
