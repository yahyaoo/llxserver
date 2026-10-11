import { additionalConfigurationFields, validateAdditionalConfiguration } from './configuration/SystemConfigurationFields'
import type { ConfigurationImportDto } from '../model/dto/ConfigurationImportDto'
import { SystemConfigurationImportService } from './configuration/SystemConfigurationImportService'
import { repositories } from '../../application/persistence/storage'
import type { RequestContext, ServerRuntime } from '../../common/http/RequestContext'
/** 系统配置、旧配置导入、本地配置备份与代理连接测试所需的应用依赖契约。 @author yahyaoo */
export type ConfigurationServiceRuntime = Pick<ServerRuntime, 'serverDownloads' | 'appUpdates' | 'path' | 'readBody' | 'validateCustomDirectoryUpdates' | 'storageFs' | 'saveUsers' | 'getSyncDownloadData' | 'migrateSyncStorage' | 'updateAllUserSnapshotDirs' | 'reloadServerData' | 'needle' | 'databaseLocation'>
/** 系统配置、旧配置导入、本地配置备份与代理连接测试服务。 @author yahyaoo */

/**
 * 读取或保存系统配置；业务字段写管理库，数据库位置写引导文件。
 * @param context /api/config 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 系统配置、旧配置导入、本地配置备份与代理连接测试的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export async function handleConfig(context: RequestContext, runtime: ConfigurationServiceRuntime) {
  const { req, res } = context
  const { serverDownloads, appUpdates, path, readBody, validateCustomDirectoryUpdates, storageFs, saveUsers, getSyncDownloadData, migrateSyncStorage, updateAllUserSnapshotDirs } = runtime

        const auth = req.headers['x-frontend-auth']
        if (auth !== global.lx.config['frontend.password']) {
          res.writeHead(401)
          res.end('Unauthorized')
          return
        }

        if (req.method === 'GET') {
          const config = {
            ...Object.fromEntries(Object.entries(global.lx.config).filter(([key]) => key !== "users" && key !== "update.token")),
            ...runtime.databaseLocation.paths(),
            additionalFields: additionalConfigurationFields,
            serverName: global.lx.config.serverName,
            'download.directory': global.lx.config['download.directory'] || '',
            'download.lyricMode': global.lx.config['download.lyricMode'] || 'embedded',
            'download.nameTemplate': global.lx.config['download.nameTemplate'] || serverDownloads.DEFAULT_NAME_TEMPLATE,
            'update.enabled': global.lx.config['update.enabled'] === true,
            'update.server': global.lx.config['update.server'] || appUpdates.DEFAULT_UPDATE_SERVER,
            'update.hasToken': !!global.lx.config['update.token'],
            'debug.enabled': global.lx.config['debug.enabled'] || false,
            maxSnapshotNum: global.lx.config.maxSnapshotNum,
            'list.addMusicLocationType': global.lx.config['list.addMusicLocationType'],
            'proxy.enabled': global.lx.config['proxy.enabled'],
            'proxy.header': global.lx.config['proxy.header'],
            'user.enablePath': global.lx.config['user.enablePath'],
            'user.enableRoot': global.lx.config['user.enableRoot'],
            'user.enablePublicRestriction': global.lx.config['user.enablePublicRestriction'],
            'user.enablePublicNonAdminLocalMusic': global.lx.config['user.enablePublicNonAdminLocalMusic'],
            'user.enablePublicNonAdminBrowserDownload': global.lx.config['user.enablePublicNonAdminBrowserDownload'] ?? true,
            'user.enablePublicNonAdminServerCache': global.lx.config['user.enablePublicNonAdminServerCache'] ?? false,
            'user.enablePublicFavorites': global.lx.config['user.enablePublicFavorites'],
            'user.enablePublicNonAdminAccess': global.lx.config['user.enablePublicNonAdminAccess'],
            'user.enableCustomMusicDir': global.lx.config['user.enableCustomMusicDir'] ?? false,
            'user.enableLoginCacheRestriction': global.lx.config['user.enableLoginCacheRestriction'],
            'user.enableCacheSizeLimit': global.lx.config['user.enableCacheSizeLimit'],
            'user.cacheSizeLimit': global.lx.config['user.cacheSizeLimit'],
            'frontend.password': global.lx.config['frontend.password'],
            'player.enableAuth': global.lx.config['player.enableAuth'] || false,
            'player.password': global.lx.config['player.password'] || '',
            'webdav.enable': global.lx.config['webdav.enable'] ?? false,
            'webdav.url': global.lx.config['webdav.url'] || '',
            'webdav.username': global.lx.config['webdav.username'] || '',
            'webdav.password': global.lx.config['webdav.password'] || '',
            'webdav.syncPath': global.lx.config['webdav.syncPath'] || '/lx-sync',
            'webdav.backupPath': global.lx.config['webdav.backupPath'] || '/lx-sync-backups',
            'sync.interval': global.lx.config['sync.interval'] || 60,
            'sync.backupInterval': global.lx.config['sync.backupInterval'] || 24,
            'webdav.excludeCache': global.lx.config['webdav.excludeCache'] ?? false,
            'webdav.excludeMusic': global.lx.config['webdav.excludeMusic'] ?? false,
            'proxy.all.enabled': global.lx.config['proxy.all.enabled'] || false,
            'proxy.all.address': global.lx.config['proxy.all.address'] || '',
            // 三类细分代理：enabled 为 undefined 表示「沿用上面的统一开关」
            'proxy.music.enabled': global.lx.config['proxy.music.enabled'],
            'proxy.music.address': global.lx.config['proxy.music.address'] || '',
            'proxy.customSource.enabled': global.lx.config['proxy.customSource.enabled'],
            'proxy.customSource.address': global.lx.config['proxy.customSource.address'] || '',
            'proxy.app.enabled': global.lx.config['proxy.app.enabled'],
            'proxy.app.address': global.lx.config['proxy.app.address'] || '',
            'admin.path': global.lx.config['admin.path'] ?? '/music',
            'player.path': global.lx.config['player.path'] ?? '/',
            'subsonic.enable': global.lx.config['subsonic.enable'] ?? true,
            'subsonic.path': global.lx.config['subsonic.path'] ?? '/rest',
            'subsonic.port': global.lx.config['subsonic.port'] ?? 0,
            'subsonic.enableDebug': global.lx.config['subsonic.enableDebug'] ?? false,
            'subsonic.onlineSearch': global.lx.config['subsonic.onlineSearch'] ?? true,
            'subsonic.onlineSearchMode': global.lx.config['subsonic.onlineSearchMode'] ?? 'fallback',
            'subsonic.onlineSearchSources': global.lx.config['subsonic.onlineSearchSources'] ?? 'wy,tx,kw,kg,mg',
            'subsonic.publicLeaderboards': global.lx.config['subsonic.publicLeaderboards'] ?? false,
            'subsonic.leaderboardSource': global.lx.config['subsonic.leaderboardSource'] ?? 'tx',
            'subsonic.sharedListMode': global.lx.config['subsonic.sharedListMode'] ?? 'leaderboard',
            'subsonic.sharedListSort': global.lx.config['subsonic.sharedListSort'] ?? 'hot',
            'subsonic.dislikeRating': global.lx.config['subsonic.dislikeRating'] ?? 1,
            'subsonic.linkRatingToDislike': global.lx.config['subsonic.linkRatingToDislike'] ?? false,
            'subsonic.linkDislikeToRating': global.lx.config['subsonic.linkDislikeToRating'] ?? false,
            'subsonic.hideDisliked': global.lx.config['subsonic.hideDisliked'] ?? true,
            'subsonic.dislikeCrossSource': global.lx.config['subsonic.dislikeCrossSource'] ?? false,
            'subsonic.dislikeNoRecommend': global.lx.config['subsonic.dislikeNoRecommend'] ?? true,
            'subsonic.dislikeDuetMode': global.lx.config['subsonic.dislikeDuetMode'] ?? 'any',
            'subsonic.dislikeNormalizeName': global.lx.config['subsonic.dislikeNormalizeName'] ?? true,
            'subsonic.dislikeRequireSinger': global.lx.config['subsonic.dislikeRequireSinger'] ?? true,
            'subsonic.lyricTranslation': global.lx.config['subsonic.lyricTranslation'] ?? true,
            'subsonic.cacheOnPlay': global.lx.config['subsonic.cacheOnPlay'] ?? false,
            'subsonic.playCacheFirst': global.lx.config['subsonic.playCacheFirst'] ?? true,
            'subsonic.quality.enabled': global.lx.config['subsonic.quality.enabled'] ?? true,
            'subsonic.quality.priority': global.lx.config['subsonic.quality.priority'] ?? 'flac,320k,128k',
            'subsonic.quality.clientCapMode': global.lx.config['subsonic.quality.clientCapMode'] ?? 'soft',
            'subsonic.source.priority': global.lx.config['subsonic.source.priority'] ?? 'kw,tx,wy,mg,kg',
            'subsonic.source.crossPlatform': global.lx.config['subsonic.source.crossPlatform'] ?? true,
            'subsonic.source.autoSwitchCustom': global.lx.config['subsonic.source.autoSwitchCustom'] ?? true,
            'singer.sourcePriority': (global.lx.config['singer.sourcePriority'] || ['tx', 'wy']).join(','),
            'artist.maxFetchPages': global.lx.config['artist.maxFetchPages'] ?? 20,
            'system.allowUnsafeVM': global.lx.config['system.allowUnsafeVM'] || false,
            'configBackup.enable': global.lx.config['configBackup.enable'] ?? true,
            'configBackup.retentionDays': global.lx.config['configBackup.retentionDays'] ?? 7,
            'configBackup.dir': global.lx.config['configBackup.dir'] ?? '',
            'snapshot.backupPath': global.lx.config['snapshot.backupPath'] ?? '',
            subsonicPortConflict: global.lx.subsonicPortConflict || null,
            configFilePath: global.lx.configPath || process.env.CONFIG_PATH || path.join(global.lx.dataPath, 'config.js'),
          }
          res.writeHead(200, {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache, no-store, must-revalidate'
          })
          res.end(JSON.stringify(config))
          return
        }

        if (req.method === 'POST') {
          void readBody(req).then(body => {
            try {
              const previousConfig = { ...global.lx.config }
              const newConfig = JSON.parse(body)
              const additional = validateAdditionalConfiguration(newConfig)
              const customDirectoryUpdates = validateCustomDirectoryUpdates(newConfig['user.customMusicDirectories'])
              const nameTemplate = newConfig['download.nameTemplate'] === undefined ? undefined : serverDownloads.validateNameTemplate(newConfig['download.nameTemplate'])
              const updateServer = newConfig['update.server'] === undefined ? undefined : appUpdates.validateUpdateServer(newConfig['update.server'])
              if (newConfig['update.enabled'] !== undefined && typeof newConfig['update.enabled'] !== 'boolean') throw new Error('检查更新开关格式错误')
              if (newConfig['update.token'] !== undefined && (typeof newConfig['update.token'] !== 'string' || /[\r\n]/.test(newConfig['update.token']))) throw new Error('更新访问令牌格式错误')
              // 先校验下载目录与命名模板，格式错误时不开始保存。
              let downloadDirectory: string | undefined
              if (newConfig['download.directory'] !== undefined) {
                const value = newConfig['download.directory']
                if (value === '') downloadDirectory = ''
                else downloadDirectory = serverDownloads.validateDirectory(value)
              }
              if (newConfig['download.lyricMode'] !== undefined && !['embedded', 'external'].includes(newConfig['download.lyricMode'])) {
                throw new Error('无效的歌词写入方式')
              }
              if (downloadDirectory !== undefined) global.lx.config['download.directory'] = downloadDirectory
              if (nameTemplate !== undefined) global.lx.config['download.nameTemplate'] = nameTemplate
              if (updateServer !== undefined) global.lx.config['update.server'] = updateServer
              if (newConfig['update.enabled'] !== undefined) global.lx.config['update.enabled'] = newConfig['update.enabled']
              if (newConfig['update.token']?.trim()) global.lx.config['update.token'] = newConfig['update.token'].trim()
              if (newConfig['update.clearToken'] === true) global.lx.config['update.token'] = ''
              if (newConfig['download.lyricMode'] !== undefined) global.lx.config['download.lyricMode'] = newConfig['download.lyricMode']
              if (newConfig.serverName !== undefined) global.lx.config.serverName = newConfig.serverName
              if (newConfig['debug.enabled'] !== undefined) global.lx.config['debug.enabled'] = newConfig['debug.enabled']
              if (newConfig.maxSnapshotNum !== undefined) global.lx.config.maxSnapshotNum = parseInt(newConfig.maxSnapshotNum)
              if (newConfig['list.addMusicLocationType'] !== undefined) global.lx.config['list.addMusicLocationType'] = newConfig['list.addMusicLocationType']
              if (newConfig['proxy.enabled'] !== undefined) global.lx.config['proxy.enabled'] = newConfig['proxy.enabled']
              if (newConfig['proxy.header'] !== undefined) global.lx.config['proxy.header'] = newConfig['proxy.header']
              if (newConfig['user.enablePath'] !== undefined) global.lx.config['user.enablePath'] = newConfig['user.enablePath']
              // 新增：处理 user.enableRoot
              if (newConfig['user.enableRoot'] !== undefined) global.lx.config['user.enableRoot'] = newConfig['user.enableRoot']
              if (newConfig['user.enablePublicRestriction'] !== undefined) global.lx.config['user.enablePublicRestriction'] = newConfig['user.enablePublicRestriction']
              if (newConfig['user.enablePublicNonAdminLocalMusic'] !== undefined) global.lx.config['user.enablePublicNonAdminLocalMusic'] = newConfig['user.enablePublicNonAdminLocalMusic']
              if (newConfig['user.enablePublicNonAdminBrowserDownload'] !== undefined) global.lx.config['user.enablePublicNonAdminBrowserDownload'] = newConfig['user.enablePublicNonAdminBrowserDownload']
              if (newConfig['user.enablePublicNonAdminServerCache'] !== undefined) global.lx.config['user.enablePublicNonAdminServerCache'] = newConfig['user.enablePublicNonAdminServerCache']
              if (newConfig['user.enablePublicFavorites'] !== undefined) global.lx.config['user.enablePublicFavorites'] = newConfig['user.enablePublicFavorites']
              if (newConfig['user.enablePublicNonAdminAccess'] !== undefined) global.lx.config['user.enablePublicNonAdminAccess'] = newConfig['user.enablePublicNonAdminAccess']
              if (newConfig['user.enableCustomMusicDir'] !== undefined) global.lx.config['user.enableCustomMusicDir'] = newConfig['user.enableCustomMusicDir']
              if (newConfig['user.enableLoginCacheRestriction'] !== undefined) global.lx.config['user.enableLoginCacheRestriction'] = newConfig['user.enableLoginCacheRestriction']
              if (newConfig['user.enableCacheSizeLimit'] !== undefined) global.lx.config['user.enableCacheSizeLimit'] = newConfig['user.enableCacheSizeLimit']
              if (newConfig['user.cacheSizeLimit'] !== undefined) global.lx.config['user.cacheSizeLimit'] = parseInt(newConfig['user.cacheSizeLimit']) || 2000
              if (newConfig['system.allowUnsafeVM'] !== undefined) global.lx.config['system.allowUnsafeVM'] = newConfig['system.allowUnsafeVM']

              Object.assign(global.lx.config, additional)
              let warning = ''

              // 校验：至少开启一种模式
              if (!global.lx.config['user.enablePath'] && !global.lx.config['user.enableRoot']) {
                // 如果都关闭了，强制开启根路径（或者报错，这里建议强制开启并警告）
                global.lx.config['user.enableRoot'] = true
                warning = '必须至少开启一种连接方式，已自动开启“根路径”模式。'
              }

              // 校验：如果开启了根路径，检查密码重复
              if (global.lx.config['user.enableRoot']) {
                const passwords = global.lx.config.users.map(u => u.password)
                if (new Set(passwords).size !== passwords.length) {
                  warning = warning ? warning + '\n' : ''
                  warning += '检测到重复密码！开启“根路径”模式要求所有用户密码唯一，否则可能导致连接错误。'
                }
              }
              if (newConfig['frontend.password'] !== undefined) global.lx.config['frontend.password'] = newConfig['frontend.password']

              // Web播放器配置
              if (newConfig['player.enableAuth'] !== undefined) global.lx.config['player.enableAuth'] = newConfig['player.enableAuth']
              if (newConfig['player.password'] !== undefined) global.lx.config['player.password'] = newConfig['player.password']

              // WebDAV 配置
              if (newConfig['webdav.enable'] !== undefined) global.lx.config['webdav.enable'] = newConfig['webdav.enable']
              if (newConfig['webdav.url'] !== undefined) global.lx.config['webdav.url'] = newConfig['webdav.url']
              if (newConfig['webdav.username'] !== undefined) global.lx.config['webdav.username'] = newConfig['webdav.username']
              if (newConfig['webdav.password'] !== undefined) global.lx.config['webdav.password'] = newConfig['webdav.password']
              if (newConfig['webdav.syncPath'] !== undefined) global.lx.config['webdav.syncPath'] = newConfig['webdav.syncPath']
              if (newConfig['webdav.backupPath'] !== undefined) global.lx.config['webdav.backupPath'] = newConfig['webdav.backupPath']
              if (newConfig['sync.interval'] !== undefined) global.lx.config['sync.interval'] = parseInt(newConfig['sync.interval'])
              if (newConfig['sync.backupInterval'] !== undefined) global.lx.config['sync.backupInterval'] = parseInt(newConfig['sync.backupInterval']) || 24
              if (newConfig['webdav.excludeCache'] !== undefined) global.lx.config['webdav.excludeCache'] = !!newConfig['webdav.excludeCache']
              if (newConfig['webdav.excludeMusic'] !== undefined) global.lx.config['webdav.excludeMusic'] = !!newConfig['webdav.excludeMusic']
              const validateAndCleanProxy = (addr: any) => {
                if (!addr || typeof addr !== 'string') return ''
                const trimmed = addr.trim()
                if (!trimmed) return ''
                try {
                  const parsed = new URL(trimmed)
                  if (['http:', 'https:', 'socks:', 'socks4:', 'socks5:'].includes(parsed.protocol)) return trimmed
                  return ''
                } catch {
                  return ''
                }
              }

              if (newConfig['proxy.all.enabled'] !== undefined) global.lx.config['proxy.all.enabled'] = newConfig['proxy.all.enabled']
              if (newConfig['proxy.all.address'] !== undefined) global.lx.config['proxy.all.address'] = validateAndCleanProxy(newConfig['proxy.all.address'])
              // 细分代理：null 表示「沿用统一开关」(写回 undefined，序列化时省略)
              ;(['music', 'customSource', 'app'] as const).forEach(cat => {
                const cfg: any = global.lx.config
                const kEnabled = `proxy.${cat}.enabled`
                const kAddress = `proxy.${cat}.address`
                if (newConfig[kEnabled] !== undefined) {
                  cfg[kEnabled] = newConfig[kEnabled] === null ? undefined : !!newConfig[kEnabled]
                }
                if (newConfig[kAddress] !== undefined) {
                  cfg[kAddress] = newConfig[kAddress] === null ? '' : validateAndCleanProxy(newConfig[kAddress])
                }
              })

              if (newConfig['admin.path'] !== undefined || newConfig['player.path'] !== undefined) {
                const adminPath = (newConfig['admin.path'] !== undefined ? newConfig['admin.path'] : (global.lx.config['admin.path'] ?? '/admin'))
                const playerPath = (newConfig['player.path'] !== undefined ? newConfig['player.path'] : (global.lx.config['player.path'] ?? '/'))
                const normalizedAdmin = adminPath.replace(/\/+$/, '')
                const normalizedPlayer = playerPath.replace(/\/+$/, '')

                if (normalizedPlayer !== '' && !normalizedPlayer.startsWith('/')) {
                  res.writeHead(422, { 'Content-Type': 'application/json' })
                  res.end(JSON.stringify({ success: false, error: '播放器路径必须以 / 开头或为空（代表根路径）' }))
                  return
                }
                if (normalizedAdmin !== '' && !normalizedAdmin.startsWith('/')) {
                  res.writeHead(422, { 'Content-Type': 'application/json' })
                  res.end(JSON.stringify({ success: false, error: '后台路径必须以 / 开头或为空' }))
                  return
                }
                if ((normalizedAdmin || '/') === (normalizedPlayer || '/')) {
                  res.writeHead(422, { 'Content-Type': 'application/json' })
                  res.end(JSON.stringify({ success: false, error: '后台管理路径与播放器路径不能相同' }))
                  return
                }
                if (normalizedAdmin.startsWith('/api') || normalizedPlayer.startsWith('/api')) {
                  res.writeHead(422, { 'Content-Type': 'application/json' })
                  res.end(JSON.stringify({ success: false, error: '路径不能以 /api 开头' }))
                  return
                }
                global.lx.config['admin.path'] = normalizedAdmin
                global.lx.config['player.path'] = normalizedPlayer
              }

              // [路径合法性校验] 校验配置备份目录与歌单快照路径
              const validateDirectoryPath = (rawPath: string, fieldName: string): string => {
                const trimmed = rawPath.trim()
                if (!trimmed) return ''
                // 检查系统非法字符 (如 < > " | ? *)
                if (/[<>"|?*]/.test(trimmed)) {
                  throw new Error(`${fieldName} 包含非法字符 (< > " | ? *)`)
                }
                const resolved = path.isAbsolute(trimmed) ? trimmed : path.join(global.lx.dataPath, trimmed)
                // 尝试创建目录检测有效性与写入权限
                try {
                  storageFs.mkdirSync(resolved, { recursive: true })
                  storageFs.accessSync(resolved, storageFs.constants.W_OK)
                } catch (e: any) {
                  throw new Error(`${fieldName} 路径无效或无写入权限 (${resolved}): ${e.message || e}`)
                }
                return trimmed
              }

              if (newConfig['configBackup.dir'] !== undefined) {
                try {
                  global.lx.config['configBackup.dir'] = validateDirectoryPath(String(newConfig['configBackup.dir']), '配置备份目录')
                } catch (err: any) {
                  res.writeHead(422, { 'Content-Type': 'application/json' })
                  res.end(JSON.stringify({ success: false, error: err.message }))
                  return
                }
              }

              if (newConfig['snapshot.backupPath'] !== undefined) {
                try {
                  global.lx.config['snapshot.backupPath'] = validateDirectoryPath(String(newConfig['snapshot.backupPath']), '歌单快照备份路径')
                } catch (err: any) {
                  res.writeHead(422, { 'Content-Type': 'application/json' })
                  res.end(JSON.stringify({ success: false, error: err.message }))
                  return
                }
              }

              // 新增：Subsonic 配置保存逻辑
              if (newConfig['subsonic.enable'] !== undefined) global.lx.config['subsonic.enable'] = newConfig['subsonic.enable']
              if (newConfig['subsonic.path'] !== undefined) {
                global.lx.config['subsonic.path'] = newConfig['subsonic.path'].replace(/\/+$/, '') || '/rest'
              }
              if (newConfig['subsonic.port'] !== undefined) {
                const port = parseInt(newConfig['subsonic.port'], 10)
                global.lx.config['subsonic.port'] = !isNaN(port) && port >= 0 ? port : 0
              }
              if (newConfig['subsonic.enableDebug'] !== undefined) global.lx.config['subsonic.enableDebug'] = newConfig['subsonic.enableDebug']
              // [本地配置备份] configBackup 配置
              if (newConfig['configBackup.enable'] !== undefined) global.lx.config['configBackup.enable'] = !!newConfig['configBackup.enable']
              if (newConfig['configBackup.retentionDays'] !== undefined) {
                const rd = Number(newConfig['configBackup.retentionDays'])
                global.lx.config['configBackup.retentionDays'] = Number.isFinite(rd) && rd > 0 ? Math.floor(rd) : 7
              }
              if (newConfig['subsonic.onlineSearch'] !== undefined) global.lx.config['subsonic.onlineSearch'] = newConfig['subsonic.onlineSearch']
              if (newConfig['subsonic.onlineSearchMode'] !== undefined) global.lx.config['subsonic.onlineSearchMode'] = newConfig['subsonic.onlineSearchMode']
              if (newConfig['subsonic.onlineSearchSources'] !== undefined) global.lx.config['subsonic.onlineSearchSources'] = newConfig['subsonic.onlineSearchSources']
              if (newConfig['subsonic.publicLeaderboards'] !== undefined) global.lx.config['subsonic.publicLeaderboards'] = newConfig['subsonic.publicLeaderboards']
              if (newConfig['subsonic.leaderboardSource'] !== undefined) {
                const s = String(newConfig['subsonic.leaderboardSource']).trim().toLowerCase()
                if (['tx', 'wy', 'kg', 'kw', 'mg'].includes(s)) global.lx.config['subsonic.leaderboardSource'] = s
              }
              if (newConfig['subsonic.sharedListMode'] !== undefined) {
                const m = String(newConfig['subsonic.sharedListMode']).trim().toLowerCase()
                if (['leaderboard', 'playlist', 'both'].includes(m)) global.lx.config['subsonic.sharedListMode'] = m as any
              }
              if (newConfig['subsonic.sharedListSort'] !== undefined) {
                const st = String(newConfig['subsonic.sharedListSort']).trim().toLowerCase()
                if (['hot', 'new'].includes(st)) global.lx.config['subsonic.sharedListSort'] = st as any
              }
              if (newConfig['subsonic.dislikeRating'] !== undefined) global.lx.config['subsonic.dislikeRating'] = Number(newConfig['subsonic.dislikeRating'])
              if (newConfig['subsonic.hideDisliked'] !== undefined) global.lx.config['subsonic.hideDisliked'] = !!newConfig['subsonic.hideDisliked']
              if (newConfig['subsonic.dislikeCrossSource'] !== undefined) global.lx.config['subsonic.dislikeCrossSource'] = !!newConfig['subsonic.dislikeCrossSource']
              if (newConfig['subsonic.dislikeNoRecommend'] !== undefined) global.lx.config['subsonic.dislikeNoRecommend'] = !!newConfig['subsonic.dislikeNoRecommend']
              if (newConfig['subsonic.dislikeDuetMode'] !== undefined) {
                const dm = String(newConfig['subsonic.dislikeDuetMode']).trim().toLowerCase()
                if (['any', 'all', 'primary'].includes(dm)) global.lx.config['subsonic.dislikeDuetMode'] = dm as any
              }
              if (newConfig['subsonic.dislikeNormalizeName'] !== undefined) global.lx.config['subsonic.dislikeNormalizeName'] = !!newConfig['subsonic.dislikeNormalizeName']
              if (newConfig['subsonic.dislikeRequireSinger'] !== undefined) global.lx.config['subsonic.dislikeRequireSinger'] = !!newConfig['subsonic.dislikeRequireSinger']
              if (newConfig['subsonic.linkRatingToDislike'] !== undefined) global.lx.config['subsonic.linkRatingToDislike'] = !!newConfig['subsonic.linkRatingToDislike']
              if (newConfig['subsonic.linkDislikeToRating'] !== undefined) global.lx.config['subsonic.linkDislikeToRating'] = !!newConfig['subsonic.linkDislikeToRating']
              if (newConfig['subsonic.recommendPoolSize'] !== undefined) global.lx.config['subsonic.recommendPoolSize'] = Number(newConfig['subsonic.recommendPoolSize'])
              if (newConfig['subsonic.lyricTranslation'] !== undefined) global.lx.config['subsonic.lyricTranslation'] = newConfig['subsonic.lyricTranslation']
              if (newConfig['subsonic.cacheOnPlay'] !== undefined) global.lx.config['subsonic.cacheOnPlay'] = newConfig['subsonic.cacheOnPlay']
              if (newConfig['subsonic.playCacheFirst'] !== undefined) global.lx.config['subsonic.playCacheFirst'] = newConfig['subsonic.playCacheFirst']
              if (newConfig['subsonic.quality.enabled'] !== undefined) global.lx.config['subsonic.quality.enabled'] = !!newConfig['subsonic.quality.enabled']
              if (newConfig['subsonic.quality.priority'] !== undefined) global.lx.config['subsonic.quality.priority'] = String(newConfig['subsonic.quality.priority'])
              if (newConfig['subsonic.quality.clientCapMode'] !== undefined && ['hard', 'soft'].includes(newConfig['subsonic.quality.clientCapMode'])) global.lx.config['subsonic.quality.clientCapMode'] = newConfig['subsonic.quality.clientCapMode']
              if (newConfig['subsonic.source.priority'] !== undefined) global.lx.config['subsonic.source.priority'] = String(newConfig['subsonic.source.priority'])
              if (newConfig['subsonic.source.crossPlatform'] !== undefined) global.lx.config['subsonic.source.crossPlatform'] = !!newConfig['subsonic.source.crossPlatform']
              if (newConfig['subsonic.source.autoSwitchCustom'] !== undefined) global.lx.config['subsonic.source.autoSwitchCustom'] = !!newConfig['subsonic.source.autoSwitchCustom']
              if (newConfig['singer.sourcePriority'] !== undefined) {
                const priority = String(newConfig['singer.sourcePriority']).split(',').filter(s => s === 'tx' || s === 'wy') as Array<'tx' | 'wy'>
                if (priority.length > 0) global.lx.config['singer.sourcePriority'] = priority
              }
              if (newConfig['artist.maxFetchPages'] !== undefined) {
                const maxPages = Number(newConfig['artist.maxFetchPages'])
                global.lx.config['artist.maxFetchPages'] = Number.isFinite(maxPages) && maxPages > 0
                  ? Math.min(Math.floor(maxPages), 100)
                  : 20
              }

              if (newConfig['database.adminPath'] !== undefined || newConfig['database.musicPath'] !== undefined) {
                try {
                  const migrated = runtime.databaseLocation.move({ 'database.adminPath': newConfig['database.adminPath'], 'database.musicPath': newConfig['database.musicPath'] })
                  if (migrated.warning) warning += migrated.warning
                } catch (error) {
                  // 迁库失败前尚未更新 WebDAV 或用户目录，恢复当前配置对象以保留调用方引用。
                  Object.assign(global.lx.config, previousConfig)
                  for (const key of Object.keys(global.lx.config)) if (!(key in previousConfig)) delete (global.lx.config as any)[key]
                  throw error
                }
              }

              // 更新 WebDAVSync 配置
              if (global.lx.webdavSync && (newConfig['webdav.enable'] !== undefined || newConfig['webdav.url'] || newConfig['webdav.username'] || newConfig['webdav.password'] || newConfig['webdav.syncPath'] || newConfig['webdav.backupPath'] || newConfig['sync.interval'] || newConfig['sync.backupInterval'] || newConfig['webdav.excludeCache'] !== undefined || newConfig['webdav.excludeMusic'] !== undefined)) {
                global.lx.webdavSync.updateConfig({
                  enable: global.lx.config['webdav.enable'],
                  url: global.lx.config['webdav.url'],
                  username: global.lx.config['webdav.username'],
                  password: global.lx.config['webdav.password'],
                  syncPath: global.lx.config['webdav.syncPath'],
                  backupPath: global.lx.config['webdav.backupPath'],
                  interval: global.lx.config['sync.interval'],
                  backupInterval: global.lx.config['sync.backupInterval'],
                  excludeCache: global.lx.config['webdav.excludeCache'],
                  excludeMusic: global.lx.config['webdav.excludeMusic'],
                })
              }

              for (const update of customDirectoryUpdates) {
                update.user.customMusicDir = update.directory
                update.user.enableCustomMusicDir = update.enabled
              }
              if (customDirectoryUpdates.length && !saveUsers()) throw new Error('用户歌曲目录保存失败，请检查应用数据目录写入权限')
              // 沿用用户管理页面的目录迁移行为，仅迁移已经选择 custom 存储的同步歌曲。
              for (const update of customDirectoryUpdates) {
                try {
                  if (getSyncDownloadData(update.user.name).storageLocation !== 'custom') continue
                  if (update.oldEnabled && !update.enabled) migrateSyncStorage(update.user.name, 'root', { overrideOldCustomDir: update.oldDirectory })
                  else if (update.enabled && update.oldDirectory && update.directory && update.oldDirectory !== update.directory) migrateSyncStorage(update.user.name, 'custom', { overrideOldCustomDir: update.oldDirectory, overrideNewCustomDir: update.directory })
                } catch (error: any) { console.error('[用户目录] 保存后的目录迁移失败:', error.message) }
              }
              global.lx.saveConfig()

              // 动态热迁移所有活跃用户空间的快照目录
              if (newConfig['snapshot.backupPath'] !== undefined) {
                updateAllUserSnapshotDirs(global.lx.config['snapshot.backupPath'])
              }

              // 触发一次 WebDAV 同步检查（如果已配置）
              if (global.lx.webdavSync && global.lx.webdavSync.isConfigured()) {
                void global.lx.webdavSync.syncChangedFiles()
              }

              res.writeHead(200)
              res.end(JSON.stringify({ success: true, warning }))
            } catch (e: any) {
              res.writeHead(400, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ success: false, message: e.message || '配置保存失败' }))
            }
          })
          return
        }

}

/**
 * 列出本地配置导出备份及保留策略。
 * @param context /api/config/backups 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 系统配置、旧配置导入、本地配置备份与代理连接测试的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export async function getConfigBackups(context: RequestContext, runtime: ConfigurationServiceRuntime) {
  const { req, res } = context
  const { path, storageFs } = runtime

        const auth = req.headers['x-frontend-auth']
        if (auth !== global.lx.config['frontend.password']) {
          res.writeHead(401, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ success: false, error: 'Unauthorized' }))
          return
        }

        try {
          const backupDir = global.lx.getConfigBackupDir ? global.lx.getConfigBackupDir() : path.join(global.lx.dataPath, 'backups')
          const list: Array<{ /** 条目名称。 */
