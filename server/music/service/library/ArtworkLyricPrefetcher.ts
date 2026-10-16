import { serverEvents } from '../../../application/events/ServerEvents'
import { customIndexManager, ensureCustomCover, getCoverVersion } from './CustomMusicService'
import { customMediaFingerprint, ensureCustomLyrics, removeCustomLyricCache } from './CustomLyricCache'
import { PrefetchStateStore } from './PrefetchStateStore'
import { pruneLibraryMedia, waitLibraryMediaPruning } from './LibraryMediaQuota'

type Kind = 'cover' | 'lyric'
interface Job { username: string; filename: string; kind: Kind; priority: 0 | 1; generation: number }
export const prefetchRetryDelay = (attempt: number) => [3600000, 6 * 3600000, 24 * 3600000, 7 * 86400000][Math.min(3, Math.max(0, attempt - 1))]

/** Service-wide bounded queue. Backfill holds cursors, not one task per library entry. */
export class ArtworkLyricPrefetcher {
  private queue = new Map<string, Job>()
  private active = new Map<string, Promise<void>>()
  private stores = new Map<string, PrefetchStateStore>()
  private backfills = new Map<string, { keys: string[]; cursor: number; restart?: boolean }>()
  private generations = new Map<string, number>()
  private scanning = new Set<string>()
  private unsubscribers: Array<() => void> = []
  private networkTimes: number[] = []
  private networkSerial: Promise<unknown> = Promise.resolve()
  private networkRequests: Promise<unknown> = Promise.resolve()
  private waits = new Map<NodeJS.Timeout, () => void>()
  private stopped = true
  private done = new Map<string, number>()
  private failed = new Map<string, number>()
  private lastProgress = new Map<string, number>()
  private lastNotified = new Map<string, number>()
  private startedBackfill = new Set<string>()
  private networkErrors = 0
  private cooldown = 0
  private retryTimer?: NodeJS.Timeout
  private retryAt = Infinity
  onReady?: (username: string, filename: string, kind: Kind) => void
  private key(username: string, filename: string, kind?: Kind) { return username + ':' + filename + ':' + (kind || '') }
  private store(username: string) { let value = this.stores.get(username); if (!value) { value = new PrefetchStateStore(username); this.stores.set(username, value) }; return value }
  start() {
    if (!this.stopped) return
    this.stopped = false
    this.unsubscribers.push(serverEvents.onEvent('library:scan-started', event => this.scanning.add(event.username)))
    this.unsubscribers.push(serverEvents.onEvent('library:scan-finished', event => {
      this.scanning.delete(event.username)
      setImmediate(() => {
        if (this.stopped || global.lx.config['library.prefetch.enabled'] === false) return
        for (const filename of event.removed) this.remove(event.username, filename)
        for (const filename of [...event.added, ...event.changed]) this.enqueue(event.username, filename, 0)
        if (!event.error && !this.startedBackfill.has(event.username) && global.lx.config['library.prefetch.backfillOnStartup'] !== false) {
          this.startedBackfill.add(event.username); this.run(event.username, 'backfill')
        }
        this.pump()
      })
    }))
  }
  enqueue(username: string, filename: string, priority: 0 | 1 = 0) {
    if (this.stopped || global.lx.config['library.prefetch.enabled'] === false) return
    for (const kind of ['cover', 'lyric'] as Kind[]) {
      if (global.lx.config[kind === 'cover' ? 'library.prefetch.cover' : 'library.prefetch.lyric'] === false) continue
      const key = this.key(username, filename, kind)
      if (this.queue.has(key)) { if (priority === 0) this.queue.get(key)!.priority = 0; continue }
      if (this.queue.size >= 5000) { const backfill = this.backfills.get(username); if (backfill) backfill.restart = true; else this.run(username, 'backfill'); break }
      this.queue.set(key, { username, filename, kind, priority, generation: this.generations.get(this.key(username, filename)) || 0 })
    }
    this.pump()
  }
  run(username: string, mode: 'backfill' | 'retry-failed' = 'backfill') {
    const store = this.store(username)
    if (mode === 'retry-failed') for (const value of Object.values(store.items)) if (value.status === 'failed') { value.nextRetryAt = 0; value.attempts = 0 }
    const keys = customIndexManager.getAll(username).map(item => item.filename)
    // Admission is not completion: replay cached records after restart rather than skip interrupted jobs.
    this.backfills.set(username, { keys, cursor: 0 })
    this.pump()
  }
  private fill() {
    // Round-robin users, at most 500 resources at once, leave queue budget for fresh changes.
    let remaining = 500
    while (remaining > 0 && this.queue.size < 4500 && this.backfills.size) {
      for (const [username, backfill] of [...this.backfills]) {
        if (remaining <= 0 || this.queue.size >= 4500) break
        const filename = backfill.keys[backfill.cursor++]
        if (filename) {
          const store = this.store(username); store.cursor = backfill.cursor; store.scheduleSave()
          for (const kind of ['cover', 'lyric'] as Kind[]) {
            if (global.lx.config[kind === 'cover' ? 'library.prefetch.cover' : 'library.prefetch.lyric'] === false) continue
            const key = this.key(username, filename, kind)
            if (!this.queue.has(key) && !this.active.has(key)) this.queue.set(key, { username, filename, kind, priority: 1, generation: this.generations.get(this.key(username, filename)) || 0 })
          }
          remaining--
        } else if (backfill.restart) { backfill.keys = customIndexManager.getAll(username).map(item => item.filename); backfill.cursor = 0; backfill.restart = false }
        else { this.backfills.delete(username); this.store(username).cursor = 0; this.store(username).scheduleSave() }
      }
    }
  }
  private pump() {
    if (this.stopped || global.lx.config['library.prefetch.enabled'] === false || this.scanning.size) return
    this.fill()
    const concurrency = Math.max(1, Math.min(4, global.lx.config['library.prefetch.concurrency'] ?? 2))
    while (this.active.size < concurrency && this.queue.size) {
      const candidates = [...this.queue.entries()].filter(([key]) => !this.active.has(key)).sort((a, b) => a[1].priority - b[1].priority)
      if (!candidates.length) break
      const [key, job] = candidates[0]; this.queue.delete(key)
      const operation = this.process(job).catch(error => console.warn('[预取] 处理失败', error)).finally(() => {
        this.active.delete(key); this.progress(job.username); this.pump()
      })
      this.active.set(key, operation)
    }
  }
  private async networkPermit() {
    const operation = this.networkSerial.then(async () => {
      while (true) {
        if (this.stopped || global.lx.config['library.prefetch.enabled'] === false || global.lx.config['library.prefetch.network'] === false) throw Error('CANCELLED: 网络预取已停止')
        const now = Date.now(), limit = global.lx.config['library.prefetch.networkPerMinute'] ?? 30
        this.networkTimes = this.networkTimes.filter(time => now - time < 60000)
        const delay = Math.max(this.cooldown - now, this.networkTimes.length >= limit ? this.networkTimes[0] + 60000 - now : 0)
        if (delay <= 0) { this.networkTimes.push(now); return }
        await new Promise<void>(resolve => { const timer = setTimeout(() => { this.waits.delete(timer); resolve() }, delay); this.waits.set(timer, resolve) })
      }
    })
    this.networkSerial = operation.catch(() => {}); await operation
  }
  private async process(job: Job) {
    if (global.lx.config[job.kind === 'cover' ? 'library.prefetch.cover' : 'library.prefetch.lyric'] === false) return
    const store = this.store(job.username), stateKey = job.kind + ':' + job.filename
    let signature = ''
    try {
      const before = await customMediaFingerprint(job.username, job.filename, job.kind); signature = before.signature
      const old = store.items[stateKey]
      if (old?.signature === signature && old.status !== 'done' && old.nextRetryAt > Date.now()) { this.scheduleRetry(old.nextRetryAt); return }
      const options = { background: true, network: global.lx.config['library.prefetch.network'] !== false, runNetwork: (run: () => Promise<any>) => {
        const request = this.networkRequests.then(async () => { await this.networkPermit(); const result = await run(); if (result) this.networkErrors = 0; return result })
        this.networkRequests = request.catch(() => {}); return request
      } }
      const result = job.kind === 'cover' ? await ensureCustomCover(job.filename, job.username, options) : await ensureCustomLyrics(job.username, job.filename, options)
      const after = await customMediaFingerprint(job.username, job.filename, job.kind)
      if (this.stopped || global.lx.config['library.prefetch.enabled'] === false || after.signature !== signature || job.generation !== (this.generations.get(this.key(job.username, job.filename)) || 0)) return
      store.items[stateKey] = { signature, status: result ? 'done' : 'none', attempts: 0, nextRetryAt: result ? 0 : Date.now() + 86400000, version: job.kind === 'cover' ? getCoverVersion(job.username, job.filename) : result?.version }
      if (!result) this.scheduleRetry(store.items[stateKey].nextRetryAt)
      this.done.set(job.username, (this.done.get(job.username) || 0) + 1)
      if ((this.done.get(job.username)! - 1) % 50 === 0) void pruneLibraryMedia(job.username).catch(error => console.warn('[媒体缓存] 配额清理失败', error))
      if (result) this.onReady?.(job.username, job.filename, job.kind)
    } catch (error: any) {
      if (this.stopped || /CANCELLED/.test(error.message)) return
      const prior = store.items[stateKey], attempts = prior?.signature === signature ? prior.attempts + 1 : 1
      store.items[stateKey] = { signature, status: 'failed', attempts, nextRetryAt: Date.now() + (/BUSY/.test(error.message) ? 60000 : prefetchRetryDelay(attempts)) }
      this.scheduleRetry(store.items[stateKey].nextRetryAt)
      this.failed.set(job.username, (this.failed.get(job.username) || 0) + 1)
      if (/NETWORK/.test(error.message) && ++this.networkErrors >= 5) { this.cooldown = Date.now() + 600000; this.networkErrors = 0 }
    } finally { if (!this.stopped) store.scheduleSave() }
  }
  private scheduleRetry(at: number) {
    if (this.stopped || global.lx.config['library.prefetch.enabled'] === false || at >= this.retryAt) return
    if (this.retryTimer) clearTimeout(this.retryTimer)
    this.retryAt = at
    // Owner: prefetcher; one deadline for persisted retry/negative-TTL records, never idle progress polling.
    this.retryTimer = setTimeout(() => {
      this.retryTimer = undefined; this.retryAt = Infinity
      let admitted = 0, next = Infinity
      for (const [username, store] of this.stores) for (const [key, state] of Object.entries(store.items)) {
        if (state.status === 'done' || !state.nextRetryAt) continue
        if (state.nextRetryAt > Date.now()) { next = Math.min(next, state.nextRetryAt); continue }
        if (admitted >= 500 || this.queue.size >= 4500) { next = Math.min(next, Date.now() + 60000); continue }
        const separator = key.indexOf(':'), kind = key.slice(0, separator) as Kind, filename = key.slice(separator + 1)
        if (!['cover', 'lyric'].includes(kind)) continue
        if (global.lx.config[kind === 'cover' ? 'library.prefetch.cover' : 'library.prefetch.lyric'] === false) continue
        const jobKey = this.key(username, filename, kind)
        if (!this.queue.has(jobKey) && !this.active.has(jobKey)) { this.queue.set(jobKey, { username, filename, kind, priority: 1, generation: this.generations.get(this.key(username, filename)) || 0 }); admitted++ }
      }
      if (Number.isFinite(next)) this.scheduleRetry(next)
      this.pump()
    }, Math.max(1, at - Date.now()))
    this.retryTimer.unref()
  }
  private progress(username: string) {
    const status = this.status(username)[0]
    if (!status) return
    if (status.running && Date.now() - (this.lastProgress.get(username) || 0) < 5000 && status.done % 50 !== 0) return
    this.lastProgress.set(username, Date.now()); serverEvents.emitEvent('library:prefetch-progress', status)
    if (!status.running && status.done > (this.lastNotified.get(username) || 0)) {
      void pruneLibraryMedia(username).catch(error => console.warn('[媒体缓存] 配额清理失败', error))
      this.lastNotified.set(username, status.done)
      serverEvents.emitEvent('notify', { username, id: 'library-prefetch-' + Date.now(), level: 'success', title: '媒体预取队列已处理完毕', createdAt: Date.now() })
    }
  }
  status(username?: string) {
    const users = username ? [username] : [...new Set([...this.stores.keys(), ...this.queue.values()].map(value => typeof value === 'string' ? value : value.username))]
    return users.map(user => ({ username: user, queued: [...this.queue.values()].filter(job => job.username === user).length, done: this.done.get(user) || 0, failed: this.failed.get(user) || 0, running: [...this.active.keys()].some(key => key.startsWith(user + ':')) || this.backfills.has(user) || [...this.queue.values()].some(job => job.username === user) }))
  }
  private remove(username: string, filename: string) {
    const key = this.key(username, filename); this.generations.set(key, (this.generations.get(key) || 0) + 1)
    for (const kind of ['cover', 'lyric'] as Kind[]) { this.queue.delete(this.key(username, filename, kind)); delete this.store(username).items[kind + ':' + filename] }
    this.store(username).scheduleSave(); void removeCustomLyricCache(username, filename).catch(error => console.warn('[预取] 清理失败', error))
  }
  refresh() {
    if (global.lx.config['library.prefetch.enabled'] === false) {
      if (this.retryTimer) clearTimeout(this.retryTimer); this.retryTimer = undefined; this.retryAt = Infinity
      this.queue.clear(); this.backfills.clear()
      for (const [timer, resolve] of this.waits) { clearTimeout(timer); resolve() }; this.waits.clear()
    } else this.pump()
  }
  async stop() {
    this.stopped = true; for (const unsubscribe of this.unsubscribers.splice(0)) unsubscribe()
    if (this.retryTimer) clearTimeout(this.retryTimer); this.retryTimer = undefined; this.retryAt = Infinity
    this.queue.clear(); this.backfills.clear()
    for (const [timer, resolve] of this.waits) { clearTimeout(timer); resolve() }; this.waits.clear()
    await Promise.allSettled([...this.active.values()]); await waitLibraryMediaPruning(); for (const store of this.stores.values()) store.flush()
    this.scanning.clear(); this.startedBackfill.clear()
  }
}
export const artworkLyricPrefetcher = new ArtworkLyricPrefetcher()
