import type { ExperienceRepository } from '../repository/ExperienceRepository'

/** 公共播放次数校验与持久化服务。 @author jingyh @date 2026-10-11 */
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
      const clean: any = {}
      for (const key of ['id', 'songmid', 'songId', 'name', 'singer', 'source', 'albumName', 'albumId', 'interval', 'quality', 'type', 'types', 'isLocal', '_localLibraryItem', 'filename', 'folder', 'isCustomDir']) {
        if (song[key] !== undefined) clean[key] = song[key]
      }
      // 展示元数据兼容收藏歌曲的 meta 字段；不参与次数计算。
      for (const key of ['size', 'fileSize', 'bitDepth', 'bitsPerSample', 'sampleRate', 'samplingRate', 'bitrate']) {
        const value = song[key] ?? song.meta?.[key]
        if (value !== undefined) clean[key] = value
      }
      for (const key of ['pic', 'img', 'url']) {
        if (typeof song[key] === 'string' && /^(https?:\/\/|\/api\/music\/)/.test(song[key])) {
          const url = new URL(song[key], 'http://local')
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
