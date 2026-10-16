import type { RequestContext, ServerRuntime } from '../../common/http/RequestContext'
import { serverEvents } from '../../application/events/ServerEvents'
/** 自动下载、缓存目录维护、媒体文件响应与歌曲洗版所需的应用依赖契约。 @author yahyaoo */
export type DownloadServiceRuntime = Pick<ServerRuntime, 'verifyUserAuth' | 'getUserSpace' | 'getSyncDownloadData' | 'getUserSyncProgress' | 'path' | 'File' | 'storageFs' | 'scheduler' | 'getUserSyncStorageLocation' | 'triggerUserSync' | 'cancelUserSync' | 'readBody' | 'isUserSyncRunning' | 'migrateSyncStorage' | 'saveSyncDownloadData' | 'getUpdatedListIds' | 'removeUpdatedListId' | 'getCacheRequestUsername' | 'getUserConfig' | 'remasterQueue' | 'fileCache' | 'serverDownloads' | 'url' | 'serverDownloadQueue' | 'accessLog' | 'customMusicManager' | 'os' | 'crypto' | 'MusicTagger' | 'MetaPicture' | 'musicSdk'>
import type * as cacheTypes from './cache/FileCacheService'
/** 自动下载、缓存目录维护、媒体文件响应与歌曲洗版服务。 @author yahyaoo */

/**
 * 查询用户歌单自动下载状态。
 * @param context /api/user/sync-download/status 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 自动下载、缓存目录维护、媒体文件响应与歌曲洗版的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export async function getUserSyncDownloadStatus(context: RequestContext, runtime: DownloadServiceRuntime) {
  const { req, res } = context
  const { verifyUserAuth, getUserSpace, getSyncDownloadData, getUserSyncProgress, path, File, storageFs, scheduler, getUserSyncStorageLocation } = runtime

        const reqUsername = req.headers['x-user-name'] as string
        const isPublic = !reqUsername || reqUsername === 'default' || reqUsername === '_open'
        let username: string | null = null
        if (isPublic) {
          username = '_open'
        } else {
          username = verifyUserAuth(req)
        }
        if (!username) {
          res.writeHead(401, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ success: false, message: 'Unauthorized' }))
          return
        }
        try {
          const userSpace = getUserSpace(username)
          const listData = await userSpace.listManage.getListData()
          const syncData = getSyncDownloadData(username)
          const progress = getUserSyncProgress(username)
          // 检查是否开启了自动更新网络歌单
          const settingsPath = path.join(userSpace.dataManage.userDir, File.userSettingsJSON)
          let autoUpdateNetworkList = false
          if (storageFs.existsSync(settingsPath)) {
            try { autoUpdateNetworkList = JSON.parse(storageFs.readFileSync(settingsPath, 'utf-8')).autoUpdateNetworkList === true } catch { }
          }
          // 获取调度器网络歌单任务状态，以便提供准确的下次触发时间
          const taskStatus = scheduler.getSchedulerStatus()
          const networkTask = taskStatus.find(t => t.id === 'network_list_autocheck')
          const nextSyncTime = (autoUpdateNetworkList && networkTask?.enabled) ? (networkTask.nextRunTime || null) : null

          const getSongCoverUrl = (song: any): string => {
            if (!song) return ''
            return song.img ||
              song.pic ||
              song.picUrl ||
              song.meta?.picUrl ||
              song.meta?.pic ||
              song.meta?.albumPic ||
              song.meta?.cover ||
              song.album?.picUrl ||
              song.album?.pic ||
              song.album?.img ||
              song.otherSource?.meta?.picUrl ||
              ''
          }

          const playlists = (listData?.userList ?? []).map((l: any) => {
            let cover = l.Album || l.album || l.cover || l.pic || l.picUrl || ''
            if (!cover && Array.isArray(l.list) && l.list.length > 0) {
              for (const song of l.list) {
                const sCover = getSongCoverUrl(song)
                if (sCover) {
                  cover = sCover
                  break
                }
              }
            }
            return {
              id: l.id,
              name: l.name,
              cover: cover || null,
              source: l.source || null,
              songCount: Array.isArray(l.list) ? l.list.length : 0,
              isNetwork: !!l.sourceListId,
              syncConfig: syncData.playlists[l.id] ?? { enabled: false, lastSyncTime: null, failedSongs: [] },
            }
          })
          const storageLocation = getUserSyncStorageLocation(username)
          // 检查该用户是否启用了自定义音乐目录
          const globalCustSwitch = !!global.lx.config['user.enableCustomMusicDir']
          const userCustCfg = global.lx.config.users?.find((u: any) => u.name === username)
          const hasCustomDir = globalCustSwitch && !!userCustCfg?.enableCustomMusicDir && !!userCustCfg?.customMusicDir
          const availableLocations: string[] = ['root', 'data']
          if (hasCustomDir) availableLocations.push('custom')

          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({
            success: true,
            data: {
              autoUpdateNetworkList,
              nextSyncTime,
              storageLocation,
              availableLocations,
              syncDownload: {
                enabled: syncData.enabled,
                preferredQuality: syncData.preferredQuality || '320k',
                downloadLyric: syncData.downloadLyric !== false, // 默认 true
                embedLyric: syncData.embedLyric !== false,       // 默认 true
                lastSyncTime: syncData.lastSyncTime,
                lastSyncResult: syncData.lastSyncResult,
              },
              playlists,
              progress,
            }
          }))
        } catch (e: any) { res.writeHead(500, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ success: false, message: e.message })) }
        return

}

/**
 * 立即执行用户歌单自动下载任务。
 * @param context /api/user/sync-download/trigger 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 自动下载、缓存目录维护、媒体文件响应与歌曲洗版的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export async function postUserSyncDownloadTrigger(context: RequestContext, runtime: DownloadServiceRuntime) {
  const { req, res, urlObj } = context
  const { verifyUserAuth, triggerUserSync } = runtime

        const reqUsername = req.headers['x-user-name'] as string
        const isPublic = !reqUsername || reqUsername === 'default' || reqUsername === '_open'
        let username: string | null = null
        if (isPublic) {
          if (global.lx.config['user.enablePublicRestriction']) {
            const auth = req.headers['x-frontend-auth']
            if (auth !== global.lx.config['frontend.password']) {
              res.writeHead(403, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ success: false, message: '权限不足：公共用户受限模式下需要管理员权限' }))
              return
            }
          }
          username = '_open'
        } else {
          username = verifyUserAuth(req)
        }
        if (!username) {
          res.writeHead(401, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ success: false, message: 'Unauthorized' }))
          return
        }
        try {
          const targetPlId = urlObj.searchParams.get('playlistId') || undefined
          const result = await triggerUserSync(username, targetPlId)
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ success: true, ...result }))
        } catch (e: any) { res.writeHead(500, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ success: false, message: e.message })) }
        return

}

/**
 * 取消用户当前自动下载任务。
 * @param context /api/user/sync-download/cancel 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 自动下载、缓存目录维护、媒体文件响应与歌曲洗版的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export async function postUserSyncDownloadCancel(context: RequestContext, runtime: DownloadServiceRuntime) {
  const { req, res } = context
  const { verifyUserAuth, cancelUserSync } = runtime

        const reqUsername = req.headers['x-user-name'] as string
        const isPublic = !reqUsername || reqUsername === 'default' || reqUsername === '_open'
        let username: string | null = null
        if (isPublic) {
          username = '_open'
        } else {
          username = verifyUserAuth(req)
        }
        if (!username) {
          res.writeHead(401, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ success: false, message: 'Unauthorized' }))
          return
        }
        const cancelled = cancelUserSync(username)
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ success: true, cancelled, message: cancelled ? '已暂停同步' : '当前无正在进行的同步' }))
        return

}

/**
 * 查询自动下载任务进度与处理日志。
 * @param context /api/user/sync-download/progress 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 自动下载、缓存目录维护、媒体文件响应与歌曲洗版的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export async function getUserSyncDownloadProgress(context: RequestContext, runtime: DownloadServiceRuntime) {
  const { req, res } = context
  const { verifyUserAuth, getUserSyncProgress } = runtime

        const reqUsername = req.headers['x-user-name'] as string
        const isPublic = !reqUsername || reqUsername === 'default' || reqUsername === '_open'
        let username: string | null = null
        if (isPublic) {
          username = '_open'
        } else {
          username = verifyUserAuth(req)
        }
        if (!username) {
          res.writeHead(401, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ success: false, message: 'Unauthorized' }))
          return
        }
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ success: true, data: getUserSyncProgress(username) }))
        return

}

/**
 * 将同步下载歌曲迁移到指定存储位置。
 * @param context /api/user/sync-download/migrate-storage 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 自动下载、缓存目录维护、媒体文件响应与歌曲洗版的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export async function postUserSyncDownloadMigrateStorage(context: RequestContext, runtime: DownloadServiceRuntime) {
  const { req, res } = context
  const { verifyUserAuth, readBody, isUserSyncRunning, migrateSyncStorage, getSyncDownloadData, saveSyncDownloadData } = runtime

        const reqUsername = req.headers['x-user-name'] as string
        const isPublic = !reqUsername || reqUsername === 'default' || reqUsername === '_open'
        let username: string | null = null
        if (isPublic) {
          username = '_open'
        } else {
          username = verifyUserAuth(req)
        }
        if (!username) {
          res.writeHead(401, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ success: false, message: 'Unauthorized' }))
          return
        }
        void readBody(req).then(async body => {
          try {
            const { newLocation } = JSON.parse(body)
            if (!['root', 'data', 'custom'].includes(newLocation)) {
              res.writeHead(400, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ success: false, message: '无效的存储位置，仅支持 root / data / custom' }))
              return
            }
            // 同步运行中不允许切换
            if (isUserSyncRunning(username!)) {
              res.writeHead(409, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ success: false, message: '同步任务正在运行中，请先暂停同步再切换存储位置' }))
              return
            }
            // 如果选择 custom，验证该用户有自定义目录配置
            if (newLocation === 'custom') {
              const globalCustSwitch = !!global.lx.config['user.enableCustomMusicDir']
              const userCustCfg = global.lx.config.users?.find((u: any) => u.name === username)
              const hasCustomDir = globalCustSwitch && !!userCustCfg?.enableCustomMusicDir && !!userCustCfg?.customMusicDir
              if (!hasCustomDir) {
                res.writeHead(400, { 'Content-Type': 'application/json' })
                res.end(JSON.stringify({ success: false, message: '该用户未配置自定义音乐目录' }))
                return
              }
            }

            let migrateResult: { /** 已经移动的文件数量。 */
