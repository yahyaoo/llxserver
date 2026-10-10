import type { RequestContext, ServerRuntime } from '../../common/http/RequestContext'
/** 用户收藏及屏蔽的歌手和专辑所需的应用依赖契约。 @author yahyaoo */
export type LibraryServiceRuntime = Pick<ServerRuntime, 'getUserDirname' | 'path' | 'storageFs' | 'fetchArtistPicShared' | 'readBody' | 'fetchAlbumPicShared'>
/** 用户收藏及屏蔽的歌手和专辑服务。 @author yahyaoo */

/**
 * 读取用户收藏歌手列表。
 * @param context /api/user/library/artists 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 用户收藏及屏蔽的歌手和专辑的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export async function getUserLibraryArtists(context: RequestContext, runtime: LibraryServiceRuntime) {
  const { getLibUsername, req, res } = context
  const { getUserDirname, path, storageFs, fetchArtistPicShared } = runtime

        const username = getLibUsername!(req)
        if (!username) { res.writeHead(401); res.end('Unauthorized'); return }
        const userDirname = getUserDirname(username)
        const libDir = path.join(global.lx.userPath, userDirname, 'library')
        if (!storageFs.existsSync(libDir)) storageFs.mkdirSync(libDir, { recursive: true })
        const filePath = path.join(libDir, 'artists.json')
        try {
          if (!storageFs.existsSync(filePath)) {
            res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('[]'); return
          }
          let arr: any[] = JSON.parse(storageFs.readFileSync(filePath, 'utf-8'))
          if (!Array.isArray(arr)) arr = []
          // [修复] 对没有可用 picUrl 的歌手，实时从音源拉取头像并补全（带内存缓存，单条失败不影响整体）
          // [稳健] 进程级共享并发队列与 In-flight Promise 复用，避免多请求并发/重复击穿音源接口
          const needFetch = arr.filter((a: any) => a && a.id != null && a.source &&
            !(a.picUrl && /^https?:\/\//.test(String(a.picUrl))))
          let changed = false
          if (needFetch.length) {
            await Promise.all(needFetch.map(async (a: any) => {
              try {
                const pic = await fetchArtistPicShared(a.source, a.id)
                if (pic) { a.picUrl = pic; changed = true }
              } catch (e) { /* 忽略单个歌手的拉取失败 */ }
            }))
            // 将补全后的 picUrl 持久化回文件：每个歌手最多实时查一次，之后永久生效（重启也不再查询）
            if (changed) {
              try { storageFs.writeFileSync(filePath, JSON.stringify(arr, null, 2), 'utf-8') } catch { /* ignore */ }
            }
          }
          res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(arr))
        } catch (e: any) { res.writeHead(500); res.end(e.message) }
        return

}