name: string, /** 文件字节数或记录数量。 */
size: number,
time: number, /** 记录或操作类别。 */
type: 'auto' | 'manual' }> = []

          if (storageFs.existsSync(backupDir)) {
            const files = storageFs.readdirSync(backupDir)
            for (const file of files) {
              if (!/^config-.*\.js$/.test(file)) continue
              const fp = path.join(backupDir, file)
              try {
                const stat = storageFs.statSync(fp)
                const isManual = file.startsWith('config-manual-')

                // 优先从文件名解析精确时间戳
                let timestamp = 0
                const manualMatch = file.match(/^config-manual-(\d{4})-(\d{2})-(\d{2})_(\d{2})(\d{2})(\d{2})\.js$/)
                const autoMatch = file.match(/^config-(\d{4})-(\d{2})-(\d{2})\.js$/)

                if (manualMatch) {
                  const [, y, m, d, h, min, s] = manualMatch
                  timestamp = new Date(Number(y), Number(m) - 1, Number(d), Number(h), Number(min), Number(s)).getTime()
                } else if (autoMatch) {
                  // 自动备份若与 mtime/birthtime 在同一天，优先使用文件修改时间以展示具体时刻；否则取日期当天 00:00
                  timestamp = stat.mtimeMs || stat.birthtimeMs || 0
                }

                if (!timestamp) {
                  timestamp = Math.max(stat.birthtimeMs || 0, stat.mtimeMs || 0)
                }

                list.push({
                  name: file,
                  size: stat.size,
                  time: timestamp,
                  type: isManual ? 'manual' : 'auto',
                })
              } catch { }
            }
          }

          // 按时间倒序排序（从新到旧）
          list.sort((a, b) => b.time - a.time)

          res.writeHead(200, {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache, no-store, must-revalidate',
          })
          res.end(JSON.stringify({
            success: true,
            backupDir,
            autoBackupEnabled: global.lx.config['configBackup.enable'] !== false,
            retentionDays: global.lx.config['configBackup.retentionDays'] || 7,
            list,
          }))
        } catch (err: any) {
          res.writeHead(500, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ success: false, error: err.message }))
        }
        return

}

