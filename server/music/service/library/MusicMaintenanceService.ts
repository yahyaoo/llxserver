/** 多页面共用音乐维护服务；只接受业务歌曲标识，不接受客户端磁盘路径。 @author yahyaoo @date 2026-10-12 */
import fs from 'node:fs'
import path from 'node:path'
import * as cache from '../cache/FileCacheService'
import * as custom from './CustomMusicService'
import * as downloads from '../download/ServerDownloadService'
import { resolveMusicFile } from '../../../application/library/MusicDirectoryService'
import { getUserConfig } from '../../../user'
import { startMusicTask, maintenanceActions, type MaintenanceAction } from './MusicTaskService'
import { libraryWatcher } from './LibraryWatcher'
import { acquireMaintenanceFile, releaseMaintenanceFile, libraryHasReaders } from './LibraryFileGuard'
import { readCachedCustomLyrics } from './CustomLyricCache'

import { automaticActionEnabled } from './AutoFixPolicy'
export { automaticActionEnabled } from './AutoFixPolicy'
export interface AutomaticMaintenanceResult { username: string; filename: string; action: string; status: string; reason?: string; fields?: string[]; at: number }
let resultObserver: ((event: AutomaticMaintenanceResult) => void) | undefined
let automaticMaintenanceOpen = false
export const setAutomaticMaintenanceOpen = (value: boolean) => { automaticMaintenanceOpen = value }
export const observeAutomaticMaintenance = (observer?: typeof resultObserver) => { resultObserver = observer }

const identity = (song: any) => {
  const source = song.source || song.songInfo?.source || ''
  return source + ':' + String(song.songmid || song.meta?.songmid || song.songInfo?.songmid || song.id || '').replace(new RegExp('^' + source + '_'), '')
}
/** 文件身份优先；远程歌曲再按平台标识匹配，不按名称猜测。 */
const matches = (item: any, song: any) => song.serverDownloadId ? item.serverDownloadId === song.serverDownloadId
  : (song.customFilename || song.filename) ? item.filename === (song.customFilename || song.filename) && (!song.folder || item.folder === song.folder) && (!song.location || item.location === song.location)
  : identity(item) === identity(song) && (!song.folder || item.folder === song.folder) && (song.folder !== 'download' || !song.quality || item.quality === song.quality)