/**
 * 保存用户收藏歌手列表。
 * @param context /api/user/library/artists 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 用户收藏及屏蔽的歌手和专辑的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export async function postUserLibraryArtists(context: RequestContext, runtime: LibraryServiceRuntime) {
  const { getLibUsername, req, res } = context
  const { readBody, getUserDirname, path, storageFs } = runtime

        const username = getLibUsername!(req)
        if (!username) { res.writeHead(401); res.end('Unauthorized'); return }
        void readBody(req).then(body => {
          try {
            const parsed = JSON.parse(body)
            if (!Array.isArray(parsed)) throw new Error('Expected an array')
            const userDirname = getUserDirname(username)
            const libDir = path.join(global.lx.userPath, userDirname, 'library')
            if (!storageFs.existsSync(libDir)) storageFs.mkdirSync(libDir, { recursive: true })
            const filePath = path.join(libDir, 'artists.json')
            // 反向同步：对比旧数据计算增量，回写 Subsonic 星标
            let oldArr: any[] = []
            try { if (storageFs.existsSync(filePath)) oldArr = JSON.parse(storageFs.readFileSync(filePath, 'utf8')) } catch { /* ignore */ }
            const keyOf = (x: any) => `${x.source}::${String(x.id)}`
            const oldKeys = new Set(oldArr.map(keyOf))
            const newKeys = new Set(parsed.map(keyOf))
            const added = parsed.filter((x: any) => !oldKeys.has(keyOf(x)))
            const removed = oldArr.filter((x: any) => !newKeys.has(keyOf(x)))
            storageFs.writeFileSync(filePath, JSON.stringify(parsed, null, 2), 'utf-8')

            // [Mutual Exclusivity] Remove newly liked artists from the dislike list
            const dislikeLibDir = path.join(global.lx.userPath, userDirname, 'dislike', 'library')
            const dislikeFilePath = path.join(dislikeLibDir, 'artists.json')
            if (added.length > 0 && storageFs.existsSync(dislikeFilePath)) {
              try {
                let dislikeArr: any[] = JSON.parse(storageFs.readFileSync(dislikeFilePath, 'utf8'))
                if (Array.isArray(dislikeArr)) {
                  const addedKeys = new Set(added.map(keyOf))
                  const newDislikeArr = dislikeArr.filter(x => !addedKeys.has(keyOf(x)))
                  if (newDislikeArr.length !== dislikeArr.length) {
                    storageFs.writeFileSync(dislikeFilePath, JSON.stringify(newDislikeArr, null, 2), 'utf-8')
                  }
                }
              } catch { /* ignore */ }
            }


            try {
              const { syncNativeLibraryToSubsonic } = require('./subsonic/SubsonicService')
              syncNativeLibraryToSubsonic(username, 'artists',
                added.map((a: any) => ({ id: String(a.id), source: a.source, name: a.name })),
                removed.map((a: any) => ({ id: String(a.id), source: a.source, name: a.name })))
            } catch (e: any) { console.error('[音乐库] 反向同步 Subsonic 星标失败:', e) }
            res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ success: true }))
          } catch (e: any) { res.writeHead(400); res.end(e.message) }
        })
        return

}

/**
 * 读取用户收藏专辑列表。
 * @param context /api/user/library/albums 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 用户收藏及屏蔽的歌手和专辑的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export async function getUserLibraryAlbums(context: RequestContext, runtime: LibraryServiceRuntime) {
  const { getLibUsername, req, res } = context
  const { getUserDirname, path, storageFs, fetchAlbumPicShared } = runtime

        const username = getLibUsername!(req)
        if (!username) { res.writeHead(401); res.end('Unauthorized'); return }
        const userDirname = getUserDirname(username)
        const libDir = path.join(global.lx.userPath, userDirname, 'library')
        if (!storageFs.existsSync(libDir)) storageFs.mkdirSync(libDir, { recursive: true })
        const filePath = path.join(libDir, 'albums.json')
        try {
          if (!storageFs.existsSync(filePath)) {
            res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('[]'); return
          }
          let arr: any[] = JSON.parse(storageFs.readFileSync(filePath, 'utf-8'))
          if (!Array.isArray(arr)) arr = []
          // [修复] 对没有可用 picUrl 的专辑，实时从音源拉取封面并补全（best-effort，带内存缓存，单条失败不影响整体）
          // [稳健] 进程级共享并发队列与 In-flight Promise 复用，避免多请求并发/重复击穿音源接口
          const needFetch = arr.filter((a: any) => a && a.id != null && a.source &&
            !(a.picUrl && /^https?:\/\//.test(String(a.picUrl))))
          let changed = false
          if (needFetch.length) {
            await Promise.all(needFetch.map(async (a: any) => {
              try {
                const pic = await fetchAlbumPicShared(a.source, a.id)
                if (pic) { a.picUrl = pic; changed = true }
              } catch (e) { /* 忽略单个专辑的拉取失败 */ }
            }))
            // 将补全后的 picUrl 持久化回文件：每个专辑最多实时查一次，之后永久生效（重启也不再查询）
            if (changed) {
              try { storageFs.writeFileSync(filePath, JSON.stringify(arr, null, 2), 'utf-8') } catch { /* ignore */ }
            }
          }
          res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(arr))
        } catch (e: any) { res.writeHead(500); res.end(e.message) }
        return

}

