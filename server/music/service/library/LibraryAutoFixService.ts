import storageFs from '../../../application/persistence/documentFileSystem'
import { serverEvents } from '../../../application/events/ServerEvents'
import { libraryStatePath } from './ScanStateStore'
import { customIndexManager } from './CustomMusicService'
import * as cache from '../cache/FileCacheService'
import { getUserConfig } from '../../../user'
import { automaticActionEnabled, observeAutomaticMaintenance, startMaintenance, setAutomaticMaintenanceOpen, type AutomaticMaintenanceResult } from './MusicMaintenanceService'
import { waitMusicTask } from './MusicTaskService'

import { inQuietHours } from './AutoFixPolicy'
export { inQuietHours } from './AutoFixPolicy'
interface FixState { version: number; items: Record<string, { signature: string; status: string; retryAt?: number }>; log: AutomaticMaintenanceResult[] }
export class LibraryAutoFixService {
  private candidates = new Map<string, { username: string; item: any }>()
  private states = new Map<string, FixState>()
  private running?: Promise<void>
  private wakeRequested = false
  private stopped = true
  private unsubscribe?: () => void
  private timer?: NodeJS.Timeout
  private enabled() { return automaticActionEnabled('embed') || automaticActionEnabled('metadata') }
  private state(username: string) {
    let value = this.states.get(username)
    if (!value) {
      try { const file = libraryStatePath(username, 'auto_fix_state.json'); if (storageFs.existsSync(file)) { const parsed = JSON.parse(storageFs.readFileSync(file, 'utf8')); if (parsed.version === 1 && parsed.items && Array.isArray(parsed.log)) value = parsed } } catch (error) { console.warn('[自动修复] 忽略损坏状态', error) }
      if (!value) value = { version: 1, items: {}, log: [] }
      this.states.set(username, value)
    }
    return value
  }
  private save(username: string) { storageFs.writeFileSync(libraryStatePath(username, 'auto_fix_state.json'), JSON.stringify(this.state(username)), 'utf8') }
  start() {
    if (!this.stopped) return
    this.stopped = false; setAutomaticMaintenanceOpen(true)
    observeAutomaticMaintenance(event => {
      const state = this.state(event.username); state.log.push(event); state.log = state.log.slice(-200); this.save(event.username)
    })
    this.unsubscribe = serverEvents.onEvent('library:scan-finished', event => {
      setImmediate(() => {
        if (this.stopped || !this.enabled()) return
        const wanted = new Set([...event.added, ...event.changed])
        for (const filename of event.removed) this.candidates.delete(event.username + ':custom:' + filename)
        for (const item of customIndexManager.getAll(event.username)) if (wanted.has(item.filename)) this.register(event.username, item)
        void this.registerCache(event.username).catch(error => console.warn('[自动修复] 注册候选失败', error))
      })
    })
  }
  resourceReady(username: string, filename: string) {
    if (this.stopped || !this.enabled()) return
    const item = customIndexManager.load(username).get(filename)
    if (item) this.register(username, item)
    this.kick()
  }
  private register(username: string, item: any) {
    if (this.candidates.size >= 5000) return
    this.candidates.set(username + ':' + item.folder + ':' + item.filename, { username, item })
  }
  private async registerCache(username: string) {
    for (const item of await cache.getCacheList(username)) {
      if (this.stopped || !this.enabled()) break
      this.register(username, item)
    }
    this.kick()
  }
  private defer() {
    if (this.timer || this.stopped || !this.enabled() || !this.candidates.size) return
    // Owner: auto-fix service, only while candidates remain; cleared on disable/stop.
    this.timer = setTimeout(() => { this.timer = undefined; this.kick() }, 60000); this.timer.unref()
  }
  private kick() {
    if (this.stopped || !this.enabled()) return
    if (this.running) { this.wakeRequested = true; return }
    if (!inQuietHours(global.lx.config['library.autoFix.quietHours'] || '')) { this.defer(); return }
    this.running = this.process().catch(error => console.warn('[自动修复] 本轮失败', error)).finally(() => {
      this.running = undefined
      if (this.wakeRequested) { this.wakeRequested = false; setImmediate(() => this.kick()) }
      else this.defer()
    })
  }
  private async process() {
    let processed = 0
    const limit = Math.max(1, Math.min(5000, global.lx.config['library.autoFix.maxPerRun'] ?? 200))
    for (const [key, candidate] of [...this.candidates]) {
      if (this.stopped || !this.enabled() || processed >= limit || !inQuietHours(global.lx.config['library.autoFix.quietHours'] || '')) break
      const { username, item } = candidate
      if (item.folder === 'custom' && (global.lx.config['library.autoFix.scope'] !== 'cache+custom' || !getUserConfig(username)?.allowWriteCustomMusicDir)) { this.candidates.delete(key); continue }
      const signature = item.size + ':' + item.mtime + ':' + (item.lyricVersion || '') + ':policy1'
      const state = this.state(username)
      let deferred = false
      for (const action of ['embed', 'metadata']) {
        if (!automaticActionEnabled(action)) continue
        const stateKey = item.folder + ':' + item.filename + ':' + action
        const old = state.items[stateKey]
        if (old?.signature === signature && (old.status === 'done' || old.status === 'failed' || (old.retryAt || 0) > Date.now())) { if (old.retryAt) deferred = true; continue }
        // Missing local lyrics are temporary; wait for an explicit resource-ready signal or next scan.
        if (action === 'embed' && !item.hasEmbedLyric && !item.hasLyric && !item.lyricFilename) { deferred = true; continue }
        if (action === 'embed' && item.hasEmbedLyric) { state.items[stateKey] = { signature, status: 'done' }; continue }
        try {
          const task = await startMaintenance(username, { action, songs: [{ ...item, customFilename: item.folder === 'custom' ? item.filename : undefined }], origin: 'auto', mode: action === 'metadata' ? 'fill-missing' : 'overwrite' }, false)
          const result = await waitMusicTask(task.id)
          const last = state.log[state.log.length - 1]
          const busy = !!last?.reason?.includes('BUSY') || !!result?.errors.some(error => error.includes('BUSY'))
          if (busy) { deferred = true; state.items[stateKey] = { signature, status: 'deferred', retryAt: Date.now() + (item.folder === 'custom' ? 6 * 3600000 : 60000) } }
          else state.items[stateKey] = { signature, status: result && result.failed === 0 && result.status !== 'error' ? 'done' : 'failed' }
          this.save(username)
        } catch (error: any) {
          if (error.statusCode === 409) { deferred = true; break }
          state.items[stateKey] = { signature, status: 'failed' }
          state.log.push({ username, filename: item.filename, action, status: 'failed', reason: error.message, at: Date.now() }); state.log = state.log.slice(-200)
          this.save(username)
        }
      }
      if (!deferred) this.candidates.delete(key)
      processed++
    }
  }
  log(username?: string) {
    const users = username ? [username] : (global.lx.config.users || []).map(user => user.name)
    return users.flatMap(user => this.state(user).log).sort((a, b) => b.at - a.at).slice(0, 200)
  }
  refresh() {
    if (!this.enabled()) { this.candidates.clear(); if (this.timer) clearTimeout(this.timer); this.timer = undefined }
    else { for (const user of global.lx.config.users || []) void this.registerCache(user.name).catch(error => console.warn('[自动修复]', error)); this.kick() }
  }
  async stop() { this.stopped = true; setAutomaticMaintenanceOpen(false); this.unsubscribe?.(); this.unsubscribe = undefined; if (this.timer) clearTimeout(this.timer); this.timer = undefined; this.candidates.clear(); await this.running; observeAutomaticMaintenance(); for (const username of this.states.keys()) this.save(username) }
}
export const libraryAutoFixService = new LibraryAutoFixService()
