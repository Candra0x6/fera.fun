import { JsonRpcProvider } from 'near-api-js'

export interface ReadProviders {
  read<T>(run: (provider: JsonRpcProvider) => Promise<T>, definitive: (error: unknown) => boolean): Promise<T>
}

export function createReadProviders(urls: readonly string[]): ReadProviders {
  const providers = urls.map((url) => new JsonRpcProvider({ url }))
  let preferred = 0
  return {
    async read(run, definitive) {
      let lastError: unknown = new Error('no rpc url configured')
      for (let step = 0; step < providers.length; step += 1) {
        const index = (preferred + step) % providers.length
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
