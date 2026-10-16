import path from 'node:path'
import crypto from 'node:crypto'
import storageFs from '../../../application/persistence/documentFileSystem'

export interface DirectoryScanState {
  path: string; lastQuickScanAt: number; lastFullScanAt: number
  folders: Record<string, number>
  watch?: { state: string; reason?: string; since: number }
}

export const libraryStatePath = (username: string, name: string) => path.join(global.lx.dataPath, 'library', crypto.createHash('sha256').update(username).digest('hex'), name)

/** The document adapter commits registered JSON atomically in SQLite, retaining legacy reads. */
export class ScanStateStore {
  private value: { version: number; directories: Record<string, DirectoryScanState> } = { version: 1, directories: {} }
  constructor(readonly username: string) {
    try {
      const file = libraryStatePath(username, 'scan_state.json')
      if (storageFs.existsSync(file)) {
        const parsed = JSON.parse(storageFs.readFileSync(file, 'utf8'))
        if (parsed.version !== 1 || !parsed.directories || typeof parsed.directories !== 'object') throw Error('invalid scan state')
        this.value = parsed
      }
    } catch (error) { console.warn('[音乐扫描] 状态损坏，重新完整扫描', error) }
  }
  get(id: string, directory: string): DirectoryScanState {
    const state = this.value.directories[id]
    return state?.path === directory && state.folders && typeof state.lastFullScanAt === 'number' && typeof state.lastQuickScanAt === 'number'
      ? state : { path: directory, lastQuickScanAt: 0, lastFullScanAt: 0, folders: {} }
  }
  update(id: string, state: DirectoryScanState) { this.value.directories[id] = state; this.flush() }
  flush() { storageFs.writeFileSync(libraryStatePath(this.username, 'scan_state.json'), JSON.stringify(this.value), 'utf8') }
}
