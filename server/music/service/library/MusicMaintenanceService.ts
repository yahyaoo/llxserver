/** 多页面共用音乐维护服务；只接受业务歌曲标识，不接受客户端磁盘路径。 @author yahyaoo @date 2026-10-12 */
import fs from 'node:fs'
import path from 'node:path'
import * as cache from '../cache/FileCacheService'
import * as custom from './CustomMusicService'
import * as downloads from '../download/ServerDownloadService'
import { resolveMusicFile } from '../../../application/library/MusicDirectoryService'
import { getUserConfig } from '../../../user'
import { startMusicTask, maintenanceActions, type MaintenanceAction } from './MusicTaskService'

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
      const lyricPath = file.slice(0, -path.extname(file).length) + '.lrc'
      resolved.set(index, { item, song, file, lyricPath })
      return { path: file, lyricPath, song, sidecars: [lyricPath] }
    },
    async lyrics(song) {
      const fetcher = cache.getLyricFetcher()
      if (!fetcher || ['custom', 'local', 'unknown'].includes(song.source)) throw new Error('该歌曲尚未关联网络音源，无法补全歌词')
      return await fetcher(song)
    },
    async cover(song) {
      const url = song.img || song.meta?.picUrl || song.picUrl || song.pic
      if (!url || !/^https?:\/\//i.test(url)) return null
      const result = await cache.downloadCoverImage(url)
      return result ? { mime: result.mime, data: result.data } : null
    },
    result(index, result) {
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
  })
}
