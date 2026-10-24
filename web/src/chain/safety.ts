export function withTimeout(task: Promise<unknown>, ms: number): Promise<void> {
  return new Promise<void>((resolve) => {
    const handle = setTimeout(resolve, ms)
    const done = (): void => {
      clearTimeout(handle)
      resolve()
    }
    task.then(done, done)
  })
}
