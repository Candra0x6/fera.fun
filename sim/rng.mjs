export const TAG_PAIR = 1
export const TAG_CLASH = 2
export const TAG_HUNT = 3
export const TAG_EPOCH = 4
export const TAG_SETUP = 5
export const TAG_TRADE = 6

function fmix(h) {
  h ^= h >>> 16
  h = Math.imul(h, 0x85ebca6b)
  h ^= h >>> 13
  h = Math.imul(h, 0xc2b2ae35)
  h ^= h >>> 16
  return h >>> 0
}

export function mix(seed, tag, idx) {
  let h = fmix((seed ^ 0x9e3779b9) >>> 0)
  h = fmix((h ^ Math.imul(tag + 1, 0x85ebca6b)) >>> 0)
  h = fmix((h ^ Math.imul(idx + 1, 0xc2b2ae35)) >>> 0)
  return h
}

export function derive(seed, ...parts) {
  let h = fmix(seed >>> 0)
  for (const p of parts) {
    h = fmix((h ^ fmix((p + 0x7f4a7c15) >>> 0)) >>> 0)
  }
  return h >>> 0
}

export function mulberry32(seed) {
  let a = seed >>> 0
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function pick(rng, n) {
  return Math.floor(rng() * n)
}