/**
 * 导出当前 SQL 系统配置并创建本地备份。
 * @param context /api/config/backup-now 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 系统配置、旧配置导入、本地配置备份与代理连接测试的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export async function postConfigBackupNow(context: RequestContext, runtime: ConfigurationServiceRuntime) {
  const { req, res } = context

        const auth = req.headers['x-frontend-auth']
        if (auth !== global.lx.config['frontend.password']) {
          res.writeHead(401, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ success: false, error: 'Unauthorized' }))
          return
        }

        try {
          if (typeof global.lx.backupConfigNow === 'function') {
            const result = global.lx.backupConfigNow()
            if (result.success) {
              res.writeHead(200, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ success: true, filename: result.filename }))
            } else {
              res.writeHead(500, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ success: false, error: result.error || 'Backup failed' }))
            }
          } else {
            res.writeHead(500, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ success: false, error: 'backupConfigNow is not available' }))
          }
        } catch (err: any) {
          res.writeHead(500, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ success: false, error: err.message }))
        }
        return

}

/**
 * 下载指定本地配置备份文件。
 * @param context /api/config/backups/download 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 系统配置、旧配置导入、本地配置备份与代理连接测试的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export async function getConfigBackupsDownload(context: RequestContext, runtime: ConfigurationServiceRuntime) {
  const { req, res, urlObj } = context
  const { path, storageFs } = runtime

        const auth = req.headers['x-frontend-auth']
        if (auth !== global.lx.config['frontend.password']) {
          res.writeHead(401)
          res.end('Unauthorized')
          return
        }

        const fileName = urlObj.searchParams.get('file')
        if (!fileName || !/^config-.*\.js$/.test(fileName) || fileName.includes('/') || fileName.includes('\\')) {
          res.writeHead(400)
          res.end('Invalid file name')
          return
        }

        const backupDir = global.lx.getConfigBackupDir ? global.lx.getConfigBackupDir() : path.join(global.lx.dataPath, 'backups')
        const filePath = path.join(backupDir, fileName)

        if (!storageFs.existsSync(filePath)) {
          res.writeHead(404)
          res.end('File not found')
          return
        }

        try {
          const content = storageFs.readFileSync(filePath)
          res.writeHead(200, {
            'Content-Type': 'application/javascript; charset=utf-8',
            'Content-Disposition': `attachment; filename="${fileName}"`,
            'Content-Length': content.length,
          })
          res.end(content)
        } catch (err: any) {
          res.writeHead(500)
          res.end(err.message)
        }
        return

}

/**
 * 删除指定本地配置备份。
 * @param context /api/config/backups/ 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 系统配置、旧配置导入、本地配置备份与代理连接测试的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export async function deleteConfigBackups(context: RequestContext, runtime: ConfigurationServiceRuntime) {
  const { req, res, pathname } = context
  const { path, storageFs } = runtime

        const auth = req.headers['x-frontend-auth']
        if (auth !== global.lx.config['frontend.password']) {
          res.writeHead(401, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ success: false, error: 'Unauthorized' }))
          return
        }

        const fileName = decodeURIComponent(pathname.replace('/api/config/backups/', '')).trim()
        if (!fileName || !/^config-.*\.js$/.test(fileName) || fileName.includes('/') || fileName.includes('\\')) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ success: false, error: 'Invalid file name' }))
          return
        }

        const backupDir = global.lx.getConfigBackupDir ? global.lx.getConfigBackupDir() : path.join(global.lx.dataPath, 'backups')
        const filePath = path.join(backupDir, fileName)

        if (!storageFs.existsSync(filePath)) {
          res.writeHead(404, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ success: false, error: 'File not found' }))
          return
        }

        try {
          storageFs.unlinkSync(filePath)
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ success: true }))
        } catch (err: any) {
          res.writeHead(500, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ success: false, error: err.message }))
        }
        return

}

/**
 * 导入选定配置备份并热加载运行数据。
 * @param context /api/config/backups/restore 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 系统配置、旧配置导入、本地配置备份与代理连接测试的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export async function postConfigBackupsRestore(context: RequestContext, runtime: ConfigurationServiceRuntime) {
  const { req, res } = context
  const { readBody, path, storageFs, reloadServerData, updateAllUserSnapshotDirs } = runtime

        const auth = req.headers['x-frontend-auth']
        if (auth !== global.lx.config['frontend.password']) {
          res.writeHead(401, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ success: false, error: 'Unauthorized' }))
          return
        }

        void readBody(req).then(async body => {
          try {
            const { fileName } = JSON.parse(body)
            if (!fileName || !/^config-.*\.js$/.test(fileName) || fileName.includes('/') || fileName.includes('\\')) {
              res.writeHead(400, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ success: false, error: 'Invalid file name' }))
              return
            }

            const backupDir = global.lx.getConfigBackupDir ? global.lx.getConfigBackupDir() : path.join(global.lx.dataPath, 'backups')
            const filePath = path.join(backupDir, fileName)

            if (!storageFs.existsSync(filePath)) {
              res.writeHead(404, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ success: false, error: 'Backup file not found' }))
              return
            }

            // 恢复前导出当前 SQL 业务配置，保留可再次导入的回退副本。
            if (typeof global.lx.backupConfigNow === 'function') {
              global.lx.backupConfigNow()
            }

            // 还原业务配置到管理库，禁止覆盖数据库引导文件。
            const imported = new SystemConfigurationImportService(repositories().admin).import(storageFs.readFileSync(filePath, 'utf8'), global.lx.config, global.lx.configPath)
            global.lx.config = imported.config

            // 执行服务器热重载数据
            await reloadServerData()

            // 同步 snapshot 目录更新
            if (global.lx.config['snapshot.backupPath'] !== undefined) {
              updateAllUserSnapshotDirs(global.lx.config['snapshot.backupPath'])
            }

            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ success: true, message: `已成功从 ${fileName} 还原配置并热加载生效！` }))
          } catch (err: any) {
            res.writeHead(500, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ success: false, error: err.message }))
          }
        })
        return

}

/**
 * 使用提交的代理地址测试外网连接和响应耗时。
 * @param context /api/config/test-proxy 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 系统配置、旧配置导入、本地配置备份与代理连接测试的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export async function postConfigTestProxy(context: RequestContext, runtime: ConfigurationServiceRuntime) {
  const { req, res } = context
  const { readBody, needle } = runtime

        const auth = req.headers['x-frontend-auth']
        if (auth !== global.lx.config['frontend.password']) {
          res.writeHead(401)
          res.end('Unauthorized')
          return
        }

        void readBody(req).then(async body => {
          try {
            const { address } = JSON.parse(body)
            if (!address) throw new Error('Missing address')

            const url = new URL(address)
            const options: any = {
              timeout: 10000,
              headers: {
                'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36'
              }
            }

            if (url.protocol === 'http:' || url.protocol === 'https:') {
              options.proxy = address
            } else if (url.protocol.startsWith('socks')) {
              const { SocksProxyAgent } = await import('socks-proxy-agent')
              options.agent = new SocksProxyAgent(address)
            } else {
              throw new Error('Unsupported protocol: ' + url.protocol)
            }

            console.log(`[代理测试] 正在通过代理 ${address} 测试连接 baidu.com...`)
            const startTime = Date.now()
            needle.get('https://www.baidu.com', options, (err: Error | null, resp: any) => {
              const duration = Date.now() - startTime
              if (err) {
                console.error('[代理测试] 连接失败:', err.message)
                res.writeHead(200, { 'Content-Type': 'application/json' })
                res.end(JSON.stringify({ success: false, message: err.message }))
              } else {
                console.log(`[代理测试] 测试成功: 状态码 ${resp.statusCode} (耗时 ${duration}ms)`)
                res.writeHead(200, { 'Content-Type': 'application/json' })
                res.end(JSON.stringify({ success: true, message: `连接成功 (状态码: ${resp.statusCode}, 耗时: ${duration}ms)` }))
              }
            })
          } catch (err: any) {
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ success: false, message: err.message }))
          }
        })
        return

}

/**
 * 静态解析上传的旧 config.js，在管理库事务中覆盖提供的配置项。
 * @param context 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 系统配置、旧配置导入、本地配置备份与代理连接测试的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export async function postConfigurationImport(context: RequestContext, runtime: ConfigurationServiceRuntime) {
  const { req, res } = context
  if (req.headers['x-frontend-auth'] !== global.lx.config['frontend.password']) { res.writeHead(401); res.end('Unauthorized'); return }
  try {
    const body = JSON.parse(await runtime.readBody(req)) as ConfigurationImportDto
    if (typeof body?.content !== 'string') throw new Error('请选择旧 config.js 文件')
    const previousPassword = global.lx.config['frontend.password']
    const imported = new SystemConfigurationImportService(repositories().admin).import(body.content, global.lx.config, global.lx.configPath)
    global.lx.config = imported.config
    await runtime.reloadServerData()
    runtime.updateAllUserSnapshotDirs(global.lx.config['snapshot.backupPath'])
    res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ...imported.result, authenticationChanged: previousPassword !== imported.config['frontend.password'] }))
  } catch (error: any) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ success: false, message: error.message })) }
}
