import storageFs from '../../../application/persistence/documentFileSystem'
import { libraryStatePath } from './ScanStateStore'

export interface PrefetchResourceState { signature: string; status: 'done' | 'none' | 'failed'; attempts: number; nextRetryAt: number; version?: string }
export class PrefetchStateStore {
  items: Record<string, PrefetchResourceState> = {}
  cursor = 0
  private timer?: NodeJS.Timeout
  constructor(readonly username: string) {
    const file = libraryStatePath(username, 'prefetch_state.json')
    try {
      if (storageFs.existsSync(file)) {
        const value = JSON.parse(storageFs.readFileSync(file, 'utf8'))
        if (value.version === 1 && value.items && typeof value.items === 'object') { this.items = value.items; this.cursor = Number.isSafeInteger(value.cursor) ? value.cursor : 0 }
      }
    } catch (error) { console.warn('[预取] 忽略损坏状态', error) }
  }
  scheduleSave() {
    if (this.timer) return
    // Owner: user state store; one trailing commit, cleared and flushed on service stop.
    this.timer = setTimeout(() => { this.timer = undefined; try { this.flush() } catch (error) { console.error('[预取] 状态保存失败', error) } }, 10000)
    this.timer.unref()
  }
  flush() { if (this.timer) clearTimeout(this.timer); this.timer = undefined; storageFs.writeFileSync(libraryStatePath(this.username, 'prefetch_state.json'), JSON.stringify({ version: 1, cursor: this.cursor, items: this.items }), 'utf8') }
}
