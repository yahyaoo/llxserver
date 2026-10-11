/** 服务器下载服务：目录与命名校验、文件下载、歌词写入、索引和本地播放。 @author yahyaoo */
import storageFs from '../../../application/persistence/documentFileSystem'
/**
 * 指定目录下载与本地播放索引；仅服务于“服务器下载”，不改变普通缓存目录。
 * @author yahyaoo
 * @date 2026-10-09
 */
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import http from 'node:http'
import https from 'node:https'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { pipeline } from 'node:stream/promises'
import { getFileName } from '../cache/FileCacheService'

/** 下载歌词的保存方式：内嵌歌词或外部 LRC。 @author yahyaoo */
export type LyricMode = 'embedded' | 'external'
/** 已下载歌曲记录，关联歌曲元信息、音质与文件路径。 @author yahyaoo */
interface DownloadItem {
  /** 业务记录标识。 */
  id: string
  /** 数据所属用户名。 */
  username: string

  identity: string
  /** 音质标识。 */
  quality: string

  root: string
  /** 关联音频或业务文件名。 */
  filename: string

  lyricFilename?: string
  /** 歌词文本。 */
  lyric?: string
  /** 文件字节数或记录数量。 */
  size: number
}
/** 下载流程使用的歌词获取与文件元信息写入钩子。 @author yahyaoo */
interface DownloadHooks {
  /** 歌词文本。 */
  lyric: (song: any, username: string) => Promise<string | null>

  embed: (file: string, lyric: string) => { /** 操作是否成功。 */
success: boolean; /** 操作失败原因。 */
error?: string }
}
let hooks: DownloadHooks | null = null
let loadedPath = ''
let items: DownloadItem[] = []
const active = new Map<string, Promise<void>>()

/** 注入洛雪已有歌词获取及标签写入能力，避免更改音源模块。 */
export const initialize = (value: DownloadHooks) => { hooks = value }

/** 校验管理员填写的绝对目录；使用真实写入探测检查飞牛目录权限。 */
export const validateDirectory = (value: unknown) => {
  if (typeof value !== 'string' || !value.trim() || !path.isAbsolute(value.trim()) || value.includes('\0')) {
    throw new Error('下载目录必须是服务器上的绝对路径')
  }
  const root = path.resolve(value.trim())
  storageFs.mkdirSync(root, { recursive: true })
  const probe = path.join(root, `.lx-write-${crypto.randomUUID()}`)
  try {
    const fd = storageFs.openSync(probe, 'wx')
    storageFs.closeSync(fd)
  } catch {
    throw new Error('下载目录不可写，请在飞牛应用设置中授权此目录')
  } finally {
    if (storageFs.existsSync(probe)) storageFs.unlinkSync(probe)
  }
  return root
}

/** 优先使用配置目录；首次安装默认落在持久化数据目录内。 */
export const getDirectory = () => global.lx.config['download.directory'] || path.join(global.lx.dataPath, 'downloads')

/** 来源与歌曲 ID 共同标识歌曲，防止同名歌曲误命中。 */
export const songIdentity = (song: any) => {
  const source = String(song.source || '')
  let id = String(song.songmid || song.meta?.songmid || song.songId || song.meta?.songId || song.id || '')
  if (id.startsWith(`${source}_`)) id = id.slice(source.length + 1)
  if (!source || !id) throw new Error('歌曲缺少来源或歌曲标识')
  return `${source}:${id}`
}

