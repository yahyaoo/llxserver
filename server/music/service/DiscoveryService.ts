import { resolveMusicFile } from '../../application/library/MusicDirectoryService'
import type { RequestContext, ServerRuntime } from '../../common/http/RequestContext'
import { removeMatchedDislikes } from './dislike/removeMatched'
/** 音乐搜索、歌手专辑查询、自定义歌曲维护和不喜欢规则所需的应用依赖契约。 @author yahyaoo */
export type DiscoveryServiceRuntime = Pick<ServerRuntime, 'verifyUserAuth' | 'customMusicManager' | 'getUserConfig' | 'readBody' | 'path' | 'storageFs' | 'fileCache' | 'serverDownloads' | 'musicSdk' | 'musicProgressClients' | 'normalizeSongInfo' | 'isSourceSupported' | 'callUserApiGetMusicUrl' | 'needle' | 'getProxyAgent' | 'resolveServerSong' | 'getAudioRemoteSize' | 'formatBytes' | 'getUserSpace' | 'serializeDislikeRules' | 'dislikeMatchOptions' | 'splitSingers' | 'encodeAlbumRule' | 'normalizeText' | 'invalidateDislikeCache'>
/** 音乐搜索、歌手专辑查询、自定义歌曲维护和不喜欢规则服务。 @author yahyaoo */

