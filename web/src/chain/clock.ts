import { useEffect, useState } from 'react'

let source: () => number = () => Date.now() / 1000

export function setClock(next: () => number): void {
  source = next
}

export function nowSeconds(): number {
  return source()
}

export function useNowSeconds(intervalMs = 500): number {
  const [value, setValue] = useState(nowSeconds)
  useEffect(() => {
    const handle = window.setInterval(() => setValue(nowSeconds()), intervalMs)
    return () => window.clearInterval(handle)
  }, [intervalMs])
  return value
}
