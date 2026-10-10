import type { RequestContext, ServerRuntime } from '../../common/http/RequestContext'
/** Settings 服务所需能力，仅允许访问本模块使用的依赖。 @author yahyaoo */
export type SettingsServiceRuntime = Pick<ServerRuntime, 'verifyUserAuth' | 'readBody' | 'getSyncDownloadData' | 'saveSyncDownloadData' | 'getUserSpace' | 'path' | 'File' | 'storageFs' | 'scheduler'>
/** Settings 业务服务，原路由处理顺序与错误响应保持不变。 @author yahyaoo */

/**
 * 处理 /api/user/sync-download/settings 请求，保留原协议及权限判断。
 * @param context 原 HTTP 上下文。
 * @param runtime 应用装配的依赖能力。
 * @returns 原处理过程的完成结果。
 * @author yahyaoo
 */
export async function putUserSyncDownloadSettings(context: RequestContext, runtime: SettingsServiceRuntime) {
  const { req, res } = context
  const { verifyUserAuth, readBody, getSyncDownloadData, saveSyncDownloadData } = runtime

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
        void readBody(req).then(async body => {
          try {
            const payload = JSON.parse(body)
            const syncData = getSyncDownloadData(username!)
            if (typeof payload.enabled === 'boolean') syncData.enabled = payload.enabled
            if (typeof payload.preferredQuality === 'string' && ['128k', '320k', 'flac', 'flac24bit'].includes(payload.preferredQuality)) {
              syncData.preferredQuality = payload.preferredQuality
            }
            if (typeof payload.downloadLyric === 'boolean') syncData.downloadLyric = payload.downloadLyric
            if (typeof payload.embedLyric === 'boolean') syncData.embedLyric = payload.embedLyric
            if (payload.playlists && typeof payload.playlists === 'object') {
              for (const [id, cfg] of Object.entries(payload.playlists) as any) {
                if (!syncData.playlists[id]) {
                  syncData.playlists[id] = { enabled: false, lastSyncTime: null, failedSongs: [] }
                }
                if (typeof cfg.enabled === 'boolean') syncData.playlists[id].enabled = cfg.enabled
              }
            }
            saveSyncDownloadData(username!, syncData)
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ success: true }))
          } catch (e: any) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ success: false, message: e.message })) }
        })
        return

}

/**
 * 处理 /api/user/settings 请求，保留原协议及权限判断。
 * @param context 原 HTTP 上下文。
 * @param runtime 应用装配的依赖能力。
 * @returns 原处理过程的完成结果。
 * @author yahyaoo
 */
export async function getUserSettings(context: RequestContext, runtime: SettingsServiceRuntime) {
  const { req, res } = context
  const { verifyUserAuth, getUserSpace, path, File, storageFs } = runtime

        const reqUsername = req.headers['x-user-name'] as string
        const isPublic = !reqUsername || reqUsername === 'default'
        let resolvedUsername: string | null = null

        if (isPublic && global.lx.config['user.enablePublicRestriction']) {
          resolvedUsername = '_open' // 公开受限用户允许访问 _open 空间
        } else {
          resolvedUsername = verifyUserAuth(req)
          if (!resolvedUsername) {
            res.writeHead(401, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ success: false, message: 'Unauthorized' }))
            return
          }
        }

        const userSpace = getUserSpace(resolvedUsername)
        const settingsPath = path.join(userSpace.dataManage.userDir, File.userSettingsJSON)

        if (storageFs.existsSync(settingsPath)) {
          const settingsData = storageFs.readFileSync(settingsPath, 'utf8')
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(settingsData)
        } else {
          // Return empty object instead of 404 to avoid console error on fresh installs
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end('{}')
        }
        return

}

/**
 * 处理 /api/user/settings 请求，保留原协议及权限判断。
 * @param context 原 HTTP 上下文。
 * @param runtime 应用装配的依赖能力。
 * @returns 原处理过程的完成结果。
 * @author yahyaoo
 */
