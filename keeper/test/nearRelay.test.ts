import { describe, expect, it } from 'vitest'
import { createApi } from '../src/api'
import { createSwitchableRelay } from '../src/follow'
import { PollingFeed, event, snapshot } from './nearFeedFixtures'

interface Frame {
  event: string
  data: string
  id: string | null
}

function parseFrames(text: string): Frame[] {
  return text
    .split('\n\n')
    .filter((chunk) => chunk.trim().length > 0)
    .map((chunk) => {
      const frame: Frame = { event: 'message', data: '', id: null }
      for (const line of chunk.split('\n')) {
        if (line.startsWith('event:')) frame.event = line.slice(6).trim()
        if (line.startsWith('data:')) frame.data += line.slice(5).trim()
        if (line.startsWith('id:')) frame.id = line.slice(3).trim()
      }
      return frame
    })
}

function openStream(response: Response) {
  const reader = response.body?.getReader()
  if (reader === undefined) throw new Error('no body')
  const decoder = new TextDecoder()
  let text = ''
  return {
    async until(count: number): Promise<Frame[]> {
      const deadline = Date.now() + 3000
      for (;;) {
        const frames = parseFrames(text.slice(0, text.lastIndexOf('\n\n') + 2))
        if (frames.length >= count) return frames
        if (Date.now() > deadline) throw new Error(`stream stalled: ${text}`)
        const { value, done } = await reader.read()
        if (done) throw new Error('stream closed early')
        text += decoder.decode(value, { stream: true })
      }
    },
    cancel: () => reader.cancel()
  }
}

function build() {
  const feed = new PollingFeed()
  const relay = createSwitchableRelay()
  relay.bind(feed)
  const api = createApi({
    health: () => ({ ok: true, headBlock: 1, lagSeconds: 0, keeperAccount: 'k.testnet', roundId: 1, round: null }),
    drip: null,
    allowedOrigins: [],
    relay,
    pingMs: 5000
  })
  return { feed, relay, api }
}

describe('relay over a NEAR-shaped feed', () => {
  it('serves two stream clients the same ids in the same order, including the Finalized upgrade', async () => {
    const { feed, api } = build()
    feed.snapshot(snapshot(9000))
    feed.envelope(event(9001, 0))
    feed.envelope(event(9001, 1))
    const a = openStream(await api.request('/stream'))
    const b = openStream(await api.request('/stream'))
    await a.until(3)
    await b.until(3)
    feed.envelope(event(9003, 0))
    feed.commit({ blockId: '9001', blockNumber: 9001, commitState: 'Finalized' })
    feed.envelope(event(9004, 0))
    const first = { frames: await a.until(6), cancel: a.cancel }
    const second = { frames: await b.until(6), cancel: b.cancel }
    const ids = (frames: Frame[]): Array<string | null> => frames.filter((f) => f.event === 'event').map((f) => f.id)
    expect(ids(first.frames)).toEqual([event(9001, 0).id, event(9001, 1).id, event(9003, 0).id, event(9004, 0).id])
    expect(ids(second.frames)).toEqual(ids(first.frames))
    expect(first.frames.map((f) => f.event)).toEqual(second.frames.map((f) => f.event))
    const commit = first.frames.find((f) => f.event === 'commit')
    expect(JSON.parse(commit?.data ?? '{}')).toEqual({ blockId: '9001', blockNumber: 9001, commitState: 'Finalized' })
    await first.cancel()
    await second.cancel()
  })

  it('carries block height as blockId and an empty txHash through /events with the upgraded state', async () => {
    const { feed, api } = build()
    feed.snapshot(snapshot(9000))
    feed.envelope(event(9001, 0))
    feed.commit({ blockId: '9001', blockNumber: 9001, commitState: 'Finalized' })
    const body: unknown = await (await api.request('/events')).json()
    expect(body).toEqual([{ ...event(9001, 0), commitState: 'Finalized' }])
    expect(Array.isArray(body) && body[0]?.txHash).toBe('')
    expect(Array.isArray(body) && body[0]?.blockId).toBe('9001')
  })

  it('resumes after a reconnect with only the events past Last-Event-ID', async () => {
    const { feed, api } = build()
    feed.snapshot(snapshot(9000))
    for (const height of [9001, 9002, 9003]) feed.envelope(event(height, 0))
    const response = await api.request('/stream', { headers: { 'last-event-id': event(9001, 0).id } })
    const stream = openStream(response)
    const frames = await stream.until(3)
    expect(frames.filter((f) => f.event === 'event').map((f) => f.id)).toEqual([event(9002, 0).id, event(9003, 0).id])
    await stream.cancel()
  })

  it('serves the new round after the relay is rebound to a fresh feed', async () => {
    const { feed, relay, api } = build()
    feed.snapshot(snapshot(9000))
    feed.envelope(event(9001, 0))
    const next = new PollingFeed()
    relay.bind(next)
    expect((await api.request('/snapshot')).status).toBe(503)
    next.snapshot(snapshot(9100))
    const response = await api.request('/snapshot')
    expect(await response.json()).toMatchObject({ blockNumber: 9100, blockId: '9100' })
    expect(await (await api.request('/events')).json()).toEqual([])
  })
})