moved: number; /** 已跳过的歌曲数量。 */
skipped: number;
errors: number; /** 处理结果或错误说明。 */
message: string }

            // migrateSyncStorage 已支持全部三种方向（root↔data、root/data↔custom）
            migrateResult = await migrateSyncStorage(username!, newLocation as 'root' | 'data' | 'custom')

            // 保存新 storageLocation 到 data.json
            const syncData = getSyncDownloadData(username!)
            syncData.storageLocation = newLocation as 'root' | 'data' | 'custom'
            saveSyncDownloadData(username!, syncData)

            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ success: true, ...migrateResult }))
          } catch (e: any) {
            res.writeHead(500, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ success: false, message: e.message }))
          }
        })
        return

}

/**
 * 查询后台调度任务状态。
 * @param context /api/tasks/status 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 自动下载、缓存目录维护、媒体文件响应与歌曲洗版的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export async function getTasksStatus(context: RequestContext, runtime: DownloadServiceRuntime) {
  const { req, res } = context
  const { verifyUserAuth, scheduler } = runtime

        const reqUsername = req.headers['x-user-name'] as string
        const isPublic = !reqUsername || reqUsername === 'default'

        if (!isPublic && !verifyUserAuth(req)) {
          res.writeHead(401, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ success: false, message: 'Unauthorized' }))
          return
        }

        const tasks = scheduler.getSchedulerStatus()
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ success: true, tasks }))
        return

}

/**
 * 手动执行指定调度任务。
 * @param context /api/tasks/trigger 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 自动下载、缓存目录维护、媒体文件响应与歌曲洗版的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export async function postTasksTrigger(context: RequestContext, runtime: DownloadServiceRuntime) {
  const { req, res, urlObj } = context
  const { verifyUserAuth, scheduler } = runtime

        const reqUsername = req.headers['x-user-name'] as string
        const isPublic = !reqUsername || reqUsername === 'default'

        if (isPublic) {
          if (global.lx.config['user.enablePublicRestriction']) {
            const auth = req.headers['x-frontend-auth']
            if (auth !== global.lx.config['frontend.password']) {
              res.writeHead(403, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ success: false, message: '权限不足：受限模式下需要管理员权限' }))
              return
            }
          }
        } else {
          if (!verifyUserAuth(req)) {
            res.writeHead(401, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ success: false, message: 'Unauthorized' }))
            return
          }
        }

        let taskId = urlObj.searchParams.get('id') || 'network_list_autocheck'
        if (taskId === 'sync_download') taskId = 'sync_download_task'
        void scheduler.executeTask(taskId).then(result => {
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify(result))
        }).catch(err => {
          res.writeHead(500, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ success: false, message: err.message }))
        })
        return

}

/**
 * 查询用户定时任务相关配置和数据。
 * @param context /api/tasks/user-data 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 自动下载、缓存目录维护、媒体文件响应与歌曲洗版的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export async function getTasksUserData(context: RequestContext, runtime: DownloadServiceRuntime) {
  const { req, urlObj, res } = context
  const { verifyUserAuth, getUpdatedListIds, readBody, removeUpdatedListId, getSyncDownloadData, getUserSyncProgress, triggerUserSync } = runtime

        const reqUsername = req.headers['x-user-name'] as string
        const isPublic = !reqUsername || reqUsername === 'default'
        let targetUser = '_open'
        if (!isPublic) {
          const verified = verifyUserAuth(req)
          if (verified) targetUser = verified
        }

        const taskId = urlObj.searchParams.get('task') || ''

        // 目前支持的任务类型：network_list_autocheck, sync_download_task
        if (taskId === 'network_list_autocheck') {
          if (req.method === 'GET') {
            const updatedListIds = getUpdatedListIds(targetUser)
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ success: true, updatedListIds }))
            return
          }

          if (req.method === 'POST') {
            void readBody(req).then(body => {
              try {
                let clearId = ''
                if (typeof body === 'string') {
                  try { clearId = JSON.parse(body).listId || JSON.parse(body).id || '' } catch { clearId = body.trim() }
                } else if (body && typeof body === 'object') {
                  clearId = (body as any).listId || (body as any).id || ''
                }
                if (clearId) removeUpdatedListId(targetUser, clearId)
                const updatedListIds = getUpdatedListIds(targetUser)
                res.writeHead(200, { 'Content-Type': 'application/json' })
                res.end(JSON.stringify({ success: true, updatedListIds }))
              } catch (err: any) {
                res.writeHead(500, { 'Content-Type': 'application/json' })
                res.end(JSON.stringify({ success: false, message: err.message }))
              }
            })
            return
          }
        }

        if (taskId === 'sync_download_task' || taskId === 'sync_download') {
          if (req.method === 'GET') {
            const syncData = getSyncDownloadData(targetUser)
            const progress = getUserSyncProgress(targetUser)
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ success: true, syncData, progress }))
            return
          }

          if (req.method === 'POST') {
            void readBody(req).then(async body => {
              try {
                let action = ''
                if (typeof body === 'string') {
                  try { action = JSON.parse(body).action || '' } catch { }
                } else if (body && typeof body === 'object') {
                  action = (body as any).action || ''
                }
                if (action === 'trigger') {
                  const result = await triggerUserSync(targetUser)
                  res.writeHead(200, { 'Content-Type': 'application/json' })
                  res.end(JSON.stringify({ success: true, ...result }))
                } else {
                  res.writeHead(200, { 'Content-Type': 'application/json' })
                  res.end(JSON.stringify({ success: true }))
                }
              } catch (err: any) {
                res.writeHead(500, { 'Content-Type': 'application/json' })
                res.end(JSON.stringify({ success: false, message: err.message }))
              }
            })
            return
          }
        }

        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ success: false, message: '未知任务或不支持的操作' }))
        return

}

/**
 * 创建、查询或取消本地歌曲洗版任务。
 * @param context /api/music/remaster/ 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 自动下载、缓存目录维护、媒体文件响应与歌曲洗版的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export async function handleMusicRemaster(context: RequestContext, runtime: DownloadServiceRuntime) {
  const { req, res, pathname, urlObj } = context
  const { getCacheRequestUsername, readBody, getUserConfig, remasterQueue } = runtime

        const username = getCacheRequestUsername(req)
        if (!username) {
          res.writeHead(401, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ success: false, message: 'Unauthorized' }))
          return
        }
        if (pathname === '/api/music/remaster/start' && req.method === 'POST') {
          try {
            const body = JSON.parse(await readBody(req))
            const explicitIsCustomDir = body?.isCustomDir === undefined ? undefined : Boolean(body?.isCustomDir)

            if (explicitIsCustomDir) {
              const userCfg = getUserConfig(username)
              if (!userCfg?.allowOperateCustomMusicDir) {
                res.writeHead(403, { 'Content-Type': 'application/json' })
                res.end(JSON.stringify({ success: false, message: '管理员未允许操作自定义目录中的文件' }))
                return
              }
            }

            const data = await remasterQueue.start(username, String(body?.targetQuality || ''), body?.filenames, explicitIsCustomDir)
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ success: true, data }))
          } catch (err: any) {
            res.writeHead(400, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ success: false, message: err?.message || '启动洗版失败' }))
          }
          return
        }

        if (pathname === '/api/music/remaster/status' && req.method === 'GET') {
          const offset = Number(urlObj.searchParams.get('offset') || 0)
          const limit = Number(urlObj.searchParams.get('limit') || 200)
          const data = remasterQueue.getStatus(username, offset, limit)
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ success: true, data }))
          return
        }

        if (pathname === '/api/music/remaster/cancel' && req.method === 'POST') {
          const cancelled = remasterQueue.cancel(username)
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ success: true, data: { cancelled } }))
          return
        }

        res.writeHead(404, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ success: false, message: 'Not Found' }))
        return

}

/**
 * 保存用户服务器缓存配置。
 * @param context /api/music/cache/config 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 自动下载、缓存目录维护、媒体文件响应与歌曲洗版的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export async function postMusicCacheConfig(context: RequestContext, runtime: DownloadServiceRuntime) {
  const { req, res } = context
  const { verifyUserAuth, readBody, fileCache, serverDownloads } = runtime

        const reqUsername = req.headers['x-user-name'] as string
        const isPublic = !reqUsername || reqUsername === 'default'

        // 具名用户必须通过 Token（或兼容密码）验证身份
        if (!isPublic) {
          const verified = verifyUserAuth(req)
          if (!verified) {
            res.writeHead(401, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ success: false, message: 'Unauthorized' }))
            return
          }
        }

        void readBody(req).then(async body => {
          try {
            const { location, namingPattern } = JSON.parse(body)
            let updated = false

            if (location) {
              if (location !== fileCache.getCacheLocation()) {
                // 公开用户：需要管理员密码才能修改
                if (isPublic && global.lx.config['user.enablePublicRestriction']) {
                  const auth = req.headers['x-frontend-auth']
                  if (auth !== global.lx.config['frontend.password']) {
                    res.writeHead(403, { 'Content-Type': 'application/json' })
                    res.end(JSON.stringify({ success: false, error: '权限不足：公共用户修改缓存位置受限，请输入管理员密码。' }))
                    return
                  }
                }
                if (!['data', 'root'].includes(location)) serverDownloads.validateDirectory(location)
                fileCache.setCacheLocation(location)
                global.lx.config.serverCacheLocation = location
                global.lx.saveConfig?.()
                updated = true
              }
            }

            if (namingPattern) {
              const normalizedNamingPattern = fileCache.setNamingPattern(namingPattern)
              if (global.lx.config) global.lx.config['cache.namingPattern'] = normalizedNamingPattern
              updated = true
            }

            if (updated) {
              res.writeHead(200, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ success: true }))
            } else {
              res.writeHead(200, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ success: true, message: 'No changes' }))
            }
          } catch (e: any) {
            res.writeHead(400, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ success: false, error: e.message || '缓存目录保存失败' }))
          }
        })
        return

}

/**
 * 列出当前用户可用的缓存目录。
 * @param context /api/music/cache/directories 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 自动下载、缓存目录维护、媒体文件响应与歌曲洗版的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export async function getMusicCacheDirectories(context: RequestContext, runtime: DownloadServiceRuntime) {
  const { req, res } = context
  const { url, verifyUserAuth, fileCache, path } = runtime

        const parsedUrl = url.parse(req.url || '', true)
        const locationQuery = (parsedUrl.query.location as string) || undefined
        const onlyDownloadQuery = parsedUrl.query.onlyDownload === 'true' || parsedUrl.query.onlyDownload === '1'

        const reqUsername = (req.headers['x-user-name'] as string) || ''
        const isPublic = !reqUsername || reqUsername === '_open' || reqUsername === 'default'
        let username = '_open'

        if (!isPublic) {
          const verified = verifyUserAuth(req)
          if (!verified) {
            res.writeHead(401, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ success: false, message: 'Unauthorized' }))
            return
          }
          username = verified
        }

        const effectiveLocation = locationQuery || fileCache.getCacheLocation()
        const cacheDir = fileCache.getCacheDir(username, false, effectiveLocation)
        const downloadDir = fileCache.getCacheDir(username, true, effectiveLocation)

        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({
          success: true,
          data: {
            username,
            location: effectiveLocation,
            isOnlyDownloadMode: onlyDownloadQuery,
            isSameDirectory: !onlyDownloadQuery,
            cacheDirectory: cacheDir,
            downloadDirectory: onlyDownloadQuery ? downloadDir : cacheDir,
            rawDownloadDirectory: downloadDir,
            rootType: path.isAbsolute(effectiveLocation) ? '自定义目录' : (effectiveLocation === 'data' ? '缓存目录' : '运行目录 (仅本地)'),
            isLocalStorage: true
          }
        }))
        return

}

/**
 * 扫描缓存目录并同步歌曲索引。
 * @param context /api/music/cache/sync 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 自动下载、缓存目录维护、媒体文件响应与歌曲洗版的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export async function postMusicCacheSync(context: RequestContext, runtime: DownloadServiceRuntime) {
  const { req, res } = context
  const { verifyUserAuth, fileCache } = runtime

        const reqUsername = (req.headers['x-user-name'] as string) || ''
        const isPublic = !reqUsername || reqUsername === '_open' || reqUsername === 'default'
        let username = '_open'

        if (!isPublic) {
          const verified = verifyUserAuth(req)
          if (!verified) {
            res.writeHead(401, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ success: false, message: 'Unauthorized' }))
            return
          }
          username = verified
        }

        try {
          await fileCache.syncCacheIndex(username)
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ success: true, message: 'Sync completed' }))
        } catch (e) {
          res.writeHead(500, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ success: false, message: 'Sync failed: ' + (e as any).message }))
        }
        return

}

/**
 * 查询缓存目录下的歌曲分类子目录。
 * @param context /api/music/cache/subdirs 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 自动下载、缓存目录维护、媒体文件响应与歌曲洗版的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export async function getMusicCacheSubdirs(context: RequestContext, runtime: DownloadServiceRuntime) {
  const { req, urlObj, res } = context
  const { verifyUserAuth, fileCache } = runtime

        const reqUsername = (req.headers['x-user-name'] as string) || urlObj.searchParams.get('user') || ''
        const isPublic = !reqUsername || reqUsername === '_open' || reqUsername === 'default'
        let username = '_open'

        if (!isPublic) {
          const verified = verifyUserAuth(req)
          if (!verified) {
            res.writeHead(401, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ success: false, message: 'Unauthorized' }))
            return
          }
          username = verified
        }
        const folder = (urlObj.searchParams.get('folder') as 'cache' | 'music') || 'music'
        const subdirs = fileCache.getSubDirectories(username, folder)
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ success: true, data: subdirs }))
        return

}

/**
 * 创建缓存子目录。
 * @param context /api/music/cache/mkdir 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 自动下载、缓存目录维护、媒体文件响应与歌曲洗版的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export async function postMusicCacheMkdir(context: RequestContext, runtime: DownloadServiceRuntime) {
  const { req, res } = context
  const { verifyUserAuth, readBody, fileCache } = runtime

        const reqUsername = (req.headers['x-user-name'] as string) || ''
        const isPublic = !reqUsername || reqUsername === '_open' || reqUsername === 'default'
        let username = '_open'

        if (!isPublic) {
          const verified = verifyUserAuth(req)
          if (!verified) {
            res.writeHead(401, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ success: false, message: 'Unauthorized' }))
            return
          }
          username = verified
        }
        void readBody(req).then(body => {
          try {
            const { folder, subPath } = JSON.parse(body)
            if (!folder || !subPath) {
              res.writeHead(400)
              res.end('Missing params')
              return
            }
            const success = fileCache.createSubDirectory(username, folder, subPath)
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ success }))
          } catch (e) {
            res.writeHead(500)
            res.end('Error')
          }
        })
        return

}

/**
 * 将缓存歌曲归入指定分类目录。
 * @param context /api/music/cache/categorize 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 自动下载、缓存目录维护、媒体文件响应与歌曲洗版的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export async function postMusicCacheCategorize(context: RequestContext, runtime: DownloadServiceRuntime) {
  const { req, res } = context
  const { verifyUserAuth, readBody, fileCache } = runtime

        const reqUsername = (req.headers['x-user-name'] as string) || ''
        const isPublic = !reqUsername || reqUsername === '_open' || reqUsername === 'default'
        let username = '_open'

        if (!isPublic) {
          const verified = verifyUserAuth(req)
          if (!verified) {
            res.writeHead(401, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ success: false, message: 'Unauthorized' }))
            return
          }
          username = verified
        }
        void readBody(req).then(async body => {
          try {
            const { filenames, subPath } = JSON.parse(body)
            if (!Array.isArray(filenames)) {
              res.writeHead(400)
              res.end('Missing params')
              return
            }
            const result = await fileCache.categorizeFiles(filenames, subPath, username)
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ success: true, ...result }))
          } catch (e) {
            res.writeHead(500)
            res.end('Error')
          }
        })
        return

}

/**
 * 重命名缓存分类子目录。
 * @param context /api/music/cache/subdirs/rename 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 自动下载、缓存目录维护、媒体文件响应与歌曲洗版的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export async function postMusicCacheSubdirsRename(context: RequestContext, runtime: DownloadServiceRuntime) {
  const { req, res } = context
  const { verifyUserAuth, readBody, fileCache } = runtime

        const reqUsername = (req.headers['x-user-name'] as string) || ''
        const auth = req.headers['x-frontend-auth']
        const isAdmin = !!(auth && auth === global.lx.config['frontend.password'])
        const isPublic = !reqUsername || reqUsername === '_open' || reqUsername === 'default'
        let username = '_open'

        if (isPublic) {
          if (!isAdmin) {
            res.writeHead(403, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ success: false, message: '权限不足：修改公共本地分类需要验证管理员权限。' }))
            return
          }
        } else {
          const verified = verifyUserAuth(req)
          if (!verified) {
            res.writeHead(401, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ success: false, message: 'Unauthorized' }))
            return
          }
          username = verified
        }

        void readBody(req).then(body => {
          try {
            const { folder = 'music', oldSubPath, newSubPath } = JSON.parse(body)
            if (!oldSubPath || !newSubPath) {
              res.writeHead(400, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ success: false, message: '缺少参数' }))
              return
            }
            const result = fileCache.renameSubDirectory(username, folder, oldSubPath.trim(), newSubPath.trim())
            res.writeHead(result.success ? 200 : 400, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify(result))
          } catch (e: any) {
            res.writeHead(500, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ success: false, message: e?.message || 'Server error' }))
          }
        })
        return

}

/**
 * 检查目录是否存在及可访问。
 * @param context /api/utils/check-dir 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 自动下载、缓存目录维护、媒体文件响应与歌曲洗版的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export async function postUtilsCheckDir(context: RequestContext, runtime: DownloadServiceRuntime) {
  const { req, res } = context
  const { readBody, path, storageFs } = runtime

        const auth = req.headers['x-frontend-auth']
        if (auth !== global.lx.config['frontend.password']) {
          res.writeHead(401, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ success: false, message: 'Unauthorized' }))
          return
        }
        void readBody(req).then(body => {
          try {
            const { dirPath } = JSON.parse(body)
            if (!dirPath || typeof dirPath !== 'string' || !dirPath.trim()) {
              res.writeHead(400, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ success: false, message: '请输入路径' }))
              return
            }
            const absolutePath = path.resolve(dirPath.trim())
            if (!storageFs.existsSync(absolutePath)) {
              res.writeHead(200, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ success: false, message: '目录不存在，请检查路径是否正确' }))
              return
            }
            const stat = storageFs.statSync(absolutePath)
            if (!stat.isDirectory()) {
              res.writeHead(200, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ success: false, message: '指定路径不是一个有效的目录' }))
              return
            }
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ success: true, message: '目录可用', path: absolutePath }))
          } catch (e: any) {
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ success: false, message: e?.message || '检测目录发生错误' }))
          }
        })
        return

}

/**
 * 删除缓存分类子目录及相关索引。
 * @param context /api/music/cache/subdirs/delete 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 自动下载、缓存目录维护、媒体文件响应与歌曲洗版的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export async function postMusicCacheSubdirsDelete(context: RequestContext, runtime: DownloadServiceRuntime) {
  const { req, res } = context
  const { verifyUserAuth, readBody, fileCache } = runtime

        const reqUsername = (req.headers['x-user-name'] as string) || ''
        const auth = req.headers['x-frontend-auth']
        const isAdmin = !!(auth && auth === global.lx.config['frontend.password'])
        const isPublic = !reqUsername || reqUsername === '_open' || reqUsername === 'default'
        let username = '_open'

        if (isPublic) {
          if (!isAdmin) {
            res.writeHead(403, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ success: false, message: '权限不足：删除公共本地分类需要验证管理员权限。' }))
            return
          }
        } else {
          const verified = verifyUserAuth(req)
          if (!verified) {
            res.writeHead(401, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ success: false, message: 'Unauthorized' }))
            return
          }
          username = verified
        }

        void readBody(req).then(body => {
          try {
            const { folder = 'music', subPath, deleteSongs = false } = JSON.parse(body)
            if (!subPath) {
              res.writeHead(400, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ success: false, message: '缺少 subPath 参数' }))
              return
            }
            const result = fileCache.deleteSubDirectory(username, folder, subPath.trim(), !!deleteSongs)
            res.writeHead(result.success ? 200 : 400, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify(result))
          } catch (e: any) {
            res.writeHead(500, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ success: false, message: e?.message || 'Server error' }))
          }
        })
        return

}

/**
 * 重命名缓存歌曲文件。
 * @param context /api/music/cache/rename 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 自动下载、缓存目录维护、媒体文件响应与歌曲洗版的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export async function postMusicCacheRename(context: RequestContext, runtime: DownloadServiceRuntime) {
  const { req, res } = context
  const { verifyUserAuth, fileCache } = runtime

        const reqUsername = (req.headers['x-user-name'] as string) || ''
        const isPublic = !reqUsername || reqUsername === '_open' || reqUsername === 'default'
        let username = '_open'

        if (!isPublic) {
          const verified = verifyUserAuth(req)
          if (!verified) {
            res.writeHead(401, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ success: false, message: 'Unauthorized' }))
            return
          }
          username = verified
        }

        try {
          const result = await fileCache.batchRenameCacheFiles(username)
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify(result))
        } catch (e) {
          res.writeHead(500, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ success: false, message: 'Rename failed: ' + (e as any).message }))
        }
        return

}

/**
 * 检查歌曲是否已下载到服务器。
 * @param context /api/music/server-download/check 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 自动下载、缓存目录维护、媒体文件响应与歌曲洗版的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export async function getMusicServerDownloadCheck(context: RequestContext, runtime: DownloadServiceRuntime) {
  const { req, res, urlObj } = context
  const { getCacheRequestUsername, serverDownloads } = runtime

        const username = getCacheRequestUsername(req)
        if (!username) { res.writeHead(401); res.end('Unauthorized'); return }
        try {
          const song = Object.fromEntries(urlObj.searchParams)
          const result = serverDownloads.check(song, username, song.quality, song.exactQuality === '1', song.currentDirectory === '1')
          if ('url' in result && result.url && username !== '_open' && req.headers['x-user-token']) {
            result.url += `&token=${encodeURIComponent(String(req.headers['x-user-token']))}`
          }
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify(result))
        } catch (err: any) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ exists: false, message: err.message }))
        }
        return

}

/**
 * 返回服务器已下载音频文件，支持范围请求。
 * @param context /api/music/server-download/file/ 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 自动下载、缓存目录维护、媒体文件响应与歌曲洗版的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export async function handleMusicServerDownloadFile(context: RequestContext, runtime: DownloadServiceRuntime) {
  const { urlObj, req, res, pathname } = context
  const { getCacheRequestUsername, serverDownloads } = runtime

        const requestedUsername = urlObj.searchParams.get('username') || '_open'
        if (requestedUsername !== '_open') {
          if (!req.headers['x-user-name']) req.headers['x-user-name'] = requestedUsername
          if (!req.headers['x-user-token']) req.headers['x-user-token'] = urlObj.searchParams.get('token') || ''
        }
        const username = getCacheRequestUsername(req)
        if (!username || username !== requestedUsername) { res.writeHead(401); res.end('Unauthorized'); return }
        serverDownloads.serve(req, res, pathname.split('/').pop() || '', username)
        return

}

/**
 * 检查歌曲是否已存在于缓存。
 * @param context /api/music/cache/check 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 自动下载、缓存目录维护、媒体文件响应与歌曲洗版的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export async function getMusicCacheCheck(context: RequestContext, runtime: DownloadServiceRuntime) {
  const { urlObj, res, req } = context
  const { verifyUserAuth, fileCache } = runtime

        const name = urlObj.searchParams.get('name')
        const singer = urlObj.searchParams.get('singer')
        const source = urlObj.searchParams.get('source')
        const songmid = urlObj.searchParams.get('songmid')
        const songId = urlObj.searchParams.get('songId')
        const quality = urlObj.searchParams.get('quality')
        const exactQuality = urlObj.searchParams.get('exactQuality') === '1' || urlObj.searchParams.get('exactQuality') === 'true'

        if (!name || !singer || !source || (!songmid && !songId)) {
          res.writeHead(400)
          res.end('Missing params')
          return
        }

        const reqUsername = (req.headers['x-user-name'] as string) || ''
        const isPublic = !reqUsername || reqUsername === 'default'
        let username = '_open'

        if (!isPublic) {
          const verified = verifyUserAuth(req)
          if (!verified) {
            res.writeHead(401, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ success: false, message: 'Unauthorized' }))
            return
          }
          username = verified
        }

        const result = fileCache.checkCache({ name, singer, source, songmid, songId, quality, exactQuality }, username)
        if (result && result.exists && username !== '_open' && username !== 'default') {
          const token = req.headers['x-user-token']
          if (token) {
            result.url += `&token=${encodeURIComponent(token as string)}`
          }
        }
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(result))
        return

}

/**
 * 查询用户缓存下载队列。
 * @param context /api/music/cache/queue 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 自动下载、缓存目录维护、媒体文件响应与歌曲洗版的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export async function getMusicCacheQueue(context: RequestContext, runtime: DownloadServiceRuntime) {
  const { req, res } = context
  const { getCacheRequestUsername, serverDownloadQueue } = runtime

        const username = getCacheRequestUsername(req)
        if (!username) {
          res.writeHead(401, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ success: false, message: 'Unauthorized' }))
          return
        }
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ success: true, data: serverDownloadQueue.list(username) }))
        return

}

/**
 * 将歌曲加入服务器缓存下载队列。
 * @param context /api/music/cache/queue 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 自动下载、缓存目录维护、媒体文件响应与歌曲洗版的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export async function postMusicCacheQueue(context: RequestContext, runtime: DownloadServiceRuntime) {
  const { req, res } = context
  const { getCacheRequestUsername, readBody, serverDownloads, serverDownloadQueue, fileCache } = runtime

        const username = getCacheRequestUsername(req)
        if (!username) {
          res.writeHead(401, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ success: false, message: 'Unauthorized' }))
          return
        }
        const auth = req.headers['x-frontend-auth']
        const isPublic = username === '_open'
        const isAdmin = auth === global.lx.config['frontend.password'] || username === 'admin'
        const enablePublicRestriction = global.lx.config['user.enablePublicRestriction']
        const isServerCacheAllowed = global.lx.config['user.enablePublicNonAdminServerCache'] !== false

        if (enablePublicRestriction && !isServerCacheAllowed && isPublic && !isAdmin) {
          res.writeHead(403, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ success: false, message: '权限限制：非管理员服务器缓存已被禁用' }))
          return
        }

        void readBody(req).then(body => {
          try {
            const { tasks, namingPattern, concurrency } = JSON.parse(body)
            if (!Array.isArray(tasks) || tasks.length === 0) throw new Error('Missing tasks')
            for (const task of tasks) {
              if (task.serverDownload === true) {
                serverDownloads.songIdentity(task.songInfo)
                serverDownloads.validateDirectory(serverDownloads.getDirectory())
                if (task.lyricMode !== 'external' && task.lyricMode !== 'embedded') {
                  task.lyricMode = global.lx.config['download.lyricMode'] || 'embedded'
                }
              }
            }
            if (concurrency !== undefined) serverDownloadQueue.setConcurrency(username, concurrency)
            if (namingPattern) {
              const auth = req.headers['x-frontend-auth']
              if (auth === global.lx.config['frontend.password']) {
                const normalizedNamingPattern = fileCache.setNamingPattern(namingPattern)
                if (global.lx.config) global.lx.config['cache.namingPattern'] = normalizedNamingPattern
              }
            }
            const queued = serverDownloadQueue.enqueue(username, tasks)
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ success: true, data: queued }))
          } catch (err: any) {
            res.writeHead(400, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ success: false, message: err.message || 'Invalid queue request' }))
          }
        })
        return

}

/**
 * 修改缓存下载队列并发数。
 * @param context /api/music/cache/queue/concurrency 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 自动下载、缓存目录维护、媒体文件响应与歌曲洗版的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export async function postMusicCacheQueueConcurrency(context: RequestContext, runtime: DownloadServiceRuntime) {
  const { req, res } = context
  const { getCacheRequestUsername, readBody, serverDownloadQueue } = runtime

        const username = getCacheRequestUsername(req)
        if (!username) {
          res.writeHead(401, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ success: false, message: 'Unauthorized' }))
          return
        }
        void readBody(req).then(body => {
          try {
            const { concurrency } = JSON.parse(body)
            const savedConcurrency = serverDownloadQueue.setConcurrency(username, concurrency)
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ success: true, data: { concurrency: savedConcurrency } }))
          } catch (err: any) {
            res.writeHead(400, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ success: false, message: err.message || 'Invalid concurrency' }))
          }
        })
        return

}

/**
 * 恢复缓存下载队列执行。
 * @param context /api/music/cache/queue/resume 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 自动下载、缓存目录维护、媒体文件响应与歌曲洗版的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export async function postMusicCacheQueueResume(context: RequestContext, runtime: DownloadServiceRuntime) {
  const { req, res } = context
  const { getCacheRequestUsername, readBody, serverDownloadQueue } = runtime

        const username = getCacheRequestUsername(req)
        if (!username) {
          res.writeHead(401, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ success: false, message: 'Unauthorized' }))
          return
        }
        void readBody(req).then(body => {
          try {
            const { id, all } = JSON.parse(body)
            if (all !== true && !id) throw new Error('Missing queue task id')
            serverDownloadQueue.resume(username, all ? undefined : id)
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ success: true }))
          } catch (err: any) {
            res.writeHead(400, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ success: false, message: err.message }))
          }
        })
        return

}

/**
 * 移除指定缓存下载排队任务。
 * @param context /api/music/cache/queue/remove 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 自动下载、缓存目录维护、媒体文件响应与歌曲洗版的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export async function postMusicCacheQueueRemove(context: RequestContext, runtime: DownloadServiceRuntime) {
  const { req, res } = context
  const { getCacheRequestUsername, readBody, serverDownloadQueue } = runtime

        const username = getCacheRequestUsername(req)
        if (!username) {
          res.writeHead(401, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ success: false, message: 'Unauthorized' }))
          return
        }
        void readBody(req).then(body => {
          try {
            const options = JSON.parse(body)
            if (!options || (options.all !== true && options.completed !== true && !options.id)) throw new Error('Missing queue removal option')
            serverDownloadQueue.remove(username, options)
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ success: true }))
          } catch (err: any) {
            res.writeHead(400, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ success: false, message: err.message }))
          }
        })
        return

}

/**
 * 下载歌曲并写入服务器缓存。
 * @param context /api/music/cache/download 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 自动下载、缓存目录维护、媒体文件响应与歌曲洗版的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export async function postMusicCacheDownload(context: RequestContext, runtime: DownloadServiceRuntime) {
  const { req, res } = context
  const { readBody, verifyUserAuth, fileCache } = runtime

        void readBody(req).then(body => {
          try {
            const { songInfo, url, quality, enableOnlyDownloadMode, namingPattern, cacheLyric, embedLyric, requestedSource, downloadSource, sourceName } = JSON.parse(body)
            if (!songInfo || !url) {
              res.writeHead(400)
              res.end('Missing params')
              return
            }

            // Fire and forget (background download) with Abort support
            const reqUsername = (req.headers['x-user-name'] as string) || ''
            const isPublic = !reqUsername || reqUsername === 'default'
            let username = '_open'

            if (!isPublic) {
              const verified = verifyUserAuth(req)
              if (!verified) {
                res.writeHead(401, { 'Content-Type': 'application/json' })
                res.end(JSON.stringify({ success: false, message: 'Unauthorized' }))
                return
              }
              username = verified
            }

            const auth = req.headers['x-frontend-auth']
            const isAdmin = auth === global.lx.config['frontend.password'] || username === 'admin'
            const enablePublicRestriction = global.lx.config['user.enablePublicRestriction']
            const isServerCacheAllowed = global.lx.config['user.enablePublicNonAdminServerCache'] !== false

            if (enablePublicRestriction && !isServerCacheAllowed && isPublic && !isAdmin) {
              res.writeHead(403, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ success: false, message: '权限限制：非管理员服务器缓存已被禁用' }))
              return
            }
            if (namingPattern) {
              const auth = req.headers['x-frontend-auth']
              if (auth === global.lx.config['frontend.password']) {
                const normalizedNamingPattern = fileCache.setNamingPattern(namingPattern)
                if (global.lx.config) global.lx.config['cache.namingPattern'] = normalizedNamingPattern
              }
            }
            const songKey = fileCache.normalizeSongId(songInfo) + '_' + (quality || 'unknown')

            console.log(`[文件缓存] 注册下载任务: ${songKey} (用户: "${username}")`)

            const controller = new AbortController()
            let userTasks = fileCache.activeTasks.get(username)
            if (!userTasks) {
              userTasks = []
              fileCache.activeTasks.set(username, userTasks)
            }
            userTasks.push({ songKey, controller })

            void fileCache.downloadAndCache(songInfo, url, quality, username, controller.signal, !!enableOnlyDownloadMode, cacheLyric !== false, embedLyric !== false, {
              requestedSource: requestedSource || songInfo.source,
              downloadSource,
              sourceName,
            })
              .then(() => console.log(`[文件缓存] 已成功下载 ${songInfo.name} (用户: ${username || '_open'})`))
              .catch((err: any) => {
                if (err.message === 'Aborted') {
                  console.log(`[文件缓存] 任务已取消: ${songInfo.name}`)
                } else {
                  console.error(`[文件缓存] 下载歌曲失败 (${songInfo.name}):`, err)
                }
              })
              .finally(() => {
                // Cleanup active task
                const tasks = fileCache.activeTasks.get(username)
                if (tasks) {
                  const idx = tasks.findIndex(t => t.songKey === songKey)
                  if (idx !== -1) {
                    tasks.splice(idx, 1)
                    console.log(`[文件缓存] 清理已完成任务: ${songKey} (用户: "${username}")`)
                  }
                }
              })

            res.writeHead(200)
            res.end(JSON.stringify({ success: true, message: 'Download started' }))
          } catch (e) {
            res.writeHead(500)
            res.end('Error')
          }
        })
        return

}

/**
 * 停止指定缓存下载任务。
 * @param context /api/music/cache/stop 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 自动下载、缓存目录维护、媒体文件响应与歌曲洗版的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export async function postMusicCacheStop(context: RequestContext, runtime: DownloadServiceRuntime) {
  const { req, res } = context
  const { verifyUserAuth, readBody, fileCache, serverDownloadQueue } = runtime

        const reqUsername = (req.headers['x-user-name'] as string) || ''
        const isPublic = !reqUsername || reqUsername === 'default'
        let username = '_open'

        if (!isPublic) {
          const verified = verifyUserAuth(req)
          if (!verified) {
            res.writeHead(401, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ success: false, message: 'Unauthorized' }))
            return
          }
          username = verified
        }
        void readBody(req).then(body => {
          try {
            const { songKey, queueId, all } = JSON.parse(body)
            if (all) {
              fileCache.stopUserTasks(username)
              serverDownloadQueue.pause(username)
              console.log(`[文件缓存] 已停止用户 ${username} 的所有下载任务`)
            } else if (queueId) {
              serverDownloadQueue.pause(username, queueId)
              console.log(`[文件缓存] 已暂停队列任务 ${queueId} (用户: ${username})`)
            } else if (songKey) {
              fileCache.stopUserTasks(username, songKey)
              console.log(`[文件缓存] 已停止任务 ${songKey} (用户: ${username})`)
            }
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ success: true }))
          } catch (e: any) {
            res.writeHead(400)
            res.end(e.message)
          }
        })
        return

}

/**
 * 返回服务器缓存音频，支持范围请求。
 * @param context /api/music/cache/file/ 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 自动下载、缓存目录维护、媒体文件响应与歌曲洗版的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export async function handleMusicCacheFile(context: RequestContext, runtime: DownloadServiceRuntime) {
  const { pathname, urlObj, req, res } = context
  const { verifyUserAuth, fileCache } = runtime

        const parts = pathname.replace('/api/music/cache/file/', '').split('/')
        const reqUsername = parts.length > 1 ? decodeURIComponent(parts[0]) : '_open'
        const filename = parts.length > 1 ? parts[1] : parts[0]

        if (filename) {
          let username = '_open'
          const isPublic = !reqUsername || reqUsername === '_open' || reqUsername === 'default'

          if (!isPublic) {
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
            username = verified
          }
          fileCache.serveCacheFile(req, res, decodeURIComponent(filename), username)
          return
        }

}

/**
 * 统计缓存歌曲数量与占用空间。
 * @param context /api/music/cache/stats 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 自动下载、缓存目录维护、媒体文件响应与歌曲洗版的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export async function getMusicCacheStats(context: RequestContext, runtime: DownloadServiceRuntime) {
  const { req, res } = context
  const { verifyUserAuth, fileCache } = runtime

        const reqUsername = (req.headers['x-user-name'] as string) || ''
        const isPublic = !reqUsername || reqUsername === 'default'
        let username = '_open'

        if (!isPublic) {
          const verified = verifyUserAuth(req)
          if (!verified) {
            res.writeHead(401, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ success: false, message: 'Unauthorized' }))
            return
          }
          username = verified
        }
        try {
          const stats = fileCache.getCacheStats(username)
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ success: true, data: stats }))
        } catch (e: any) {
          res.writeHead(500, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ success: false, message: e.message || 'Failed to get cache stats' }))
        }
        return

}

/**
 * 清理用户缓存歌曲及索引。
 * @param context /api/music/cache/clear 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 自动下载、缓存目录维护、媒体文件响应与歌曲洗版的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export async function postMusicCacheClear(context: RequestContext, runtime: DownloadServiceRuntime) {
  const { req, res } = context
  const { verifyUserAuth, fileCache } = runtime

        const reqUsername = (req.headers['x-user-name'] as string) || ''
        const isPublic = !reqUsername || reqUsername === 'default'
        let username = '_open'

        if (!isPublic) {
          const verified = verifyUserAuth(req)
          if (!verified) {
            res.writeHead(401, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ success: false, message: 'Unauthorized' }))
            return
          }
          username = verified
        }
        try {
          const result = fileCache.clearAllCache(username)
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ success: true, data: result }))
        } catch (e: any) {
          res.writeHead(500, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ success: false, message: e.message || 'Failed to clear cache' }))
        }
        return

}

/**
 * 清理用户缓存歌词。
 * @param context /api/music/cache/lyric/clear 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 自动下载、缓存目录维护、媒体文件响应与歌曲洗版的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export async function postMusicCacheLyricClear(context: RequestContext, runtime: DownloadServiceRuntime) {
  const { req, res } = context
  const { verifyUserAuth, fileCache } = runtime

        const reqUsername = (req.headers['x-user-name'] as string) || ''
        const isPublic = !reqUsername || reqUsername === 'default'
        let username = '_open'

        if (!isPublic) {
          const verified = verifyUserAuth(req)
          if (!verified) {
            res.writeHead(401, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ success: false, message: 'Unauthorized' }))
            return
          }
          username = verified
        }
        try {
          const result = fileCache.clearLyricCache(username)
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ success: true, data: result }))
        } catch (e: any) {
          res.writeHead(500, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ success: false, message: e.message || 'Failed to clear lyric cache' }))
        }
        return

}

/**
 * 查询缓存下载处理进度。
 * @param context /api/music/cache/progress 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 自动下载、缓存目录维护、媒体文件响应与歌曲洗版的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export async function getMusicCacheProgress(context: RequestContext, runtime: DownloadServiceRuntime) {
  const { urlObj, res } = context
  const { fileCache } = runtime

        const ids = urlObj.searchParams.get('ids')?.split(',') || []
        const progress: any = {}
        ids.forEach(id => {
          if (fileCache.cacheProgress.has(id)) {
            progress[id] = fileCache.cacheProgress.get(id)
          }
        })
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ success: true, data: progress }))
        return

}

/**
 * 返回缓存歌曲封面。
 * @param context /api/music/cache/cover 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 自动下载、缓存目录维护、媒体文件响应与歌曲洗版的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export async function getMusicCacheCover(context: RequestContext, runtime: DownloadServiceRuntime) {
  const { req, urlObj, res } = context
  const { verifyUserAuth, fileCache } = runtime

        const reqUsername = (req.headers['x-user-name'] as string) || urlObj.searchParams.get('user') || ''
        const isPublic = !reqUsername || reqUsername === '_open' || reqUsername === 'default'
        let username = '_open'

        if (!isPublic) {
          // <img src> 无法携带自定义请求头，允许从 URL ?token= 参数读取 Token 作为补偿
          const urlToken = urlObj.searchParams.get('token')
          if (urlToken && !req.headers['x-user-token']) {
            (req.headers as any)['x-user-token'] = urlToken
          }
          const verified = verifyUserAuth(req)
          if (!verified) {
            res.writeHead(401)
            res.end('Unauthorized')
            return
          }
          username = verified
        }
        const filename = urlObj.searchParams.get('filename')
        if (!filename) {
          res.writeHead(400)
          res.end('Missing filename')
          return
        }
        const location = urlObj.searchParams.get('location') || undefined
        if (location && ![fileCache.getCacheLocation(), 'data', 'root'].includes(location)) {
          res.writeHead(400); res.end('Invalid cache location'); return
        }
        const cover = await fileCache.getCacheCover(filename, username, { folder: urlObj.searchParams.get('folder') || undefined, location }) as any
        if (cover && cover.data) {
          res.writeHead(200, {
            'Content-Type': cover.mime || 'image/jpeg',
            'Cache-Control': 'public, max-age=86400'
          })
          res.end(cover.data)
        } else {
          // Fallback to logo or 404
          res.writeHead(404)
          res.end('Not Found')
        }
        return

}

/**
 * 删除指定缓存歌曲文件及索引。
 * @param context /api/music/cache/remove 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 自动下载、缓存目录维护、媒体文件响应与歌曲洗版的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export async function postMusicCacheRemove(context: RequestContext, runtime: DownloadServiceRuntime) {
  const { req, res } = context
  const { verifyUserAuth, readBody, fileCache, accessLog } = runtime

        const reqUsername = (req.headers['x-user-name'] as string) || ''
        const auth = req.headers['x-frontend-auth']
        const isAdmin = !!(auth && auth === global.lx.config['frontend.password'])
        const isPublic = !reqUsername || reqUsername === 'default' || reqUsername === '_open'
        let username = '_open'

        if (isPublic) {
          if (!isAdmin) {
            res.writeHead(403, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ success: false, message: '权限不足：删除公共本地歌曲需要验证管理员权限。' }))
            return
          }
        } else {
          const verified = verifyUserAuth(req)
          if (!verified) {
            res.writeHead(401, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ success: false, message: 'Unauthorized' }))
            return
          }
          username = verified
        }
        void readBody(req).then(body => {
          try {
            const payload = JSON.parse(body)
            const legacyFilenames = payload.filenames
            const rawItems = Array.isArray(payload.items)
              ? payload.items
              : (legacyFilenames ? (Array.isArray(legacyFilenames) ? legacyFilenames : [legacyFilenames]) : [])
            if (rawItems.length === 0) throw new Error('Missing items')

            const deleteItems: Array<{ /** 文件名称或完整路径。 */
