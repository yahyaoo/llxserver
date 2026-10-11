import { resolveMusicFile } from '../../../application/library/MusicDirectoryService'
import { hasIndexedAudio } from './SongFileIntegrity'
import * as fileCache from '../cache/FileCacheService'
import * as customMusic from './CustomMusicService'
import * as serverDownloads from '../download/ServerDownloadService'
import { SongFileStatusService, type SongFileCatalog } from './SongFileStatusService'

/** 同一用户和目录的扫描合并，外部新增歌曲最多等待 10 秒重新扫描。 */
const customScans = new Map<string, { root: string; time: number; pending?: Promise<unknown> }>()

/**
 * 复用缓存与用户音乐目录索引，批量检查实际文件。
 * @param username 已鉴权的当前账号，不接受客户端目录路径。
 * @returns 三处来源的可用文件信息；不查询其他账号的目录。
 * @author jingyh
 */
async function loadCatalog(username: string): Promise<SongFileCatalog> {
  const downloaded = serverDownloads.getAvailableIdentities(username)
  const cacheItems = await fileCache.getCacheList(username)
  const cache = cacheItems.filter(item => hasIndexedAudio(fileCache.getCacheDir(username, item.folder === 'music'), item))
  customMusic.ensureMusicScan(username)
  const custom = (await customMusic.getCustomMusicList(username)).filter(item => !!resolveMusicFile(username, item.filename))
  return { downloaded, cache, custom }
}

/** HTTP 列表和其他业务可复用的状态查询实例。 */
export const songFileStatusService = new SongFileStatusService(loadCatalog)
