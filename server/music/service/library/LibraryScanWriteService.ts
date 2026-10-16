import { serverEvents } from '../../../application/events/ServerEvents'
import { customIndexManager } from './CustomMusicService'
import { startMaintenance } from './MusicMaintenanceService'
import { waitMusicTask } from './MusicTaskService'

/** 扫描完成后按配置把已预取的歌词或封面写入自定义音乐文件。 */
export class LibraryScanWriteService {
  private candidates = new Map<string, Set<string>>()
  private running = new Map<string, Promise<void>>()
  private tails = new Map<string, Promise<void>>()
  private processed = new Set<string>()
  private unsubscribe?: () => void
  private stopped = true

  start() {
    if (!this.stopped) return
    this.stopped = false
    this.unsubscribe = serverEvents.onEvent('library:scan-finished', event => {
      const wanted = this.candidates.get(event.username) || new Set<string>()
      this.candidates.set(event.username, wanted)
      for (const filename of event.removed) { wanted.delete(filename); this.processed.delete(`${event.username}:${filename}:cover`); this.processed.delete(`${event.username}:${filename}:lyric`) }
      let totalCandidates = [...this.candidates.values()].reduce((count, names) => count + names.size, 0)
      for (const filename of [...event.added, ...event.changed]) {
        if (!wanted.has(filename) && totalCandidates >= 5000) continue
        if (!wanted.has(filename)) totalCandidates++
        wanted.add(filename)
        this.processed.delete(`${event.username}:${filename}:cover`)
        this.processed.delete(`${event.username}:${filename}:lyric`)
      }
    })
  }

  resourceReady(username: string, filename: string, kind: 'cover' | 'lyric') {
    if (this.stopped || !this.candidates.get(username)?.has(filename)) return
    const key = `${username}:${filename}:${kind}`
    if (this.running.has(key) || this.processed.has(key)) return
    this.processed.add(key)
    const prior = this.tails.get(username) || Promise.resolve()
    const operation = prior.catch(() => {}).then(() => this.process(username, filename, kind)).catch(error => {
      console.warn('[扫描写入] 单曲处理失败', { username, filename, kind, error: error?.message || String(error) })
    }).finally(() => {
      this.running.delete(key)
      if (this.tails.get(username) === operation) this.tails.delete(username)
    })
    this.running.set(key, operation)
    this.tails.set(username, operation)
  }

  refresh() {
    if (this.stopped) return
    this.processed.clear()
    for (const [username, filenames] of this.candidates) for (const filename of filenames) {
      this.resourceReady(username, filename, 'lyric')
      this.resourceReady(username, filename, 'cover')
    }
  }

  private async process(username: string, filename: string, kind: 'cover' | 'lyric') {
    const item = customIndexManager.load(username).get(filename)
    if (!item || this.stopped) return
    const lyricMode = global.lx.config['library.scan.lyricWriteMode'] || 'sidecar'
    const actions: Array<{ action: string; coverOnly?: boolean }> = []
    if (kind === 'lyric' && ['sidecar', 'both'].includes(lyricMode)) actions.push({ action: 'lyrics' })
    if (kind === 'lyric' && ['embedded', 'both'].includes(lyricMode)) actions.push({ action: 'embed' })
    if (kind === 'cover' && global.lx.config['library.scan.embedCover'] === true) actions.push({ action: 'metadata', coverOnly: true })
    for (const entry of actions) {
      if (this.stopped) break
      try {
        const task = await startMaintenance(username, {
          action: entry.action,
          songs: [{ ...item, customFilename: item.filename }],
          origin: 'scan',
          mode: 'fill-missing',
          coverOnly: entry.coverOnly,
        })
        await waitMusicTask(task.id)
      } catch (error: any) {
        console.warn('[扫描写入] 单曲写入跳过', { username, filename, action: entry.action, reason: error?.message || String(error) })
      }
    }
  }

  async stop() {
    this.stopped = true
    this.unsubscribe?.()
    this.unsubscribe = undefined
    this.candidates.clear()
    this.processed.clear()
    await Promise.allSettled([...this.running.values()])
    this.running.clear()
    this.tails.clear()
  }
}

export const libraryScanWriteService = new LibraryScanWriteService()