filename: string; /** 缓存或下载目录类别。 */
folder?: cacheTypes.CacheFolder }> = rawItems.map((item: any) => {
              if (typeof item === 'string') return { filename: item }
              if (!item || typeof item.filename !== 'string') throw new Error('Invalid delete item')
              if (item.folder !== undefined && item.folder !== 'cache' && item.folder !== 'music') {
                throw new Error('Invalid folder')
              }
              return { filename: item.filename, folder: item.folder }
            })

            let deletedCount = 0
            const failures: Array<{ /** 文件名称或完整路径。 */
filename: string; /** 缓存或下载目录类别。 */
folder?: cacheTypes.CacheFolder; /** 处理结果或错误说明。 */
message: string }> = []
            for (const item of deleteItems) {
              try {
                const result = fileCache.removeCacheFile(item.filename, username, item.folder)
                if (result.deleted) {
                  deletedCount++
                  accessLog.info(`music file deleted user=${username} folder=${result.folder} filename=${JSON.stringify(item.filename)}`)
                } else {
                  failures.push({ ...item, message: 'File not found' })
                }
              } catch (error: any) {
                failures.push({ ...item, message: error?.message || 'Delete failed' })
                accessLog.warn(`music file delete rejected user=${username} folder=${item.folder || 'unspecified'} filename=${JSON.stringify(item.filename)} reason=${JSON.stringify(error?.message || 'Delete failed')}`)
              }
            }

            const success = failures.length === 0
            const statusCode = success ? 200 : (deletedCount > 0 ? 207 : 409)
            res.writeHead(statusCode, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({
              success,
              deletedCount,
              failedCount: failures.length,
              failures,
              message: success ? undefined : failures[0]?.message,
            }))
          } catch (e: any) {
            res.writeHead(400, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ success: false, message: e.message }))
          }
        })
        return

}

