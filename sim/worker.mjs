import { parentPort } from 'node:worker_threads'
import { evCell } from './experiments.mjs'
import { runDynamic } from './dynamic.mjs'
import { check1, check3Bye, check3Edge } from './checks.mjs'

const FNS = { evCell, runDynamic, check1, check3Bye, check3Edge }

parentPort.on('message', (task) => {
  const fn = FNS[task.fn]
  const result = fn(task.spec)
  parentPort.postMessage({ id: task.id, result })
})
