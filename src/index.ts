#!/usr/bin/env node
import storageFs from './application/persistence/documentFileSystem'
import { repositories } from './application/persistence/storage'
import { GlobalConfigurationService } from './admin/service/GlobalConfigurationService'

import fs from 'fs'
import path from 'path'
import { readDatabasePaths, writeDatabasePaths } from './application/persistence/BootstrapConfiguration'
import moduleAlias from 'module-alias'
// @ts-ignore
moduleAlias.addAliases({
  '@renderer': path.join(__dirname, 'modules'),
  '@': __dirname
})

if (typeof (global as any).navigator === 'undefined') {
  (global as any).navigator = { userAgent: 'node.js' }
}

import { initLogger } from './utils/log4js'
import defaultConfig from './defaultConfig'
import { ENV_PARAMS, File } from './constants'
import { checkAndCreateDirSync } from './utils'

// Declare Env Params Type
type ENV_PARAMS_Type = typeof ENV_PARAMS
type ENV_PARAMS_Value_Type = ENV_PARAMS_Type[number]


process.on('uncaughtException', (err) => {
  console.error('[异常捕获] 未捕获的同步异常:', err)
})
process.on('unhandledRejection', (reason: any) => {
  if (global.lx?.config?.['debug.enabled']) {
    console.error('[异常捕获] 未处理的异步Promise拒绝:', reason)
  } else {
    // 非 DEBUG 模式下精简输出一行，避免第三方音源后台请求失败时刷屏
    const msg = reason?.message || reason || '未知错误'
    console.warn(`[异步警告] 脚本/网络未捕获异常: ${msg}`)
  }
})

let envParams: Partial<Record<Exclude<ENV_PARAMS_Value_Type, 'LX_USER_'>, string>> = {}
let envUsers: LX.User[] = []
const envParamKeys = Object.values(ENV_PARAMS).filter(v => v != 'LX_USER_')
const parseBool = (val?: string): boolean | undefined => {
  if (val === undefined || val === null || val === '') return undefined
  const str = String(val).trim().toLowerCase()
  if (['true', '1', 'yes', 'y', 'on'].includes(str)) return true
  if (['false', '0', 'no', 'n', 'off'].includes(str)) return false
  return undefined
}
const setBoolConfig = <K extends keyof LX.Config>(key: K, val?: string) => {
  const parsed = parseBool(val)
  if (parsed !== undefined) {
    // @ts-expect-error
    global.lx.config[key] = parsed
  }
}

{
  const envLog = [
    ...(envParamKeys.map(e => [e, process.env[e]]) as Array<[Exclude<ENV_PARAMS_Value_Type, 'LX_USER_'>, string]>).filter(([k, v]) => {
      if (!v) return false
      envParams[k] = v
      return true
    }),
    ...Object.entries(process.env)
      .filter(([k, v]) => {
        if (k.startsWith('LX_USER_') && !!v) {
          const name = k.replace('LX_USER_', '')
          if (name) {
            envUsers.push({
              name,
              password: v,
            })
            return true
          }
        }
        return false
      }),
  ].map(([e, v]) => `${e}: ${v as string}`)
  if (envLog.length) console.log(`Load env: \n  ${envLog.join('\n  ')}`)
}

const dataPath = envParams.DATA_PATH ?? path.join(__dirname, '../data')
const resolvedConfigPath = process.env.CONFIG_PATH || path.join(dataPath, 'config.js')

// [本地配置备份] 每天一份 config-YYYY-MM-DD.js，保留可配置天数（见 configBackup.*）
let lastBackupDate = ''

const getConfigBackupDir = (): string => {
  const dir = global.lx?.config['configBackup.dir']
  if (dir && typeof dir === 'string' && dir.trim()) {
    const p = dir.trim()
    return path.isAbsolute(p) ? p : path.join(dataPath, p)
  }
  return path.join(dataPath, 'backups')
}

const getConfigBackupRetention = (): number => {
  const days = global.lx?.config['configBackup.retentionDays']
  return typeof days === 'number' && days > 0 ? days : 7
}

