export function acc() {
  return { n: 0, mean: 0, m2: 0 }
}

export function push(a, x) {
  a.n += 1
  const d = x - a.mean
  a.mean += d / a.n
  a.m2 += d * (x - a.mean)
}

export function se(a) {
  if (a.n < 2) return 0
  return Math.sqrt(a.m2 / (a.n - 1) / a.n)
}

export function ci(a) {
  return 1.96 * se(a)
}

export function fmt(a, digits = 3) {
  return a.mean.toFixed(digits) + ' +-' + ci(a).toFixed(digits)
}

export function gini(values) {
  const v = values.filter((x) => x >= 0).sort((p, q) => p - q)
  const n = v.length
  if (n === 0) return 0
  let sum = 0
  let weighted = 0
  for (let i = 0; i < n; i++) {
    sum += v[i]
    weighted += (i + 1) * v[i]
  }
  if (sum === 0) return 0
  return (2 * weighted) / (n * sum) - (n + 1) / n
}

export function batchRatio(numBatches, numerators, denominators) {
  const k = numBatches
  const ratios = []
  const size = Math.floor(numerators.length / k)
  for (let b = 0; b < k; b++) {
    let num = 0
    let den = 0
    for (let i = b * size; i < (b + 1) * size; i++) {
      num += numerators[i]
      den += denominators[i]
    }
    ratios.push(num / den)
  }
  const a = acc()
  for (const r of ratios) push(a, r)
  let num = 0
  let den = 0
  for (let i = 0; i < size * k; i++) {
    num += numerators[i]
    den += denominators[i]
  }
  return { ratio: num / den, ci: 2.093 * se(a) }
}
