import { Worker } from 'node:worker_threads'
import { mergeResults } from './merge.mjs'

export function runTasks(tasks, workerCount) {
  return new Promise((resolve, reject) => {
    const results = new Array(tasks.length)
    let next = 0
    let done = 0
    const workers = []
    const feed = (w) => {
      if (next >= tasks.length) {
        w.terminate()
        return
      }
      const id = next++
      w.postMessage({ id, fn: tasks[id].fn, spec: tasks[id].spec })
    }
    const count = Math.max(1, Math.min(workerCount, tasks.length))
    for (let i = 0; i < count; i++) {
      const w = new Worker(new URL('./worker.mjs', import.meta.url))
      workers.push(w)
      w.on('message', (m) => {
        results[m.id] = m.result
        done += 1
        if (done === tasks.length) {
          for (const x of workers) x.terminate()
          resolve(results)
        } else feed(w)
      })
      w.on('error', (err) => {
        for (const x of workers) x.terminate()
        reject(err)
      })
      feed(w)
    }
  })
}

export async function runChunked(fn, spec, chunks, workerCount) {
  const per = Math.ceil(spec.runs / chunks)
  const tasks = []
  for (let c = 0; c < chunks; c++) {
    const from = c * per
    const runs = Math.min(per, spec.runs - from)
    if (runs <= 0) break
    tasks.push({ fn, spec: { ...spec, from, runs } })
  }
  const parts = await runTasks(tasks, workerCount)
  return { parts, merged: mergeResults(parts) }
}