/**
 * 在缓存子目录之间移动歌曲。
 * @param context /api/music/cache/move 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 自动下载、缓存目录维护、媒体文件响应与歌曲洗版的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export async function postMusicCacheMove(context: RequestContext, runtime: DownloadServiceRuntime) {
  const { req, res } = context
  const { verifyUserAuth, readBody, fileCache } = runtime

        const reqUsername = (req.headers['x-user-name'] as string) || ''
        const isPublic = !reqUsername || reqUsername === 'default'
        let username = '_open'

        if (!isPublic) {
          const verified = verifyUserAuth(req)
          if (!verified) {
            res.writeHead(401)
            res.end(JSON.stringify({ success: false, message: 'Unauthorized' }))
            return
          }
          username = verified
        }

        void readBody(req).then(async body => {
          try {
            const { filenames } = JSON.parse(body)
            if (!filenames) throw new Error('Missing filenames')
            const fileList = Array.isArray(filenames) ? filenames : [filenames]

            const result = await fileCache.switchFolder(fileList, username)

            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ success: true, ...result }))
          } catch (e: any) {
            res.writeHead(400)
            res.end(e.message)
          }
        })
        return

}

/**
 * 迁移用户缓存到指定基础存储位置。
 * @param context /api/music/cache/switch-base 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 自动下载、缓存目录维护、媒体文件响应与歌曲洗版的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export async function postMusicCacheSwitchBase(context: RequestContext, runtime: DownloadServiceRuntime) {
  const { req, res } = context
  const { verifyUserAuth, readBody, fileCache } = runtime

        const reqUsername = (req.headers['x-user-name'] as string) || ''
        const isPublic = !reqUsername || reqUsername === 'default'
        let username = '_open'

        if (!isPublic) {
          const verified = verifyUserAuth(req)
          if (!verified) {
            res.writeHead(401)
            res.end(JSON.stringify({ success: false, message: 'Unauthorized' }))
            return
          }
          username = verified
        }

        void readBody(req).then(async body => {
          try {
            const { filenames } = JSON.parse(body)
            if (!filenames) throw new Error('Missing filenames')
            const fileList = Array.isArray(filenames) ? filenames : [filenames]

            const result = await fileCache.switchBaseLocation(fileList, username)

            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ success: true, ...result }))
          } catch (e: any) {
            res.writeHead(400)
            res.end(e.message)
          }
        })
        return

}

/**
 * 更新缓存歌曲的文件元信息。
 * @param context /api/music/cache/updateMetadata 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 自动下载、缓存目录维护、媒体文件响应与歌曲洗版的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export async function postMusicCacheUpdateMetadata(context: RequestContext, runtime: DownloadServiceRuntime) {
  const { req, res } = context
  const { verifyUserAuth, readBody, fileCache } = runtime

        const reqUsername = (req.headers['x-user-name'] as string) || ''
        const isPublic = !reqUsername || reqUsername === 'default'
        let username = '_open'

        if (!isPublic) {
          const verified = verifyUserAuth(req)
          if (!verified) {
            res.writeHead(401, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ success: false, message: 'Unauthorized' }))
            return
          }
          username = verified
        }
        void readBody(req).then(async body => {
          try {
            const { filenames } = JSON.parse(body)
            if (!filenames) throw new Error('Missing filenames')

            const fileList = Array.isArray(filenames) ? filenames : [filenames]
            const result = await fileCache.batchUpdateMetadata(fileList, username)

            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ success: true, ...result }))
          } catch (e: any) {
            res.writeHead(400)
            res.end(e.message)
          }
        })
        return

}

/**
 * 读取缓存歌曲内嵌歌词。
 * @param context /api/music/cache/embedLyric 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 自动下载、缓存目录维护、媒体文件响应与歌曲洗版的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export async function getMusicCacheEmbedLyric(context: RequestContext, runtime: DownloadServiceRuntime) {
  const { req, res, urlObj } = context
  const { verifyUserAuth, fileCache, path, storageFs } = runtime

        const reqUsername = (req.headers['x-user-name'] as string) || ''
        const isPublic = !reqUsername || reqUsername === 'default'
        let username = '_open'
        if (!isPublic) {
          const verified = verifyUserAuth(req)
          if (!verified) {
            res.writeHead(401, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ success: false, message: 'Unauthorized' }))
            return
          }
          username = verified
        }
        const filename = urlObj.searchParams.get('filename') || ''
        const folder = (urlObj.searchParams.get('folder') || 'cache') as 'cache' | 'music'
        if (!filename) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ success: false, message: 'Missing filename' }))
          return
        }
        try {
          const dir = fileCache.getCacheDir(username, folder === 'music')
          const filePath = path.join(dir, filename)
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
 * 向缓存歌曲文件写入内嵌歌词。
 * @param context /api/music/cache/embedLyric 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 自动下载、缓存目录维护、媒体文件响应与歌曲洗版的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export async function postMusicCacheEmbedLyric(context: RequestContext, runtime: DownloadServiceRuntime) {
  const { req, res } = context
  const { verifyUserAuth, readBody, fileCache, path, storageFs } = runtime

        const reqUsername = (req.headers['x-user-name'] as string) || ''
        const isPublic = !reqUsername || reqUsername === 'default'
        let username = '_open'

        if (!isPublic) {
          const verified = verifyUserAuth(req)
          if (!verified) {
            res.writeHead(401, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ success: false, message: 'Unauthorized' }))
            return
          }
          username = verified
        }

        void readBody(req).then(async body => {
          try {
            const { filenames } = JSON.parse(body)
            if (!filenames || !Array.isArray(filenames)) throw new Error('Missing filenames')

            let successCount = 0
            let skippedCount = 0
            let failCount = 0
            const details: any[] = []

            for (const filename of filenames) {
              let filePath = ''
              let folder: 'cache' | 'music' = 'cache'

              // 在 cache 和 music 两个目录中查找文件
              for (const f of ['cache', 'music'] as const) {
                const dir = fileCache.getCacheDir(username, f === 'music')
                const candidate = path.join(dir, filename)
                if (storageFs.existsSync(candidate)) {
                  filePath = candidate
                  folder = f
                  break
                }
              }

              if (!filePath) {
                details.push({ filename, status: 'fail', reason: '文件不存在' })
                failCount++
                continue
              }

              try {
                const indexItem = fileCache.getIndexItemByFilename(filename, username) as any
                if (indexItem?.metadataWritable === false) {
                  details.push({ filename, status: 'fail', reason: indexItem.embedLyricError || indexItem.metadataError || '当前音频容器不支持嵌入歌词，外置歌词文件仍可正常使用' })
                  failCount++
                  continue
                }

                // 检查是否已有 USLT 歌词（已有则跳过）
                const { MusicTagger: MT } = require('music-tag-native')
                let checkTagger: any
                let existingLyrics = ''
                try {
                  checkTagger = new MT()
                  checkTagger.loadPath(filePath)
                  existingLyrics = checkTagger.lyrics || ''
                } catch (checkError: any) {
                  const unsupportedStatus = fileCache.getAudioMetadataUnsupportedStatus(filePath)
                  fileCache.setIndexEmbedLyric(filename, username, false, {
                    audioContainer: unsupportedStatus.audioContainer,
                    metadataWritable: false,
                    metadataError: unsupportedStatus.error,
                    embedLyricError: unsupportedStatus.error,
                  })
                  details.push({ filename, status: 'fail', reason: unsupportedStatus.error || '当前音频容器不支持嵌入歌词，外置歌词文件仍可正常使用' })
                  failCount++
                  continue
                } finally {
                  try { if (checkTagger) checkTagger.dispose() } catch (e) { }
                }

                if (existingLyrics && existingLyrics.trim().length > 10) {
                  details.push({ filename, status: 'skipped', reason: '已有歌词标签' })
                  skippedCount++
                  continue
                }

                // 从索引中获取 songInfo（索引条目本身就包含 source/songmid 等字段）
                const songInfo = indexItem

                // 优先读同名 .lrc 文件
                const ext = path.extname(filename)
                const baseName = filename.slice(0, filename.length - ext.length)
                const lrcFilename = baseName + '.lrc'
                const dir = fileCache.getCacheDir(username, folder === 'music')
                const lrcPath = path.join(dir, lrcFilename)

                let lyricText: string | null = null

                if (storageFs.existsSync(lrcPath)) {
                  lyricText = storageFs.readFileSync(lrcPath, 'utf8')
                  console.log(`[嵌入歌词] 正在使用本地 .lrc 文件: ${filename}`)
                } else if (songInfo && songInfo.source && songInfo.source !== 'unknown' && songInfo.source !== 'local') {
                  // 没有 .lrc 文件，尝试通过 SDK 获取
                  const lyricFetcherFn = fileCache.getLyricFetcher()
                  if (lyricFetcherFn) {
                    lyricText = await lyricFetcherFn(songInfo)
                  }
                  if (lyricText) {
                    console.log(`[嵌入歌词] 从音源获取到歌词: ${filename}`)
                  }
                }

                if (!lyricText) {
                  details.push({ filename, status: 'fail', reason: '无法获取歌词' })
                  failCount++
                  continue
                }

                const embedResult = fileCache.embedLyricsIntoFile(filePath, lyricText)
                fileCache.setIndexEmbedLyric(filename, username, embedResult.hasEmbedLyric, {
                  audioContainer: embedResult.audioContainer,
                  metadataWritable: embedResult.metadataWritable,
                  metadataError: embedResult.metadataWritable ? undefined : embedResult.error,
                  embedLyricError: embedResult.error,
                })
                if (!embedResult.success) {
                  details.push({ filename, status: 'fail', reason: embedResult.error || '歌词标签写入后校验失败，外置歌词文件仍可正常使用' })
                  failCount++
                  continue
                }

                details.push({ filename, status: 'success' })
                successCount++
                console.log(`[嵌入歌词] 歌词已成功写入文件: ${filename}`)
              } catch (itemErr: any) {
                details.push({ filename, status: 'fail', reason: itemErr.message || '未知错误' })
                failCount++
              }
            }

            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ success: true, successCount, skippedCount, failCount, details }))
          } catch (e: any) {
            res.writeHead(400, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ success: false, message: e.message }))
          }
        })
        return

}

/**
 * 为缓存歌曲关联平台元信息。
 * @param context /api/music/cache/link 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 自动下载、缓存目录维护、媒体文件响应与歌曲洗版的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export async function postMusicCacheLink(context: RequestContext, runtime: DownloadServiceRuntime) {
  const { req, res } = context
  const { verifyUserAuth, readBody, fileCache } = runtime

        const verified = verifyUserAuth(req)
        if (!verified) {
          res.writeHead(401, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ success: false, message: 'Unauthorized' }))
          return
        }

        void readBody(req).then(async body => {
          try {
            const { filename, songInfo } = JSON.parse(body)
            if (!filename || !songInfo) {
              res.writeHead(400)
              res.end('Missing params')
              return
            }

            const result = await fileCache.linkLocalFile(filename, songInfo, verified)
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
 * 读取用户歌曲的缓存歌词。
 * @param context /api/music/cache/lyric 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 自动下载、缓存目录维护、媒体文件响应与歌曲洗版的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export async function getMusicCacheLyric(context: RequestContext, runtime: DownloadServiceRuntime) {
  const { urlObj, req, res } = context
  const { verifyUserAuth, fileCache } = runtime

        const source = urlObj.searchParams.get('source')
        const songmid = urlObj.searchParams.get('songmid') || urlObj.searchParams.get('songId') || urlObj.searchParams.get('id')
        const songId = urlObj.searchParams.get('songId') || urlObj.searchParams.get('id')

        const reqUsername = (req.headers['x-user-name'] as string) || ''
        const isPublic = !reqUsername || reqUsername === 'default'
        let username = '_open'

        if (!isPublic) {
          const verified = verifyUserAuth(req)
          if (!verified) {
            res.writeHead(401, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ success: false, message: 'Unauthorized' }))
            return
          }
          username = verified
        }

        if (!source || (!songmid && !songId)) {
          res.writeHead(400)
          res.end('Missing source or songmid')
          return
        }

        const name = urlObj.searchParams.get('name') || ''
        const singer = urlObj.searchParams.get('singer') || ''
        const result = fileCache.checkLyricCache({ source, songmid, id: songId, name, singer }, username)
        if (result.exists) {
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ success: true, data: result.content }))
        } else {
          res.writeHead(404, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ success: false, message: 'Not found in cache' }))
        }
        return

}

/**
 * 保存用户歌曲的缓存歌词。
 * @param context /api/music/cache/lyric 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 自动下载、缓存目录维护、媒体文件响应与歌曲洗版的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export async function postMusicCacheLyric(context: RequestContext, runtime: DownloadServiceRuntime) {
  const { req, res } = context
  const { readBody, verifyUserAuth, customMusicManager, fileCache } = runtime

        void readBody(req).then(body => {
          try {
            const { songInfo, lyricsObj, enableOnlyDownloadMode } = JSON.parse(body)
            const reqUsername = (req.headers['x-user-name'] as string) || ''
            const isPublic = !reqUsername || reqUsername === 'default'
            let username = '_open'

            if (!isPublic) {
              const verified = verifyUserAuth(req)
              if (!verified) {
                res.writeHead(401, { 'Content-Type': 'application/json' })
                res.end(JSON.stringify({ success: false, message: 'Unauthorized' }))
                return
              }
              username = verified
            }

            if (!songInfo || !lyricsObj) {
              res.writeHead(400)
              res.end('Missing parameters')
              return
            }

            let success = false
            if (songInfo?.folder === 'custom') {
              success = customMusicManager.saveCustomLyricCache(songInfo, lyricsObj, username)
            } else {
              success = fileCache.saveLyricCache(songInfo, lyricsObj, username, !!enableOnlyDownloadMode)
              if (!success) {
                // 如果在常规缓存没找到，尝试在自定义目录匹配
                success = customMusicManager.saveCustomLyricCache(songInfo, lyricsObj, username)
              }
            }
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ success }))
          } catch (e: any) {
            res.writeHead(500)
            res.end('Server internal error')
          }
        })
        return

}

/**
 * 代理下载远端音频，可按请求写入标签并返回文件。
 * @param context /api/music/download 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 自动下载、缓存目录维护、媒体文件响应与歌曲洗版的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export async function getMusicDownload(context: RequestContext, runtime: DownloadServiceRuntime) {
  const { urlObj, res, req } = context
  const { fileCache, path, os, crypto, storageFs, MusicTagger, MetaPicture, musicSdk } = runtime

        const urlStr = urlObj.searchParams.get('url')
        const filename = urlObj.searchParams.get('filename') || 'download.mp3'
        const isInline = urlObj.searchParams.get('inline') === '1'

        if (!urlStr) {
          res.writeHead(400)
          res.end('Missing url param')
          return
        }

        try {
          const isTaggingMode = urlObj.searchParams.get('tag') === '1'
          const taskId = urlObj.searchParams.get('taskId')
          console.log(`[下载代理] 正在获取音频流: ${urlStr} (写入标签: ${isTaggingMode}, 任务ID: ${taskId})`)

          // 使用原生 http/https 模块以获得最高的流媒体转发性能
          const http = require('http')
          const https = require('https')

          // Manual redirect handling for maximum control and stability
          const doFetch = (targetUrl: string, attempt: number) => {
            if (attempt > 5) {
              console.error('[下载代理] 触发过多重定向，已终止')
              if (!res.headersSent) {
                res.writeHead(502)
                res.end('Too Many Redirects')
              }
              return
            }

            try {
              const parsedUrl = new URL(targetUrl)
              const options: any = {
                method: 'GET',
                headers: {
                  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                  'Referer': parsedUrl.origin
                }
              }

              // 转发 Range 请求头，以支持播放器的快进和拖拽
              if (req.headers['range']) {
                options.headers['Range'] = req.headers['range']
              }

              const lib = parsedUrl.protocol === 'https:' ? https : http

              const proxyReq = lib.request(targetUrl, options, (proxyRes: any) => {
                // 处理重定向
                if ([301, 302, 303, 307, 308].includes(proxyRes.statusCode)) {
                  const location = proxyRes.headers.location
                  if (location) {
                    const nextUrl = location.startsWith('http') ? location : new URL(location, targetUrl).href
                    doFetch(nextUrl, attempt + 1)
                    return
                  }
                }

                // 处理最终响应
                let contentType = proxyRes.headers['content-type'] || 'application/octet-stream'
                if (contentType.includes('audio/') || contentType.includes('video/')) {
                  contentType = contentType.split(';')[0].trim()
                }

                const headers: Record<string, string | string[] | undefined> = {
                  'Content-Type': contentType,
                  'Access-Control-Allow-Origin': '*',
                }

                if (proxyRes.headers['content-length']) headers['Content-Length'] = proxyRes.headers['content-length']
                if (proxyRes.headers['accept-ranges']) headers['Accept-Ranges'] = proxyRes.headers['accept-ranges']
                if (proxyRes.headers['content-range']) headers['Content-Range'] = proxyRes.headers['content-range']

                if (!isInline) {
                  headers['Content-Disposition'] = `attachment; filename="${encodeURIComponent(filename)}"`
                }

                // [Unified metadata] Tagging support for browser download
                // NOTE: Local fetch from browser often sends Range: bytes=0- for full download
                const rangeHeader = req.headers['range']
                const isFullRange = rangeHeader === 'bytes=0-'

                if (isTaggingMode && (!rangeHeader || isFullRange)) {
                  const songName = urlObj.searchParams.get('name') || ''
                  const artist = urlObj.searchParams.get('singer') || ''
                  const album = urlObj.searchParams.get('album') || ''
                  const imageUrl = urlObj.searchParams.get('pic') || ''
                  // [新增] 浏览器下载歌词嵌入参数
                  const embedLyric = urlObj.searchParams.get('lyric') === '1'
                  const lyricSource = urlObj.searchParams.get('source') || ''
                  const lyricSongmid = urlObj.searchParams.get('songmid') || ''
                  const lyricHash = urlObj.searchParams.get('hash') || ''
                  const lyricInterval = urlObj.searchParams.get('interval') || ''

                  const chunks: any[] = []
                  let received = 0
                  const total = parseInt(proxyRes.headers['content-length'] as string || '0', 10)
                  let lastSpeedAt = Date.now()
                  let lastSpeedBytes = 0
                  let currentSpeed = 0

                  if (taskId) {
                    fileCache.cacheProgress.set(taskId, { progress: 0, status: 'downloading', total, received: 0, speed: 0, updatedAt: Date.now() })
                    serverEvents.emitEvent('download:proxy-progress', { username: runtime.verifyUserAuth(req) || '_open', taskId, data: fileCache.cacheProgress.get(taskId)! })
                  }

                  proxyRes.on('data', (c: any) => {
                    chunks.push(c)
                    if (taskId) {
                      received += c.length
                      const now = Date.now()
                      if (now - lastSpeedAt >= 1000) {
                        currentSpeed = Math.max(0, (received - lastSpeedBytes) / ((now - lastSpeedAt) / 1000))
                        lastSpeedAt = now
                        lastSpeedBytes = received
                      }
                      const progress = total > 0 ? Math.round((received / total) * 100) : 0
                      fileCache.cacheProgress.set(taskId, { progress, status: 'downloading', total, received, speed: currentSpeed, updatedAt: now })
                      serverEvents.emitEvent('download:proxy-progress', { username: runtime.verifyUserAuth(req) || '_open', taskId, data: fileCache.cacheProgress.get(taskId)! })
                    }
                  })
                  proxyRes.on('end', async () => {
                    if (taskId) {
                      fileCache.cacheProgress.set(taskId, { progress: 100, status: 'tagging', total, received, speed: 0, updatedAt: Date.now() })
                      serverEvents.emitEvent('download:proxy-progress', { username: runtime.verifyUserAuth(req) || '_open', taskId, data: fileCache.cacheProgress.get(taskId)! })
                    }
                    const finishProgress = () => {
                      if (!taskId) return
                      fileCache.cacheProgress.set(taskId, { progress: 100, status: 'finished', total: total || received, received, speed: 0, updatedAt: Date.now() })
                      serverEvents.emitEvent('download:proxy-progress', { username: runtime.verifyUserAuth(req) || '_open', taskId, data: fileCache.cacheProgress.get(taskId)! })
                      setTimeout(() => fileCache.cacheProgress.delete(taskId), 30000)
                    }
                    let tempPath = ''
                    let tagger: any = null
                    try {
                      const buffer = Buffer.concat(chunks)
                      if (buffer.length < 100) throw new Error('File too small, possibly invalid');

                      // Use filename extension for temp file so MusicTagger can identify container format
                      const ext = path.extname(filename) || '.mp3'
                      tempPath = path.join(os.tmpdir(), `lx_tag_${Date.now()}_${crypto.randomBytes(8).toString('hex')}${ext}`)
                      storageFs.writeFileSync(tempPath, new Uint8Array(buffer))

                      tagger = new MusicTagger()
                      tagger.loadPath(tempPath)
                      if (songName) tagger.title = songName
                      if (artist) tagger.artist = artist
                      if (album) tagger.album = album

                      if (imageUrl) {
                        try {
                          let imgBuf: Buffer | null = null;
                          if (imageUrl.startsWith('http')) {
                            const imgResp = await (global as any).fetch(imageUrl)
                            if (imgResp.ok) imgBuf = Buffer.from(await imgResp.arrayBuffer())
                          } else if (imageUrl.startsWith('/api')) {
                            // 内部 API 请求，使用请求头中的 host
                            const hostLabel = req.headers.host || '127.0.0.1:2026'
                            const internalUrl = `http://${hostLabel}${imageUrl}`
                            const imgResp = await (global as any).fetch(internalUrl)
                            if (imgResp.ok) imgBuf = Buffer.from(await imgResp.arrayBuffer())
                          }

                          if (imgBuf && imgBuf.length > 0) {
                            try {
                              // music-tag-native signature: (mime, data, type)
                              tagger.pictures = [new MetaPicture('image/jpeg', new Uint8Array(imgBuf), 'Cover')]
                            } catch (picErr) {
                              console.warn('[下载代理] 封面标签创建失败:', picErr)
                            }
                          }
                        } catch (e: any) {
                          console.warn('[下载代理] 获取或嵌入封面失败:', imageUrl, e.message)
                        }
                      }
                      // [新增] 嵌入歌词 USLT 标签：SDK 返回 { promise, cancel }，必须 await .promise
                      if (embedLyric && lyricSource && lyricSongmid && musicSdk[lyricSource]?.getLyric) {
                        try {
                          const lyricReqObj = musicSdk[lyricSource].getLyric({
                            songmid: lyricSongmid,
                            name: songName,
                            singer: artist,
                            hash: lyricHash,
                            interval: lyricInterval,
                          })
                          const lyricResult = await lyricReqObj.promise
                          const lyricText = lyricResult?.lyric || lyricResult?.lrc || ''
                          if (lyricText) tagger.lyrics = lyricText
                        } catch (e) { /* 歌词获取失败不影响下载 */ }
                      }
                      tagger.save()
                      console.log('[下载代理] 音频元数据标签保存成功:', songName)
                      tagger.dispose()
                      tagger = null

                      const tagged = storageFs.readFileSync(tempPath)
                      headers['Content-Length'] = tagged.length.toString()
                      if (!res.headersSent) {
                        res.writeHead(200, headers)
                        res.end(tagged)
                      }
                      finishProgress()
                    } catch (e: any) {
                      if (!res.headersSent) {
                        res.writeHead(200, headers)
                        res.end(Buffer.concat(chunks))
                      }
                      finishProgress()
                    } finally {
                      if (tagger) tagger.dispose()
                      if (tempPath) storageFs.unlink(tempPath, () => { })
                    }
                  })
                  return
                }

                if (!res.headersSent) {
                  res.writeHead(proxyRes.statusCode || 200, headers)
                  proxyRes.pipe(res)
                }
              })

              proxyReq.on('error', (err: any) => {
                console.error('[下载代理] 请求异常:', err)
                if (!res.headersSent) {
                  res.writeHead(502)
                  res.end('Request Error')
                }
              })

              // 如果客户端（浏览器）中止了请求（例如：用户拖拽进度条、切换歌曲等），应该立刻销毁上游的下载请求，防止持续占用服务器下行带宽
              req.on('close', () => {
                if (!proxyReq.destroyed) {
                  proxyReq.destroy()
                }
              })

              proxyReq.end()

            } catch (err: any) {
              console.error('[下载代理] 代理请求捕获异常:', err)
              if (!res.headersSent) {
                res.writeHead(500)
                res.end('Internal Server Error')
              }
            }
          }

          // Start the fetch process
          doFetch(urlStr, 0)

        } catch (err: any) {
          console.error('[下载代理] 发生错误:', err)
          res.writeHead(500)
          res.end('Server Error')
        }
        return

}
