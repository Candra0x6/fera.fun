import { createStore } from './store'

export type ToastTone = 'pending' | 'confirmed' | 'failed' | 'info'

export interface Toast {
  id: number
  tone: ToastTone
  title: string
  detail: string | null
  txHash: string | null
}

export const toastStore = createStore<Toast[]>([])

let nextId = 1
const CONFIRMED_DISMISS_MS = 6000

export function dismissToast(id: number): void {
  toastStore.set((previous) => previous.filter((toast) => toast.id !== id))
}

function scheduleDismiss(id: number, tone: ToastTone): void {
  if (tone === 'confirmed' || tone === 'info') window.setTimeout(() => dismissToast(id), CONFIRMED_DISMISS_MS)
}

export function pushToast(tone: ToastTone, title: string, detail: string | null = null, txHash: string | null = null): number {
  const id = nextId++
  toastStore.set((previous) => [...previous.slice(-3), { id, tone, title, detail, txHash }])
  scheduleDismiss(id, tone)
  return id
}

export function updateToast(id: number, tone: ToastTone, title: string, detail: string | null, txHash: string | null): void {
  toastStore.set((previous) => previous.map((toast) => (toast.id === id ? { ...toast, tone, title, detail, txHash } : toast)))
  scheduleDismiss(id, tone)
}