/**
 * 保存用户收藏专辑列表。
 * @param context /api/user/library/albums 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 用户收藏及屏蔽的歌手和专辑的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export async function postUserLibraryAlbums(context: RequestContext, runtime: LibraryServiceRuntime) {
  const { getLibUsername, req, res } = context
  const { readBody, getUserDirname, path, storageFs } = runtime

        const username = getLibUsername!(req)
        if (!username) { res.writeHead(401); res.end('Unauthorized'); return }
        void readBody(req).then(body => {
          try {
            const parsed = JSON.parse(body)
            if (!Array.isArray(parsed)) throw new Error('Expected an array')
            const userDirname = getUserDirname(username)
            const libDir = path.join(global.lx.userPath, userDirname, 'library')
            if (!storageFs.existsSync(libDir)) storageFs.mkdirSync(libDir, { recursive: true })
            const filePath = path.join(libDir, 'albums.json')
            // 反向同步：对比旧数据计算增量，回写 Subsonic 星标
            let oldArr: any[] = []
            try { if (storageFs.existsSync(filePath)) oldArr = JSON.parse(storageFs.readFileSync(filePath, 'utf8')) } catch { /* ignore */ }
            const keyOf = (x: any) => `${x.source}::${String(x.id)}`
            const oldKeys = new Set(oldArr.map(keyOf))
            const newKeys = new Set(parsed.map(keyOf))
            const added = parsed.filter((x: any) => !oldKeys.has(keyOf(x)))
            const removed = oldArr.filter((x: any) => !newKeys.has(keyOf(x)))
            storageFs.writeFileSync(filePath, JSON.stringify(parsed, null, 2), 'utf-8')

            // [Mutual Exclusivity] Remove newly liked albums from the dislike list
            const dislikeLibDir = path.join(global.lx.userPath, userDirname, 'dislike', 'library')
            const dislikeFilePath = path.join(dislikeLibDir, 'albums.json')
            if (added.length > 0 && storageFs.existsSync(dislikeFilePath)) {
              try {
                let dislikeArr: any[] = JSON.parse(storageFs.readFileSync(dislikeFilePath, 'utf8'))
                if (Array.isArray(dislikeArr)) {
                  const addedKeys = new Set(added.map(keyOf))
                  const newDislikeArr = dislikeArr.filter(x => !addedKeys.has(keyOf(x)))
                  if (newDislikeArr.length !== dislikeArr.length) {
                    storageFs.writeFileSync(dislikeFilePath, JSON.stringify(newDislikeArr, null, 2), 'utf-8')
                  }
                }
              } catch { /* ignore */ }
            }

            try {
              const { syncNativeLibraryToSubsonic } = require('./subsonic/SubsonicService')
              syncNativeLibraryToSubsonic(username, 'albums',
                added.map((a: any) => ({ id: String(a.id), source: a.source, name: a.name })),
                removed.map((a: any) => ({ id: String(a.id), source: a.source, name: a.name })))
            } catch (e: any) { console.error('[音乐库] 反向同步 Subsonic 星标失败:', e) }
            res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ success: true }))
          } catch (e: any) { res.writeHead(400); res.end(e.message) }
        })
        return

}