const indexFile = () => path.join(global.lx.dataPath, 'runtime', 'server-downloads.json')
const load = () => {
  const file = indexFile()
  if (loadedPath === file) return
  // 不覆盖损坏的索引，避免丢失已下载文件的关联。
  items = storageFs.existsSync(file) ? JSON.parse(storageFs.readFileSync(file, 'utf8')) : []
  if (!Array.isArray(items)) throw new Error('服务器下载索引格式错误')
  loadedPath = file
}
const save = () => {
  const file = indexFile()
  storageFs.mkdirSync(path.dirname(file), { recursive: true })
  storageFs.writeFileSync(`${file}.tmp`, JSON.stringify(items, null, 2), 'utf8')
  storageFs.renameSync(`${file}.tmp`, file)
}
const itemPath = (item: DownloadItem) => {
  if (path.basename(item.filename) !== item.filename) throw new Error('非法下载文件名')
  const file = path.join(item.root, item.filename)
  if (!storageFs.existsSync(file) || storageFs.lstatSync(file).isSymbolicLink() || !storageFs.statSync(file).isFile() || storageFs.statSync(file).size !== item.size) return null
  return file
}
const findItem = (song: any, username: string, quality?: string, exact = false, currentDirectory = false) => {
  load()
  const identity = songIdentity(song)
  const root = currentDirectory ? path.resolve(getDirectory()) : undefined
  const candidates = items.filter(i => i.username === username && i.identity === identity && (!exact || i.quality === quality) && (!root || i.root === root))
  candidates.sort((a, b) => Number(b.quality === quality) - Number(a.quality === quality))
  return candidates.find(i => itemPath(i))
}

/** 返回可供播放器直接使用的本地 URL；文件被移走或损坏时回退原播放流程。 */
export const check = (song: any, username: string, quality?: string, exact = false, currentDirectory = false) => {
  const item = findItem(song, username, quality, exact, currentDirectory)
  if (!item) return { exists: false }
  return {
    exists: true, isCollision: false, folder: 'download', quality: item.quality,
    url: `/api/music/server-download/file/${item.id}?username=${encodeURIComponent(username)}`,
  }
}

/** 优先返回下载时保存的歌词，断网播放也可显示歌词。 */
export const getLyric = (song: any, username: string) => findItem(song, username)?.lyric || null

/**
 * 批量获取当前用户实际可读取的下载歌曲身份，复用下载文件完整性检查。
 * @param username 已验证的当前用户名称。
 * @returns 文件仍然存在且大小正确的歌曲身份集合。
 * @author jingyh
 */
export const getAvailableIdentities = (username: string): Set<string> => {
  load()
  const identities = new Set<string>()
  for (const item of items) {
    if (item.username !== username) continue
    try { if (item.size > 0 && itemPath(item)) identities.add(item.identity) } catch (error: any) {
      if (!['ENOENT', 'ENOTDIR'].includes(error.code)) throw error
    }
  }
  return identities
}

/** 根据真实音频头识别扩展名，拒绝把 HTML 或错误 JSON 当作歌曲保存。 */
export const audioExtension = (file: string) => {
  const fd = storageFs.openSync(file, 'r')
  const head = Buffer.alloc(16)
  try { storageFs.readSync(fd, head, 0, head.length, 0) } finally { storageFs.closeSync(fd) }
  if (head.toString('ascii', 0, 3) === 'ID3' || (head[0] === 0xff && (head[1] & 0xe0) === 0xe0)) return 'mp3'
  if (head.toString('ascii', 0, 4) === 'fLaC') return 'flac'
  if (head.toString('ascii', 0, 4) === 'OggS') return 'ogg'
  if (head.toString('ascii', 0, 4) === 'RIFF' && head.toString('ascii', 8, 12) === 'WAVE') return 'wav'
  if (head.toString('ascii', 4, 8) === 'ftyp') return 'm4a'
  if (head.toString('ascii', 0, 4) === 'MAC ') return 'ape'
  throw new Error('音源未返回有效音频文件')
}
export const DEFAULT_NAME_TEMPLATE = ''

/** 验证文件名模板，固定字段范围，防止错误占位符被直接写入文件名。 @author yahyaoo */
export const validateNameTemplate = (value: unknown): string => {
  if (typeof value !== 'string' || value.length > 256 || /[\x00-\x1f]/.test(value)) throw new Error('文件命名模板最多 256 个字符，不能包含控制字符')
  const template = value.trim()
  if (/[{}]/.test(template.replace(/\{(artist|title|album|platform|quality|id|track)\}/g, ''))) throw new Error('文件命名模板包含不支持的字段')
  return template
}

/** 整个文件名按 UTF-8 字节截断，为扩展名和重名序号留空间，不允许元数据注入目录。 */
const safeName = (text: string) => {
  const cleaned = text.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').trim()
  let result = '', bytes = 0
  for (const character of cleaned) {
    bytes += Buffer.byteLength(character)
    if (bytes > 180) break
    result += character
  }
  result = result.replace(/[. ]+$/g, '') || '未知'
  return /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i.test(result) ? '_' + result : result
}