/**
 * 扫描用户自定义歌曲目录并刷新索引。
 * @param context /api/music/custom/sync 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 音乐搜索、歌手专辑查询、自定义歌曲维护和不喜欢规则的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export async function postMusicCustomSync(context: RequestContext, runtime: DiscoveryServiceRuntime) {
  const { req, res } = context
  const { verifyUserAuth, customMusicManager } = runtime

        const verified = verifyUserAuth(req)
        if (!verified) {
          res.writeHead(401, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ success: false, message: 'Unauthorized' }))
          return
        }
        const scan = customMusicManager.ensureMusicScan(verified, true)
        res.writeHead(202, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ success: true, scan }))
        return

}

/**
 * 校验用户与文件路径后返回自定义音频，支持范围请求。
 * @param context /api/music/custom/file 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 音乐搜索、歌手专辑查询、自定义歌曲维护和不喜欢规则的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export async function handleMusicCustomFile(context: RequestContext, runtime: DiscoveryServiceRuntime) {
  const { urlObj, pathname, req, res } = context
  const { verifyUserAuth, customMusicManager } = runtime

        let rawFilename = urlObj.searchParams.get('filename')
        let reqUsername = urlObj.searchParams.get('user') || ''

        if (!rawFilename && pathname.startsWith('/api/music/custom/file/')) {
          const rest = pathname.substring('/api/music/custom/file/'.length)
          try {
            rawFilename = decodeURIComponent(rest)
          } catch (e) {
            rawFilename = rest
          }
        }

        if (rawFilename) {
          const urlToken = urlObj.searchParams.get('token')
          if (urlToken && !req.headers['x-user-token']) {
            (req.headers as any)['x-user-token'] = urlToken
          }
          if (reqUsername && !req.headers['x-user-name']) {
            (req.headers as any)['x-user-name'] = reqUsername
          }
          const verified = verifyUserAuth(req)
          if (!verified) {
            res.writeHead(401)
            res.end('Unauthorized')
            return
          }
          customMusicManager.serveCustomFile(req, res, rawFilename, verified)
          return
        }

}

/**
 * 返回自定义歌曲的封面图片。
 * @param context /api/music/custom/cover 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 音乐搜索、歌手专辑查询、自定义歌曲维护和不喜欢规则的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export async function getMusicCustomCover(context: RequestContext, runtime: DiscoveryServiceRuntime) {
  const { req, urlObj, res } = context
  const { verifyUserAuth, customMusicManager } = runtime

        const reqUsername = (req.headers['x-user-name'] as string) || urlObj.searchParams.get('user') || ''
        const urlToken = urlObj.searchParams.get('token')
        if (urlToken && !req.headers['x-user-token']) {
          (req.headers as any)['x-user-token'] = urlToken
        }
        if (reqUsername && !req.headers['x-user-name']) {
          (req.headers as any)['x-user-name'] = reqUsername
        }
        const verified = verifyUserAuth(req)
        if (!verified) {
          res.writeHead(401)
          res.end('Unauthorized')
          return
        }
        const filename = urlObj.searchParams.get('filename')
        if (!filename) {
          res.writeHead(400)
          res.end('Missing filename')
          return
        }
        const cover = await customMusicManager.getCustomCover(filename, verified)
        if (cover && cover.data) {
          res.writeHead(200, {
            'Content-Type': cover.mime || 'image/jpeg',
            'Cache-Control': 'public, max-age=86400',
          })
          res.end(cover.data)
        } else {
          res.writeHead(404)
          res.end('Not Found')
        }
        return

}

/**
 * 删除用户授权范围内的自定义歌曲文件。
 * @param context /api/music/custom/remove 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 音乐搜索、歌手专辑查询、自定义歌曲维护和不喜欢规则的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export async function postMusicCustomRemove(context: RequestContext, runtime: DiscoveryServiceRuntime) {
  const { req, res } = context
  const { verifyUserAuth, getUserConfig, readBody, customMusicManager } = runtime

        const verified = verifyUserAuth(req)
        if (!verified) {
          res.writeHead(401, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ success: false, message: 'Unauthorized' }))
          return
        }
        const userCfg = getUserConfig(verified)
        if (!userCfg?.allowOperateCustomMusicDir) {
          res.writeHead(403, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ success: false, message: '管理员未允许操作或删除自定义目录中的文件' }))
          return
        }

        void readBody(req).then(body => {
          try {
            const payload = JSON.parse(body)
            const rawItems = Array.isArray(payload.items)
              ? payload.items
              : (payload.filenames ? (Array.isArray(payload.filenames) ? payload.filenames : [payload.filenames]) : [])

            let deletedCount = 0
            for (const item of rawItems) {
              const filename = typeof item === 'string' ? item : item?.filename
              if (filename && customMusicManager.removeCustomFile(filename, verified)) {
                deletedCount++
              }
            }
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ success: true, deletedCount }))
          } catch (e: any) {
            res.writeHead(400, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ success: false, message: e.message }))
          }
        })
        return

}

/**
 * 为自定义歌曲关联音乐平台歌曲信息。
 * @param context /api/music/custom/link 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 音乐搜索、歌手专辑查询、自定义歌曲维护和不喜欢规则的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export async function postMusicCustomLink(context: RequestContext, runtime: DiscoveryServiceRuntime) {
  const { req, res } = context
  const { verifyUserAuth, getUserConfig, readBody, customMusicManager } = runtime

        const verified = verifyUserAuth(req)
        if (!verified) {
          res.writeHead(401, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ success: false, message: 'Unauthorized' }))
          return
        }
        const userCfg = getUserConfig(verified)
        if (!userCfg?.allowWriteCustomMusicDir) {
          res.writeHead(403, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ success: false, message: '管理员未允许操作自定义目录中的文件' }))
          return
        }

        void readBody(req).then(async body => {
          try {
            const { filename, songInfo } = JSON.parse(body)
            if (!filename || !songInfo) {
              res.writeHead(400, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ success: false, message: 'Missing params' }))
              return
            }

            const result = await customMusicManager.linkCustomSong(filename, songInfo, verified)
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify(result))
          } catch (e: any) {
            res.writeHead(500, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ success: false, message: e.message || 'Linking failed' }))
          }
        })
        return

}

/**
 * 更新自定义歌曲文件的元信息标签。
 * @param context /api/music/custom/updateMetadata 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 音乐搜索、歌手专辑查询、自定义歌曲维护和不喜欢规则的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export async function postMusicCustomUpdateMetadata(context: RequestContext, runtime: DiscoveryServiceRuntime) {
  const { req, res } = context
  const { verifyUserAuth, getUserConfig, readBody, customMusicManager } = runtime

        const verified = verifyUserAuth(req)
        if (!verified) {
          res.writeHead(401, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ success: false, message: 'Unauthorized' }))
          return
        }

        const userCfg = getUserConfig(verified)
        if (!userCfg?.allowWriteCustomMusicDir) {
          res.writeHead(403, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ success: false, message: '管理员未允许写入自定义目录中的歌曲文件' }))
          return
        }

        void readBody(req).then(async body => {
          try {
            const { filenames } = JSON.parse(body)
            if (!filenames) throw new Error('Missing filenames')
            const fileList = Array.isArray(filenames) ? filenames : [filenames]
            const result = await customMusicManager.batchUpdateMetadata(fileList, verified)
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ success: true, ...result }))
          } catch (e: any) {
            res.writeHead(400, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ success: false, message: e.message }))
          }
        })
        return

}

/**
 * 读取自定义歌曲内嵌歌词。
 * @param context /api/music/custom/embedLyric 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 音乐搜索、歌手专辑查询、自定义歌曲维护和不喜欢规则的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export async function getMusicCustomEmbedLyric(context: RequestContext, runtime: DiscoveryServiceRuntime) {
  const { req, res, urlObj } = context
  const { verifyUserAuth, customMusicManager, path, storageFs } = runtime

        const verified = verifyUserAuth(req)
        if (!verified) {
          res.writeHead(401, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ success: false, message: 'Unauthorized' }))
          return
        }
        const filename = urlObj.searchParams.get('filename') || ''
        if (!filename) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ success: false, message: 'Missing filename' }))
          return
        }
        try {
          const customDir = customMusicManager.getCustomMusicDir(verified)
          if (!customDir) throw new Error('未配置自定义目录')
          const filePath = resolveMusicFile(verified, filename)
          // 安全检查：防止路径穿越
          if (!filePath) throw new Error('非法路径')
          if (!storageFs.existsSync(filePath)) {
            res.writeHead(404, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ success: false, message: '文件不存在' }))
            return
          }
          const { MusicTagger: MT } = require('music-tag-native')
          const tagger = new MT()
          tagger.loadPath(filePath)
          const lrc = tagger.lyrics || ''
          tagger.dispose()
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ success: true, lrc }))
        } catch (e: any) {
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ success: false, message: e.message || '读取内嵌歌词失败' }))
        }
        return

}

/**
 * 将歌词写入自定义歌曲文件。
 * @param context /api/music/custom/embedLyric 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 音乐搜索、歌手专辑查询、自定义歌曲维护和不喜欢规则的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export async function postMusicCustomEmbedLyric(context: RequestContext, runtime: DiscoveryServiceRuntime) {
  const { req, res } = context
  const { verifyUserAuth, getUserConfig, readBody, customMusicManager } = runtime

        const verified = verifyUserAuth(req)
        if (!verified) {
          res.writeHead(401, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ success: false, message: 'Unauthorized' }))
          return
        }

        const userCfg = getUserConfig(verified)
        if (!userCfg?.allowWriteCustomMusicDir) {
          res.writeHead(403, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ success: false, message: '管理员未允许写入自定义目录中的歌曲文件' }))
          return
        }

        void readBody(req).then(async body => {
          try {
            const { filenames } = JSON.parse(body)
            if (!filenames || !Array.isArray(filenames)) throw new Error('Missing filenames')
            const result = await customMusicManager.batchEmbedLyric(filenames, verified)
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ success: true, ...result }))
          } catch (e: any) {
            res.writeHead(400, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ success: false, message: e.message }))
          }
        })
        return

}

/**
 * 提取音频指纹并查询匹配的歌曲录音。
 * @param context /api/music/identify 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 音乐搜索、歌手专辑查询、自定义歌曲维护和不喜欢规则的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export async function postMusicIdentify(context: RequestContext, runtime: DiscoveryServiceRuntime) {
  const { req, res } = context
  const { verifyUserAuth, readBody, customMusicManager, fileCache, path, storageFs } = runtime

        const verified = verifyUserAuth(req)
        if (!verified) {
          res.writeHead(401, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ success: false, message: 'Unauthorized' }))
          return
        }

        void readBody(req).then(async body => {
          try {
            const { filename, folder } = JSON.parse(body)
            if (!filename) {
              res.writeHead(400)
              res.end('Missing filename')
              return
            }

            const { identifyLocalSong } = require('./discovery/identify')
            const username = verified

            const dir = folder === 'custom'
              ? customMusicManager.getCustomMusicDir(username)
              : fileCache.getCacheDir(username, folder === 'music')

            if (!dir) {
              res.writeHead(404, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ success: false, message: 'Directory not found' }))
              return
            }
            const filePath = path.join(dir, filename) // [Fix] Allow subfolders

            if (!storageFs.existsSync(filePath)) {
              throw new Error('文件不存在: ' + filename)
            }

            const results = await identifyLocalSong(filePath)
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ success: true, results }))
          } catch (e: any) {
            console.error('[歌曲识别] 识别发生异常:', e.message)
            res.writeHead(500, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ success: false, message: e.message || 'Identification failed' }))
          }
        })
        return

}

/**
 * 查询歌曲歌词。
 * @param context /api/music/lyric 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 音乐搜索、歌手专辑查询、自定义歌曲维护和不喜欢规则的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export async function getMusicLyric(context: RequestContext, runtime: DiscoveryServiceRuntime) {
  const { urlObj, res, req } = context
  const { verifyUserAuth, serverDownloads, fileCache, musicSdk } = runtime

        const source = urlObj.searchParams.get('source')
        // [Optimization] Accept multiple ID param names for better client compatibility
        let songmid = urlObj.searchParams.get('songmid') || urlObj.searchParams.get('songId') || urlObj.searchParams.get('id')

        if (!source || !songmid) {
          res.writeHead(400)
          res.end('Missing source or songmid')
          return
        }

        // [Fix] Normalize ID by stripping source prefix if present (e.g., "tx_001..." -> "001...")
        const sourcePrefix = `${source}_`
        if (songmid.startsWith(sourcePrefix)) {
          songmid = songmid.slice(sourcePrefix.length)
        }

        // [优化] 先检查本地 .lrc 文件缓存，命中则直接返回，无需网络请求（断网也可用）
        const reqUsername = (req.headers['x-user-name'] as string) || ''
        const isPublic = !reqUsername || reqUsername === 'default'
        let lyricUsername = '_open'
        if (!isPublic) {
          const verified = verifyUserAuth(req)
          if (verified) lyricUsername = verified
        }
        const downloadedLyric = serverDownloads.getLyric({ source, songmid }, lyricUsername)
        if (downloadedLyric) {
          res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' })
          res.end(JSON.stringify({ lyric: downloadedLyric, _fromLocalCache: true }))
          return
        }
        const localLyricResult = fileCache.checkLyricCache({
          source,
          songmid,
          id: urlObj.searchParams.get('songId') || urlObj.searchParams.get('id') || songmid,
          name: urlObj.searchParams.get('name') || '',
          singer: urlObj.searchParams.get('singer') || '',
        }, lyricUsername)

        if (localLyricResult.exists && localLyricResult.content) {
          console.log(`[歌词服务] 命中本地 .lrc 缓存: ${source}_${songmid}`)
          res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=86400' })
          res.end(JSON.stringify({ ...localLyricResult.content, _fromLocalCache: true }))
          return
        }

        try {
          if (!musicSdk[source]) {
            throw new Error('Source not supported')
          }

          // console.log('[歌词服务] 正在从音源获取歌词:', source, songmid)

          // Construct complete songInfo object for SDK compatibility
          // KuGou (kg) needs: name, hash, interval
          // MiGu (mg) needs: copyrightId, lrcUrl, mrcUrl, trcUrl (优先，避免调用getMusicInfo API)
          const songInfo = {
            songmid,
            name: urlObj.searchParams.get('name') || '',
            singer: urlObj.searchParams.get('singer') || '',
            hash: urlObj.searchParams.get('hash') || '',
            interval: urlObj.searchParams.get('interval') || '',
            copyrightId: urlObj.searchParams.get('copyrightId') || '',
            albumId: urlObj.searchParams.get('albumId') || '',
            lrcUrl: urlObj.searchParams.get('lrcUrl') || '',
            mrcUrl: urlObj.searchParams.get('mrcUrl') || '',
            trcUrl: urlObj.searchParams.get('trcUrl') || ''
          }

          const requestObj = musicSdk[source].getLyric(songInfo)
          const lyricInfo = await requestObj.promise

          res.writeHead(200, {
            'Content-Type': 'application/json',
            'Cache-Control': 'public, max-age=86400' // Cache lyrics for 1 day
          })
          res.end(JSON.stringify(lyricInfo))
        } catch (err: any) {
          console.error('[歌词服务] 获取歌词失败:', source, songmid, err.message || err)

          // [Fallback] 网络请求失败时，再次尝试本地 .lrc 文件（防止 Step2 miss 但物理文件存在的情况）
          const fallbackResult = fileCache.checkLyricCache({
            source,
            songmid,
            id: urlObj.searchParams.get('songId') || urlObj.searchParams.get('id') || songmid,
            name: urlObj.searchParams.get('name') || '',
            singer: urlObj.searchParams.get('singer') || '',
          }, lyricUsername)
          if (fallbackResult.exists && fallbackResult.content) {
            console.log(`[歌词服务] 网络获取失败，回退到本地 .lrc: ${source}_${songmid}`)
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ ...fallbackResult.content, _fromLocalCache: true }))
            return
          }

          // Avoid circular structure error - only send message
          res.writeHead(500, { 'Content-Type': 'text/plain' })
          res.end(err.message || 'Failed to fetch lyric')
        }
        return

}

/**
 * 按关键词、平台和分页参数搜索歌曲。
 * @param context /api/music/search 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 音乐搜索、歌手专辑查询、自定义歌曲维护和不喜欢规则的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export async function getMusicSearch(context: RequestContext, runtime: DiscoveryServiceRuntime) {
  const { urlObj, res } = context
  const { musicSdk, storageFs, path } = runtime

        const name = urlObj.searchParams.get('name') || ''
        const singer = urlObj.searchParams.get('singer') || ''
        const source = urlObj.searchParams.get('source') || 'kw'
        const type = urlObj.searchParams.get('type') || 'song' // 新增 type 参数: song, singer, album, playlist
        const limit = parseInt(urlObj.searchParams.get('limit') || '20')
        const page = parseInt(urlObj.searchParams.get('page') || '1')
        const fetchPages = parseInt(urlObj.searchParams.get('pages') || '1') // 新增：一次请求多少页

        if (!name) {
          res.writeHead(400); res.end('Missing name'); return
        }

        try {
          if (!musicSdk[source]) {
            throw new Error(`Source ${source} is not supported`)
          }

          let result
          if (type === 'song') {
            const PAGE_SIZE = 20
            let allSongs: any[] = []
            // 根据前端给定的起始页 (page) 和 请求量 (pages) 进行拉取
            const startPage = page
            const endPage = page + fetchPages - 1

            for (let p = startPage; p <= endPage; p++) {
              const searchData = await musicSdk[source].musicSearch.search(name, p, PAGE_SIZE)
              const pageList: any[] = searchData.list || []
              allSongs = allSongs.concat(pageList)
              // 如果本页返回数量小于 PAGE_SIZE，说明已经是最后页
              if (pageList.length < PAGE_SIZE) break
            }
            result = allSongs
          } else if (type === 'singer') {
            if (!musicSdk[source].extendSearch || !musicSdk[source].extendSearch.searchSinger) {
              throw new Error(`Source ${source} does not support singer search`)
            }
            const searchData = await musicSdk[source].extendSearch.searchSinger(name, page, limit)
            result = searchData.list || []
          } else if (type === 'album') {
            if (!musicSdk[source].extendSearch || !musicSdk[source].extendSearch.searchAlbum) {
              throw new Error(`Source ${source} does not support album search`)
            }
            const searchData = await musicSdk[source].extendSearch.searchAlbum(name, page, limit)
            result = searchData.list || []
          } else if (type === 'playlist') {
            if (!musicSdk[source].extendSearch || !musicSdk[source].extendSearch.searchPlaylist) {
              throw new Error(`Source ${source} does not support playlist search`)
            }
            const searchData = await musicSdk[source].extendSearch.searchPlaylist(name, page, limit)
            result = searchData.list || []
          } else {
            throw new Error(`Invalid search type: ${type}`)
          }

          storageFs.appendFileSync(path.join(process.cwd(), 'debug.txt'), `[Search] Source: ${source}, Type: ${type}, Query: ${name}, StartPage: ${page}, Pages: ${fetchPages}, Result Count: ${result.length}\n`)
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify(result))
        } catch (err: any) {
          storageFs.appendFileSync(path.join(process.cwd(), 'debug.txt'), `[Search Error] ${err.message}\n${err.stack}\n`)
          console.error(err)
          res.writeHead(500, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: err.message, code: 500 }))
        }
        return

}

/**
 * 查询音乐平台的搜索建议。
 * @param context /api/music/tipSearch 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 音乐搜索、歌手专辑查询、自定义歌曲维护和不喜欢规则的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export async function getMusicTipSearch(context: RequestContext, runtime: DiscoveryServiceRuntime) {
  const { urlObj, res } = context
  const { musicSdk } = runtime

        const name = urlObj.searchParams.get('name') || ''
        const source = urlObj.searchParams.get('source') || 'kw'
        if (!name) {
          res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('[]'); return
        }
        try {
          if (!musicSdk[source] || !musicSdk[source].tipSearch) {
            res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('[]'); return
          }
          const tips = await musicSdk[source].tipSearch.search(name)
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify(tips || []))
        } catch (err: any) {
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end('[]')
        }
        return

}

/**
 * 聚合歌手简介、头像及详情。
 * @param context /api/music/artistDetail 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 音乐搜索、歌手专辑查询、自定义歌曲维护和不喜欢规则的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export async function getMusicArtistDetail(context: RequestContext, runtime: DiscoveryServiceRuntime) {
  const { urlObj, res } = context
  const { musicSdk } = runtime

        const id = urlObj.searchParams.get('id')
        const source = urlObj.searchParams.get('source') || 'wy'
        if (!id) {
          res.writeHead(400); res.end('Missing id'); return
        }
        try {
          const data = await musicSdk[source].extendDetail.getArtistDetail(id)
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify(data))
        } catch (err: any) {
          res.writeHead(500); res.end(err.message)
        }
        return

}

/**
 * 分页查询歌手专辑。
 * @param context /api/music/artistAlbums 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 音乐搜索、歌手专辑查询、自定义歌曲维护和不喜欢规则的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export async function getMusicArtistAlbums(context: RequestContext, runtime: DiscoveryServiceRuntime) {
  const { urlObj, res } = context
  const { musicSdk } = runtime

        const id = urlObj.searchParams.get('id')
        const source = urlObj.searchParams.get('source') || 'wy'
        const page = parseInt(urlObj.searchParams.get('page') || '1')
        if (!id) {
          res.writeHead(400); res.end('Missing id'); return
        }
        try {
          const data = await musicSdk[source].extendDetail.getArtistAlbums(id, page)
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify(data))
        } catch (err: any) {
          res.writeHead(500); res.end(err.message)
        }
        return

}

/**
 * 分页查询歌手歌曲。
 * @param context /api/music/artistSongs 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 音乐搜索、歌手专辑查询、自定义歌曲维护和不喜欢规则的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export async function getMusicArtistSongs(context: RequestContext, runtime: DiscoveryServiceRuntime) {
  const { urlObj, res } = context
  const { musicSdk } = runtime

        const id = urlObj.searchParams.get('id')
        const source = urlObj.searchParams.get('source') || 'wy'
        const order = urlObj.searchParams.get('order') || 'hot'
        if (!id) {
          res.writeHead(400); res.end('Missing id'); return
        }
        try {
          const PAGE_SIZE = 100
          const configuredMaxPages = Number((global.lx.config as any)?.['artist.maxFetchPages'])
          const MAX_PAGES = Number.isFinite(configuredMaxPages) && configuredMaxPages > 0
            ? Math.min(Math.floor(configuredMaxPages), 100)
            : 20
          let allSongs: any[] = []
          for (let p = 1; p <= MAX_PAGES; p++) {
            const data = await musicSdk[source].extendDetail.getArtistSongs(id, p, PAGE_SIZE, order)
            const pageList: any[] = data.list || []
            allSongs = allSongs.concat(pageList)
            const total = Number(data.total) || 0
            if (pageList.length < PAGE_SIZE || (total > 0 && allSongs.length >= total)) break
          }
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify(allSongs))
        } catch (err: any) {
          res.writeHead(500); res.end(err.message)
        }
        return

}

/**
 * 查询专辑歌曲。
 * @param context /api/music/albumSongs 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 音乐搜索、歌手专辑查询、自定义歌曲维护和不喜欢规则的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export async function getMusicAlbumSongs(context: RequestContext, runtime: DiscoveryServiceRuntime) {
  const { urlObj, res } = context
  const { musicSdk } = runtime

        const id = urlObj.searchParams.get('id')
        const source = urlObj.searchParams.get('source') || 'wy'
        if (!id) {
          res.writeHead(400); res.end('Missing id'); return
        }
        try {
          const data = await musicSdk[source].extendDetail.getAlbumSongs(id)
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify(data))
        } catch (err: any) {
          res.writeHead(500); res.end(err.message)
        }
        return

}

/**
 * 查询歌曲处理任务进度。
 * @param context /api/music/progress 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 音乐搜索、歌手专辑查询、自定义歌曲维护和不喜欢规则的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export async function getMusicProgress(context: RequestContext, runtime: DiscoveryServiceRuntime) {
  const { urlObj, res, req } = context
  const { musicProgressClients } = runtime

        const reqId = urlObj.searchParams.get('reqId')
        if (!reqId) {
          res.writeHead(400)
          res.end('Missing reqId')
          return
        }
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache, no-transform',
          'Connection': 'keep-alive',
          'Access-Control-Allow-Origin': '*',
          'X-Accel-Buffering': 'no', // 关键：禁用 Nginx 等代理的缓冲
        })
        res.write('retry: 3000\n\n')
        musicProgressClients.set(reqId, res)
        req.on('close', () => {
          musicProgressClients.delete(reqId)
        })
        return

}

/**
 * 按歌曲及音质解析可播放音频地址。
 * @param context /api/music/url 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 音乐搜索、歌手专辑查询、自定义歌曲维护和不喜欢规则的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export async function postMusicUrl(context: RequestContext, runtime: DiscoveryServiceRuntime) {
  const { req, res } = context
  const { verifyUserAuth, readBody, musicProgressClients, normalizeSongInfo, isSourceSupported, callUserApiGetMusicUrl, needle, getProxyAgent, fileCache } = runtime

        const clientUsername = req.headers['x-user-name'] as string | undefined

        // 鉴权逻辑：如果提供了具名用户，必须通过 Token 或密码验证
        let verifiedUsername = 'open' // userApi 中公开用户标识为 'open'
        if (clientUsername && clientUsername !== 'default' && clientUsername !== 'open' && clientUsername !== '_open') {
          const verified = verifyUserAuth(req)
          if (!verified || verified !== clientUsername) {
            res.writeHead(401, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ success: false, message: 'Unauthorized' }))
            return
          }
          verifiedUsername = verified
        }

        const clientId = req.headers['x-client-id'] as string | undefined
        const reqId = req.headers['x-req-id'] as string | undefined

        void readBody(req).then(async body => {
          // 辅助：通过 SSE 推送进度（内置竞态重试，最多等 600ms 让 SSE 连接就绪）
          let sseFailed = false
          const pushProgress = async (attempt: any, retries = 10): Promise<void> => {
            if (!reqId || sseFailed) return
            if (musicProgressClients.has(reqId)) {
              musicProgressClients.get(reqId)!.write(`data: ${JSON.stringify(attempt)}\n\n`)
              return
            }
            if (retries > 0) {
              await new Promise(r => setTimeout(r, 300))
              await pushProgress(attempt, retries - 1)
            } else {
              sseFailed = true
              console.warn(`[进度推送] 经过多次重试未找到 ReqId: ${reqId} (当前已注册 ${musicProgressClients.size} 个客户端)`)
            }
          }

          try {
            let { songInfo, quality, enableAutoSwitchApiSource, excludeApiSources } = JSON.parse(body)
            songInfo = normalizeSongInfo(songInfo)
            // console.log('[歌曲播放] 歌曲信息:', JSON.stringify(songInfo, null, 2))
            if (!songInfo || !songInfo.source) {
              throw new Error('Invalid songInfo')
            }
            const source = songInfo.source
            let result: any

            let customSourceError: string | null = null
            let attempts: any[] = []
            if (isSourceSupported(source, verifiedUsername)) {
              try {
                console.log(`[歌曲播放] 使用自定义源解析: ${source} (请求ID: ${reqId || '无'}, 用户: ${verifiedUsername})`)

                const userApiResult = await callUserApiGetMusicUrl(
                  source, songInfo, quality || '128k', verifiedUsername,
                  (attempt) => { void pushProgress(attempt) },
                  enableAutoSwitchApiSource !== false,
                  excludeApiSources
                )
                result = userApiResult
                attempts = userApiResult.attempts || []
              } catch (userApiError: any) {
                console.error(`[歌曲播放] 自定义源解析失败:`, userApiError.message)
                customSourceError = userApiError.message
                attempts = userApiError.attempts || []
                // 不抛出错误，继续尝试内置源
              }
            } else {
              // isSourceSupported = false: 无任何自定义源支持此平台，立即通知前端
              void pushProgress({ name: '系统', status: 'fail', message: `未找到支持 ${source} 平台的自定义源，请在设置中添加或启用相关源` })
            }

            // 自定义源失败则直接报错（内置 SDK 无独立解析能力，回退无意义）
            if (!result) {
              const errMsg = customSourceError || `未找到支持 ${source} 平台的自定义源，请在设置中添加或启用相关源`
              const err: any = new Error(errMsg)
              err.attempts = attempts
              throw err
            }

            // 合并解析尝试记录到响应（前端可用于诊断）
            if (attempts.length > 0) result.attempts = attempts

            // [Fix] Server-side Mixed Content handling & Redirect Resolution
            // If the upstream URL is HTTP, rewrite it to use our secure proxy OR resolve it if it's a redirect
            if (result && result.url) {
              // 1. Resolve Redirects (301, 302, 307, etc.) to get direct link
              try {
                // Only try to resolve if it looks like a remote URL and is not already resolved
                if (result.url.startsWith('http')) {
                  // console.log(`[歌曲播放] 正在解析重定向: ${songInfo.name} (${quality})`);

                  const checkRedirect = async (u: string, depth: number = 0): Promise<string> => {
                    if (depth > 3) return u // Max depth 3
                    try {
                      const resp = await needle('head', u, null, {
                        follow_max: 0,
                        response_timeout: 4000, // Increase timeout slightly
                        read_timeout: 4000,
                        // 解析的是音乐平台链接，归 music 分类
                        agent: await getProxyAgent(u, 'music'),
                        headers: {
                          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                          'Referer': new URL(u).origin
                        }
                      })
                      if (resp.statusCode && [301, 302, 303, 307, 308].includes(resp.statusCode) && resp.headers.location) {
                        let nextUrl = resp.headers.location
                        if (!nextUrl.startsWith('http')) {
                          try { nextUrl = new URL(nextUrl, u).href } catch (e) { }
                        }
                        // console.log(`[歌曲播放] 解析重定向 [${resp.statusCode}]: ${u.substring(0, 50)}... -> ${nextUrl.substring(0, 50)}...`)
                        return checkRedirect(nextUrl, depth + 1)
                      }
                      // If error status but not redirect, return original
                      if (resp.statusCode !== undefined && resp.statusCode >= 400) {
                        console.warn(`[歌曲播放] 重定向探测返回异常状态码 ${resp.statusCode}，使用原始链接`);
                        return u;
                      }
                    } catch (e: any) {
                      console.warn(`[歌曲播放] HEAD 校验重定向失败: ${e.message}`);
                    }
                    return u
                  }

                  const finalUrl = await checkRedirect(result.url)
                  if (finalUrl !== result.url) {
                    result.url = finalUrl
                  }
                  // console.log(`[歌曲播放] 最终解析音频链接: ${result.url.substring(0, 100)}...`);
                }
              } catch (e) {
                console.error('[歌曲播放] 解析重定向发生异常:', e)
              }

              // 2. Mixed Content Handling (Optional Proxy) implementation details handled by frontend now
              // But we can keep the log for debugging
              if (result.url.startsWith('http://')) {
                // console.log(`[歌曲播放] 提示: 音频链接为 HTTP 协议: ${result.url}`)
              }

              result.requestedSource = songInfo.source
              result.downloadSource = fileCache.detectDownloadSource(result.url, songInfo.source)
            }

            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify(result))
          } catch (err: any) {
            console.error('[歌曲播放] 音频地址解析失败:', err.message)
            // [Fix] Return 500 but with specific error JSON to let frontend show detailed toast
            res.writeHead(500, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: err.message, code: 500, attempts: err.attempts }))
          }
        })
        return

}

/**
 * 查询歌曲各音质的文件大小。
 * @param context /api/music/quality/size 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 音乐搜索、歌手专辑查询、自定义歌曲维护和不喜欢规则的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export async function postMusicQualitySize(context: RequestContext, runtime: DiscoveryServiceRuntime) {
  const { req, res } = context
  const { verifyUserAuth, readBody, normalizeSongInfo, resolveServerSong, getAudioRemoteSize, formatBytes, fileCache } = runtime

        const clientUsername = req.headers['x-user-name'] as string | undefined

        let verifiedUsername = 'open'
        if (clientUsername && clientUsername !== 'default' && clientUsername !== 'open' && clientUsername !== '_open') {
          const verified = verifyUserAuth(req)
          if (!verified || verified !== clientUsername) {
            res.writeHead(401, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ success: false, message: 'Unauthorized' }))
            return
          }
          verifiedUsername = verified
        }

        void readBody(req).then(async body => {
          try {
            let { songInfo, quality } = JSON.parse(body)
            songInfo = normalizeSongInfo(songInfo)
            if (!songInfo || !songInfo.source || !quality) {
              throw new Error('Invalid quality size request')
            }

            const result = await resolveServerSong(songInfo, quality, verifiedUsername, false)
            const bytes = await getAudioRemoteSize(result.url)
            if (!bytes) throw new Error('无法读取真实文件大小')

            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({
              success: true,
              quality,
              bytes,
              size: formatBytes(bytes),
              type: result.quality,
              source: fileCache.detectDownloadSource(result.url, result.downloadSource || result.songInfo?.source),
              sourceName: result.sourceName,
            }))
          } catch (err: any) {
            console.error('[音质探测] 获取文件大小失败:', err.message)
            res.writeHead(500, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ success: false, error: err.message, code: 500 }))
          }
        })
        return

}

/**
 * 按提交的歌曲信息解析歌词。
 * @param context /api/music/lyric 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 音乐搜索、歌手专辑查询、自定义歌曲维护和不喜欢规则的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export async function postMusicLyric(context: RequestContext, runtime: DiscoveryServiceRuntime) {
  const { req, res } = context
  const { readBody, normalizeSongInfo, musicSdk } = runtime

        void readBody(req).then(async body => {
          try {
            let { songInfo } = JSON.parse(body)
            songInfo = normalizeSongInfo(songInfo)
            if (!songInfo || !songInfo.source) {
              throw new Error('Invalid songInfo')
            }
            const source = songInfo.source
            if (!musicSdk[source] || !musicSdk[source].getLyric) {
              throw new Error(`Source ${source} not supported`)
            }
            const result = await musicSdk[source].getLyric(songInfo)
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify(result))
          } catch (err: any) {
            console.error(err)
            res.writeHead(500)
            res.end(err.message)
          }
        })
        return

}

/**
 * 查询音乐平台热门搜索关键词。
 * @param context /api/music/hotSearch 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 音乐搜索、歌手专辑查询、自定义歌曲维护和不喜欢规则的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export async function getMusicHotSearch(context: RequestContext, runtime: DiscoveryServiceRuntime) {
  const { urlObj, res } = context
  const { musicSdk } = runtime

        const source = urlObj.searchParams.get('source') || 'mg'

        try {
          // 检查是否支持热搜
          if (!musicSdk[source] || !musicSdk[source].hotSearch) {
            res.writeHead(404, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: '该音源不支持热搜功能' }))
            return
          }

          // console.log(`[热搜服务] 获取热搜: source=${source}`)
          const result = await musicSdk[source].hotSearch.getList()

          res.writeHead(200, {
            'Content-Type': 'application/json',
            'Cache-Control': 'public, max-age=300' // 5分钟缓存
          })
          res.end(JSON.stringify(result))
        } catch (err: any) {
          console.error('[热搜服务] 获取热搜失败:', err.message)
          // Return empty array instead of 500 to keep UI stable
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify([]))
        }
        return

}

/**
 * 查询平台歌单标签分类。
 * @param context /api/music/songList/tags 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 音乐搜索、歌手专辑查询、自定义歌曲维护和不喜欢规则的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export async function getMusicSongListTags(context: RequestContext, runtime: DiscoveryServiceRuntime) {
  const { urlObj, res } = context
  const { musicSdk } = runtime

        const source = urlObj.searchParams.get('source') || 'wy'
        try {
          if (!musicSdk[source] || !musicSdk[source].songList) {
            throw new Error(`Source ${source} does not support songList`)
          }
          const result = await musicSdk[source].songList.getTags()
          const sortList = musicSdk[source].songList.sortList
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ ...result, sortList }))
        } catch (err: any) {
          console.error(`[歌单服务] 获取歌单分类标签失败:`, err)
          res.writeHead(500, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: err.message || '获取歌单标签失败' }))
        }
        return

}

/**
 * 查询平台歌单详情与歌曲。
 * @param context /api/music/songList/detail 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 音乐搜索、歌手专辑查询、自定义歌曲维护和不喜欢规则的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export async function getMusicSongListDetail(context: RequestContext, runtime: DiscoveryServiceRuntime) {
  const { urlObj, res } = context
  const { musicSdk, normalizeSongInfo } = runtime

        const source = urlObj.searchParams.get('source') || 'wy'
        const id = urlObj.searchParams.get('id')
        const page = parseInt(urlObj.searchParams.get('page') || '1')
        if (!id) {
          res.writeHead(400)
          res.end('Missing id')
          return
        }
        try {
          if (!musicSdk[source] || !musicSdk[source].songList) {
            throw new Error(`Source ${source} does not support songList`)
          }
          const result = await musicSdk[source].songList.getListDetail(id, page)
          if (result && result.list) {
            result.list = result.list.map(normalizeSongInfo)
          }
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify(result))
        } catch (err: any) {
          console.error(`[歌单服务] 获取歌单详情失败:`, err)
          res.writeHead(500, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: err.message || '获取歌单详情失败' }))
        }
        return

}

/**
 * 按关键词搜索平台歌单。
 * @param context /api/music/songList/search 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 音乐搜索、歌手专辑查询、自定义歌曲维护和不喜欢规则的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export async function getMusicSongListSearch(context: RequestContext, runtime: DiscoveryServiceRuntime) {
  const { urlObj, res } = context
  const { musicSdk } = runtime

        const source = urlObj.searchParams.get('source') || 'wy'
        const text = urlObj.searchParams.get('text')
        const page = parseInt(urlObj.searchParams.get('page') || '1')
        if (!text) {
          res.writeHead(400)
          res.end('Missing text')
          return
        }
        try {
          if (!musicSdk[source] || !musicSdk[source].songList) {
            throw new Error(`Source ${source} does not support songList`)
          }
          const result = await musicSdk[source].songList.search(text, page)
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify(result))
        } catch (err: any) {
          console.error(`[歌单服务] 搜索歌单失败:`, err)
          res.writeHead(500, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: err.message || '搜索歌单失败' }))
        }
        return

}

/**
 * 查询平台用户公开歌单。
 * @param context /api/music/songList/userPlaylist 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 音乐搜索、歌手专辑查询、自定义歌曲维护和不喜欢规则的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export async function getMusicSongListUserPlaylist(context: RequestContext, runtime: DiscoveryServiceRuntime) {
  const { urlObj, res } = context
  const { musicSdk } = runtime

        const source = urlObj.searchParams.get('source') || 'tx'
        const uid = urlObj.searchParams.get('uid')
        const page = parseInt(urlObj.searchParams.get('page') || '1')
        if (!uid) {
          res.writeHead(400)
          res.end('Missing uid')
          return
        }
        try {
          if (!musicSdk[source] || !musicSdk[source].userPlaylist) {
            throw new Error(`Source ${source} does not support userPlaylist`)
          }
          const result = await musicSdk[source].userPlaylist.getList(uid, page)
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify(result))
        } catch (err: any) {
          console.error(`[用户歌单] 获取用户歌单失败:`, err)
          res.writeHead(500, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: err.message || '获取用户歌单失败' }))
        }
        return

}

/**
 * 查询平台排行榜分类。
 * @param context /api/music/leaderboard/boards 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 音乐搜索、歌手专辑查询、自定义歌曲维护和不喜欢规则的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export async function getMusicLeaderboardBoards(context: RequestContext, runtime: DiscoveryServiceRuntime) {
  const { urlObj, res } = context
  const { musicSdk } = runtime

        const source = urlObj.searchParams.get('source') || 'kg'
        try {
          if (!musicSdk[source] || !musicSdk[source].leaderboard) {
            throw new Error(`Source ${source} does not support leaderboard`)
          }
          const result = await musicSdk[source].leaderboard.getBoards()
          res.writeHead(200, {
            'Content-Type': 'application/json',
            'Cache-Control': 'public, max-age=600'
          })
          res.end(JSON.stringify(result))
        } catch (err: any) {
          console.error(`[排行榜] 获取排行榜列表失败:`, err)
          res.writeHead(500, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: err.message || '获取排行榜列表失败' }))
        }
        return

}

/**
 * 查询歌曲评论及分页结果。
 * @param context /api/music/comment 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 音乐搜索、歌手专辑查询、自定义歌曲维护和不喜欢规则的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export async function postMusicComment(context: RequestContext, runtime: DiscoveryServiceRuntime) {
  const { req, res } = context
  const { readBody, normalizeSongInfo, musicSdk } = runtime

        void readBody(req).then(async body => {
          try {
            let { songInfo, type, page, limit } = JSON.parse(body)
            songInfo = normalizeSongInfo(songInfo)
            if (!songInfo || !songInfo.source) {
              console.warn('[评论服务] 无效的请求参数:', body)
              throw new Error('Invalid songInfo')
            }
            const source = songInfo.source
            console.log(`[评论服务] 请求评论: ${source} - ${songInfo.name} - ${type} - 第 ${page} 页`)

            if (!musicSdk[source] || !musicSdk[source].comment) {
              console.warn(`[评论服务] 音源 ${source} 不支持评论功能`)
              throw new Error(`Source ${source} not supported for comments`)
            }

            const method = type === 'hot' ? 'getHotComment' : 'getComment'
            console.log(`[评论服务] 歌曲: ${songInfo.name}, ID: ${songInfo.songmid}, 音源: ${source}`)

            if (!musicSdk[source].comment[method]) {
              console.warn(`[评论服务] 方法 ${method} 不被音源 ${source} 支持`)
              throw new Error(`Method ${method} not supported for source ${source}`)
            }

            const result = await musicSdk[source].comment[method](songInfo, page, limit)
            console.log(`[评论服务] 获取成功: ${source} - 共找到 ${result.comments?.length} 条评论`)
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify(result))
          } catch (err: any) {
            console.error('[评论服务] 获取评论发生异常:', err.message)
            res.writeHead(500, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: err.message, code: 500 }))
          }
        })
        return

}

/**
 * 查询用户不喜欢规则。
 * @param context /api/music/dislike 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 音乐搜索、歌手专辑查询、自定义歌曲维护和不喜欢规则的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export async function getMusicDislike(context: RequestContext, runtime: DiscoveryServiceRuntime) {
  const { req, res } = context
  const { verifyUserAuth, getUserSpace, serializeDislikeRules, dislikeMatchOptions } = runtime

        const verified = verifyUserAuth(req)
        if (!verified) {
          res.writeHead(401, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ success: false, message: 'Unauthorized' }))
          return
        }
        void getUserSpace(verified).dislikeManage.getDislikeRules().then(rules => {
          const dm = getUserSpace(verified).dislikeManage
          const rulesString = dm.dislikeDataManage.getDislikeRulesString()
          const data: any = serializeDislikeRules(rulesString, verified)
          data.dislikeList = dm.dislikeDataManage.dislikeRules.dislikeList || []
          res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
          res.end(JSON.stringify({ success: true, data, options: dislikeMatchOptions() }))
        }).catch((err: any) => {
          res.writeHead(500, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ success: false, message: err.message }))
        })
        return

}

/**
 * 向用户不喜欢规则中添加歌曲或匹配条目。
 * @param context /api/music/dislike/add 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 音乐搜索、歌手专辑查询、自定义歌曲维护和不喜欢规则的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export async function postMusicDislikeAdd(context: RequestContext, runtime: DiscoveryServiceRuntime) {
  const { req, res, pathname } = context
  const { readBody, verifyUserAuth, getUserSpace, splitSingers, encodeAlbumRule, normalizeText, invalidateDislikeCache, serializeDislikeRules, dislikeMatchOptions } = runtime

        void readBody(req).then(async body => {
          const verified = verifyUserAuth(req)
          if (!verified) {
            res.writeHead(401, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ success: false, message: 'Unauthorized' }))
            return
          }
          try {
            const isAdd = pathname === '/api/music/dislike/add'
            const payload = JSON.parse(body || '{}')
            const type = String(payload.type || 'song')
            const name = String(payload.name || '')
            const singer = String(payload.singer || '')
            const source = String(payload.source || '')
            const id = String(payload.id || '')
            const albumId = String(payload.albumId || '')
            const pic = String(payload.pic || '')
            const interval = String(payload.interval || '')
            const meta = payload.meta || {}

            const dm = getUserSpace(verified).dislikeManage

            if (!isAdd && type === 'song' && payload.removeMatched === true) {
              if (!name) { res.writeHead(400); res.end(JSON.stringify({ success: false, message: 'Missing name' })); return }
              const { getUserDirname } = require('../../user')
              const libraryDir = runtime.path.join(global.lx.userPath, getUserDirname(verified), 'dislike', 'library')
              const readLibrary = (kind: string) => {
                const file = runtime.path.join(libraryDir, kind + '.json')
                if (!runtime.storageFs.existsSync(file)) return []
                const entries = JSON.parse(runtime.storageFs.readFileSync(file, 'utf8'))
                if (!Array.isArray(entries)) throw new Error('Invalid dislike library')
                return entries
              }
              const artists = readLibrary('artists'), albums = readLibrary('albums')
              const originalRules = dm.dislikeDataManage.getDislikeRulesString()
              const next = removeMatchedDislikes({ name, singer, source, albumName: String(payload.albumName || '') }, originalRules, artists, albums, dislikeMatchOptions())
              if (next.rules !== originalRules) await dm.dislikeDataManage.overwirteDislikeInfo(next.rules)
              if (next.artists.length !== artists.length) runtime.storageFs.writeFileSync(runtime.path.join(libraryDir, 'artists.json'), JSON.stringify(next.artists), 'utf8')
              if (next.albums.length !== albums.length) runtime.storageFs.writeFileSync(runtime.path.join(libraryDir, 'albums.json'), JSON.stringify(next.albums), 'utf8')
            }

            let removeKeys: Set<string> = new Set()
            if (type === 'album') {
              const albumName = String(payload.albumName || '')
              if (!albumName) {
                res.writeHead(400, { 'Content-Type': 'application/json' })
                res.end(JSON.stringify({ success: false, message: 'Missing albumName' }))
                return
              }
              const singers = splitSingers(singer)
              if (isAdd) await dm.dislikeDataManage.addDislikeAlbums(singers.map(s => ({ albumName, singer: s })))
              else for (const s of singers) {
                removeKeys.add(encodeAlbumRule(normalizeText(albumName), s))
                removeKeys.add(normalizeText(encodeAlbumRule(albumName, s)))
              }
            } else if (type === 'singer') {
              if (!singer) {
                res.writeHead(400, { 'Content-Type': 'application/json' })
                res.end(JSON.stringify({ success: false, message: 'Missing singer' }))
                return
              }
              if (isAdd) await dm.dislikeDataManage.addDislikeInfo([{ name: '', singer, dislikeRule: '' }])
              else removeKeys.add(`@${normalizeText(singer)}`)
            } else {
              if (!name) {
                res.writeHead(400, { 'Content-Type': 'application/json' })
                res.end(JSON.stringify({ success: false, message: 'Missing name' }))
                return
              }
              if (isAdd) {
                const { type, ...songData } = payload
                songData.dislikeRule = ''
                await dm.dislikeDataManage.addDislikeInfo([songData])
              } else if (payload.removeMatched !== true) {
                if (singer) {
                  removeKeys.add(`${name}@${singer}`.toLowerCase())
                  removeKeys.add(`${normalizeText(name)}@${normalizeText(singer)}`.toLowerCase())
                }
                removeKeys.add(name.toLowerCase())
                removeKeys.add(normalizeText(name).toLowerCase())
              }
            }

            const dislikeRatingThreshold = global.lx.config['subsonic.dislikeRating'] ?? 1
            if (global.lx.config['subsonic.linkDislikeToRating'] && dislikeRatingThreshold > 0 && id && source) {
              const subId = id.startsWith(`${source}_`) ? id : `${source}_${id}`
              try {
                const { syncDislikeToRating } = require('./subsonic/SubsonicService')
                await syncDislikeToRating(verified, subId, isAdd ? 1 : 0)
              } catch (e) {
                console.error('[黑名单 API] 评分回写失败:', e)
              }
            }

            if (!isAdd && removeKeys.size > 0) {
              const rulesString = dm.dislikeDataManage.getDislikeRulesString()
              const lines = rulesString.split('\n').filter((l: string) => l.trim())
              const remain = lines.filter((l: string) => {
                const trimmed = l.trim().toLowerCase()
                if (removeKeys.has(trimmed)) return false
                // Also check without spaces or with alias
                return true
              })
              if (remain.length !== lines.length) {
                await dm.dislikeDataManage.overwirteDislikeInfo(remain.join('\n'))
              }
            }

            await dm.createSnapshot()
            invalidateDislikeCache(verified)
            const rules = await dm.getDislikeRules()
            const finalRulesString = dm.dislikeDataManage.getDislikeRulesString()
            const data: any = serializeDislikeRules(finalRulesString, verified)
            data.dislikeList = dm.dislikeDataManage.dislikeRules.dislikeList || []
            res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
            res.end(JSON.stringify({ success: true, data, options: dislikeMatchOptions() }))
          } catch (err: any) {
            console.error('[黑名单 API] 处理异常:', err?.message)
            res.writeHead(500, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ success: false, message: err.message }))
          }
        })
        return

}
