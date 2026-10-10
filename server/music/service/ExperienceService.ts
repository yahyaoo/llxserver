import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import type { ExperienceRepository } from '../repository/ExperienceRepository'

/** 音乐体验配置与搜索分组业务。 @author jingyh @date 2026-10-10 */
export const DEFAULT_EXPERIENCE = {
  // opacity 表示透明比例：0 为实色，1 为全透明；glassBlur 为毛玻璃强度百分比。
  theme: 'pink', appearance: 'system', color: '#ec4899', opacity: 0.18, glassBlur: 60, recentLimit: 100,
  background: null as null | { file: string; x: number; y: number; blur: number },
}
export type Experience = typeof DEFAULT_EXPERIENCE
const themes = ['pink', 'emerald', 'blue', 'amber', 'violet', 'rose', 'custom', 'zhulv', 'jiqing', 'xinghuang', 'zhuhong', 'shizhuhong']
const number = (value: unknown, min: number, max: number, fallback: number) => typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback

/** 校验客户端输入；不接受绝对路径、越界数值或任意 CSS 内容。 */
export function normalizeExperience(input: any): Experience {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('配置必须为对象')
  const background = input.background
  if (background && !/^[a-f0-9]{64}\.(png|jpg|webp|gif)$/.test(background.file || '')) throw new Error('背景文件标识无效')
  return {
    theme: themes.includes(input.theme) ? input.theme : 'pink',
    appearance: ['light', 'dark', 'system'].includes(input.appearance) ? input.appearance : 'system',
    color: /^#[a-f0-9]{6}$/i.test(input.color || '') ? input.color : '#ec4899',
    opacity: number(input.opacity, 0, 1, 0.18),
    glassBlur: number(input.glassBlur, 0, 100, 60),
    recentLimit: Math.round(number(input.recentLimit, 1, 10000, 100)),
    background: background ? { file: background.file, x: number(background.x, 0, 100, 50), y: number(background.y, 0, 100, 50), blur: number(background.blur, 0, 40, 0) } : null,
  }
}

/** 使用现有缓存根目录保存图片；文件名由内容哈希生成，账号目录隔离。 */
export function saveBackground(bytes: Buffer, cacheDir: string): string {
  if (!bytes.length || bytes.length > 10 * 1024 * 1024) throw new Error('图片必须小于或等于 10 MB')
  const ext = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ? 'png'
    : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 ? 'jpg'
      : bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP' ? 'webp'
        : /^GIF8[79]a$/.test(bytes.toString('ascii', 0, 6)) ? 'gif' : null
  if (!ext || bytes.length < 20) throw new Error('仅支持 PNG、JPEG、WebP 和 GIF 图片')
  const dir = path.join(cacheDir, 'theme-backgrounds')
  fs.mkdirSync(dir, { recursive: true })
  const file = crypto.createHash('sha256').update(bytes).digest('hex') + '.' + ext
  fs.writeFileSync(path.join(dir, file), bytes)
  return file
}

/** 读取偏好；数据库迁移后图片缺失则持久化回退默认主题，避免每次启动失效。 */
export function getExperience(repository: ExperienceRepository, cacheDir: string): Experience {
  const appearance = repository.read<Record<string, unknown>>('client_appearance', 'appearance.json', {})
  const recent = repository.read('client_recent_setting', 'recent-setting.json', { maxRecords: 100 })
  const value = normalizeExperience({ ...appearance, recentLimit: recent.maxRecords })
  if (value.background && !fs.existsSync(path.join(cacheDir, 'theme-backgrounds', value.background.file))) {
    Object.assign(value, { theme: 'pink', color: '#ec4899', background: null })
    const { recentLimit, ...theme } = value
    repository.write('client_appearance', 'appearance.json', theme)
  }
  return value
}

/** 保存偏好并立即裁剪当前账号历史；其他账号的数据不受影响。 */
export function putExperience(repository: ExperienceRepository, cacheDir: string, input: unknown): Experience {
  const value = normalizeExperience(input)
  if (value.background && !fs.existsSync(path.join(cacheDir, 'theme-backgrounds', value.background.file))) throw new Error('背景图片不存在，请重新上传')
  repository.transaction(() => {
    // 主题与历史保存偏好分表，接口聚合返回仅用于现有页面同步。
    const { recentLimit, ...theme } = value
    repository.write('client_appearance', 'appearance.json', theme)
    repository.write('client_recent_setting', 'recent-setting.json', { maxRecords: recentLimit })
    repository.write('client_recent_play', 'recent-play.json', getRecent(repository).slice(0, value.recentLimit))
  })
  return value
}

/** 返回按最近播放时间倒序保存的账号歌曲列表。 */
export function getRecent(repository: ExperienceRepository): any[] {
  return repository.read('client_recent_play', 'recent-play.json', [])
}