/** 使用原曲身份生成可读文件名，索引 ID 不参与默认命名。 @author yahyaoo */
export const formatDownloadName = (template: string, song: any, identitySong: any, quality: string): string => {
  const validated = validateNameTemplate(template)
  // 留空沿用播放器设置的命名方式；不传用户，重名统一由下载目录排他创建处理。
  if (!validated) return safeName(getFileName({ ...song, ...identitySong }, quality))
  const identity = songIdentity(identitySong)
  const values: Record<string, string> = {
    artist: String(identitySong.singer || song.singer || '未知'),
    title: String(identitySong.name || song.name || '未知'),
    album: String(identitySong.albumName || identitySong.meta?.albumName || song.albumName || song.meta?.albumName || ''),
    platform: String(identitySong.source || song.source || ''), quality,
    id: identity.slice(identity.indexOf(':') + 1),
    track: String(identitySong.trackNumber ?? identitySong.meta?.trackNumber ?? song.trackNumber ?? song.meta?.trackNumber ?? ''),
  }
  return safeName(validated.replace(/\{(artist|title|album|platform|quality|id|track)\}/g, (_, field: string) => values[field]))
}

/** 沿用 Node HTTP 流式下载，限制重定向和超时；取消时销毁请求并清理暂存文件。 */
const receive = async (rawUrl: string, file: string, signal: AbortSignal, progress: (received: number, total: number) => void, redirects = 0): Promise<void> => {
  if (redirects > 10) throw new Error('下载重定向过多')
  const url = new URL(rawUrl)
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('无效下载协议')
  const response = await new Promise<IncomingMessage>((resolve, reject) => {
    const request = (url.protocol === 'https:' ? https : http).get(url, { signal, headers: { 'User-Agent': 'Mozilla/5.0' } }, resolve)
    request.setTimeout(60000, () => request.destroy(new Error('下载超时')))
    request.on('error', reject)
  })
  if (response.statusCode && [301, 302, 303, 307, 308].includes(response.statusCode) && response.headers.location) {
    response.resume()
    return receive(new URL(response.headers.location, url).href, file, signal, progress, redirects + 1)
  }
  if (response.statusCode !== 200) {
    response.resume()
    throw new Error(`音频下载失败：HTTP ${response.statusCode}`)
  }
  let received = 0
  const total = Number(response.headers['content-length'] || 0)
  response.on('data', chunk => { received += chunk.length; progress(received, total) })
  await pipeline(response, storageFs.createWriteStream(file, { flags: 'wx' }), { signal })
  if (!received || (total && received !== total)) throw new Error('音频文件不完整')
}