export async function postUserSettings(context: RequestContext, runtime: SettingsServiceRuntime) {
  const { req, res } = context
  const { verifyUserAuth, readBody, getUserSpace, path, File, storageFs, scheduler } = runtime

        const reqUsername = req.headers['x-user-name'] as string
        const isPublic = !reqUsername || reqUsername === 'default'
        let resolvedUsername: string | null = null

        if (isPublic) {
          // 公开用户：若开启了限制，需要管理员密码
          if (global.lx.config['user.enablePublicRestriction']) {
            const auth = req.headers['x-frontend-auth']
            if (auth !== global.lx.config['frontend.password']) {
              res.writeHead(403, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ success: false, error: '权限不足：公共用户保存设置受限，请先验证管理员身份。' }))
              return
            }
          }
          resolvedUsername = '_open'
        } else {
          resolvedUsername = verifyUserAuth(req)
          if (!resolvedUsername) {
            res.writeHead(401, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ success: false, message: 'Unauthorized' }))
            return
          }
        }

        void readBody(req).then(body => {
          try {
            const userSpace = getUserSpace(resolvedUsername!)
            const settingsPath = path.join(userSpace.dataManage.userDir, File.userSettingsJSON)

            let settings = JSON.parse(body)

            // [核心逻辑] 如果是受限的公开用户，仅允许保存特定的 3 项设置
            if (resolvedUsername === '_open' && global.lx.config['user.enablePublicRestriction']) {
              const restrictedSettings: any = {}
              const allowedKeys = ['enableServerCache', 'enableServerLyricCache', 'serverCacheLocation', 'serverCacheNamingPattern', 'downloadConcurrency', 'enableRemaster', 'preferredQuality', 'enableOnlyDownloadMode', 'enablePublicSources', 'embedLyricToFile', 'preferServerCache']
              allowedKeys.forEach(key => {
                if (settings[key] !== undefined) restrictedSettings[key] = settings[key]
              })
              settings = restrictedSettings
            }

            storageFs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8')

            // 如果更新了网络歌单自动检测设置，同步更新后台任务调度器
            if (settings.networkListAutoCheckInterval !== undefined || settings.autoUpdateNetworkList !== undefined) {
              const taskConfig: { /**
 * intervalMs 字段，沿用原业务结构与空值约定。
 */
intervalMs?: number; /**
 * enabled 字段，沿用原业务结构与空值约定。
 */
enabled?: boolean } = {}
              if (settings.networkListAutoCheckInterval !== undefined) {
                const ms = scheduler.parseIntervalMs(settings.networkListAutoCheckInterval)
                if (ms) taskConfig.intervalMs = ms
              }
              if (settings.autoUpdateNetworkList !== undefined) {
                taskConfig.enabled = !!settings.autoUpdateNetworkList
              }
              scheduler.updateTaskConfig('network_list_autocheck', taskConfig)
            }

            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ success: true }))
          } catch (err: any) {
            res.writeHead(400)
            res.end('Invalid JSON data')
          }
        })
        return

}

/**
 * 处理 /api/user/sound-effects 请求，保留原协议及权限判断。
 * @param context 原 HTTP 上下文。
 * @param runtime 应用装配的依赖能力。
 * @returns 原处理过程的完成结果。
 * @author yahyaoo
 */
export async function getUserSoundEffects(context: RequestContext, runtime: SettingsServiceRuntime) {
  const { req, res } = context
  const { verifyUserAuth, getUserSpace, path, File, storageFs } = runtime

        const username = verifyUserAuth(req)
        if (!username) {
          res.writeHead(401, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ success: false, message: 'Unauthorized' }))
          return
        }

        const userSpace = getUserSpace(username)
        const soundEffectsPath = path.join(userSpace.dataManage.userDir, File.userSoundEffectsJSON)

        if (storageFs.existsSync(soundEffectsPath)) {
          const soundEffectsData = storageFs.readFileSync(soundEffectsPath, 'utf8')
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(soundEffectsData)
        } else {
          // Return empty object instead of 404 to avoid console error on fresh installs
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end('{}')
        }
        return

}

/**
 * 处理 /api/user/sound-effects 请求，保留原协议及权限判断。
 * @param context 原 HTTP 上下文。
 * @param runtime 应用装配的依赖能力。
 * @returns 原处理过程的完成结果。
 * @author yahyaoo
 */
export async function postUserSoundEffects(context: RequestContext, runtime: SettingsServiceRuntime) {
  const { req, res } = context
  const { verifyUserAuth, readBody, getUserSpace, path, File, storageFs } = runtime

        const username = verifyUserAuth(req)
        if (!username) {
          res.writeHead(401, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ success: false, message: 'Unauthorized' }))
          return
        }

        void readBody(req).then(body => {
          try {
            const userSpace = getUserSpace(username)
            const soundEffectsPath = path.join(userSpace.dataManage.userDir, File.userSoundEffectsJSON)

            // Validate JSON
            JSON.parse(body)

            storageFs.writeFileSync(soundEffectsPath, body, 'utf8')
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ success: true }))
          } catch (err: any) {
            res.writeHead(400)
            res.end('Invalid JSON data')
          }
        })
        return

}
