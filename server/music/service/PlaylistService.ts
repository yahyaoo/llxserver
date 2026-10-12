import type { RequestContext, ServerRuntime } from '../../common/http/RequestContext'
import { getLibraryItems } from './download/ServerDownloadService'
import { validatePlaylistCover } from './playlist/cover'
import { aggregateLibrary } from './library/LibraryAggregationService'
/** 用户歌单、历史快照、缓存列表和平台歌单查询所需的应用依赖契约。 @author yahyaoo */
export type PlaylistServiceRuntime = Pick<ServerRuntime, 'verifyUserAuth' | 'getUserSpace' | 'getUserDirname' | 'path' | 'storageFs' | 'readBody' | 'getUserConfig' | 'startupLog' | 'fileCache' | 'customMusicManager' | 'musicSdk' | 'normalizeSongInfo'>
/** 用户歌单、历史快照、缓存列表和平台歌单查询服务。 @author yahyaoo */

/**
 * 查询指定用户的歌单与歌曲数据。
 * @param context /api/data 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 用户歌单、历史快照、缓存列表和平台歌单查询的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export async function getData(context: RequestContext, runtime: PlaylistServiceRuntime) {
  const { req, urlObj, res } = context
  const { verifyUserAuth, getUserSpace, getUserDirname, path, storageFs } = runtime

        const auth = req.headers['x-frontend-auth']
        const isAdminAuth = auth === global.lx.config['frontend.password']
        const userParam = urlObj.searchParams.get('user')

        if (!userParam) {
          res.writeHead(400)
          res.end('Missing user param')
          return
        }

        // 鉴权逻辑：管理员 或 公共用户 或 具名用户(需 Token)
        let verifiedUser: string | null = null
        if (isAdminAuth) {
          verifiedUser = userParam // 管理员信任 userParam
        } else if (userParam === 'default' || userParam === '_open') {
          verifiedUser = '_open'
        } else {
          verifiedUser = verifyUserAuth(req)
          if (!verifiedUser || verifiedUser !== userParam) {
            res.writeHead(403)
            res.end('Forbidden: User mismatch or unauthorized')
            return
          }
        }

        const userSpace = getUserSpace(verifiedUser)
        void userSpace.listManage.getListData().then(async data => {
          let albums = []
          let artists = []
          let dislikeAlbums = []
          let dislikeArtists = []
          try {
            const userDirname = getUserDirname(verifiedUser)
            const libraryPath = path.join(global.lx.userPath, userDirname, 'library')
            const albumsPath = path.join(libraryPath, 'albums.json')
            const artistsPath = path.join(libraryPath, 'artists.json')

            const dislikeLibraryPath = path.join(global.lx.userPath, userDirname, 'dislike', 'library')
            const dislikeAlbumsPath = path.join(dislikeLibraryPath, 'albums.json')
            const dislikeArtistsPath = path.join(dislikeLibraryPath, 'artists.json')

            if (await storageFs.promises.stat(albumsPath).then(() => true).catch(() => false)) albums = JSON.parse(await storageFs.promises.readFile(albumsPath, 'utf8'))
            if (await storageFs.promises.stat(artistsPath).then(() => true).catch(() => false)) artists = JSON.parse(await storageFs.promises.readFile(artistsPath, 'utf8'))
            if (await storageFs.promises.stat(dislikeAlbumsPath).then(() => true).catch(() => false)) dislikeAlbums = JSON.parse(await storageFs.promises.readFile(dislikeAlbumsPath, 'utf8'))
            if (await storageFs.promises.stat(dislikeArtistsPath).then(() => true).catch(() => false)) dislikeArtists = JSON.parse(await storageFs.promises.readFile(dislikeArtistsPath, 'utf8'))
          } catch (err) {
            console.error(err)
          }

          res.writeHead(200, {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache, no-store, must-revalidate'
          })
          res.end(JSON.stringify({ ...data, albums, artists, dislikeAlbums, dislikeArtists }))
        }).catch(err => {
          res.writeHead(500)
          res.end(err.message)
        })
        return

}

/**
 * 查询用户歌单历史快照列表。
 * @param context /api/data/snapshots 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 用户歌单、历史快照、缓存列表和平台歌单查询的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export async function getDataSnapshots(context: RequestContext, runtime: PlaylistServiceRuntime) {
  const { req, urlObj, res } = context
  const { verifyUserAuth, getUserSpace } = runtime

        const auth = req.headers['x-frontend-auth']
        const isAdminAuth = auth === global.lx.config['frontend.password']
        const userParam = urlObj.searchParams.get('user')

        if (!userParam) {
          res.writeHead(400)
          res.end('Missing user param')
          return
        }

        // 鉴权逻辑
        let verifiedUser: string | null = null
        if (isAdminAuth) {
          verifiedUser = userParam
        } else if (userParam === 'default' || userParam === '_open') {
          verifiedUser = '_open'
        } else {
          verifiedUser = verifyUserAuth(req)
          if (!verifiedUser || verifiedUser !== userParam) {
            res.writeHead(403)
            res.end('Forbidden')
            return
          }
        }

        const userSpace = getUserSpace(verifiedUser)
        try {
          const list = await userSpace.listManage.getSnapshotList()
          res.writeHead(200, {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache, no-store, must-revalidate'
          })
          res.end(JSON.stringify(list))
        } catch (err: any) {
          res.writeHead(500)
          res.end(err.message)
        }
        return

}

/**
 * 读取指定用户与快照标识对应的歌单数据。
 * @param context /api/data/snapshot 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 用户歌单、历史快照、缓存列表和平台歌单查询的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export async function getDataSnapshot(context: RequestContext, runtime: PlaylistServiceRuntime) {
  const { req, urlObj, res } = context
  const { verifyUserAuth, getUserSpace } = runtime

        const auth = req.headers['x-frontend-auth']
        const isAdminAuth = auth === global.lx.config['frontend.password']
        const userParam = urlObj.searchParams.get('user')

        if (!userParam) {
          res.writeHead(400)
          res.end('Missing user param')
          return
        }

        let verifiedUser: string | null = null
        if (isAdminAuth) {
          verifiedUser = userParam
        } else if (userParam === 'default' || userParam === '_open') {
          verifiedUser = '_open'
        } else {
          verifiedUser = verifyUserAuth(req)
          if (!verifiedUser || verifiedUser !== userParam) {
            res.writeHead(403)
            res.end('Forbidden')
            return
          }
        }

        const userSpace = getUserSpace(verifiedUser)
        const id = urlObj.searchParams.get('id')
        if (!id) {
          res.writeHead(400)
          res.end('Missing id')
          return
        }
        try {
          const data = await userSpace.listManage.getSnapshot(id)
          if (!data) {
            res.writeHead(404)
            res.end('Not Found')
            return
          }
          res.writeHead(200, {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache, no-store, must-revalidate'
          })
          res.end(JSON.stringify(data))
        } catch (err: any) {
          res.writeHead(500)
          res.end(err.message)
        }
        return

}

/**
 * 使用选定快照恢复用户歌单数据。
 * @param context /api/data/restore-snapshot 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 用户歌单、历史快照、缓存列表和平台歌单查询的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export async function postDataRestoreSnapshot(context: RequestContext, runtime: PlaylistServiceRuntime) {
  const { req, urlObj, res } = context
  const { verifyUserAuth, getUserSpace, readBody } = runtime

        const auth = req.headers['x-frontend-auth']
        const isAdminAuth = auth === global.lx.config['frontend.password']
        const userParam = urlObj.searchParams.get('user')

        if (!userParam) {
          res.writeHead(400)
          res.end('Missing user param')
          return
        }

        let verifiedUser: string | null = null
        if (isAdminAuth) {
          verifiedUser = userParam
        } else if (userParam === 'default' || userParam === '_open') {
          verifiedUser = '_open'
        } else {
          verifiedUser = verifyUserAuth(req)
          if (!verifiedUser || verifiedUser !== userParam) {
            res.writeHead(403)
            res.end('Forbidden')
            return
          }
        }

        const userSpace = getUserSpace(verifiedUser)
        try {
          const body = await readBody(req)
          const { id } = JSON.parse(body)
          if (!id) throw new Error('Missing id')

          await userSpace.listManage.restoreSnapshot(id)

          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ success: true }))
        } catch (err: any) {
          res.writeHead(500)
          res.end(err.message)
        }
        return

}

/**
 * 删除用户的指定歌单。
 * @param context /api/music/user/list/remove 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 用户歌单、历史快照、缓存列表和平台歌单查询的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export async function postMusicUserListRemove(context: RequestContext, runtime: PlaylistServiceRuntime) {
  const { req, res } = context
  const { verifyUserAuth, readBody, getUserSpace } = runtime

        const username = verifyUserAuth(req)
        if (!username) {
          res.writeHead(401, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ success: false, message: '需要用户认证' }))
          return
        }

        void readBody(req).then(async body => {
          try {
            const { listId, songIds } = JSON.parse(body)

            if (!listId || !Array.isArray(songIds)) {
              res.writeHead(400)
              res.end('参数错误:需要listId和songIds数组')
              return
            }

            console.log(`[用户接口] 批量删除请求: 用户=${username}, 列表=${listId}, 删除歌曲数=${songIds.length}`)
            console.log(`[用户接口] 待删除歌曲ID:`, songIds)

            const userSpace = getUserSpace(username)

            // Get list before deletion
            const listBefore = await userSpace.listManage.listDataManage.getListMusics(listId)
            console.log(`[用户接口] 删除前列表歌曲数: ${listBefore.length}`)

            // Remove songs from the list
            const affectedLists = await userSpace.listManage.listDataManage.listMusicRemove(listId, songIds)
            console.log(`[用户接口] 受影响的列表:`, affectedLists)

            // Get list after deletion
            const listAfter = await userSpace.listManage.listDataManage.getListMusics(listId)
            console.log(`[用户接口] 删除后列表歌曲数: ${listAfter.length}`)

            // Create new snapshot to persist changes
            const newSnapshotKey = await userSpace.listManage.createSnapshot()
            console.log(`[用户接口] 批量删除成功,已创建新快照: ${newSnapshotKey}`)

            res.writeHead(200)
            res.end('删除成功')
          } catch (err: any) {
            console.error('[用户接口] 批量删除失败:', err)
            res.writeHead(500)
            res.end(err.message || '删除失败')
          }
        })
        return

}

/**
 * 调整用户歌单排列顺序。
 * @param context /api/music/user/list/reorder 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 用户歌单、历史快照、缓存列表和平台歌单查询的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export async function postMusicUserListReorder(context: RequestContext, runtime: PlaylistServiceRuntime) {
  const { req, res } = context
  const { verifyUserAuth, readBody, getUserSpace } = runtime

        const username = verifyUserAuth(req)
        if (!username) {
          res.writeHead(401, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ success: false, message: '需要用户认证' }))
          return
        }

        void readBody(req).then(async body => {
          try {
            const { listId, orderedSongIds } = JSON.parse(body)

            if (!listId || !Array.isArray(orderedSongIds)) {
              res.writeHead(400)
              res.end('参数错误:需要listId和orderedSongIds数组')
              return
            }

            console.log(`[用户接口] 歌单重排请求: 用户=${username}, 列表=${listId}, 歌曲数=${orderedSongIds.length}`)

            const userSpace = getUserSpace(username)

            // Get current full song objects
            const currentList = await userSpace.listManage.listDataManage.getListMusics(listId)

            // Build ordered list from IDs, preserving song objects
            const songMap = new Map<string, LX.Music.MusicInfo>()
            for (const song of currentList) songMap.set(song.id, song)

            const reorderedList = orderedSongIds
              .map((id: string) => songMap.get(id))
              .filter(Boolean) as LX.Music.MusicInfo[]

            // Append any songs not in orderedSongIds (safety net)
            const orderedSet = new Set<string>(orderedSongIds)
            for (const song of currentList) {
              if (!orderedSet.has(song.id)) reorderedList.push(song)
            }

            await userSpace.listManage.listDataManage.listMusicOverwrite(listId, reorderedList)

            // Create new snapshot to persist changes
            const newSnapshotKey = await userSpace.listManage.createSnapshot()
            console.log(`[用户接口] 歌单重排成功,已创建新快照: ${newSnapshotKey}`)

            res.writeHead(200)
            res.end('重排成功')
          } catch (err: any) {
            console.error('[用户接口] 歌单重排失败:', err)
            res.writeHead(500)
            res.end(err.message || '重排失败')
          }
        })
        return

}

/**
 * 向用户歌单添加歌曲。
 * @param context /api/music/user/list/add 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 用户歌单、历史快照、缓存列表和平台歌单查询的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export async function postMusicUserListAdd(context: RequestContext, runtime: PlaylistServiceRuntime) {
  const { req, res } = context
  const { verifyUserAuth, readBody, getUserSpace, getUserConfig } = runtime

        const username = verifyUserAuth(req)
        if (!username) {
          res.writeHead(401, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ success: false, message: '需要用户认证' }))
          return
        }

        void readBody(req).then(async body => {
          try {
            const { listId, musicInfos, location } = JSON.parse(body)

            if (listId === 'love') {
              res.writeHead(400)
              res.end('我的喜爱不是歌单，请使用喜欢接口')
              return
            }

            if (!listId || !Array.isArray(musicInfos)) {
              res.writeHead(400)
              res.end('参数错误:需要listId和musicInfos数组')
              return
            }

            console.log(`[用户接口] 批量添加请求: 用户=${username}, 列表=${listId}, 添加歌曲数=${musicInfos.length}`)

            const userSpace = getUserSpace(username)

            // Add songs to the list
            const addMusicLocationType = location === 'top' || location === 'bottom'
              ? location
              : getUserConfig(username)['list.addMusicLocationType']
            await userSpace.listManage.listDataManage.listMusicAdd(listId, musicInfos, addMusicLocationType)

            // Create new snapshot to persist changes
            const newSnapshotKey = await userSpace.listManage.createSnapshot()
            console.log(`[用户接口] 批量添加成功,已创建新快照: ${newSnapshotKey}`)

            res.writeHead(200)
            res.end('添加成功')
          } catch (err: any) {
            console.error('[用户接口] 批量添加失败:', err)
            res.writeHead(500)
            res.end(err.message || '添加失败')
          }
        })
        return

}

/**
 * 删除用户指定的历史快照。
 * @param context /api/data/delete-snapshot 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 用户歌单、历史快照、缓存列表和平台歌单查询的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export async function postDataDeleteSnapshot(context: RequestContext, runtime: PlaylistServiceRuntime) {
  const { req, urlObj, res } = context
  const { verifyUserAuth, getUserSpace, readBody } = runtime

        const auth = req.headers['x-frontend-auth']
        const isAdminAuth = auth === global.lx.config['frontend.password']
        const userParam = urlObj.searchParams.get('user')

        if (!userParam) {
          res.writeHead(400)
          res.end('Missing user param')
          return
        }

        let verifiedUser: string | null = null
        if (isAdminAuth) {
          verifiedUser = userParam
        } else if (userParam === 'default' || userParam === '_open') {
          verifiedUser = '_open'
        } else {
          verifiedUser = verifyUserAuth(req)
          if (!verifiedUser || verifiedUser !== userParam) {
            res.writeHead(403)
            res.end('Forbidden')
            return
          }
        }

        const userSpace = getUserSpace(verifiedUser)
        try {
          const body = await readBody(req)
          const { id } = JSON.parse(body)
          if (!id) throw new Error('Missing id')

          // 调用刚刚在 ListManage 中添加的方法
          await userSpace.listManage.removeSnapshot(id)

          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ success: true }))
        } catch (err: any) {
          res.writeHead(500)
          res.end(err.message)
        }
        return

}

/**
 * 上传歌单快照并保存到用户空间。
 * @param context /api/data/upload-snapshot 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 用户歌单、历史快照、缓存列表和平台歌单查询的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export async function postDataUploadSnapshot(context: RequestContext, runtime: PlaylistServiceRuntime) {
  const { req, urlObj, res } = context
  const { verifyUserAuth, getUserSpace, readBody, startupLog } = runtime

        const auth = req.headers['x-frontend-auth']
        const isAdminAuth = auth === global.lx.config['frontend.password']
        const userParam = urlObj.searchParams.get('user')
        const time = parseInt(urlObj.searchParams.get('time') || '0')
        const filename = urlObj.searchParams.get('filename')

        if (!userParam) {
          res.writeHead(400)
          res.end('Missing user param')
          return
        }

        let verifiedUser: string | null = null
        if (isAdminAuth) {
          verifiedUser = userParam
        } else if (userParam === 'default' || userParam === '_open') {
          verifiedUser = '_open'
        } else {
          verifiedUser = verifyUserAuth(req)
          if (!verifiedUser || verifiedUser !== userParam) {
            res.writeHead(403)
            res.end('Forbidden')
            return
          }
        }

        if (!filename) {
          res.writeHead(400)
          res.end('Missing filename param')
          return
        }

        const userSpace = getUserSpace(verifiedUser)

        try {
          const body = await readBody(req)
          let finalData = body

          // [核心兼容性修复] 检测是否为落雪音乐离线备份格式 (playList_v2)
          try {
            const jsonData = JSON.parse(body)
            if (jsonData && jsonData.type === 'playList_v2' && Array.isArray(jsonData.data)) {
              startupLog.info(`[Snapshot] Detected LX Music backup format for user ${verifiedUser}, converting back to internal format...`)

              // 寻找默认列表
              const defaultList = jsonData.data.find((l: any) => l.id === 'default')?.list || []
              // 寻找收藏列表
              const loveList = jsonData.data.find((l: any) => l.id === 'love')?.list || []
              // 其他所有列表均作为用户列表
              const userList = jsonData.data.filter((l: any) => l.id !== 'default' && l.id !== 'love')

              // 拼装为服务器内部快照格式
              const internalFormat = {
                defaultList,
                loveList,
                userList
              }

              // 压缩为单行 JSON 以节省磁盘空间并保持与原生快照一致的大小
              finalData = JSON.stringify(internalFormat)
              startupLog.info(`[Snapshot] Conversion complete for user ${verifiedUser}.`)
            }
          } catch (parseErr) {
            // 解析失败说明不是标准的 JSON 格式或已经是原始快照，保持原样即可
          }

          // 处理文件名：如果以 snapshot_ 开头，则去掉（因为 saveSnapshotWithTime 会自动加）
          // 如果不以 snapshot_ 开头，则保持原样（saveSnapshotWithTime 会自动加 snapshot_ 前缀）
          let name = filename
          if (name.startsWith('snapshot_')) {
            name = name.substring(9)
          }

          // 调用 ListManage 中的 saveSnapshotWithTime 方法
          await userSpace.listManage.saveSnapshotWithTime(name, finalData, time)

          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ success: true }))
        } catch (err: any) {
          res.writeHead(500)
          res.end(err.message)
        }
        return

}

/**
 * 查询用户列表设置。
 * @param context /api/user/list 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 用户歌单、历史快照、缓存列表和平台歌单查询的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export async function getUserList(context: RequestContext, runtime: PlaylistServiceRuntime) {
  const { urlObj, req, res } = context
  const { verifyUserAuth, getUserSpace } = runtime

        const targetUserParam = urlObj.searchParams.get('user')
        const reqUsername = (req.headers['x-user-name'] as string) || targetUserParam || ''
        const auth = req.headers['x-frontend-auth']
        const isAdmin = !!(auth && auth === global.lx.config['frontend.password'])
        let username: string | null = null

        const canAccessOpen = global.lx.config['user.enablePublicFavorites'] && (
          global.lx.config['user.enablePublicNonAdminAccess'] || isAdmin || !!verifyUserAuth(req)
        )
        if (targetUserParam === '_open' || reqUsername === '_open' || (!reqUsername && !verifyUserAuth(req))) {
          if (canAccessOpen) {
            username = '_open'
          }
        }
        if (!username) {
          username = verifyUserAuth(req)
        }
        if (!username && reqUsername && reqUsername !== '_open') {
          username = reqUsername
        }


        if (!username) {
          res.writeHead(401, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ success: false, message: 'Unauthorized' }))
          return
        }

        const userSpace = getUserSpace(username)
        void userSpace.listManage.getListData().then(data => {
          res.writeHead(200, {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache, no-store, must-revalidate'
          })
          res.end(JSON.stringify(data))
        }).catch(err => {
          res.writeHead(500)
          res.end(err.message)
        })
        return

}

/**
 * 保存用户列表设置。
 * @param context /api/user/list 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 用户歌单、历史快照、缓存列表和平台歌单查询的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export async function postUserList(context: RequestContext, runtime: PlaylistServiceRuntime) {
  const { urlObj, req, res } = context
  const { verifyUserAuth, readBody, getUserSpace } = runtime

        const targetUserParam = urlObj.searchParams.get('user')
        const reqUsername = (req.headers['x-user-name'] as string) || targetUserParam || ''
        const auth = req.headers['x-frontend-auth']
        const isAdmin = !!(auth && auth === global.lx.config['frontend.password'])
        let username: string | null = null

        const canAccessOpen = global.lx.config['user.enablePublicFavorites'] && (
          global.lx.config['user.enablePublicNonAdminAccess'] || isAdmin || !!verifyUserAuth(req)
        )
        if (targetUserParam === '_open' || reqUsername === '_open' || (!reqUsername && !verifyUserAuth(req))) {
          if (!canAccessOpen) {
            res.writeHead(403, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ success: false, error: '权限不足：未开启公开访问。' }))
            return
          }
          if (auth !== global.lx.config['frontend.password']) {
            res.writeHead(403, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ success: false, error: '权限不足：公共歌单修改受限，请先验证管理员身份。' }))
            return
          }
          username = '_open'
        }
        if (!username) {
          username = verifyUserAuth(req)
        }
        if (!username && reqUsername && reqUsername !== '_open') {
          username = reqUsername
        }


        if (!username) {
          res.writeHead(401, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ success: false, message: 'Unauthorized' }))
          return
        }

        void readBody(req).then(async body => {
          try {
            const listData = JSON.parse(body)
            if (Array.isArray(listData?.userList) && listData.userList.some((list: any) => list && !validatePlaylistCover(list.cover))) {
              res.writeHead(400, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ success: false, error: '封面无效，仅支持不超过 5MB 的 JPG、PNG、WEBP 图片' }))
              return
            }
            if (!Array.isArray(listData?.defaultList) || !Array.isArray(listData?.userList) || listData.userList.some((list: any) => !list || ['love', 'default', 'temp'].includes(list.id) || !Array.isArray(list.list))) {
              res.writeHead(400, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ success: false, error: '普通歌单数据无效，不能包含喜爱保留标识' }))
              return
            }
            const userSpace = getUserSpace(username!)
            // Restore ensures consistency with the provided snapshot
            await userSpace.listManage.listDataManage.restore(listData, true)
            // Create a snapshot after update
            await userSpace.listManage.createSnapshot()

            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ success: true }))
          } catch (err: any) {
            res.writeHead(500)
            res.end(err.message)
          }
        })
        return

}

/**
 * 查询用户服务器缓存歌曲列表。
 * @param context /api/music/cache/list 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 用户歌单、历史快照、缓存列表和平台歌单查询的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export async function getMusicCacheList(context: RequestContext, runtime: PlaylistServiceRuntime) {
  const { urlObj, req, res } = context
  const { verifyUserAuth, fileCache } = runtime

        const targetUserParam = urlObj.searchParams.get('user')
        const reqUsername = targetUserParam || (req.headers['x-user-name'] as string) || verifyUserAuth(req) || ''
        const auth = req.headers['x-frontend-auth']
        const isAdmin = !!(auth && auth === global.lx.config['frontend.password'])
        const isPublic = !reqUsername || reqUsername === 'default' || reqUsername === '_open' || targetUserParam === '_open'
        let username = '_open'

        if (isPublic) {
          const enablePublicNonAdminLocalMusic = !!global.lx.config['user.enablePublicNonAdminLocalMusic']
          const verified = verifyUserAuth(req)
          if (!enablePublicNonAdminLocalMusic && !isAdmin && !verified) {
            res.writeHead(403, {
              'Content-Type': 'application/json',
              'Cache-Control': 'no-cache, no-store, must-revalidate',
            })
            res.end(JSON.stringify({ success: false, message: '您没有权限查看此目录，请联系管理员设置' }))
            return
          }
          username = '_open'
        } else {
          const verified = verifyUserAuth(req)
          if (!verified) {
            res.writeHead(401, {
              'Content-Type': 'application/json',
              'Cache-Control': 'no-cache, no-store, must-revalidate',
            })
            res.end(JSON.stringify({ success: false, message: 'Unauthorized' }))
            return
          }
          username = verified
        }
        void Promise.all([fileCache.getCacheList(username), username === '_open' ? Promise.resolve([]) : runtime.customMusicManager.getCustomMusicList(username)]).then(([cached, custom]) => {
          const list = aggregateLibrary(username, [...cached, ...custom, ...getLibraryItems(username)])
          res.writeHead(200, {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache, no-store, must-revalidate',
          })
          res.end(JSON.stringify({ success: true, data: list, scan: runtime.customMusicManager.getScanStatus(username) }))
        }).catch(err => {
          res.writeHead(500)
          res.end(err.message)
        })
        return

}

/**
 * 查询用户自定义音乐目录歌曲列表。
 * @param context /api/music/custom/list 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 用户歌单、历史快照、缓存列表和平台歌单查询的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export async function getMusicCustomList(context: RequestContext, runtime: PlaylistServiceRuntime) {
  const { req, res } = context
  const { verifyUserAuth, getUserConfig, customMusicManager } = runtime

        const verified = verifyUserAuth(req)
        if (!verified) {
          res.writeHead(401, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ success: false, message: 'Unauthorized' }))
          return
        }
        const userCfg = getUserConfig(verified)
        void customMusicManager.getCustomMusicList(verified).then(list => {
          res.writeHead(200, {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache, no-store, must-revalidate',
          })
          res.end(JSON.stringify({
            success: true,
            data: list,
            allowOperateCustomMusicDir: !!userCfg?.allowOperateCustomMusicDir,
            allowWriteCustomMusicDir: !!userCfg?.allowWriteCustomMusicDir
          }))
        }).catch(err => {
          res.writeHead(500, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ success: false, message: err.message }))
        })
        return

}

/**
 * 删除指定歌单并更新用户数据。
 * @param context /api/data/delete-playlist 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 用户歌单、历史快照、缓存列表和平台歌单查询的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export async function postDataDeletePlaylist(context: RequestContext, runtime: PlaylistServiceRuntime) {
  const { req, res } = context
  const { readBody, getUserSpace } = runtime

        const auth = req.headers['x-frontend-auth']
        if (auth !== global.lx.config['frontend.password']) {
          res.writeHead(401)
          res.end('Unauthorized')
          return
        }


        void readBody(req).then(async body => {
          try {
            const { username, playlistId } = JSON.parse(body)

            // 检查用户是否存在
            if (!global.lx.config.users.some(u => u.name === username)) {
              res.writeHead(404)
              res.end('User not found')
              return
            }

            const userSpace = getUserSpace(username)
            const listManage = userSpace.listManage

            // 删除歌单
            await listManage.listDataManage.userListsRemove([playlistId])
            // 创建快照
            await listManage.createSnapshot()

            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ success: true }))
          } catch (err: any) {
            res.writeHead(500)
            res.end(err.message)
          }
        })
        return

}

/**
 * 删除指定歌单中的歌曲。
 * @param context /api/data/delete-song 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 用户歌单、历史快照、缓存列表和平台歌单查询的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export async function postDataDeleteSong(context: RequestContext, runtime: PlaylistServiceRuntime) {
  const { req, res } = context
  const { readBody, getUserSpace } = runtime

        const auth = req.headers['x-frontend-auth']
        if (auth !== global.lx.config['frontend.password']) {
          res.writeHead(401)
          res.end('Unauthorized')
          return
        }

        void readBody(req).then(async body => {
          try {
            const { username, playlistId, songIndex } = JSON.parse(body)

            // 检查用户是否存在
            if (!global.lx.config.users.some(u => u.name === username)) {
              res.writeHead(404)
              res.end('User not found')
              return
            }

            const userSpace = getUserSpace(username)
            const listManage = userSpace.listManage
            const listData = await listManage.getListData()

            // 获取歌单
            const playlist = listData.userList.find((list: any) => list.id === playlistId)

            if (!playlist) {
              res.writeHead(404)
              res.end('Playlist not found')
              return
            }

            if (!playlist.list || songIndex >= playlist.list.length) {
              res.writeHead(404)
              res.end('Song not found')
              return
            }

            const songInfo = playlist.list[songIndex]
            // 从歌单中删除歌曲
            await listManage.listDataManage.listMusicRemove(playlistId, [songInfo.id])
            // 创建快照
            await listManage.createSnapshot()

            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ success: true }))
          } catch (err: any) {
            res.writeHead(500)
            res.end(err.message)
          }
        })
        return

}

/**
 * 重命名指定歌单。
 * @param context /api/data/rename-playlist 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 用户歌单、历史快照、缓存列表和平台歌单查询的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export async function postDataRenamePlaylist(context: RequestContext, runtime: PlaylistServiceRuntime) {
  const { req, res } = context
  const { readBody, getUserSpace } = runtime

        const auth = req.headers['x-frontend-auth']
        if (auth !== global.lx.config['frontend.password']) {
          res.writeHead(401)
          res.end('Unauthorized')
          return
        }

        void readBody(req).then(async body => {
          try {
            const { username, playlistId, newName } = JSON.parse(body)

            // 检查用户是否存在
            if (!global.lx.config.users.some(u => u.name === username)) {
              res.writeHead(404)
              res.end('User not found')
              return
            }

            const userSpace = getUserSpace(username)
            const listManage = userSpace.listManage
            const listData = await listManage.getListData()

            // 查找歌单
            const playlist = listData.userList.find((list: any) => list.id === playlistId)

            if (!playlist) {
              res.writeHead(404)
              res.end('Playlist not found')
              return
            }

            // 更新歌单信息
            await listManage.listDataManage.userListsUpdate([{
              id: playlist.id,
              name: newName,
              source: playlist.source,
              sourceListId: playlist.sourceListId,
              locationUpdateTime: playlist.locationUpdateTime
            }])
            // 创建快照
            await listManage.createSnapshot()

            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ success: true }))
          } catch (err: any) {
            res.writeHead(500)
            res.end(err.message)
          }
        })
        return

}

/**
 * 批量删除指定歌单中的歌曲。
 * @param context /api/data/batch-delete-songs 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 用户歌单、历史快照、缓存列表和平台歌单查询的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export async function postDataBatchDeleteSongs(context: RequestContext, runtime: PlaylistServiceRuntime) {
  const { req, res } = context
  const { readBody, getUserSpace } = runtime

        const auth = req.headers['x-frontend-auth']
        if (auth !== global.lx.config['frontend.password']) {
          res.writeHead(401)
          res.end('Unauthorized')
          return
        }

        void readBody(req).then(async body => {
          try {
            const { username, playlistId, songIndices } = JSON.parse(body)

            // 检查用户是否存在
            if (!global.lx.config.users.some(u => u.name === username)) {
              res.writeHead(404)
              res.end('User not found')
              return
            }

            const userSpace = getUserSpace(username)
            const listManage = userSpace.listManage
            const listData = await listManage.getListData()

            // 获取歌单
            const playlist = listData.userList.find((list: any) => list.id === playlistId)

            if (!playlist) {
              res.writeHead(404)
              res.end('Playlist not found')
              return
            }

            // 获取要删除的歌曲ID列表
            const songIds = songIndices.map((index: number) => {
              if (playlist.list && playlist.list[index]) {
                const id = playlist.list[index].id
                return id
              }
              return null
            }).filter((id: any) => id !== null)

            if (songIds.length === 0) {
              res.writeHead(400)
              res.end('No valid songs selected')
              return
            }

            // 批量删除
            await listManage.listDataManage.listMusicRemove(playlistId, songIds)
            // 创建快照
            await listManage.createSnapshot()

            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ success: true }))
          } catch (err: any) {
            res.writeHead(500)
            res.end(err.message)
          }
        })
        return

}

/**
 * 分页查询平台推荐歌单。
 * @param context /api/music/songList/list 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 用户歌单、历史快照、缓存列表和平台歌单查询的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export async function getMusicSongListList(context: RequestContext, runtime: PlaylistServiceRuntime) {
  const { urlObj, res } = context
  const { musicSdk } = runtime

        const source = urlObj.searchParams.get('source') || 'wy'
        const tagId = urlObj.searchParams.get('tagId') || ''
        const sortId = urlObj.searchParams.get('sortId') || 'hot'
        const page = parseInt(urlObj.searchParams.get('page') || '1')
        try {
          if (!musicSdk[source] || !musicSdk[source].songList) {
            throw new Error(`Source ${source} does not support songList`)
          }
          const result = await musicSdk[source].songList.getList(sortId, tagId, page)
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify(result))
        } catch (err: any) {
          console.error(`[歌单服务] 获取歌单列表失败:`, err)
          res.writeHead(500, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: err.message || '获取歌单列表失败' }))
        }
        return

}

/**
 * 查询指定平台排行榜歌曲。
 * @param context /api/music/leaderboard/list 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 用户歌单、历史快照、缓存列表和平台歌单查询的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export async function getMusicLeaderboardList(context: RequestContext, runtime: PlaylistServiceRuntime) {
  const { urlObj, res } = context
  const { musicSdk, normalizeSongInfo } = runtime

        const source = urlObj.searchParams.get('source') || 'kg'
        const bangid = urlObj.searchParams.get('bangid')
        const page = parseInt(urlObj.searchParams.get('page') || '1')
        if (!bangid) {
          res.writeHead(400); res.end('Missing bangid'); return
        }
        try {
          if (!musicSdk[source] || !musicSdk[source].leaderboard) {
            throw new Error(`Source ${source} does not support leaderboard`)
          }
          const result = await musicSdk[source].leaderboard.getList(bangid, page)
          if (result && result.list) {
            result.list = result.list.map(normalizeSongInfo)
          }
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify(result))
        } catch (err: any) {
          console.error(`[排行榜] 获取排行榜歌曲失败:`, err)
          res.writeHead(500, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: err.message || '获取排行榜歌曲失败' }))
        }
        return

}