const pad2 = (n: number) => String(n).padStart(2, '0')
const getTodayStr = () => {
  const d = new Date()
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

const getTimestampStr = () => {
  const d = new Date()
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}_${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}`
}

// 清理超过保留期的本地配置备份（按文件 mtime 判断）
const cleanOldConfigBackups = () => {
  const backupDir = getConfigBackupDir()
  try {
    if (!storageFs.existsSync(backupDir)) return
    const cutoff = Date.now() - getConfigBackupRetention() * 24 * 60 * 60 * 1000
    for (const name of storageFs.readdirSync(backupDir)) {
      if (!/^config-.*\.js$/.test(name)) continue
      const fp = path.join(backupDir, name)
      try {
        if (storageFs.statSync(fp).mtimeMs < cutoff) storageFs.unlinkSync(fp)
      } catch { /* ignore */ }
    }
  } catch (err) {
    console.error('[Config] Failed to clean old config backups:', err)
  }
}

// 迁移旧备份：当配置了自定义备份目录时，自动将默认路径（data/backups）下的历史备份搬迁过来
const migrateConfigBackups = (targetBackupDir: string) => {
  const legacyDir = path.join(dataPath, 'backups')
  if (path.resolve(targetBackupDir) === path.resolve(legacyDir) || !storageFs.existsSync(legacyDir)) return
  try {
    storageFs.mkdirSync(targetBackupDir, { recursive: true })
    for (const name of storageFs.readdirSync(legacyDir)) {
      if (!/^config-.*\.js$/.test(name)) continue
      const src = path.join(legacyDir, name)
      const dst = path.join(targetBackupDir, name)
      if (!storageFs.existsSync(dst)) {
        try {
          storageFs.renameSync(src, dst)
          console.log(`[Config] Migrated backup ${name} -> ${targetBackupDir}`)
        } catch (e) {
          console.warn(`[Config] Failed to migrate backup ${name}:`, e)
        }
      }
    }
    if (storageFs.readdirSync(legacyDir).length === 0) {
      try { storageFs.rmdirSync(legacyDir) } catch { }
    }
  } catch (err) {
    console.warn('[Config] Error during config backup migration:', err)
  }
}

// 每天自动备份一次（同日覆盖），备份后顺带清理过期文件
const backupConfig = () => {
  if (global.lx?.config['configBackup.enable'] === false) return
  const backupDir = getConfigBackupDir()
  migrateConfigBackups(backupDir)
  const dateStr = getTodayStr()
  if (dateStr === lastBackupDate) return
  try {
    storageFs.mkdirSync(backupDir, { recursive: true })
    storageFs.writeFileSync(path.join(backupDir, `config-${dateStr}.js`), new GlobalConfigurationService(repositories().admin).export(global.lx.config))
    lastBackupDate = dateStr
    console.log(`[Config] Local backup saved to ${backupDir}/config-${dateStr}.js`)
  } catch (err) {
    console.error('[Config] Failed to backup config:', err)
  }
  cleanOldConfigBackups()
}

// 手动立即备份一次（精确到秒时间戳，不覆盖当天的自动备份）
const backupConfigNow = (): { success: boolean, filename?: string, error?: string } => {
  const backupDir = getConfigBackupDir()
  try {
    storageFs.mkdirSync(backupDir, { recursive: true })
    // 同秒多次备份不能覆盖待还原文件，依次追加序号保留每个完整版本。
    const basename = `config-manual-${getTimestampStr()}`
    let filename = `${basename}.js`, sequence = 1
    while (storageFs.existsSync(path.join(backupDir, filename))) filename = `${basename}-${sequence++}.js`
    storageFs.writeFileSync(path.join(backupDir, filename), new GlobalConfigurationService(repositories().admin).export(global.lx.config))
    console.log(`[Config] Manual backup saved to ${backupDir}/${filename}`)
    return { success: true, filename }
  } catch (err: any) {
    console.error('[Config] Failed to perform manual backup:', err)
    return { success: false, error: err.message || String(err) }
  }
}

/** 保存完整业务配置到 SQLite，失败直接返回调用方，禁止误报成功。 @author yahyaoo */
const saveConfigToFile = () => {
  new GlobalConfigurationService(repositories().admin).save(global.lx.configPath, global.lx.config)
  backupConfig()
}

global.lx = {
  logPath: envParams.LOG_PATH ?? path.join(__dirname, '../logs'),
  dataPath,
  userPath: path.join(dataPath, File.userDir),
  config: defaultConfig,
  staticPath: process.env.STATIC_PATH ?? path.join(process.cwd(), 'public'),
  configPath: resolvedConfigPath,
  saveConfig: saveConfigToFile,
  backupConfigNow,
  getConfigBackupDir,
}

/** SQLite 是业务配置唯一来源；环境变量继续在下方按原顺序覆盖。 @author yahyaoo */
const margeConfig = (_filename: string) => {
  const config = new GlobalConfigurationService(repositories().admin).load(global.lx.configPath, defaultConfig)
  global.lx.config = { ...defaultConfig, ...config, users: (config.users || []).map(user => ({ ...user, dataPath: '' })) }
  return true
}
writeDatabasePaths(dataPath, readDatabasePaths(dataPath))
margeConfig(global.lx.configPath)

if (envParams.PROXY_HEADER) {
  global.lx.config['proxy.enabled'] = true
  global.lx.config['proxy.header'] = envParams.PROXY_HEADER
}
if (envParams.MAX_SNAPSHOT_NUM) {
  const num = parseInt(envParams.MAX_SNAPSHOT_NUM)
  if (!isNaN(num)) global.lx.config.maxSnapshotNum = num
}
if (envParams.LIST_ADD_MUSIC_LOCATION_TYPE) {
  switch (envParams.LIST_ADD_MUSIC_LOCATION_TYPE) {
    case 'top':
    case 'bottom':
      global.lx.config['list.addMusicLocationType'] = envParams.LIST_ADD_MUSIC_LOCATION_TYPE
      break
  }
}
if (envParams.FRONTEND_PASSWORD) {
  global.lx.config['frontend.password'] = envParams.FRONTEND_PASSWORD
}
if (envParams.WEBDAV_ENABLE !== undefined) {
  setBoolConfig('webdav.enable', envParams.WEBDAV_ENABLE)
}
if (envParams.WEBDAV_URL) {
  global.lx.config['webdav.url'] = envParams.WEBDAV_URL
}
if (envParams.WEBDAV_USERNAME) {
  global.lx.config['webdav.username'] = envParams.WEBDAV_USERNAME
}
if (envParams.WEBDAV_PASSWORD) {
  global.lx.config['webdav.password'] = envParams.WEBDAV_PASSWORD
}
if (envParams.WEBDAV_SYNC_PATH) {
  global.lx.config['webdav.syncPath'] = envParams.WEBDAV_SYNC_PATH
}
if (envParams.WEBDAV_BACKUP_PATH) {
  global.lx.config['webdav.backupPath'] = envParams.WEBDAV_BACKUP_PATH
}
if (envParams.SYNC_INTERVAL) {
  const interval = parseInt(envParams.SYNC_INTERVAL)
  if (!isNaN(interval)) global.lx.config['sync.interval'] = interval
}
if (envParams.BACKUP_INTERVAL) {
  const backupInterval = parseInt(envParams.BACKUP_INTERVAL)
  if (!isNaN(backupInterval)) global.lx.config['sync.backupInterval'] = backupInterval
}
if (envParams.WEBDAV_EXCLUDE_CACHE !== undefined) {
  setBoolConfig('webdav.excludeCache', envParams.WEBDAV_EXCLUDE_CACHE)
}
if (envParams.WEBDAV_EXCLUDE_MUSIC !== undefined) {
  setBoolConfig('webdav.excludeMusic', envParams.WEBDAV_EXCLUDE_MUSIC)
}

if (envParams.USER_ENABLE_PATH !== undefined) {
  setBoolConfig('user.enablePath', envParams.USER_ENABLE_PATH)
}
if (envParams.USER_ENABLE_ROOT !== undefined) {
  setBoolConfig('user.enableRoot', envParams.USER_ENABLE_ROOT)
}
if (envParams.ENABLE_DEBUG !== undefined) {
  setBoolConfig('debug.enabled', envParams.ENABLE_DEBUG)
}
if (envParams.PORT) {
  const port = parseInt(envParams.PORT, 10)
  if (!isNaN(port) && port > 0) global.lx.config.port = port
}
if (envParams.ENABLE_WEBPLAYER_AUTH !== undefined) {
  setBoolConfig('player.enableAuth', envParams.ENABLE_WEBPLAYER_AUTH)
}
if (envParams.WEBPLAYER_PASSWORD) {
  global.lx.config['player.password'] = envParams.WEBPLAYER_PASSWORD
}
if (envParams.DISABLE_TELEMETRY !== undefined) {
  setBoolConfig('disableTelemetry', envParams.DISABLE_TELEMETRY)
}
if (envParams.ENABLE_PUBLIC_USER_RESTRICTION !== undefined) {
  setBoolConfig('user.enablePublicRestriction', envParams.ENABLE_PUBLIC_USER_RESTRICTION)
}
if (envParams.ENABLE_PUBLIC_NON_ADMIN_LOCAL_MUSIC !== undefined) {
  setBoolConfig('user.enablePublicNonAdminLocalMusic', envParams.ENABLE_PUBLIC_NON_ADMIN_LOCAL_MUSIC)
}
if (envParams.ENABLE_PUBLIC_NON_ADMIN_BROWSER_DOWNLOAD !== undefined) {
  setBoolConfig('user.enablePublicNonAdminBrowserDownload', envParams.ENABLE_PUBLIC_NON_ADMIN_BROWSER_DOWNLOAD)
}
if (envParams.ENABLE_PUBLIC_NON_ADMIN_SERVER_CACHE !== undefined) {
  setBoolConfig('user.enablePublicNonAdminServerCache', envParams.ENABLE_PUBLIC_NON_ADMIN_SERVER_CACHE)
}
if (envParams.ENABLE_PUBLIC_FAVORITES !== undefined) {
  setBoolConfig('user.enablePublicFavorites', envParams.ENABLE_PUBLIC_FAVORITES)
}
if (envParams.ENABLE_PUBLIC_NON_ADMIN_ACCESS !== undefined) {
  setBoolConfig('user.enablePublicNonAdminAccess', envParams.ENABLE_PUBLIC_NON_ADMIN_ACCESS)
}
if (envParams.ENABLE_CUSTOM_MUSIC_DIR !== undefined) {
  setBoolConfig('user.enableCustomMusicDir', envParams.ENABLE_CUSTOM_MUSIC_DIR)
}
if (envParams.ENABLE_LOGIN_USER_CACHE_RESTRICTION !== undefined) {
  setBoolConfig('user.enableLoginCacheRestriction', envParams.ENABLE_LOGIN_USER_CACHE_RESTRICTION)
}
if (envParams.ENABLE_CACHE_SIZE_LIMIT !== undefined) {
  setBoolConfig('user.enableCacheSizeLimit', envParams.ENABLE_CACHE_SIZE_LIMIT)
}
if (envParams.CACHE_SIZE_LIMIT) {
  global.lx.config['user.cacheSizeLimit'] = parseInt(envParams.CACHE_SIZE_LIMIT) || 2000
}
if (envParams.PROXY_ALL_ENABLED !== undefined) {
  setBoolConfig('proxy.all.enabled', envParams.PROXY_ALL_ENABLED)
}
if (envParams.PROXY_ALL_ADDRESS) {
  global.lx.config['proxy.all.address'] = envParams.PROXY_ALL_ADDRESS
}
if (envParams.ADMIN_PATH !== undefined) {
  global.lx.config['admin.path'] = envParams.ADMIN_PATH
}
if (envParams.PLAYER_PATH !== undefined) {
  global.lx.config['player.path'] = envParams.PLAYER_PATH
}
if (envParams.SUBSONIC_ENABLE !== undefined) {
  setBoolConfig('subsonic.enable', envParams.SUBSONIC_ENABLE)
}
if (envParams.SUBSONIC_PATH !== undefined) {
  global.lx.config['subsonic.path'] = envParams.SUBSONIC_PATH
}
if (envParams.SUBSONIC_PORT !== undefined) {
  const port = parseInt(envParams.SUBSONIC_PORT, 10)
  if (!isNaN(port) && port >= 0) global.lx.config['subsonic.port'] = port
}
if (envParams.SUBSONIC_ENABLE_DEBUG !== undefined) {
  setBoolConfig('subsonic.enableDebug', envParams.SUBSONIC_ENABLE_DEBUG)
}
if (envParams.SUBSONIC_ONLINE_SEARCH !== undefined) {
  setBoolConfig('subsonic.onlineSearch', envParams.SUBSONIC_ONLINE_SEARCH)
}
if (envParams.SUBSONIC_ONLINE_SEARCH_MODE) {
  const mode = envParams.SUBSONIC_ONLINE_SEARCH_MODE as any
  if (['fallback', 'merge', 'local_only'].includes(mode)) {
    global.lx.config['subsonic.onlineSearchMode'] = mode
  }
}
if (envParams.SUBSONIC_ONLINE_SEARCH_SOURCES) {
  global.lx.config['subsonic.onlineSearchSources'] = envParams.SUBSONIC_ONLINE_SEARCH_SOURCES
}
if (envParams.SUBSONIC_PUBLIC_LEADERBOARDS !== undefined) {
  setBoolConfig('subsonic.publicLeaderboards', envParams.SUBSONIC_PUBLIC_LEADERBOARDS)
}
if (envParams.SUBSONIC_LEADERBOARD_SOURCE) {
  const src = envParams.SUBSONIC_LEADERBOARD_SOURCE.trim().toLowerCase()
  if (['tx', 'wy', 'kg', 'kw', 'mg'].includes(src)) {
    global.lx.config['subsonic.leaderboardSource'] = src
  }
}
if (envParams.SUBSONIC_LYRIC_TRANSLATION !== undefined) {
  setBoolConfig('subsonic.lyricTranslation', envParams.SUBSONIC_LYRIC_TRANSLATION)
}
if (envParams.SUBSONIC_CACHE_ON_PLAY !== undefined) {
  setBoolConfig('subsonic.cacheOnPlay', envParams.SUBSONIC_CACHE_ON_PLAY)
}
if (envParams.SUBSONIC_PLAY_CACHE_FIRST !== undefined) {
  setBoolConfig('subsonic.playCacheFirst', envParams.SUBSONIC_PLAY_CACHE_FIRST)
}
if (envParams.SUBSONIC_QUALITY_ENABLED !== undefined) {
  setBoolConfig('subsonic.quality.enabled', envParams.SUBSONIC_QUALITY_ENABLED)
}
if (envParams.SUBSONIC_QUALITY_PRIORITY) {
  global.lx.config['subsonic.quality.priority'] = envParams.SUBSONIC_QUALITY_PRIORITY.split(',').map((s: string) => s.trim()).filter(Boolean).join(',')
}
if (envParams.SUBSONIC_QUALITY_CLIENT_CAP_MODE) {
  const mode = envParams.SUBSONIC_QUALITY_CLIENT_CAP_MODE as any
  if (mode === 'hard' || mode === 'soft') global.lx.config['subsonic.quality.clientCapMode'] = mode
}
if (envParams.SUBSONIC_SOURCE_PRIORITY) {
  global.lx.config['subsonic.source.priority'] = envParams.SUBSONIC_SOURCE_PRIORITY.split(',').map((s: string) => s.trim()).filter(Boolean).join(',')
}
if (envParams.SUBSONIC_SOURCE_CROSS_PLATFORM !== undefined) {
  setBoolConfig('subsonic.source.crossPlatform', envParams.SUBSONIC_SOURCE_CROSS_PLATFORM)
}
if (envParams.SUBSONIC_SOURCE_AUTOSWITCH_CUSTOM !== undefined) {
  setBoolConfig('subsonic.source.autoSwitchCustom', envParams.SUBSONIC_SOURCE_AUTOSWITCH_CUSTOM)
}
if (envParams.ARTIST_MAX_FETCH_PAGES) {
  const pages = parseInt(envParams.ARTIST_MAX_FETCH_PAGES, 10)
  if (!isNaN(pages) && pages > 0) global.lx.config['artist.maxFetchPages'] = pages
}
if (envParams.CACHE_NAMING_PATTERN) {
  global.lx.config['cache.namingPattern'] = envParams.CACHE_NAMING_PATTERN
}
if (envParams.SYSTEM_ALLOW_UNSAFE_VM !== undefined) {
  setBoolConfig('system.allowUnsafeVM', envParams.SYSTEM_ALLOW_UNSAFE_VM)
}
if (envParams.SINGER_SOURCE_PRIORITY !== undefined) {
  const priority = envParams.SINGER_SOURCE_PRIORITY.split(',').filter(s => s === 'tx' || s === 'wy') as Array<'tx' | 'wy'>
  if (priority.length > 0) global.lx.config['singer.sourcePriority'] = priority
}
if (envParams.CONFIG_BACKUP_ENABLE !== undefined) {
  setBoolConfig('configBackup.enable', envParams.CONFIG_BACKUP_ENABLE)
}
if (envParams.CONFIG_BACKUP_RETENTION_DAYS) {
  const days = parseInt(envParams.CONFIG_BACKUP_RETENTION_DAYS, 10)
  if (!isNaN(days) && days > 0) global.lx.config['configBackup.retentionDays'] = days
}
if (envParams.CONFIG_BACKUP_DIR !== undefined) {
  const dir = String(envParams.CONFIG_BACKUP_DIR).trim()
  if (/[<>"|?*]/.test(dir)) {
    console.warn(`[Config] 环境变量 CONFIG_BACKUP_DIR 包含非法字符 ("${dir}")，已忽略并回退到默认目录`)
    global.lx.config['configBackup.dir'] = ''
  } else {
    global.lx.config['configBackup.dir'] = dir
  }
}
if (envParams.SNAPSHOT_BACKUP_PATH !== undefined) {
  const snapPath = String(envParams.SNAPSHOT_BACKUP_PATH).trim()
  if (/[<>"|?*]/.test(snapPath)) {
    console.warn(`[Config] 环境变量 SNAPSHOT_BACKUP_PATH 包含非法字符 ("${snapPath}")，已忽略并回退到默认目录`)
    global.lx.config['snapshot.backupPath'] = ''
  } else {
    global.lx.config['snapshot.backupPath'] = snapPath
  }
}
if (envParams.SERVER_NAME) {
  global.lx.config.serverName = envParams.SERVER_NAME
}

// 代理地址合法性校验与清洗（支持 http:, https:, socks:, socks4:, socks5:）
const sanitizeProxyAddress = (address: any, fieldName: string): string => {
  if (!address || typeof address !== 'string') return ''
  const trimmed = address.trim()
  if (!trimmed) return ''
  try {
    const parsed = new URL(trimmed)
    if (['http:', 'https:', 'socks:', 'socks4:', 'socks5:'].includes(parsed.protocol)) {
      return trimmed
    }
    console.warn(`[Config] ${fieldName} 协议不受支持 ("${parsed.protocol}")，仅支持 http/https/socks5，已清空为默认直连`)
    return ''
  } catch {
    console.warn(`[Config] ${fieldName} 填入非法代理地址 ("${trimmed}")，已清空为默认直连`)
    return ''
  }
}

// 启动阶段清洗各代理地址
global.lx.config['proxy.all.address'] = sanitizeProxyAddress(global.lx.config['proxy.all.address'], 'proxy.all.address')
;(['music', 'customSource', 'app'] as const).forEach(cat => {
  const kAddress = `proxy.${cat}.address` as keyof LX.Config
  const val = global.lx.config[kAddress]
  if (val) {
    (global.lx.config as any)[kAddress] = sanitizeProxyAddress(val, kAddress)
  }
})

// Subsonic 路径冗余校正（确保以 / 开头，去除尾部多余斜杠）
if (typeof global.lx.config['subsonic.path'] === 'string') {
  let subPath = global.lx.config['subsonic.path'].trim()
  if (!subPath.startsWith('/')) subPath = '/' + subPath
  subPath = subPath.replace(/\/+$/, '') || '/rest'
  global.lx.config['subsonic.path'] = subPath
}

// 缓存大小边界防护（避免 <= 0 的非法值）
if (typeof global.lx.config['user.cacheSizeLimit'] === 'number') {
  if (isNaN(global.lx.config['user.cacheSizeLimit']) || global.lx.config['user.cacheSizeLimit'] <= 0) {
    global.lx.config['user.cacheSizeLimit'] = 2000
  }
}

if (envUsers.length) {
  const users: LX.Config['users'] = []
  let u
  for (let user of envUsers) {
    let isLikeJSON = true
    try {
      u = JSON.parse(user.password) as Omit<LX.User, 'name'>
    } catch {
      isLikeJSON = false
    }
    if (isLikeJSON && typeof u == 'object') {
      users.push({
        name: user.name,
        ...u,
        dataPath: '',
      })
    } else {
      users.push({
        name: user.name,
        password: user.password,
        dataPath: '',
      })
    }
  }
  global.lx.config.users = users
}

const exit = (message: string): never => {
  console.error(message)
  process.exit(0)
}

const checkAndCreateDir = (path: string) => {
  try {
    checkAndCreateDirSync(path)
  } catch (e: any) {
    if (e.code !== 'EEXIST') {
      exit(`Could not set up log directory, error was: ${e.message as string}`)
    }
  }
}

const checkUserConfig = (users: LX.Config['users']) => {
  const userNames: string[] = []
  const passwords: string[] = []
  // 允许重复密码的条件：开启了路径模式 且 关闭了根路径模式
  const allowDuplicatePasswords = global.lx.config['user.enablePath'] && !global.lx.config['user.enableRoot']

  for (const user of users) {
    if (userNames.includes(user.name)) exit('User name duplicate: ' + user.name)
    if (!allowDuplicatePasswords && passwords.includes(user.password)) exit('User password duplicate: ' + user.password)
    userNames.push(user.name)
    passwords.push(user.password)
  }
}

checkAndCreateDir(global.lx.logPath)
checkAndCreateDir(global.lx.dataPath)
checkAndCreateDir(global.lx.userPath)
checkAndCreateDir(global.lx.userPath)

// Load users from users.json if exists
const usersJsonPath = path.join(global.lx.dataPath, 'users.json')
if (storageFs.existsSync(usersJsonPath)) {
  try {
    const users = JSON.parse(storageFs.readFileSync(usersJsonPath, 'utf-8'))
    if (Array.isArray(users)) {
      console.log('[用户] 从 users.json 加载用户列表')
      global.lx.config.users = users.map(u => ({ ...u, dataPath: '' }))
    }
  } catch (err) {
    console.error('[用户] 加载 users.json 失败:', err)
  }
} else {
  // Save initial users to users.json
  try {
    storageFs.writeFileSync(usersJsonPath, JSON.stringify(global.lx.config.users.map(u => ({
      name: u.name,
      password: u.password,
      maxSnapshotNum: u.maxSnapshotNum,
      'list.addMusicLocationType': u['list.addMusicLocationType'],
      enableCustomMusicDir: u.enableCustomMusicDir,
      customMusicDir: u.customMusicDir,
      allowOperateCustomMusicDir: u.allowOperateCustomMusicDir,
      allowWriteCustomMusicDir: u.allowWriteCustomMusicDir,
    })), null, 2))
  } catch (err) {
    console.error('[用户] 保存 users.json 失败:', err)
  }
}

checkUserConfig(global.lx.config.users)

console.log(`[用户] 已注册用户:
${global.lx.config.users.map(user => `  ${user.name}: ${user.password}`).join('\n') || '  (暂无用户)'}
`)
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { getUserDirname } = require('./user')
let hasUserCustomDirModified = false
for (const user of global.lx.config.users) {
  const dataPath = path.join(global.lx.userPath, getUserDirname(user.name))
  checkAndCreateDir(dataPath)
  user.dataPath = dataPath

  if (user.enableCustomMusicDir) {
    let isValid = false
    if (user.customMusicDir && typeof user.customMusicDir === 'string' && user.customMusicDir.trim()) {
      const resolvedDir = path.resolve(user.customMusicDir.trim())
      try {
        if (storageFs.existsSync(resolvedDir) && storageFs.statSync(resolvedDir).isDirectory()) {
          isValid = true
        }
      } catch {
        isValid = false
      }
    }
    if (!isValid) {
      console.warn(`[StartupCheck] 用户 ${user.name} 的自定义歌曲目录 [${user.customMusicDir || ''}] 无效，已自动关闭自定义目录功能并清除路径`)
      user.enableCustomMusicDir = false
      user.customMusicDir = ''
      hasUserCustomDirModified = true
    }
  }
}

if (hasUserCustomDirModified) {
  saveConfigToFile()
  try {
    storageFs.writeFileSync(usersJsonPath, JSON.stringify(global.lx.config.users.map(u => ({
      name: u.name,
      password: u.password,
      maxSnapshotNum: u.maxSnapshotNum,
      'list.addMusicLocationType': u['list.addMusicLocationType'],
      enableCustomMusicDir: u.enableCustomMusicDir,
      customMusicDir: u.customMusicDir,
      allowOperateCustomMusicDir: u.allowOperateCustomMusicDir,
      allowWriteCustomMusicDir: u.allowWriteCustomMusicDir,
    })), null, 2))
  } catch (err) {
    console.error('Failed to update users.json after custom dir cleanup', err)
  }
}

initLogger()


/**
 * Normalize a port into a number, string, or false.
 */

function normalizePort(val: string) {
  const port = parseInt(val, 10)

  if (isNaN(port) || port < 1) {
    // named pipe
    exit(`port illegal: ${val}`)
  }
  return port
}

/**
 * Get port from environment and store in Express.
 */

// const port = normalizePort(envParams.PORT ?? '9527')
// const bindIP = envParams.BIND_IP ?? '127.0.0.1'

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { createModuleEvent } = require('./event')
createModuleEvent()

// eslint-disable-next-line @typescript-eslint/no-var-requires
require('./utils/migrate').default(global.lx.dataPath, global.lx.userPath)

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { startServer } = require('./server')

// 初始化 WebDAV 同步
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { createWebDavGateway } = require('./integrations/webdav/WebDavGateway') as typeof import('./integrations/webdav/WebDavGateway')
const webdavSync = createWebDavGateway({
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
}, global.lx.dataPath)


// 导出 webdavSync 实例供全局使用
global.lx.webdavSync = webdavSync

// 如果配置了 WebDAV，在启动时尝试从远程恢复
if (webdavSync.isConfigured()) {
  console.log('[WebDAV] 已配置 WebDAV，正在尝试从远端恢复数据...')
  void webdavSync.restoreFromRemote().then(async (success: boolean) => {
    if (success) {
      console.log('[WebDAV] 数据已成功从 WebDAV 恢复')

      // 云端恢复写回 SQL 文档后，再从管理库刷新运行配置。
      try { margeConfig(global.lx.configPath) }
      catch (error) { console.error('[WebDAV] 恢复后加载 SQL 配置失败:', error) }

      // 2. 重新加载 users.json
      const usersJsonPath = path.join(global.lx.dataPath, 'users.json')
      if (storageFs.existsSync(usersJsonPath)) {
        try {
          const users = JSON.parse(storageFs.readFileSync(usersJsonPath, 'utf-8'))
          if (Array.isArray(users)) {
            console.log('[WebDAV] 从恢复的 users.json 重新加载用户列表')
            global.lx.config.users = users.map(u => ({ ...u, dataPath: '' }))

            // 重新初始化用户目录
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const { getUserDirname } = require('./user')
            for (const user of global.lx.config.users) {
              const dataPath = path.join(global.lx.userPath, getUserDirname(user.name))
              checkAndCreateDir(dataPath)
              user.dataPath = dataPath
            }
          }
        } catch (err) {
          console.error('[WebDAV] 恢复后重新加载 users.json 失败:', err)
        }
      }

      // 3. 重新加载所有自定义源 (解决前端显示加载中/旧源问题)
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { initUserApis } = require('./integrations/custom-source/CustomSourceGateway')
      console.log('[WebDAV] 正在重新初始化自定义源...')
      await initUserApis()
    }
    // 启动自动同步
    webdavSync.startAutoSync()
  })
} else {
  console.log('[WebDAV] 未配置 WebDAV，跳过远端恢复')
}

// [新增] 确保数据目录下的 _open 及 _open/library 目录存在 (用于公共受限资源 & 公开收藏)
const openDir = path.join(global.lx.userPath, '_open')
const openLibDir = path.join(openDir, 'library')
if (!storageFs.existsSync(openDir)) {
  storageFs.mkdirSync(openDir, { recursive: true })
}
if (!storageFs.existsSync(openLibDir)) {
  storageFs.mkdirSync(openLibDir, { recursive: true })
}

// 启动前保存合并后的配置到 SQLite，环境变量优先级保持原顺序
saveConfigToFile()

// 每日清理过期本地配置备份（保留最近 7 天）
cleanOldConfigBackups()
const configBackupTimer = setInterval(cleanOldConfigBackups, 24 * 60 * 60 * 1000)
if (typeof configBackupTimer.unref === 'function') configBackupTimer.unref()

startServer(global.lx.config.port, '0.0.0.0')

// 业务配置通过后台保存到 SQLite；不监听旧配置文件。
