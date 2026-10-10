import fs from 'node:fs'
import path from 'node:path'
import type { RequestContext, ServerRuntime } from '../../common/http/RequestContext'
import { repositories } from '../../application/persistence/storage'
import { ExperienceRepository } from '../repository/ExperienceRepository'
import * as service from '../service/ExperienceService'
import * as fileCache from '../service/cache/FileCacheService'
import * as customMusic from '../service/library/CustomMusicService'
import { ArtistArtworkService } from '../service/library/ArtistArtworkService'

/** 账号主题、音乐库搜索和最近播放接口。 @author jingyh @date 2026-10-10 */
export async function handleExperience(context: RequestContext, runtime: ServerRuntime): Promise<void> {
  const { req, res, pathname, urlObj } = context
  const requested = req.headers['x-user-name']
  const authenticated = runtime.verifyUserAuth(req)
  const publicRequest = !req.headers['x-user-token'] && (!requested || requested === '_open' || requested === 'default')
  const username = authenticated || (publicRequest ? '_open' : null)
  const json = (status: number, value: unknown) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)) }
  if (!username) { json(401, { message: '请先登录账号' }); return }
  if (username === '_open' && global.lx.config['user.enablePublicRestriction'] && req.method !== 'GET' && pathname !== '/api/user/recent' && req.headers['x-frontend-auth'] !== global.lx.config['frontend.password']) {
    json(403, { message: '修改公开主题需要管理员权限' }); return
  }
  const userDir = runtime.getUserSpace(username).dataManage.userDir
  const repository = new ExperienceRepository(repositories().music, userDir)
  const cacheDir = fileCache.getCacheDir(username, false)
  try {
    if (pathname === '/api/music/library/avatar' && req.method === 'GET') {
      const name = (urlObj.searchParams.get('name') || '').slice(0, 120)
      const cache = repository.read<any>('client_artist_group', 'artist-groups.json', {})
      const artist = cache.groups?.find((item: any) => item.name === name)
      if (!artist) { json(404, { message: '歌手不存在' }); return }
      const artwork = new ArtistArtworkService(repository, cacheDir)
      const file = await artwork.get(name, async singer => {
        if (artist.artist?.picUrl) return artist.artist.picUrl
        if (artist.artist?.id && artist.artist?.source) return runtime.fetchArtistPicShared(artist.artist.source, artist.artist.id)
        const source = artist.songs[0]?.source || 'wy'
        const sdk = runtime.musicSdk[source]?.extendSearch || runtime.musicSdk.wy?.extendSearch
        const result = await sdk?.searchSinger?.(singer, 1, 5)
        const exact = result?.list?.find((item: any) => item.name === singer)
        return exact?.picUrl || exact?.img || exact?.pic || null
      })
      if (!file) { json(404, { message: '暂无歌手头像' }); return }
      const bytes = fs.readFileSync(file)
      const type = bytes[0] === 255 ? 'image/jpeg' : bytes[0] === 137 ? 'image/png' : bytes.toString('ascii', 0, 3) === 'GIF' ? 'image/gif' : 'image/webp'
      res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'private, max-age=86400', 'X-Content-Type-Options': 'nosniff' }); res.end(bytes)
    } else if (pathname === '/api/user/appearance/background' && req.method === 'POST') {
      // 单独限制上传流，避免读入超大请求；不信任扩展名或 Content-Type。
      const chunks: Buffer[] = []
      let size = 0
      for await (const chunk of req) {
        size += chunk.length
        if (size > 10 * 1024 * 1024) { json(413, { message: '图片不能超过 10 MB' }); req.resume(); return }
        chunks.push(chunk)
      }
      json(200, { file: service.saveBackground(Buffer.concat(chunks), cacheDir) })
    } else if (pathname === '/api/user/appearance/background' && req.method === 'GET') {
      const background = service.getExperience(repository, cacheDir).background
      if (!background) { json(404, { message: '背景图片不存在' }); return }
      const file = path.join(cacheDir, 'theme-backgrounds', background.file)
      const types: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif' }
      res.writeHead(200, { 'Content-Type': types[path.extname(file)], 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' })
      fs.createReadStream(file).on('error', () => res.destroy()).pipe(res)
    } else if (pathname === '/api/user/appearance' && req.method === 'GET') {
      json(200, service.getExperience(repository, cacheDir))
    } else if (pathname === '/api/user/appearance' && req.method === 'PUT') {
      json(200, service.putExperience(repository, cacheDir, JSON.parse(await runtime.readBody(req))))
    } else if (pathname === '/api/user/recent' && req.method === 'GET') {
      json(200, { items: service.getRecent(repository), limit: service.getExperience(repository, cacheDir).recentLimit })
    } else if (pathname === '/api/user/recent' && req.method === 'POST') {
      json(200, { items: service.recordRecent(repository, cacheDir, JSON.parse(await runtime.readBody(req))) })
    } else if (pathname === '/api/user/recent' && req.method === 'DELETE') {
      repository.write('client_recent_play', 'recent-play.json', [])
      json(200, { items: [] })
    } else if (pathname === '/api/music/library/search' && req.method === 'GET') {
      const query = (urlObj.searchParams.get('q') || '').slice(0, 120)
      if (!query.trim()) { json(200, { songs: [], artists: [], albums: [] }); return }
      const items = [...await fileCache.getCacheList(username), ...await customMusic.getCustomMusicList(username)]
      const favoritePath = path.join(userDir, 'library', 'artists.json')
      const favorites = runtime.storageFs.existsSync(favoritePath) ? JSON.parse(runtime.storageFs.readFileSync(favoritePath, 'utf8')) : []
      const groups = new service.ArtistGroupCache(repository).groups(items, favorites)
      const albums = new service.AlbumGroupCache(repository).groups(items)
      json(200, service.searchLibrary(items, groups, query, albums))
    } else json(405, { message: '不支持的请求方法' })
  } catch (error: any) { json(400, { message: error.message }) }
}