/**
 * 读取用户屏蔽歌手列表。
 * @param context /api/user/dislike/library/artists 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 用户收藏及屏蔽的歌手和专辑的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export async function getUserDislikeLibraryArtists(context: RequestContext, runtime: LibraryServiceRuntime) {
  const { getLibUsername, req, res } = context
  const { getUserDirname, path, storageFs } = runtime

        const username = getLibUsername!(req)
        if (!username) { res.writeHead(401); res.end('Unauthorized'); return }
        const userDirname = getUserDirname(username)
        const libDir = path.join(global.lx.userPath, userDirname, 'dislike', 'library')
        if (!storageFs.existsSync(libDir)) storageFs.mkdirSync(libDir, { recursive: true })
        const filePath = path.join(libDir, 'artists.json')
        try {
          if (!storageFs.existsSync(filePath)) {
            res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('[]'); return
          }
          let arr: any[] = JSON.parse(storageFs.readFileSync(filePath, 'utf-8'))
          if (!Array.isArray(arr)) arr = []
          res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(arr))
        } catch (e: any) { res.writeHead(500); res.end(e.message) }
        return

}

/**
 * 保存用户屏蔽歌手列表。
 * @param context /api/user/dislike/library/artists 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 用户收藏及屏蔽的歌手和专辑的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export async function postUserDislikeLibraryArtists(context: RequestContext, runtime: LibraryServiceRuntime) {
  const { getLibUsername, req, res } = context
  const { readBody, getUserDirname, path, storageFs } = runtime

        const username = getLibUsername!(req)
        if (!username) { res.writeHead(401); res.end('Unauthorized'); return }
        void readBody(req).then(async (body) => {
          try {
            const parsed = JSON.parse(body)
            if (!Array.isArray(parsed)) throw new Error('Expected an array')
            const userDirname = getUserDirname(username)
            const libDir = path.join(global.lx.userPath, userDirname, 'dislike', 'library')
            if (!storageFs.existsSync(libDir)) storageFs.mkdirSync(libDir, { recursive: true })
            const filePath = path.join(libDir, 'artists.json')

            // Add dislikeRule if missing
            parsed.forEach((x: any) => {
              if (!x.dislikeRule) x.dislikeRule = `@${String(x.name)}`
            })

            let oldArr: any[] = []
            try { if (storageFs.existsSync(filePath)) oldArr = JSON.parse(storageFs.readFileSync(filePath, 'utf8')) } catch { /* ignore */ }
            const keyOf = (x: any) => `${x.source}::${String(x.id)}`
            const oldKeys = new Set(oldArr.map(keyOf))
            const newKeys = new Set(parsed.map(keyOf))
            const added = parsed.filter((x: any) => !oldKeys.has(keyOf(x)))
            const removed = oldArr.filter((x: any) => !newKeys.has(keyOf(x)))

            storageFs.writeFileSync(filePath, JSON.stringify(parsed, null, 2), 'utf-8')

            // [Mutual Exclusivity] Remove newly disliked artists from the liked list
            const likeLibDir = path.join(global.lx.userPath, userDirname, 'library')
            const likeFilePath = path.join(likeLibDir, 'artists.json')
            if (added.length > 0 && storageFs.existsSync(likeFilePath)) {
              try {
                let likeArr: any[] = JSON.parse(storageFs.readFileSync(likeFilePath, 'utf8'))
                if (Array.isArray(likeArr)) {
                  const addedKeys = new Set(added.map(keyOf))
                  const newLikeArr = likeArr.filter(x => !addedKeys.has(keyOf(x)))
                  if (newLikeArr.length !== likeArr.length) {
                    storageFs.writeFileSync(likeFilePath, JSON.stringify(newLikeArr, null, 2), 'utf-8')
                  }
                }
              } catch { /* ignore */ }
            }

            const { invalidateDislikeCache } = require('./discovery/dislikeCache')
            invalidateDislikeCache(username)

            res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ success: true }))
          } catch (e: any) { res.writeHead(400); res.end(e.message) }
        })
        return

}

