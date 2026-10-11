import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import type { ExperienceRepository } from '../../repository/ExperienceRepository'

/** 歌曲展示封面持久缓存，不写入音频标签，不改变内嵌歌词状态。 @author jingyh @date 2026-10-11 */
export class SongArtworkService {
  private static pending = new Map<string, Promise<{ data: Buffer; mime: string } | null>>()
  constructor(private readonly repository: ExperienceRepository, private readonly cacheDir: string,
    private readonly download = SongArtworkService.download) {}

  /** 根据文件头校验真实图片，不信任 URL 扩展名和响应类型。 */
  static mime(data: Buffer): string | null {
    if (data.length < 20) return null
    if (data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png'
    if (data[0] === 255 && data[1] === 216 && data[2] === 255) return 'image/jpeg'
    if (/^GIF8[79]a$/.test(data.toString('ascii', 0, 6))) return 'image/gif'
    if (data.toString('ascii', 0, 4) === 'RIFF' && data.toString('ascii', 8, 12) === 'WEBP') return 'image/webp'
    return null
  }

  /** 仅获取公网图片；每次重定向重新检查主机，限制等待时间和正文大小。 */
  static async download(value: string): Promise<Buffer | null> {
    if (/^data:image\/(png|jpeg|webp|gif);base64,/i.test(value)) {
      if (value.length > 7 * 1024 * 1024) return null
      return Buffer.from(value.slice(value.indexOf(',') + 1), 'base64')
    }
    let current = value
    for (let redirects = 0; redirects < 4; redirects++) {
      const url = new URL(current)
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || isIP(url.hostname) || !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(url.hostname)) return null
      const addresses = await lookup(url.hostname, { all: true })
      if (!addresses.length || addresses.some(({ address }) => {
        // IPv6、私网、回环、链路本地和保留地址均不作为外部封面源。
        if (isIP(address) !== 4) return true
        const [a, b] = address.split('.').map(Number)
        return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || (a === 198 && (b === 18 || b === 19))
      })) return null
      const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(8000) })
      if (response.status >= 300 && response.status < 400) {
        const next = response.headers.get('location'); await response.body?.cancel()
        if (!next) return null
        current = new URL(next, url).toString(); continue
      }
      if (!response.ok) { await response.body?.cancel(); return null }
      let size = 0; const chunks: Uint8Array[] = []
      for await (const chunk of response.body as any) {
        size += chunk.length
        if (size > 5 * 1024 * 1024) throw new Error('封面过大')
        chunks.push(chunk)
      }
      return Buffer.concat(chunks)
    }
    return null
  }

  /** 先读取磁盘，成功获取后事务回写歌曲展示状态；失败不标记为已有封面。 */
  async get(source: string, id: string, urls: string[]): Promise<{ data: Buffer; mime: string } | null> {
    if (!/^[a-z0-9_-]{1,24}$/i.test(source) || !id || id.length > 256 || urls.length > 8) return null
    const key = crypto.createHash('sha256').update(source + ':' + id).digest('hex')
    const directory = path.join(this.cacheDir, 'song-artwork'), file = path.join(directory, key + '.img')
    const update = (url: string) => this.repository.transaction(() => {
      const records = this.repository.read<any>('client_song_artwork', 'song-artwork.json', {})
      records[key] = { source, id, url, hasCover: true, cachedAt: Date.now() }
      this.repository.write('client_song_artwork', 'song-artwork.json', records)
      for (const [table, name] of [['client_recent_play', 'recent-play.json'], ['client_favorite_song', 'favorites.json']]) {
        const songs = this.repository.read<any[]>(table, name, [])
        let changed = false
        for (const song of songs) if (song.source === source && String(song.id) === id) {
          song.artworkCached = true; song.artworkUrl = '/api/music/artwork?source=' + encodeURIComponent(source) + '&id=' + encodeURIComponent(id); changed = true
        }
        if (changed) this.repository.write(table, name, songs)
      }
    })
    try {
      if (fs.existsSync(file)) {
        const data = fs.readFileSync(file), mime = SongArtworkService.mime(data)
        if (mime) { const records = this.repository.read<any>('client_song_artwork', 'song-artwork.json', {}); if (!records[key]?.hasCover) update(records[key]?.url || ''); return { data, mime } }
      }
    } catch { /* 缓存缺失或损坏时重新读取候选，不更改标签判断。 */ }
    const pendingKey = file
    if (SongArtworkService.pending.has(pendingKey)) return SongArtworkService.pending.get(pendingKey)!
    const work = (async () => {
      const records = this.repository.read<any>('client_song_artwork', 'song-artwork.json', {})
      for (const url of [...new Set([records[key]?.url, ...urls].filter(Boolean))]) {
        try {
          const data = await this.download(url), mime = data && SongArtworkService.mime(data)
          if (!data || !mime || data.length > 5 * 1024 * 1024) continue
          fs.mkdirSync(directory, { recursive: true }); fs.writeFileSync(file, data)
          update(url); return { data, mime }
        } catch { /* 单个地址不可用时尝试下一个。 */ }
      }
      return null
    })().finally(() => SongArtworkService.pending.delete(pendingKey))
    SongArtworkService.pending.set(pendingKey, work)
    return work
  }
}
