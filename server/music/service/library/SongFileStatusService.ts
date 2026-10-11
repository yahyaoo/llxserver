/** 列表歌曲的本地文件状态，不包含文件路径或播放凭据。 @author jingyh */
export type SongFileState = 'downloaded' | 'cached' | 'cloud'
/** 目录索引提供的歌曲信息，兼容洛雪 meta 和原服务器结构。 @author jingyh */
export interface FileStatusSong {
  id?: string | number
  source?: string
  songmid?: string | number
  songId?: string | number
  name?: string
  singer?: string
  album?: string
  albumName?: string
  folder?: string
  meta?: Record<string, any>
}
/** 每批请求共享的已验证文件索引。 @author jingyh */
export interface SongFileCatalog {
  downloaded: Set<string>
  cache: FileStatusSong[]
  custom: FileStatusSong[]
}

/** 验证查询描述中的标量字段，拒绝对象冒充 ID 或过大的标签。 @author jingyh */
export function validateFileStatusSongs(songs: unknown): asserts songs is FileStatusSong[] {
  if (!Array.isArray(songs) || songs.length > 500) throw new Error('每次最多查询 500 首歌曲')
  for (const song of songs) {
    if (!song || typeof song !== 'object' || Array.isArray(song)) throw new Error('歌曲参数必须为对象数组')
    if (song.meta !== undefined && (!song.meta || typeof song.meta !== 'object' || Array.isArray(song.meta))) throw new Error('歌曲 meta 必须为对象')
    for (const values of [song, song.meta || {}]) {
      for (const key of ['id', 'source', 'songmid', 'songId', 'name', 'singer', 'album', 'albumName']) {
        const value = values[key]
        if (value !== undefined && (typeof value !== 'string' && typeof value !== 'number' || String(value).length > 4096 || typeof value === 'number' && !Number.isFinite(value))) throw new Error('歌曲字段必须为有限的文本或数字')
      }
    }
  }
}

/**
 * 从洛雪及服务器歌曲字段提取平台和歌曲 ID，不使用歌名作为在线身份。
 * @param song 待查询歌曲或索引歌曲。
 * @returns 跨平台唯一标识；缺少身份时返回空字符串。
 * @author jingyh
 */
export function fileStatusIdentity(song: FileStatusSong): string {
  const source = String(song.source || song.meta?.source || '')
  let id = String(song.songmid || song.meta?.songmid || song.songId || song.meta?.songId || song.id || '')
  if (source && id.startsWith(source + '_')) id = id.slice(source.length + 1)
  return source && id ? source + ':' + id : ''
}

/** 归一化标签仅忽略大小写和首尾空白，不移除版本、Live 等区别。 */
const text = (value: unknown) => String(value ?? '').normalize('NFKC').trim().toLowerCase()
/** 将歌名和歌手组合成无分隔符歧义的标签键。 */
const nameKey = (song: FileStatusSong) => JSON.stringify([text(song.name || song.meta?.name), text(song.singer || song.meta?.singer)])

/**
 * 可复用的歌曲文件状态组件；索引和磁盘检查通过目录加载契约注入。
 * @author jingyh
 */
export class SongFileStatusService {
  /** @param loadCatalog 按已鉴权账号批量加载并验证文件的能力。 @author jingyh */
  constructor(private readonly loadCatalog: (username: string) => Promise<SongFileCatalog>) {}

  /**
   * 按原请求顺序返回状态，同一批次只加载一次目录。
   * @param username 已验证的当前账号。
   * @param songs 最多 500 首歌曲，可包含重复歌曲。
   * @returns 状态数组，下载优先于缓存，无本地文件时为云端。
   * @throws Error 输入非法或目录读取失败时拒绝，不能误报云端。
   * @author jingyh
   */
  async query(username: string, songs: FileStatusSong[]) {
    validateFileStatusSongs(songs)
    if (!songs.length) return []
    const catalog = await this.loadCatalog(username)
    const exact = new Map<string, SongFileState>()
    const unlinked = new Map<string, FileStatusSong[]>()
    for (const item of catalog.cache) {
      const identity = fileStatusIdentity(item)
      if (!identity) continue
      const state = item.folder === 'music' ? 'downloaded' : 'cached'
      if (!exact.has(identity) || state === 'downloaded') exact.set(identity, state)
    }
    for (const item of catalog.custom) {
      const identity = fileStatusIdentity(item)
      if (identity) exact.set(identity, 'downloaded')
      // 已关联的平台文件只能按身份命中，避免同名的不同录音互相误报。
      if (item.source && !['custom', 'local'].includes(item.source)) continue
      if (!text(item.name) || !text(item.singer) || text(item.singer) === '未知歌手') continue
      const key = nameKey(item)
      const items = unlinked.get(key) || []
      items.push(item); unlinked.set(key, items)
    }
    return songs.map(song => {
      const identity = fileStatusIdentity(song)
      let state: SongFileState = catalog.downloaded.has(identity) ? 'downloaded' : exact.get(identity) || 'cloud'
      if (state !== 'downloaded') {
        const album = text(song.albumName || song.album || song.meta?.albumName)
        if (unlinked.get(nameKey(song))?.some(item => !album || !text(item.albumName || item.album) || text(item.albumName || item.album) === album)) state = 'downloaded'
      }
      return { id: String(song.id ?? ''), identity, state }
    })
  }
}
