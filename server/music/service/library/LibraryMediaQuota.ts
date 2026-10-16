import fs from 'node:fs'
import path from 'node:path'
import { getCoverCacheDir } from '../cache/FileCacheService'
import { libraryStatePath } from './ScanStateStore'
import { invalidateCustomCoverHints } from './CustomMusicService'

const pending = new Map<string, Promise<void>>()
/** Only hashed media artifacts are evictable; music, sidecars, indexes and user documents are never candidates. */
export function pruneLibraryMedia(username: string): Promise<void> {
  const existing = pending.get(username); if (existing) return existing
  const operation = (async () => {
    const roots = [getCoverCacheDir(username), path.join(path.dirname(libraryStatePath(username, 'prefetch_state.json')), 'media')]
    const candidates: Array<{ file: string; size: number; at: number }> = []
    let total = 0
    for (const root of roots) {
      let entries: fs.Dirent[]
      try { entries = await fs.promises.readdir(root, { withFileTypes: true }) } catch (error: any) { if (error.code === 'ENOENT') continue; throw error }
      for (const entry of entries) {
        if (!entry.isFile() || !/^(?:[a-f0-9]{32}\.(?:bin|mime)|[a-f0-9]{64}\.lyrics)$/.test(entry.name)) continue
        const file = path.join(root, entry.name)
        try { const stat = await fs.promises.lstat(file); if (stat.isFile() && !stat.isSymbolicLink()) { total += stat.size; candidates.push({ file, size: stat.size, at: stat.mtimeMs }) } } catch (error: any) { if (error.code !== 'ENOENT') throw error }
      }
    }
    const limit = (global.lx.config['library.prefetch.maxCacheMB'] ?? 256) * 1024 * 1024
    if (total <= limit) return
    candidates.sort((a, b) => a.at - b.at)
    for (const candidate of candidates) {
      if (total <= limit * 0.9) break
      await fs.promises.unlink(candidate.file).catch((error: any) => { if (error.code !== 'ENOENT') throw error })
      total -= candidate.size
    }
    invalidateCustomCoverHints(username)
  })().finally(() => pending.delete(username))
  pending.set(username, operation); return operation
}
export const waitLibraryMediaPruning = () => Promise.allSettled([...pending.values()])