/** 创建任务并安装索引写回钩子。未知文件单首失败不影响其他歌曲。 */
export async function startMaintenance(username: string, payload: any, publicAdmin = false) {
  const action: MaintenanceAction = payload.action
  const automatic = payload.origin === 'auto'
  const scanWrite = payload.origin === 'scan'
  const mode = payload.mode ?? 'overwrite'
  if (scanWrite) {
    const lyricMode = global.lx.config['library.scan.lyricWriteMode'] || 'sidecar'
    const allowed = action === 'lyrics' ? ['sidecar', 'both'].includes(lyricMode)
      : action === 'embed' ? ['embedded', 'both'].includes(lyricMode)
        : action === 'metadata' && global.lx.config['library.scan.embedCover'] === true
    if (!allowed || (action === 'metadata' && payload.coverOnly !== true)) throw Error('扫描写入策略未启用')
  }
  if (!['overwrite', 'fill-missing'].includes(mode)) throw Error('不支持的元信息模式')
  if (automatic && (publicAdmin || !automaticMaintenanceOpen || !automaticActionEnabled(action))) throw Error('自动写入未启用')
  if (automatic && action === 'metadata' && mode !== 'fill-missing') throw Error('自动标签写入仅允许填补空缺')
  if (!maintenanceActions.includes(action)) throw new Error('不支持的维护操作')
  const library = [...await cache.getCacheList(username), ...await custom.getCustomMusicList(username), ...downloads.getLibraryItems(username)]
  const input = payload.scope === 'all' ? library : payload.songs
  if (!Array.isArray(input) || !input.length || input.length > 100000) throw new Error('没有可处理的歌曲')
  const seen = new Set<string>()
  const targets = input.map((song: any) => {
    if (!song || typeof song !== 'object') throw new Error('歌曲格式错误')
    const item = library.find(item => matches(item, song))
    if (!item && action !== 'lyrics') throw new Error('嵌入、元信息和删除操作需要已下载的本地文件')
    const key = item ? `${item.location || ''}:${item.folder}:${item.serverDownloadId || item.filename}` : identity(song)
    if (seen.has(key)) return null
    seen.add(key); return { item, song: { ...song, ...item?.songInfo } }
  }).filter(Boolean) as Array<{ item: any; song: any }>
  const cfg = getUserConfig(username)
  if (!publicAdmin && targets.some(target => target.item?.folder === 'custom') && !(action === 'delete' ? cfg?.allowOperateCustomMusicDir : cfg?.allowWriteCustomMusicDir)) {
    const error: any = new Error(action === 'delete' ? '管理员未允许删除自定义目录文件' : '管理员未允许写入自定义目录文件'); error.statusCode = 403; throw error
  }
  const resolved = new Map<number, any>()
  const held = new Set<string>()
  const release = (file?: string) => { if (file && held.delete(file)) releaseMaintenanceFile(file) }
  return startMusicTask(username, action, targets.length, {
    prepare(index) {
      const { item, song } = targets[index]
      if (!item) { resolved.set(index, { song }); return { song, skip: action === 'lyrics' ? undefined : '没有本地文件', lyricPath: path.join(cache.getCacheDir(username), cache.getFileName(song, song.quality, false, username) + '.lrc') } }
      let file: string | null, root: string
      if (item.folder === 'custom') { file = resolveMusicFile(username, item.filename); root = file ? path.dirname(file) : '' }
      else if (item.folder === 'download') { file = downloads.getMaintenanceFile(item.serverDownloadId, username); root = file ? path.dirname(file) : '' }
      else {
        root = cache.getCacheDir(username, item.folder === 'music', item.location)
        file = path.resolve(root, item.filename)
        const relative = path.relative(root, file)
        if (relative.startsWith('..') || path.isAbsolute(relative)) file = null
      }
      if (!file || !fs.existsSync(file) || fs.lstatSync(file).isSymbolicLink() || !fs.statSync(file).isFile()) throw new Error('文件不存在或不允许访问')
      const realRelative = path.relative(fs.realpathSync(root), fs.realpathSync(file))
      if (realRelative.startsWith('..') || path.isAbsolute(realRelative)) throw new Error('文件越界')
      file = fs.realpathSync(file)
      const lyricPath = file.slice(0, -path.extname(file).length) + '.lrc'
      resolved.set(index, { item, song, file, lyricPath })
      if (automatic || scanWrite) {
        if (!automaticMaintenanceOpen || (automatic && !automaticActionEnabled(action)) || (scanWrite && global.lx.config['library.autoFix.safeWrite'] === false)) return { skip: '自动写入已关闭' }
        if (automatic && (item.folder === 'custom' || item.location === 'custom')) return { skip: 'BUSY: 自定义目录缺少可证明的外部独占保护，自动写入跳过' }
        if (global.lx.config['subsonic.enable'] !== false && (global.lx.config['subsonic.port'] || 0) > 0) return { skip: 'BUSY: 独立 Subsonic 端口的读取状态未接入保护，自动写入跳过' }
        if (action !== 'lyrics' && !['.mp3', '.flac', '.m4a'].includes(path.extname(file).toLowerCase())) return { skip: '该格式未验证安全自动写入' }
        if (libraryHasReaders() || Date.now() - fs.statSync(file).mtimeMs < 60000) return { skip: 'BUSY: 正在播放或近期修改' }
        if (automatic && action === 'metadata' && (!song.source || ['custom', 'local', 'unknown'].includes(song.source) || !(song.songmid || song.id))) return { skip: '缺少可信平台关联信息' }
        // Crash recovery: old staged copies are disposable; never remove or rename an original here.
        for (const entry of fs.readdirSync(path.dirname(file), { withFileTypes: true })) {
          if (!entry.isFile() || !/^\.llx-auto-[a-f0-9-]{36}\.(mp3|flac|m4a)$/.test(entry.name)) continue
          const staged = path.join(path.dirname(file), entry.name)
          const stat = fs.lstatSync(staged)
          if (!stat.isSymbolicLink() && Date.now() - stat.mtimeMs > 86400000) fs.unlinkSync(staged)
        }
      }
      if (!acquireMaintenanceFile(file)) return { skip: 'BUSY: 文件已有维护任务' }
      held.add(file)
      if (automatic || scanWrite) libraryWatcher.suppress(file)
      return { path: file, lyricPath, song, mode, origin: automatic ? 'auto' : scanWrite ? 'scan' : 'manual', safeWrite: global.lx.config['library.autoFix.safeWrite'] !== false, exclusive: true, expected: fs.statSync(file), sidecars: [lyricPath], coverOnly: scanWrite && payload.coverOnly === true }
    },
    async lyrics(song) {
      if (automatic || scanWrite) {
        const current = [...resolved.values()].find(value => identity(value.song) === identity(song))
        if (current?.item?.folder === 'custom') return (await readCachedCustomLyrics(username, current.item.filename))?.lyrics?.lrc || null
        throw Error('BUSY: 尚无可信本地歌词，等待资源就绪')
      }
      const fetcher = cache.getLyricFetcher()
      if (!fetcher || ['custom', 'local', 'unknown'].includes(song.source)) throw new Error('该歌曲尚未关联网络音源，无法补全歌词')
      return await fetcher(song)
    },
    async cover(song) {
      if (automatic || scanWrite) {
        const current = [...resolved.values()].find(value => identity(value.song) === identity(song))
        if (!current?.file) return null
        return cache.readCoverCache(current.item.filename, username, fs.statSync(current.file))
      }
      const url = song.img || song.meta?.picUrl || song.picUrl || song.pic
      if (!url || !/^https?:\/\//i.test(url)) return null
      const result = await cache.downloadCoverImage(url)
      return result ? { mime: result.mime, data: result.data } : null
    },
    result(index, result) {
      const owned = resolved.get(index)
      release(owned?.file)
      if ((automatic || scanWrite) && owned?.file) {
        libraryWatcher.markDirty(owned.file)
        const event = { username, filename: owned.item.filename, action, status: result.status, reason: result.reason, fields: result.fields, at: Date.now() }
        resultObserver?.(event)
        console.info('[音乐自动修复]', JSON.stringify(event))
      }
      if (result.status === 'failed') return
      const current = resolved.get(index)
      if (!current?.item) return
      const { item, lyricPath } = current
      if (item.folder === 'download') { downloads.finishMaintenance(item.serverDownloadId, username, result, lyricPath); return }
      if (action === 'delete') {
        if (item.folder === 'custom') { custom.customIndexManager.remove(username, item.filename); custom.customIndexManager.save(username) }
        else cache.indexManager.remove(username, item.id, item.folder, item.quality, item.location)
        return
      }
      const updated = { ...item }
      for (const key of ['hasLyric', 'hasEmbedLyric', 'hasCover', 'size', 'mtime']) if (result[key] !== undefined) updated[key] = result[key]
      if (result.hasLyric && item.folder !== 'custom') updated.lyricFilename = path.relative(cache.getCacheDir(username, item.folder === 'music', item.location), lyricPath).replace(/\\/g, '/')
      if (result.hasCover) updated.coverType = 'embedded'
      if (item.folder === 'custom') { custom.customIndexManager.set(username, item.filename, updated); custom.customIndexManager.save(username) }
      else cache.indexManager.update(username, updated, item.folder, item.location)
    },
    authorize(value) {
      if (!(automatic || scanWrite) || !automaticMaintenanceOpen || (automatic && !automaticActionEnabled(action)) || (scanWrite && global.lx.config['library.autoFix.safeWrite'] === false) || libraryHasReaders() || !held.has(value.path)) return false
      if (global.lx.config['subsonic.enable'] !== false && (global.lx.config['subsonic.port'] || 0) > 0) return false
      const current = [...resolved.values()].find(item => item.file === value.path)
      if (!current || (current.item.folder === 'custom' && !getUserConfig(username)?.allowWriteCustomMusicDir)) return false
      const stat = fs.lstatSync(value.path)
      return !stat.isSymbolicLink() && fs.realpathSync(value.path) === value.path && stat.size === value.expected.size && stat.mtimeMs === value.expected.mtimeMs && stat.ino === value.expected.ino
    },
    finished() { for (const file of held) releaseMaintenanceFile(file); held.clear() },
  }, { origin: automatic ? 'auto' : scanWrite ? 'scan' : 'manual' })
}
