import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseFixture } from '../src/fixture.ts'
import { toNearFixture } from '../src/nearFixture.ts'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures')
const source = parseFixture(JSON.parse(readFileSync(join(root, 'arena-replay.json'), 'utf8')))
const messages = toNearFixture(source)
const lines = messages.map((message) => JSON.stringify(message))
writeFileSync(join(root, 'arena-near-replay.json'), `[\n${lines.join(',\n')}\n]\n`)
process.stdout.write(`wrote ${messages.length} messages to fixtures/arena-near-replay.json\n`)
