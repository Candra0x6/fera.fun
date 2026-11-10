import { configDefaults, defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    exclude: [...configDefaults.exclude, 'test/viemPort.test.ts', 'test/demo.test.ts', 'test/house.test.ts']
  }
})
