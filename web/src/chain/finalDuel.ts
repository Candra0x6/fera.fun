export function isFinalClash(
  displayedKeys: Iterable<string>,
  removed: ReadonlySet<string>,
  winnerKey: string,
  loserKey: string
): boolean {
  const alive = new Set<string>()
  for (const key of displayedKeys) if (!removed.has(key)) alive.add(key)
  return alive.size === 2 && alive.has(winnerKey) && alive.has(loserKey)
}
