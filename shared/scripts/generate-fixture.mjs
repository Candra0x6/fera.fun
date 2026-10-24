import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { generateFixture } from '../src/fixtureBuilder.ts'

const target = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'arena-replay.json')
const messages = generateFixture()
const lines = messages.map((message) => JSON.stringify(message))
writeFileSync(target, `[\n${lines.join(',\n')}\n]\n`)
process.stdout.write(`wrote ${messages.length} messages to fixtures/arena-replay.json\n`)
