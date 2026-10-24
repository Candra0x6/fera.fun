export function mergeAcc(a, b) {
  if (a.n === 0) return { ...b }
  if (b.n === 0) return { ...a }
  const n = a.n + b.n
  const d = b.mean - a.mean
  return { n, mean: a.mean + (d * b.n) / n, m2: a.m2 + b.m2 + (d * d * a.n * b.n) / n }
}

export function mergeResults(list) {
  const out = {}
  for (const k of Object.keys(list[0])) {
    const v = list[0][k]
    if (v && typeof v === 'object' && 'm2' in v) {
      let m = { n: 0, mean: 0, m2: 0 }
      for (const r of list) m = mergeAcc(m, r[k])
      out[k] = m
    } else if (typeof v === 'number') {
      out[k] = list.reduce((s, r) => s + r[k], 0)
    }
  }
  return out
}