/**
 * 读取用户屏蔽专辑列表。
 * @param context /api/user/dislike/library/albums 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 用户收藏及屏蔽的歌手和专辑的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export async function getUserDislikeLibraryAlbums(context: RequestContext, runtime: LibraryServiceRuntime) {
  const { getLibUsername, req, res } = context
  const { getUserDirname, path, storageFs } = runtime

        const username = getLibUsername!(req)
        if (!username) { res.writeHead(401); res.end('Unauthorized'); return }
        const userDirname = getUserDirname(username)
        const libDir = path.join(global.lx.userPath, userDirname, 'dislike', 'library')
        if (!storageFs.existsSync(libDir)) storageFs.mkdirSync(libDir, { recursive: true })
        const filePath = path.join(libDir, 'albums.json')
        try {
          if (!storageFs.existsSync(filePath)) {
            res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('[]'); return
          }
          let arr: any[] = JSON.parse(storageFs.readFileSync(filePath, 'utf-8'))
          if (!Array.isArray(arr)) arr = []
          res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(arr))
        } catch (e: any) { res.writeHead(500); res.end(e.message) }
        return

}

/**
 * 保存用户屏蔽专辑列表。
 * @param context /api/user/dislike/library/albums 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 用户收藏及屏蔽的歌手和专辑的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export async function postUserDislikeLibraryAlbums(context: RequestContext, runtime: LibraryServiceRuntime) {
  const { getLibUsername, req, res } = context
  const { readBody, getUserDirname, path, storageFs } = runtime

        const username = getLibUsername!(req)
        if (!username) { res.writeHead(401); res.end('Unauthorized'); return }
        void readBody(req).then(async (body) => {
          try {
            const parsed = JSON.parse(body)
            if (!Array.isArray(parsed)) throw new Error('Expected an array')
            const userDirname = getUserDirname(username)
            const libDir = path.join(global.lx.userPath, userDirname, 'dislike', 'library')
            if (!storageFs.existsSync(libDir)) storageFs.mkdirSync(libDir, { recursive: true })
            const filePath = path.join(libDir, 'albums.json')

            // Add dislikeRule if missing
            parsed.forEach((x: any) => {
              if (!x.dislikeRule) x.dislikeRule = `!${String(x.name)}@${String(x.artistName || '')}`
            })

            let oldArr: any[] = []
            try { if (storageFs.existsSync(filePath)) oldArr = JSON.parse(storageFs.readFileSync(filePath, 'utf8')) } catch { /* ignore */ }
            const keyOf = (x: any) => `${x.source}::${String(x.id)}`
            const oldKeys = new Set(oldArr.map(keyOf))
            const newKeys = new Set(parsed.map(keyOf))
            const added = parsed.filter((x: any) => !oldKeys.has(keyOf(x)))
            const removed = oldArr.filter((x: any) => !newKeys.has(keyOf(x)))

            storageFs.writeFileSync(filePath, JSON.stringify(parsed, null, 2), 'utf-8')

            // [Mutual Exclusivity] Remove newly disliked albums from the liked list
            const likeLibDir = path.join(global.lx.userPath, userDirname, 'library')
            const likeFilePath = path.join(likeLibDir, 'albums.json')
            if (added.length > 0 && storageFs.existsSync(likeFilePath)) {
              try {
                let likeArr: any[] = JSON.parse(storageFs.readFileSync(likeFilePath, 'utf8'))
                if (Array.isArray(likeArr)) {
                  const addedKeys = new Set(added.map(keyOf))
                  const newLikeArr = likeArr.filter(x => !addedKeys.has(keyOf(x)))
                  if (newLikeArr.length !== likeArr.length) {
                    storageFs.writeFileSync(likeFilePath, JSON.stringify(newLikeArr, null, 2), 'utf-8')
                  }
                }
              } catch { /* ignore */ }
            }

            const { invalidateDislikeCache } = require('./discovery/dislikeCache')
            invalidateDislikeCache(username)

            res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ success: true }))
          } catch (e: any) { res.writeHead(400); res.end(e.message) }
        })
        return

}
