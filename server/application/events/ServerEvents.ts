import { EventEmitter } from 'node:events'

export type ScanReason = 'startup' | 'schedule' | 'watch' | 'manual'

export interface ServerEventMap {
  'library:scan-started': { username: string; directoryIds: string[]; reason: ScanReason; startedAt: number }
  'library:scan-finished': {
    username: string; directoryIds: string[]; reason: ScanReason
    added: string[]; changed: string[]; removed: string[]
    total: number; durationMs: number; error?: string
    errors?: Array<{ file?: string; directory?: string; code?: string; message: string }>
  }
  'library:prefetch-progress': { username: string; queued: number; done: number; failed: number; running: boolean }
  'download:changed': { username: string; reason: 'progress' | 'state' | 'queue' }
  'notify': {
    username: string | '*'; id: string; level: 'info' | 'success' | 'warn' | 'error'
    title: string; message?: string; createdAt: number; link?: string
  }
  // 03 追加：不同后台任务的进度独立失效，避免下载事件读取无关任务。
  'task:changed': { username: string; topic: 'sync-download' | 'maintenance' | 'remaster'; reason: 'progress' | 'state' }
  'download:proxy-progress': { username: string; taskId: string; data: { progress: number; status: string; total?: number; received?: number; speed?: number; updatedAt?: number } }
}

class TypedEmitter extends EventEmitter {
  emitEvent<K extends keyof ServerEventMap>(name: K, payload: ServerEventMap[K]) { return this.emit(name, payload) }
  onEvent<K extends keyof ServerEventMap>(name: K, listener: (payload: ServerEventMap[K]) => void) { this.on(name, listener); return () => this.off(name, listener) }
}

export const serverEvents = new TypedEmitter()
serverEvents.setMaxListeners(50)
