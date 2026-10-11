import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import type { ExperienceRepository } from '../../repository/ExperienceRepository'

/** 歌手头像缓存组件：复用已有音源查找，图片保存到账号缓存目录。 @author jingyh @date 2026-10-10 */
export class ArtistArtworkService {
  private static pending = new Map<string, Promise<string | null>>()
  constructor(private readonly repository: ExperienceRepository, private readonly cacheDir: string) {}

  /** 先读磁盘缓存，缺少时查精确歌手名称；失败缓存一小时，成功元数据缓存七天。 */
  async get(name: string, lookup: (name: string) => Promise<string | null>): Promise<string | null> {
    const directory = path.join(this.cacheDir, 'artist-avatars')
    const key = crypto.createHash('sha256').update(name).digest('hex')
    const file = path.join(directory, key + '.img')
    if (fs.existsSync(file)) return file
    const metadata = this.repository.read<any>('client_artist_group', 'avatar-metadata.json', {})
    if (metadata[key] && Date.now() - metadata[key].checkedAt < (metadata[key].url ? 7 * 86400000 : 3600000)) {
      if (!metadata[key].url) return null
    }
    const pendingKey = this.cacheDir + ':' + key
    if (ArtistArtworkService.pending.has(pendingKey)) return ArtistArtworkService.pending.get(pendingKey)!
    const work = (async () => {
      let imageUrl: string | null = metadata[key]?.url || null
      try {
        if (!imageUrl) {
          let timer: ReturnType<typeof setTimeout> | undefined
          try { imageUrl = await Promise.race([lookup(name), new Promise<null>(resolve => { timer = setTimeout(() => resolve(null), 4000) })]) }
          finally { if (timer) clearTimeout(timer) }
        }
        // URL 仅来自歌手元数据，不接受请求直接传入地址；每次重定向也检查协议及主机。
        let current = imageUrl
        for (let redirects = 0; current && redirects < 4; redirects++) {
          const url = new URL(current)
          if (url.protocol !== 'https:' || !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(url.hostname) || /(^|\.)localhost$/i.test(url.hostname)) break
          const response = await fetch(url, { signal: AbortSignal.timeout(5000), redirect: 'manual' })
          if (response.status >= 300 && response.status < 400) { const next = response.headers.get('location'); current = next ? new URL(next, url).toString() : null; continue }
          if (!response.ok || !/^image\/(png|jpeg|webp|gif)/.test(response.headers.get('content-type') || '')) break
          const chunks: Uint8Array[] = []; let size = 0
          for await (const chunk of response.body as any) { size += chunk.length; if (size > 3 * 1024 * 1024) throw new Error('头像过大'); chunks.push(chunk) }
          if (!size) break
          fs.mkdirSync(directory, { recursive: true }); fs.writeFileSync(file, Buffer.concat(chunks))
          break
        }
      } catch { /* 单个头像失败不阻塞本地检索；客户端使用占位。 */ }
      const latest = this.repository.read<any>('client_artist_group', 'avatar-metadata.json', {})
      latest[key] = { url: fs.existsSync(file) ? imageUrl : null, checkedAt: Date.now() }
      this.repository.write('client_artist_group', 'avatar-metadata.json', latest)
      return fs.existsSync(file) ? file : null
    })().finally(() => ArtistArtworkService.pending.delete(pendingKey))
    ArtistArtworkService.pending.set(pendingKey, work)
    return work
  }
}
