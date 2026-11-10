import { JsonRpcProvider } from 'near-api-js'

export interface ReadProviders {
  read<T>(run: (provider: JsonRpcProvider) => Promise<T>, definitive: (error: unknown) => boolean): Promise<T>
}

export interface ReadProvidersOptions {
  cooldownMs?: number
  clock?: () => number
}

export function isRateLimited(error: unknown): boolean {
  const text = error instanceof Error ? error.message : String(error)
  return text.includes('-429') || text.includes('429') || text.toLowerCase().includes('rate limit')
}

export function createReadProviders(urls: readonly string[], options: ReadProvidersOptions = {}): ReadProviders {
  const providers = urls.map((url) => new JsonRpcProvider({ url }))
  const blockedUntil = providers.map(() => 0)
  const cooldown = options.cooldownMs ?? 20_000
  const clock = options.clock ?? (() => Date.now())
  let preferred = 0
  return {
    async read(run, definitive) {
      let lastError: unknown = new Error('no rpc url configured')
      const now = clock()
      const order = providers.map((_, step) => (preferred + step) % providers.length)
      const open = order.filter((index) => (blockedUntil[index] ?? 0) <= now)
      const attempts = open.length > 0 ? open : order
      for (const index of attempts) {
        const provider = providers[index]
        if (provider === undefined) continue
        try {
          const value = await run(provider)
          preferred = index
          return value
        } catch (error) {
          if (definitive(error)) {
            preferred = index
            throw error
          }
          if (isRateLimited(error)) blockedUntil[index] = clock() + cooldown
          lastError = error
        }
      }
      throw lastError
    }
  }
}

export function isDefinitiveReadError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  return (
    error.name === 'AccountDoesNotExistError' ||
    error.message.includes('ArenaError:') ||
    error.message.includes('Smart contract panicked')
  )
}
