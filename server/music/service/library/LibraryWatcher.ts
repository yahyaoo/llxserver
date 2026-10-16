import fs from 'node:fs'
import path from 'node:path'
import type { MusicDirectory } from '../../../application/library/MusicDirectoryService'

export type DirtyListener = (username: string, directoryId: string, paths: string[], uncertain: boolean) => void
interface WatchEntry {
  username: string; directory: MusicDirectory; handle?: fs.FSWatcher; timer?: NodeJS.Timeout
  paths: Set<string>; uncertain: boolean; firstAt: number
  state: 'active' | 'disabled' | 'failed' | 'unsupported'; reason?: string; since: number; retryAt?: number; signature: string
}

/** Native watches are hints; full scans remain the correctness fallback. */
export function networkFileSystem(directory: string): boolean {
  if (directory.startsWith('\\\\')) return true
  if (process.platform !== 'linux') return false
  try {
    const decode = (value: string) => value.replace(/\\([0-7]{3})/g, (_, code) => String.fromCharCode(parseInt(code, 8)))
    const mounts = fs.readFileSync('/proc/self/mounts', 'utf8').split('\n').map(line => line.split(' '))
      .map(parts => ({ root: decode(parts[1] || ''), type: parts[2] || '' }))
      .filter(item => item.root && (directory === item.root || directory.startsWith(item.root.replace(/\/$/, '') + '/')))
      .sort((a, b) => b.root.length - a.root.length)
    return /^(cifs|smb3|nfs4?|9p|fuse\.)/.test(mounts[0]?.type || '')
  } catch { return false }
}

export class LibraryWatcher {
  private entries = new Map<string, WatchEntry>()
  private suppressed = new Map<string, NodeJS.Timeout>()
  private listener?: DirtyListener
  configure(username: string, directories: MusicDirectory[], config: Record<string, any>, onDirty: DirtyListener) {
    this.listener = onDirty
    const wanted = new Set(directories.map(directory => username + ':' + directory.id))
    for (const [key, entry] of this.entries) if (entry.username === username && !wanted.has(key)) { this.close(entry); this.entries.delete(key) }
    for (const directory of directories) {
      const key = username + ':' + directory.id
      const signature = JSON.stringify([directory, config['library.scan.enabled'], config['library.scan.legacy'], config['library.scan.watch'], config['library.scan.watchMode'], config['library.scan.watchDebounceSeconds']])
      const old = this.entries.get(key)
      if (old?.signature === signature && !(old.state === 'failed' && Date.now() >= (old.retryAt || old.since + 6 * 3600000))) continue
      if (old) this.close(old)
      const entry: WatchEntry = { username, directory, signature, paths: new Set(), uncertain: false, firstAt: 0, state: 'disabled', since: Date.now() }
      this.entries.set(key, entry)
      const mode = config['library.scan.watchMode'] || 'auto'
      if (config['library.scan.enabled'] === false || config['library.scan.legacy'] === true || !(directory.watch ?? config['library.scan.watch'] ?? true) || ['off', 'polling'].includes(mode)) { entry.reason = config['library.scan.legacy'] === true ? '兼容全量扫描' : '定时 quick/full 扫描'; continue }
      if (mode === 'auto' && networkFileSystem(directory.path)) { entry.state = 'unsupported'; entry.reason = '网络文件系统，使用定时扫描'; continue }
      const fail = (error: any, rootChanged = false) => {
        entry.handle?.close(); entry.handle = undefined; entry.state = 'failed'; entry.reason = error.code || error.message; entry.since = Date.now()
        entry.retryAt = Date.now() + (rootChanged || error.code === 'ENOENT' ? 60000 : 6 * 3600000)
        this.dirty(entry, '', true, config)
      }
      try {
        entry.handle = fs.watch(directory.path, { recursive: true }, (event, filename) => {
          const value = filename?.toString().replace(/\\/g, '/') || ''
          if (value.split('/').some(part => part.startsWith('.') || part === 'node_modules')) return
          if (path.isAbsolute(value) || value.split('/').includes('..')) { this.dirty(entry, '', true, config); return }
          if (this.suppressed.has(path.resolve(directory.path, value))) return
          // Root replacement invalidates an inode-bound handle. Re-register on the next scheduler tick.
          if (!value) { fail(Error('不确定监听事件，重新核查根目录'), true); return }
          this.dirty(entry, value, false, config)
        })
        entry.handle.on('error', fail)
        entry.handle.unref(); entry.state = 'active'
      } catch (error) { fail(error) }
    }
  }
  private dirty(entry: WatchEntry, value: string, uncertain: boolean, config: Record<string, any>) {
    if (!entry.firstAt) entry.firstAt = Date.now()
    if (value) entry.paths.add(value)
    entry.uncertain ||= uncertain || entry.paths.size > 500
    if (entry.uncertain) entry.paths.clear() // full, never quick, covers overflow/unknown hints
    if (entry.timer) clearTimeout(entry.timer)
    const debounce = Math.max(2000, (config['library.scan.watchDebounceSeconds'] ?? 10) * 1000)
    const delay = Math.max(0, Math.min(debounce, entry.firstAt + debounce * 5 - Date.now()))
    // Owner: this entry; cleared on flush, reconfiguration and stop.
    entry.timer = setTimeout(() => {
      const values = [...entry.paths], full = entry.uncertain
      entry.paths.clear(); entry.uncertain = false; entry.firstAt = 0; entry.timer = undefined
      this.listener?.(entry.username, entry.directory.id, values, full)
    }, delay)
    entry.timer.unref()
  }
  suppress(absolutePath: string, ms = 30000) {
    absolutePath = path.resolve(absolutePath)
    const previous = this.suppressed.get(absolutePath); if (previous) clearTimeout(previous)
    const timer = setTimeout(() => { this.suppressed.delete(absolutePath); this.markDirty(absolutePath) }, ms)
    timer.unref(); this.suppressed.set(absolutePath, timer)
  }
  markDirty(absolutePath: string) {
    const resolved = path.resolve(absolutePath)
    const timer = this.suppressed.get(resolved); if (timer) clearTimeout(timer)
    this.suppressed.delete(resolved)
    for (const entry of this.entries.values()) {
      const relative = path.relative(entry.directory.path, resolved)
      if (relative && !relative.startsWith('..') && !path.isAbsolute(relative)) this.listener?.(entry.username, entry.directory.id, [relative.replace(/\\/g, '/')], false)
    }
  }
  getStatus(username?: string) { return [...this.entries.values()].filter(entry => !username || entry.username === username).map(entry => ({ username: entry.username, directoryId: entry.directory.id, path: entry.directory.path, state: entry.state, reason: entry.reason, since: entry.since })) }
  private close(entry: WatchEntry) { entry.handle?.close(); if (entry.timer) clearTimeout(entry.timer) }
  stop() { for (const entry of this.entries.values()) this.close(entry); this.entries.clear(); for (const timer of this.suppressed.values()) clearTimeout(timer); this.suppressed.clear(); this.listener = undefined }
}
export const libraryWatcher = new LibraryWatcher()