/** 完整下载、歌词写入、原子落盘后才登记索引，防止播放半成品。 */
export const download = async (song: any, identitySong: any, url: string, quality: string, username: string, mode: LyricMode,
  signal: AbortSignal, progress: (received: number, total: number) => void) => {
  const identity = songIdentity(identitySong)
  const root = validateDirectory(getDirectory())
  const nameTemplate = validateNameTemplate(global.lx.config['download.nameTemplate'] ?? DEFAULT_NAME_TEMPLATE)
  // 在任务开始时固定命名，避免流式下载期间修改设置导致文件名变化。
  const basename = formatDownloadName(nameTemplate, song, identitySong, quality)
  const key = `${username}:${identity}:${quality}:${root}`
  if (active.has(key)) return active.get(key)
  const work = (async () => {
    const existing = findItem(identitySong, username, quality, true, true)
    if (existing && existing.root === root) { progress(existing.size, existing.size); return }
    const id = crypto.createHash('sha256').update(key).digest('hex').slice(0, 24)
    const temporary = path.join(root, `.lx-download-${crypto.randomUUID()}.part`)
    let installedAudio: string | undefined
    let installedLyric: string | undefined
    try {
      await receive(url, temporary, signal, progress)
      signal.throwIfAborted()
      const ext = audioExtension(temporary)
      let lyric: string | null = null
      // 搜索接口可能返回数字 ID；原歌词钩子需要字符串，保留其他平台的完整元数据。
      const lyricSong = { ...song, songmid: String(song.songmid || song.meta?.songmid || song.songId || song.meta?.songId || song.id || '') }
      try { lyric = await hooks?.lyric(lyricSong, username) || null } catch { /* 无歌词不阻断音频下载。 */ }
      signal.throwIfAborted()
      if (lyric && mode === 'embedded') {
        const result = hooks?.embed(temporary, lyric)
        if (!result?.success) throw new Error(result?.error || '歌词内嵌失败，请选择外部 .lrc 后重试')
      }
      let filename = '', lyricFilename: string | undefined
      // 音频和 LRC 成对使用短序号；排他 link/write 处理并发竞争，不覆盖已有文件。
      for (let number = 1; number <= 10000; number++) {
        const stem = basename + (number === 1 ? '' : ` (${number})`)
        const candidate = `${stem}.${ext}`
        const final = path.join(root, candidate)
        const lyricPath = path.join(root, `${stem}.lrc`)
        if (storageFs.existsSync(final) || storageFs.existsSync(lyricPath)) continue
        try { storageFs.linkSync(temporary, final) } catch (error: any) { if (error.code === 'EEXIST') continue; throw error }
        installedAudio = final
        if (lyric && mode === 'external') {
          try { storageFs.writeFileSync(lyricPath, lyric, { encoding: 'utf8', flag: 'wx' }) } catch (error: any) {
            if (error.code !== 'EEXIST') throw error
            storageFs.unlinkSync(final); installedAudio = undefined
            continue
          }
          installedLyric = lyricPath
          lyricFilename = `${stem}.lrc`
        }
        filename = candidate
        break
      }
      if (!filename) throw new Error('同名文件过多，请调整命名模板后重试')
      const item: DownloadItem = { id, username, identity, quality, root, filename, lyricFilename,
        lyric: lyric || undefined, size: storageFs.statSync(installedAudio!).size }
      load()
      const oldItems = items
      items = [...items.filter(i => i.id !== id), item]
      try { save() } catch (error) { items = oldItems; throw error }
      installedAudio = undefined
      installedLyric = undefined
    } finally {
      for (const file of [temporary, installedAudio, installedLyric]) {
        if (file && storageFs.existsSync(file)) storageFs.unlinkSync(file)
      }
    }
  })()
  active.set(key, work)
  try { await work } finally { active.delete(key) }
}

/** 按索引与已验证的用户读取文件，支持播放器拖动进度和 HEAD 探测。 */
export const serve = (req: IncomingMessage, res: ServerResponse, id: string, username: string) => {
  load()
  const item = items.find(i => i.id === id && i.username === username)
  const file = item && itemPath(item)
  if (!item || !file) { res.writeHead(404); res.end('File not found'); return }
  if (!['GET', 'HEAD'].includes(req.method || '')) { res.writeHead(405); res.end(); return }
  const size = item.size
  let start = 0
  let end = size - 1
  const range = req.headers.range
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range)
    if (!match || (!match[1] && !match[2])) { res.writeHead(416, { 'Content-Range': `bytes */${size}` }); res.end(); return }
    if (!match[1]) start = Math.max(0, size - Number(match[2]))
    else { start = Number(match[1]); if (match[2]) end = Math.min(end, Number(match[2])) }
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= size) {
      res.writeHead(416, { 'Content-Range': `bytes */${size}` }); res.end(); return
    }
  }
  const types: Record<string, string> = { mp3: 'audio/mpeg', flac: 'audio/flac', wav: 'audio/wav', m4a: 'audio/mp4', ogg: 'audio/ogg', ape: 'audio/ape' }
  res.writeHead(range ? 206 : 200, { 'Content-Type': types[path.extname(file).slice(1)] || 'application/octet-stream',
    'Accept-Ranges': 'bytes', 'Content-Length': end - start + 1, 'Cache-Control': 'private, no-store',
    ...(range ? { 'Content-Range': `bytes ${start}-${end}/${size}` } : {}) })
  if (req.method === 'HEAD') { res.end(); return }
  const stream = storageFs.createReadStream(file, { start, end })
  stream.on('error', () => res.destroy())
  res.on('close', () => stream.destroy())
  stream.pipe(res)
}
