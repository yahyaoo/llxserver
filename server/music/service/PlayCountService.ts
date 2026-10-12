import type { ExperienceRepository } from '../repository/ExperienceRepository'
import { recordRoamingPlay } from './RoamingService'

/** 公共播放次数校验与持久化服务。 @author yahyaoo @date 2026-10-11 */
export class PlayCountService {
  constructor(private readonly repository: ExperienceRepository) {}

  /** 旧记录缺少有效播放证据，次数显示为零，不推测历史播放次数。 */
  static count(song: any): number {
    return Number.isSafeInteger(song.playCount) && song.playCount >= 0 ? song.playCount : 0
  }

  /** 展示按次数降序，同次数按最近播放时间降序；不改变存储顺序。 */
  static sort(items: any[]): any[] {
    return items.map(item => ({ ...item, playCount: this.count(item) }))
      .sort((a, b) => b.playCount - a.playCount || (b.playedAt || 0) - (a.playedAt || 0))
  }

  /** 校验成功标记、严格大于十秒的有效时长和本次播放标识。 */
  static qualified(song: any): boolean {
    return song?.playbackSucceeded === true && typeof song.playedSeconds === 'number'
      && Number.isFinite(song.playedSeconds) && song.playedSeconds > 10
      && typeof song.playbackId === 'string' && song.playbackId.length > 0 && song.playbackId.length <= 128
  }

  /** 获取当前账号统计；历史文档兼容旧数据。 */
  get(): any[] {
    return PlayCountService.sort(this.repository.read('client_recent_play', 'recent-play.json', []))
  }

  /** 成功播放超过十秒才累计一次，客户端不能指定次数；同会话重复上报不累加。 */
  record(song: any, limit: number): any[] {
    if (!song || typeof song.name !== 'string' || !song.name.trim() || !song.id || typeof song.source !== 'string') throw new Error('歌曲信息不完整')
    if (!PlayCountService.qualified(song)) throw new Error('仅统计成功播放且有效时长超过 10 秒的记录')
    return this.repository.transaction(() => {
      const items = this.get()
      const previous = items.find(item => String(item.id) === String(song.id) && item.source === song.source)
      if (previous?.lastPlaybackId === song.playbackId) return items
      if (!recordRoamingPlay(song, this.repository)) return items
      const clean: any = {}
      for (const key of ['id', 'songmid', 'songId', 'name', 'singer', 'source', 'albumName', 'albumId', 'interval', 'quality', 'type', 'types', 'isLocal', '_localLibraryItem', 'filename', 'folder', 'isCustomDir', 'hasCover', 'mtime', 'serverDownloadId', 'customFilename', 'isCustomFile']) {
        if (song[key] !== undefined) clean[key] = song[key]
      }
      // 展示元数据兼容收藏歌曲的 meta 字段；不参与次数计算。
      for (const key of ['size', 'fileSize', 'bitDepth', 'bitsPerSample', 'sampleRate', 'samplingRate', 'bitrate']) {
        const value = song[key] ?? song.meta?.[key]
        if (value !== undefined) clean[key] = value
      }
      // 平台封面通常位于 meta，规范化后保存，避免历史记录丢图；认证参数不落库。
      const picture = [song.meta?.picUrl, song.img, song.pic, song.picUrl, song.picture, song.meta?.img, song.meta?.pic, song.album?.picUrl, song.album?.img, song.album?.pic, song.album?.cover, song.al?.picUrl, previous?.pic]
        .find(value => typeof value === 'string' && /^(https?:\/\/|\/api\/music\/)/.test(value))
      for (const [key, value] of [['pic', picture], ['img', song.img], ['url', song.url]]) {
        if (typeof value === 'string' && /^(https?:\/\/|\/api\/music\/)/.test(value)) {
          const url = new URL(value, 'http://local')
          for (const param of ['token', 'password', 'auth']) url.searchParams.delete(param)
          clean[key] = url.origin === 'http://local' ? url.pathname + url.search : url.toString()
        }
      }
      clean.playCount = PlayCountService.count(previous || {}) + 1
      clean.lastPlaybackId = song.playbackId
      clean.playedAt = Date.now()
      // 展示次数排序与历史保留上限分开：始终保留最近听过的歌曲。
      const recent = items.filter(item => !(String(item.id) === String(song.id) && item.source === song.source))
        .sort((a, b) => (b.playedAt || 0) - (a.playedAt || 0))
      const saved = [clean, ...recent].slice(0, limit)
      this.repository.write('client_recent_play', 'recent-play.json', saved)
      return PlayCountService.sort(saved)
    })
  }
}