/** 同曲重播移至首位；只保留播放器实际需要的歌曲字段，剔除临时认证参数。 */
export function recordRecent(repository: ExperienceRepository, cacheDir: string, song: any): any[] {
  if (!song || typeof song.name !== 'string' || !song.name.trim() || !song.id || typeof song.source !== 'string') throw new Error('歌曲信息不完整')
  const clean: any = {}
  for (const key of ['id', 'songmid', 'songId', 'name', 'singer', 'source', 'albumName', 'albumId', 'interval', 'quality', 'type', 'types', 'isLocal', '_localLibraryItem', 'filename', 'folder', 'isCustomDir']) {
    if (song[key] !== undefined) clean[key] = song[key]
  }
  for (const key of ['pic', 'img', 'url']) {
    if (typeof song[key] === 'string' && /^(https?:\/\/|\/api\/music\/)/.test(song[key])) {
      const url = new URL(song[key], 'http://local')
      for (const param of ['token', 'password', 'auth']) url.searchParams.delete(param)
      clean[key] = url.origin === 'http://local' ? url.pathname + url.search : url.toString()
    }
  }
  clean.playedAt = Date.now()
  return repository.transaction(() => {
    const recent = getRecent(repository).filter(item => !(String(item.id) === String(clean.id) && item.source === clean.source))
    recent.unshift(clean)
    const saved = recent.slice(0, getExperience(repository, cacheDir).recentLimit)
    repository.write('client_recent_play', 'recent-play.json', saved)
    return saved
  })
}

/** 歌手分组缓存组件：支持多人演唱，头像优先使用歌手收藏元数据。 */
export class ArtistGroupCache {
  constructor(private readonly repository: ExperienceRepository) {}

  /** 按曲库内容签名刷新缓存；无头像时返回空值供客户端显示占位。 */
  groups(items: any[], favorites: any[]): any[] {
    const fingerprint = crypto.createHash('sha256').update(JSON.stringify([items, favorites])).digest('hex')
    const cache = this.repository.read<any>('client_artist_group', 'artist-groups.json', {})
    if (cache.fingerprint === fingerprint) return cache.groups
    const groups = new Map<string, any>()
    for (const item of items) for (const name of String(item.singer || '未知歌手').split(/\s*(?:\/|、|;|；|&|＆)\s*/).filter(Boolean)) {
      const group = groups.get(name) || { id: groupId('artist', name), name, rawNames: [name], songs: [], avatar: '/api/music/library/avatar?name=' + encodeURIComponent(name), artist: favorites.find(artist => artist.name === name) || null }
      group.songs.push(item)
      groups.set(name, group)
    }
    const result = Array.from(groups.values())
    this.repository.write('client_artist_group', 'artist-groups.json', { fingerprint, groups: result })
    return result
  }
}

/** 基于原始身份生成稳定分组标识；以后合并别名时可建立显式映射，不自动猜测繁简字。 */
function groupId(kind: string, identity: string): string {
  return kind + '_' + crypto.createHash('sha256').update(identity).digest('hex')
}

/** 专辑按名称及歌手区分，同名不同歌手不会混为一张专辑。 */
export class AlbumGroupCache {
  constructor(private readonly repository: ExperienceRepository) {}

  /** 保存按账号隔离的专辑分组；歌曲索引变动时整体重建可再生缓存。 */
  groups(items: any[]): any[] {
    const fingerprint = crypto.createHash('sha256').update(JSON.stringify(items)).digest('hex')
    const cache = this.repository.read<any>('client_album_group', 'album-groups.json', {})
    if (cache.fingerprint === fingerprint) return cache.groups
    const groups = aggregateAlbums(items)
    this.repository.write('client_album_group', 'album-groups.json', { fingerprint, groups })
    return groups
  }
}

/** 保留原始专辑名及歌曲关系，为后续人工整理提供身份依据。 */
function aggregateAlbums(items: any[]): any[] {
  const albums = new Map<string, any>()
  for (const item of items) {
    const name = item.album || item.songInfo?.albumName
    if (!name) continue
    const key = name + '\u0000' + (item.singer || '')
    const album = albums.get(key) || { id: groupId('album', key), name, rawNames: [name], singer: item.singer, cover: item, songs: [] }
    album.songs.push(item)
    albums.set(key, album)
  }
  return Array.from(albums.values())
}

/** 本地搜索按歌曲、歌手、专辑分组；数量有限制，空词不返回整库。 */
export function searchLibrary(items: any[], artists: any[], query: string, albumGroups?: any[]) {
  const words = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean)
  const match = (text: string) => words.every(word => text.toLocaleLowerCase().includes(word))
  if (!words.length) return { songs: [], artists: [], albums: [] }
  return {
    songs: items.filter(item => match(`${item.name || ''} ${item.singer || ''} ${item.album || ''}`)).slice(0, 8),
    artists: artists.filter(artist => match(artist.name)).slice(0, 6),
    albums: (albumGroups || aggregateAlbums(items)).filter(album => match(`${album.name} ${album.singer || ''}`)).slice(0, 6),
  }
}
