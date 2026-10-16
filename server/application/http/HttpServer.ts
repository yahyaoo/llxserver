import { ClientChannel, cacheVersions } from './ClientChannel'
import { getMusicDirectories, validateDirectories, checkDirectory } from '../library/MusicDirectoryService'
import { ApiTokenStore } from '../auth/ApiTokenStore'
import { handleAccount } from '../../music/service/AccountService'
import { UserSessionStore, USER_SESSION_COOKIE, ADMIN_SESSION_COOKIE, ADMIN_USERNAME } from '../auth/UserSessionStore'
import { proxyRemoteRequest } from '../auth/RemoteSessionGateway'
import { clientFileExists, clientMetadata, externalClient } from './ClientAssets'
import { deliverStatic } from './StaticDelivery'
import { DatabaseLocationService } from '../persistence/DatabaseLocationService'
import { reloadActiveUserSpaces } from '../../user'
import type { UserToken } from '../../common/model/dto/UserTokenDto'
import { GlobalConfigurationService } from '../../admin/service/GlobalConfigurationService'
import defaultConfig from '../../defaultConfig'
import { BrowserStorageService } from '../../music/service/configuration/BrowserStorageService'
import { handleLibraryAdmin, startLibraryBackground, stopLibraryBackground, refreshLibraryBackground } from '../../music/service/library/LibraryBackgroundService'
import { installLibraryReadGuard } from '../../music/service/library/LibraryFileGuard'
import { BrowserStorageRepository } from '../../music/repository/BrowserStorageRepository'
/** 服务装配与 HTTP 路由：初始化依赖、同步 WebSocket、播放器鉴权和媒体响应。 @author yahyaoo */
import * as adminOperationsController from '../../admin/controller/OperationsController'
import { importConfiguration } from '../../music/controller/ConfigurationImportController'
import { importPlaylists } from '../../music/controller/PlaylistImportController'
import { songFileStatus } from '../../music/controller/SongFileStatusController'
import { songFileStatusService } from '../../music/service/library/SongFileStatusSources'
import { MusicConfigurationRepository } from '../../music/repository/MusicConfigurationRepository'
import { LxConfigurationImportService } from '../../music/service/configuration/LxConfigurationImportService'
import { repositories } from '../persistence/storage'
import { browserList } from '../../music/controller/BrowserStorageController'
import * as adminUserController from '../../admin/controller/UserController'
import * as musicPlaylistController from '../../music/controller/PlaylistController'
import * as musicFavoriteController from '../../music/controller/FavoriteController'
import * as musicAuthenticationController from '../../music/controller/AuthenticationController'
import * as musicLibraryController from '../../music/controller/LibraryController'
import * as musicDownloadController from '../../music/controller/DownloadController'
import * as musicSettingsController from '../../music/controller/SettingsController'
import { handleExperience } from '../../music/controller/ExperienceController'
import { startNotificationPersistence } from '../../music/service/NotificationService'
import * as musicDiscoveryController from '../../music/controller/DiscoveryController'
import * as adminSourceController from '../../admin/controller/SourceController'
import * as adminConfigurationController from '../../admin/controller/ConfigurationController'
import * as adminBackupController from '../../admin/controller/BackupController'
import storageFs from '../persistence/documentFileSystem'
import http, { type IncomingMessage } from 'node:http'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import url from 'node:url'
import { WebSocketServer, WebSocket } from 'ws'
import { registerLocalSyncEvent, callObj, sync } from '../../server/sync'
import { authCode, authConnect } from '../../server/auth'
import { getAddress, sendStatus, decryptMsg, encryptMsg, getIP } from '../../utils/tools'
import { accessLog, startupLog, syncLog, loginLog, tokenLog } from '../../utils/log4js'
import {
  File,
  SYNC_CODE,
  SYNC_CLOSE_CODE,
} from '../../constants'
import { getUserSpace, releaseUserSpace, getUserName, getServerId, getUserDirname, getUserConfig, migrateUserData, renameUserSpace, finishRenameUserSpace, updateAllUserSnapshotDirs } from '../../user'
import { parseDislikeRules, splitSingers } from '../../music/service/dislike/match'
import { encodeAlbumRule } from '../../music/service/dislike/utils'
import { normalizeText } from '../../music/service/discovery/songVersion'
import { invalidateDislikeCache } from '../../music/service/discovery/dislikeCache'
import { createMsg2call } from 'message2call'
import { ElFinderConnector, getSystemRoot } from '../../server/elfinderConnector'
import formidable from 'formidable'
// @ts-ignore
import musicSdkRaw from '../../integrations/music-sdk/MusicGateway'
const musicSdk = musicSdkRaw as any
import { initUserApis, callUserApiGetMusicUrl, isSourceSupported, getLoadedApis, getLoadedApisCount } from '../../integrations/custom-source/CustomSourceGateway'
import * as customSourceHandlers from '../../admin/service/source/CustomSourceService'
import * as fileCache from '../../music/service/cache/FileCacheService'
import * as customMusicManager from '../../music/service/library/CustomMusicService'
import * as serverDownloadQueue from '../../music/service/download/ServerDownloadQueueService'
import * as serverDownloads from '../../music/service/download/ServerDownloadService'
import { startMaintenance } from '../../music/service/library/MusicMaintenanceService'
import { getMusicTasks } from '../../music/service/library/MusicTaskService'
import * as appUpdates from '../../integrations/update/UpdateGateway'
import * as remasterQueue from '../../music/service/download/RemasterQueueService'
import * as scheduler from '../../music/service/task/SchedulerService'
import { getUpdatedListIds, removeUpdatedListId } from '../../music/service/task/networkListTask'
import { setSongResolver, getSyncDownloadData, saveSyncDownloadData, getUserSyncProgress, triggerUserSync, cancelUserSync, getUserSyncStorageLocation, isUserSyncRunning, migrateSyncStorage } from '../../music/service/task/syncDownloadTask'
import { getDownloadQualityCandidates } from '../../server/downloadQuality'
import crypto from 'node:crypto'
import needle from 'needle'
import { getProxyAgent } from '../../integrations/music-sdk/NetworkGateway'
const { MusicTagger, MetaPicture } = require('music-tag-native')

/** 当前生效的 dislike 匹配选项，下发给前端保证前后端判定一致 */
const dislikeMatchOptions = () => ({
  crossSource: global.lx.config['subsonic.dislikeCrossSource'] === true,
  duetMode: (global.lx.config['subsonic.dislikeDuetMode'] || 'any') as 'any' | 'all' | 'primary',
  normalizeName: global.lx.config['subsonic.dislikeNormalizeName'] !== false,
  requireSinger: global.lx.config['subsonic.dislikeRequireSinger'] !== false,
})

/** 把 dislike 规则集转成可 JSON 序列化的结构（Set/Map → Array，同时聚合 dislike/library 下的 albums 和 artists） */
const serializeDislikeRules = (rules: string, username?: string) => {
  const parsed = parseDislikeRules(rules)
  if (username) {
    try {
      const uDir = getUserDirname(username)
      const dLibDir = path.join(global.lx.userPath, uDir, 'dislike', 'library')
      // Merge disliked albums from library/albums.json
      const albumsFile = path.join(dLibDir, 'albums.json')
      if (storageFs.existsSync(albumsFile)) {
        const albumsArr = JSON.parse(storageFs.readFileSync(albumsFile, 'utf8'))
        if (Array.isArray(albumsArr)) {
          for (const x of albumsArr) {
            const albumName = normalizeText(String(x.name || ''))
            if (!albumName) continue
            let sSet = parsed.albums.get(albumName)
            if (!sSet) {
              sSet = new Set<string>()
              parsed.albums.set(albumName, sSet)
            }
            const singers = splitSingers(x.artistName)
            for (const s of singers) sSet.add(s)
          }
        }
      }
      // Merge disliked artists from library/artists.json
      const artistsFile = path.join(dLibDir, 'artists.json')
      if (storageFs.existsSync(artistsFile)) {
        const artistsArr = JSON.parse(storageFs.readFileSync(artistsFile, 'utf8'))
        if (Array.isArray(artistsArr)) {
          for (const x of artistsArr) {
            const singerName = normalizeText(String(x.name || ''))
            if (singerName) parsed.singerNames.add(singerName)
          }
        }
      }
    } catch (e: any) {
      console.warn('[黑名单] 合并黑名单规则失败:', e.message)
    }
  }
  return {
    exact: Array.from(parsed.exact),
    musicNames: Array.from(parsed.musicNames),
    singerNames: Array.from(parsed.singerNames),
    albums: Array.from(parsed.albums.entries()).map(([albumName, singers]) => ({
      albumName,
      singers: Array.from(singers),
    })),
  }
}

// ===== Player Session Store =====
const playerSessions = new Map<string, { /** 记录创建时间。 */
createdAt: number }>()
const SESSION_TTL = 24 * 60 * 60 * 1000 // 24小时
const SESSION_COOKIE_NAME = 'lx_player_session'

// 收藏歌手列表头像补全：内存缓存（避免每次刷新重复请求音源）
const artistPicCache = new Map<string, string>()
const artistPicInFlight = new Map<string, Promise<string | null>>()
/**
 * 从歌手详情的候选图片字段中提取可用图片地址。
 * @param d 待格式化日期。
 * @author yahyaoo
 */
function extractArtistPic(d: any): string | null {
  if (!d || typeof d !== 'object') return null
  return d.avatar || d.img || d.pic || d.picUrl || d.picture || d.image || d.cover || null
}

// 收藏专辑列表封面补全：内存缓存（best-effort：取专辑歌曲列表首曲 img）
const albumPicCache = new Map<string, string>()
const albumPicInFlight = new Map<string, Promise<string | null>>()
/**
 * 从专辑详情中提取封面地址，兼容不同音乐平台字段。
 * @param d 待格式化日期。
 * @author yahyaoo
 */
function extractAlbumPic(d: any): string | null {
  const first = d?.list?.[0]
  const candidates = [first?.img, first?.meta?.img, d?.info?.img, d?.img, d?.pic, d?.cover, d?.coverUrl]
  for (const v of candidates) if (typeof v === 'string' && v) return v
  return null
}

// 进程级共享信号量：限制整个服务同时向音源回源拉取专辑/歌手详情的并发数，防止限流
const MEDIA_METADATA_FETCH_MAX_CONCURRENCY = 5
let activeMediaMetadataFetches = 0
const mediaMetadataWaiters: Array<() => void> = []

/**
 * 等待媒体元信息操作的并发名额，避免同时启动过多原生处理任务。
 * @author yahyaoo
 */
function acquireMediaMetadataSlot(): Promise<void> {
  return new Promise<void>((resolve) => {
    if (activeMediaMetadataFetches < MEDIA_METADATA_FETCH_MAX_CONCURRENCY) {
      activeMediaMetadataFetches++
      resolve()
    } else {
      mediaMetadataWaiters.push(resolve)
    }
  })
}

/**
 * 归还元信息处理名额，并唤醒等待队列中的下一项操作。
 * @author yahyaoo
 */
function releaseMediaMetadataSlot() {
  activeMediaMetadataFetches = Math.max(0, activeMediaMetadataFetches - 1)
  const next = mediaMetadataWaiters.shift()
  if (next) {
    activeMediaMetadataFetches++
    next()
  }
}

/** 进程级共享的专辑封面拉取：带全局并发限制与 In-flight Promise 复用 */
async function fetchAlbumPicShared(source: string, id: string | number): Promise<string | null> {
  const key = `${source}::${id}`
  const cached = albumPicCache.get(key)
  if (cached) return cached

  if (albumPicInFlight.has(key)) {
    return albumPicInFlight.get(key)!
  }

  const promise = (async () => {
    await acquireMediaMetadataSlot()
    try {
      if (albumPicCache.has(key)) return albumPicCache.get(key) || null
      const detail = await musicSdk[source]?.extendDetail?.getAlbumSongs?.(String(id))
      const pic = extractAlbumPic(detail) || null
      if (pic) albumPicCache.set(key, pic)
      return pic
    } catch {
      return null
    } finally {
      releaseMediaMetadataSlot()
      albumPicInFlight.delete(key)
    }
  })()

  albumPicInFlight.set(key, promise)
  return promise
}

/** 进程级共享的歌手头像拉取：带全局并发限制与 In-flight Promise 复用 */
async function fetchArtistPicShared(source: string, id: string | number): Promise<string | null> {
  const key = `${source}::${id}`
  const cached = artistPicCache.get(key)
  if (cached) return cached

  if (artistPicInFlight.has(key)) {
    return artistPicInFlight.get(key)!
  }

  const promise = (async () => {
    await acquireMediaMetadataSlot()
    try {
      if (artistPicCache.has(key)) return artistPicCache.get(key) || null
      const detail = await musicSdk[source]?.extendDetail?.getArtistDetail?.(String(id))
      const pic = extractArtistPic(detail) || null
      if (pic) artistPicCache.set(key, pic)
      return pic
    } catch {
      return null
    } finally {
      releaseMediaMetadataSlot()
      artistPicInFlight.delete(key)
    }
  })()

  artistPicInFlight.set(key, promise)
  return promise
}

/** 生成随机 sessionId */
const generateSessionId = () => crypto.randomBytes(32).toString('hex')

/** 解析 Cookie 字符串 */
const parseCookies = (cookieHeader: string | undefined): Record<string, string> => {
  if (!cookieHeader) return {}
  return Object.fromEntries(
    cookieHeader.split(';').map(c => {
      const [k, ...v] = c.trim().split('=')
      return [k.trim(), decodeURIComponent(v.join('='))]
    })
  )
}

/** 检查请求是否携带有效的 Player Session Cookie */
const checkPlayerAuth = (req: IncomingMessage): boolean => {
  if (!global.lx.config['player.enableAuth']) return true // 未开启认证，直接放行
  const cookies = parseCookies(req.headers['cookie'])
  const sessionId = cookies[SESSION_COOKIE_NAME]
  if (!sessionId) return false
  const session = playerSessions.get(sessionId)
  if (!session) return false
  if (Date.now() - session.createdAt > SESSION_TTL) {
    playerSessions.delete(sessionId)
    return false
  }
  return true
}

/** 定期清理过期 Session（每小时） */
setInterval(() => {
  const now = Date.now()
  for (const [id, session] of playerSessions) {
    if (now - session.createdAt > SESSION_TTL) playerSessions.delete(id)
  }
}, 60 * 60 * 1000)
// ===== End Player Session Store =====

// ===== User Session Token Store =====
export type { UserToken } from '../../common/model/dto/UserTokenDto'

/** 播放器用户令牌的有效期与保存数据结构。 @author yahyaoo */
interface UserTokenConfig {
  /** 功能是否启用。 */
  enabled: boolean

  tokens: UserToken[]
}

/** 用户 Token 存储：token → { username, createdAt } */
const userSessions = new UserSessionStore()

const apiTokenStore = new ApiTokenStore(getUserDirname)
const getUserTokenConfig = (username: string): UserTokenConfig => apiTokenStore.get(username)
const saveUserTokenConfig = (username: string, config: UserTokenConfig) => apiTokenStore.save(username, config)

/** 会话 Cookie、请求头以及标准 Bearer Token 统一认证。 */
export const verifyUserAuth = (req: IncomingMessage): string | null => {
  const bearer = /^Bearer (.+)$/i.exec(req.headers.authorization || '')?.[1]
  const token = (req.headers['x-user-token'] as string) || bearer || parseCookies(req.headers.cookie)[USER_SESSION_COOKIE]
  if (!token) return null
  const session = userSessions.get(token)
  if (session && session.username !== ADMIN_USERNAME) return session.username
  const username = apiTokenStore.verify(token)
  if (username) tokenLog.info('API Token (' + token.slice(0, 6) + '...' + token.slice(-4) + ') used by ' + username + ' from ' + getIP(req) + ' to access ' + (req.url || '').split('?')[0])
  return username
}

const getCacheRequestUsername = (req: IncomingMessage): string | null => {
  const requested = (req.headers['x-user-name'] as string) || ''
  if (!requested || requested === 'default' || requested === 'open' || requested === '_open') return '_open'
  return verifyUserAuth(req)
}

setInterval(() => userSessions.prune(), 60 * 60 * 1000)
// ===== End User Session Token Store =====


const getMime = (filename: string) => {
  const ext = path.extname(filename).toLowerCase()
  const mimeTypes: Record<string, string> = {
    '.txt': 'text/plain',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.html': 'text/html',
    '.css': 'text/css',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.pdf': 'application/pdf',
    '.zip': 'application/zip',
    '.mp3': 'audio/mpeg',
    '.mp4': 'video/mp4',
  }
  return mimeTypes[ext] || 'application/octet-stream'
}

/**
 * 规范化歌曲信息，确保收藏列表中的 meta 属性在根节点也可用
 * 解决 SDK 无法识别收藏歌曲音质的问题
 */
const normalizeSongInfo = (songInfo: any) => {
  if (!songInfo) return songInfo
  const meta = songInfo.meta || {}

  // 1. 处理音质信息 (types / _types)
  if (!songInfo.types && meta) {
    songInfo.types = meta.qualitys || meta.types
  }
  if (!songInfo._types && meta) {
    songInfo._types = meta._qualitys || meta._types
  }

  // 2. 处理基础字段备用根节点映射
  if (!songInfo.albumName && meta.albumName) songInfo.albumName = meta.albumName
  if (!songInfo.albumId && meta.albumId) songInfo.albumId = meta.albumId
  if (!songInfo.img && meta.picUrl) songInfo.img = meta.picUrl
  if (!songInfo.name && meta.name) songInfo.name = meta.name
  if (!songInfo.singer && meta.singer) songInfo.singer = meta.singer
  if (!songInfo.source && meta.source) songInfo.source = meta.source
  if (!songInfo.interval && meta.interval) songInfo.interval = meta.interval

  // 3. 处理通用 ID 转换 (id -> songmid)
  if (!songInfo.songmid) {
    if (meta.songId) {
      songInfo.songmid = meta.songId
    } else if (songInfo.id) {
      const sourcePrefix = `${songInfo.source}_`
      if (typeof songInfo.id === 'string' && songInfo.id.startsWith(sourcePrefix)) {
        songInfo.songmid = songInfo.id.slice(sourcePrefix.length)
      } else {
        songInfo.songmid = songInfo.id
      }
    }
  }

  // 4. 针对各平台 SDK 所需的特定字段进行补全
  switch (songInfo.source) {
    case 'wy': // 网易
      if (!songInfo.id && meta.songId) songInfo.id = Number(meta.songId)
      if (!songInfo.songmid && songInfo.id) songInfo.songmid = String(songInfo.id)
      break

    case 'kg': // 酷狗
      if (!songInfo.hash && meta.hash) songInfo.hash = meta.hash
      // 兼容某些 SDK 可能需要的 songmid 格式 (数字_哈希 或 仅哈Hash)
      break

    case 'tx': // 腾讯
      if (!songInfo.strMediaMid && meta.strMediaMid) songInfo.strMediaMid = meta.strMediaMid
      if (!songInfo.albumMid && meta.albumMid) songInfo.albumMid = meta.albumMid
      // 只有当 meta 中的 songId 是纯数字时才回填至 root.songId，否则保持 undefined 触发 SDK 自动获取
      const metaSongId = String(meta.songId || '')
      if (/^\d+$/.test(metaSongId)) {
        songInfo.songId = metaSongId
      }
      break

    case 'mg': // 咪咕
      if (!songInfo.copyrightId && meta.copyrightId) songInfo.copyrightId = meta.copyrightId
      if (!songInfo.lrcUrl && meta.lrcUrl) songInfo.lrcUrl = meta.lrcUrl
      if (!songInfo.songId) songInfo.songId = songInfo.songmid
      break

    case 'kw': // 酷我
      // 已在步骤 3 中通用处理
      break
  }

  return songInfo
}

let status: LX.Sync.Status = {
  status: false,
  message: '',
  address: [],
  // code: '',
  devices: [],
}

let host = 'http://localhost'
const sseClients = new Set<http.ServerResponse>()
// 音乐解析进度 SSE 专属通道: requestId -> response
const musicProgressClients = new Map<string, http.ServerResponse>()

// const codeTools: {
//   timeout: NodeJS.Timer | null
//   start: () => void
//   stop: () => void
// } = {
//   timeout: null,
//   start() {
//     this.stop()
//     this.timeout = setInterval(() => {
//       void generateCode()
//     }, 60 * 3 * 1000)
//   },
//   stop() {
//     if (!this.timeout) return
//     clearInterval(this.timeout)
//     this.timeout = null
//   },
// }

const checkDuplicateClient = (newSocket: LX.Socket) => {
  for (const client of [...wss!.clients]) {
    if (client === newSocket || client.keyInfo.clientId != newSocket.keyInfo.clientId) continue
    syncLog.info('duplicate client', client.userInfo.name, client.keyInfo.deviceName)
    client.isReady = false
    for (const name of Object.keys(client.moduleReadys) as Array<keyof LX.Socket['moduleReadys']>) {
      client.moduleReadys[name] = false
    }
    client.close(SYNC_CLOSE_CODE.normal)
  }
}

const handleConnection = async (socket: LX.Socket, request: IncomingMessage) => {
  const queryData = new URL(request.url as string, host).searchParams
  const clientId = queryData.get('i')

  //   // if (typeof socket.handshake.query.i != 'string') return socket.disconnect(true)
  const userName = getUserName(clientId)
  if (!userName) {
    socket.close(SYNC_CLOSE_CODE.failed)
    return
  }
  const userSpace = getUserSpace(userName)
  const keyInfo = userSpace.dataManage.getClientKeyInfo(clientId)
  if (!keyInfo) {
    socket.close(SYNC_CLOSE_CODE.failed)
    return
  }
  const user = global.lx.config.users.find(u => u.name == userName)
  if (!user) {
    socket.close(SYNC_CLOSE_CODE.failed)
    return
  }
  keyInfo.lastConnectDate = Date.now()
  userSpace.dataManage.saveClientKeyInfo(keyInfo)
  //   // socket.lx_keyInfo = keyInfo
  socket.keyInfo = keyInfo
  socket.userInfo = user

  checkDuplicateClient(socket)

  try {
    await sync(socket)
  } catch (err) {
    // console.log(err)
    syncLog.warn(err)
    socket.close(SYNC_CLOSE_CODE.failed)
    return
  }
  status.devices.push(keyInfo)
  // handleConnection(io, socket)
  sendStatus(status)
  socket.onClose(() => {
    status.devices.splice(status.devices.findIndex(k => k.clientId == keyInfo.clientId), 1)
    sendStatus(status)
  })

  // console.log('connection', keyInfo.deviceName)
  accessLog.info('connection', user.name, keyInfo.deviceName)
  // console.log(socket.handshake.query)

  socket.isReady = true
}

const handleUnconnection = (userName: string) => {
  // console.log('unconnection')
  releaseUserSpace(userName)
}

const authConnection = (req: http.IncomingMessage, callback: (err: string | null | undefined, success: boolean) => void) => {
  // console.log(req.headers)
  // // console.log(req.auth)
  // console.log(req._query.authCode)
  authConnect(req).then(() => {
    callback(null, true)
  }).catch(err => {
    // console.log('WebSocket auth failed:', err.message)
    callback(null, false) // <--- 修改为传递 null, false
  })
}

let wss: LX.SocketServer | null

/**
 * 提供无需处理结果的空回调。
 * @author yahyaoo
 */
function noop() { }
/**
 * 记录同步连接的底层套接字错误。
 * @param err 捕获的运行错误。
 * @author yahyaoo
 */
function onSocketError(err: Error) {
  console.error(err)
}

const saveUsers = () => {
  const usersJsonPath = path.join(global.lx.dataPath, 'users.json')
  try {
    storageFs.writeFileSync(usersJsonPath, JSON.stringify(global.lx.config.users.map(u => ({
      name: u.name,
      password: u.password,
      nickname: u.nickname,
      avatarVersion: u.avatarVersion,
      maxSnapshotNum: u.maxSnapshotNum,
      'list.addMusicLocationType': u['list.addMusicLocationType'],
      enableCustomMusicDir: u.enableCustomMusicDir,
      customMusicDir: u.customMusicDir,
      musicDirectoriesMigrated: (u as any).musicDirectoriesMigrated,
      allowOperateCustomMusicDir: u.allowOperateCustomMusicDir,
      allowWriteCustomMusicDir: u.allowWriteCustomMusicDir,
      enableAutoDownload: u.enableAutoDownload,
    })), null, 2))
    if (typeof global.lx.saveConfig === 'function') {
      global.lx.saveConfig()
    }
    return true
  } catch (err) {
    console.error('[用户管理] 保存 users.json 失败:', err)
    return false
  }
}

/** 统一保存目录前完成全部校验，仅允许修改现有用户的目录字段。 @author yahyaoo */
const validateCustomDirectoryUpdates = async (value: unknown) => {
  if (value === undefined) return []
  if (!Array.isArray(value) || value.length > global.lx.config.users.length) throw new Error('用户歌曲目录配置格式错误')
  const names = new Set<string>()
  const result = []
  for (const entry of value) {
    if (!entry || typeof entry.name !== 'string' || typeof entry.enableCustomMusicDir !== 'boolean' || names.has(entry.name)) throw new Error('用户歌曲目录配置格式错误')
    const user = global.lx.config.users.find(user => user.name === entry.name)
    if (!user) throw new Error('目录所属用户不存在')
    names.add(entry.name)
    const values = entry.directories ?? (entry.customMusicDir?.trim() ? [{ path: entry.customMusicDir, scanMinutes: 30 }] : [])
    const directories = await validateDirectories(entry.name, values)
    if (entry.enableCustomMusicDir && !directories.length) throw new Error('启用歌曲目录时必须填写目录')
    result.push({ user, directories, directory: directories[0]?.path || '', enabled: entry.enableCustomMusicDir, oldDirectory: user.customMusicDir || '', oldEnabled: !!user.enableCustomMusicDir })
  }
  return result
}

/** [新增] 服务器内部热重载数据 */
const reloadServerData = async () => {
  startupLog.info('Hot-reloading server data (users and config)...')

  // 1. 重新加载配置文件 (必须先加载基础配置)
  const configPath = global.lx.configPath || process.env.CONFIG_PATH || path.join(global.lx.dataPath, 'config.js')
  {
    try {
      const rootConfig = new GlobalConfigurationService(repositories().admin).load(configPath, defaultConfig)

      // 合并除 users 以外的配置项
      for (const key of Object.keys(rootConfig)) {
        if (key !== 'users') {
          (global.lx.config as any)[key] = (rootConfig as any)[key]
        }
      }

      startupLog.info(`Config re-loaded and merged from ${configPath}.`)
    } catch (err: any) {
      startupLog.error('Failed to reload config file:', err.message)
    }
  }

  // 2. 重新加载 users.json (users.json 权重更高，会覆盖 config.js 中的 users)
  const usersJsonPath = path.join(global.lx.dataPath, 'users.json')
  if (storageFs.existsSync(usersJsonPath)) {
    try {
      const usersRaw = storageFs.readFileSync(usersJsonPath, 'utf-8')
      const users = JSON.parse(usersRaw)
      if (Array.isArray(users)) {
        global.lx.config.users = users.map(u => ({
          ...u,
          dataPath: path.join(global.lx.userPath, getUserDirname(u.name))
        }))

        // 确保新加载的所有用户目录存在
        for (const user of global.lx.config.users) {
          if (!storageFs.existsSync(user.dataPath)) {
            storageFs.mkdirSync(user.dataPath, { recursive: true })
          }
        }
        startupLog.info(`Reloaded ${global.lx.config.users.length} users from users.json`)
      }
    } catch (err: any) {
      startupLog.error('Failed to reload users.json:', err.message)
    }
  }

  // 3. 重新初始化 User APIs (解决脚本源实时生效问题)
  try {
    await initUserApis()
    startupLog.info('User APIs re-initialized.')
  } catch (err: any) {
    startupLog.error('Failed to re-init user APIs:', err.message)
  }

  await reloadActiveUserSpaces()
  refreshLibraryBackground()

  return true
}

const checkAndCreateDir = (p: string) => {
  try {
    if (!storageFs.existsSync(p)) {
      storageFs.mkdirSync(p, { recursive: true })
    }
  } catch (e: any) {
    if (e.code !== 'EEXIST') {
      console.error(`[系统] 创建目录失败 (${p}):`, e.message)
    }
  }
}

const readBody = async (req: IncomingMessage) => await new Promise<string>((resolve, reject) => {
  const chunks: any[] = []
  req.on('data', chunk => { chunks.push(chunk) })
  req.on('end', () => {
    resolve(Buffer.concat(chunks).toString('utf-8'))
  })
  req.on('error', reject)
})

const formatBytes = (bytes: number): string => {
  if (!Number.isFinite(bytes) || bytes <= 0) return ''
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  return `${(bytes / Math.pow(1024, index)).toFixed(2)} ${units[index]}`
}

const getHeaderValue = (headers: Record<string, any>, key: string): string | undefined => {
  const value = headers[key] ?? headers[key.toLowerCase()]
  if (Array.isArray(value)) return value[0]
  return value == null ? undefined : String(value)
}

const parseContentLength = (headers: Record<string, any>): number | null => {
  const range = getHeaderValue(headers, 'content-range')
  const total = range?.match(/\/(\d+)$/)?.[1]
  if (total) {
    const parsed = Number(total)
    if (Number.isFinite(parsed) && parsed > 0) return parsed
  }

  const length = Number(getHeaderValue(headers, 'content-length'))
  if (Number.isFinite(length) && length > 0) return length

  return null
}

const getAudioRemoteSize = async (audioUrl: string): Promise<number | null> => {
  if (!/^https?:\/\//i.test(audioUrl)) return null

  const urlObj = new URL(audioUrl)
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Referer': urlObj.origin,
  }
  const options = {
    follow_max: 5,
    response_timeout: 8000,
    read_timeout: 8000,
    headers,
    // 音质探测抓的是音乐平台的音频地址，归 music 分类
    agent: await getProxyAgent(audioUrl, 'music'),
  }

  try {
    const resp = await needle('head', audioUrl, null, options)
    const size = parseContentLength(resp.headers || {})
    if (size) return size
  } catch (e: any) {
    console.warn(`[音质探测] HEAD 请求探测文件大小失败: ${e.message}`)
  }

  try {
    const resp = await needle('get', audioUrl, null, {
      ...options,
      headers: {
        ...headers,
        Range: 'bytes=0-0',
      },
    })
    return parseContentLength(resp.headers || {})
  } catch (e: any) {
    console.warn(`[音质探测] Range 分段探测文件大小失败: ${e.message}`)
  }

  return null
}

const AUTO_SOURCE_ORDER = ['wy', 'tx', 'kw', 'kg', 'mg']
const SOURCE_MATCH_CACHE_TTL = 60_000
const sourceMatchCache = new Map<string, { /** 缓存或票据失效时间。 */
expiresAt: number,
promise: Promise<any[]> }>()

const normalizeSongMatchText = (value: unknown) => String(value || '')
  .toLowerCase()
  .replace(/[（(\[].*?[）)\]]/g, '')
  .replace(/[\s\p{P}\p{S}]/gu, '')

const normalizeSongNameText = (value: unknown) => String(value || '')
  .toLowerCase()
  .replace(/[\s\p{P}\p{S}]/gu, '')

const splitSingerNames = (value: unknown) => String(value || '')
  .toLowerCase()
  .split(/[、，,&；;|/+]/)
  .map(normalizeSongMatchText)
  .filter(Boolean)

const isSingerMatch = (candidateSinger: unknown, targetSinger: unknown) => {
  const candidateText = normalizeSongMatchText(candidateSinger)
  const targetText = normalizeSongMatchText(targetSinger)
  if (!targetText) return true
  if (!candidateText) return false
  if (candidateText.includes(targetText) || targetText.includes(candidateText)) return true

  const candidateParts = splitSingerNames(candidateSinger)
  const targetParts = splitSingerNames(targetSinger)
  return candidateParts.some(candidatePart => targetParts.some(targetPart => (
    candidatePart.includes(targetPart) || targetPart.includes(candidatePart)
  )))
}

const getSongDurationSeconds = (value: unknown) => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value > 10000 ? Math.round(value / 1000) : Math.round(value)
  }

  const text = String(value || '').trim()
  if (!text) return 0
  if (/^\d+(?:\.\d+)?$/.test(text)) {
    const parsed = Number(text)
    return parsed > 10000 ? Math.round(parsed / 1000) : Math.round(parsed)
  }

  const parts = text.split(':').map(Number)
  if (parts.some(part => !Number.isFinite(part))) return 0
  if (parts.length === 2) return Math.round(parts[0] * 60 + parts[1])
  if (parts.length === 3) return Math.round(parts[0] * 3600 + parts[1] * 60 + parts[2])
  return 0
}

const getSongMatchScore = (candidate: any, target: any) => {
  const candidateName = normalizeSongNameText(candidate?.name)
  const targetName = normalizeSongNameText(target?.name)
  if (!candidateName || !targetName) return -1
  if (!candidateName.includes(targetName) && !targetName.includes(candidateName)) return -1
  if (!isSingerMatch(candidate?.singer, target?.singer)) return -1

  const candidateDuration = getSongDurationSeconds(candidate?.interval)
  const targetDuration = getSongDurationSeconds(target?.interval)
  let durationScore = 0
  if (candidateDuration > 0 && targetDuration > 0) {
    const durationDiff = Math.abs(candidateDuration - targetDuration)
    if (durationDiff > 8) return -1
    durationScore = 8 - durationDiff
  }

  const nameScore = candidateName === targetName ? 20 : 10
  const candidateAlbum = normalizeSongMatchText(candidate?.albumName)
  const targetAlbum = normalizeSongMatchText(target?.albumName)
  const albumScore = candidateAlbum && targetAlbum && candidateAlbum === targetAlbum ? 3 : 0
  return nameScore + durationScore + albumScore
}

const findServerSourceMatches = async (songInfo: any, username: string) => {
  if (!songInfo?.name || !songInfo?.singer) return []

  const cacheKey = [
    username,
    songInfo.source,
    normalizeSongMatchText(songInfo.name),
    normalizeSongMatchText(songInfo.singer),
    getSongDurationSeconds(songInfo.interval),
  ].join(':')
  const now = Date.now()
  const cached = sourceMatchCache.get(cacheKey)
  if (cached && cached.expiresAt > now) return cached.promise

  for (const [key, value] of sourceMatchCache) {
    if (value.expiresAt <= now) sourceMatchCache.delete(key)
  }

  const searchSources = AUTO_SOURCE_ORDER.filter(source => (
    source !== songInfo.source && isSourceSupported(source, username) && musicSdk[source]?.musicSearch?.search
  ))
  const query = `${songInfo.name} ${songInfo.singer}`
  const promise = Promise.all(searchSources.map(async source => {
    try {
      const searchData = await musicSdk[source].musicSearch.search(query, 1, 20)
      const list = Array.isArray(searchData?.list) ? searchData.list : []
      return list.map((item: any) => ({ ...item, source }))
    } catch (err: any) {
      console.warn(`[自动换源] 搜索 ${source} 失败: ${err?.message || err}`)
      return []
    }
  })).then(resultGroups => resultGroups.flat()
    .map(candidate => ({ candidate, score: getSongMatchScore(candidate, songInfo) }))
    .filter(item => item.score >= 0)
    .sort((a, b) => b.score - a.score)
    .map(item => item.candidate))

  sourceMatchCache.set(cacheKey, { expiresAt: now + SOURCE_MATCH_CACHE_TTL, promise })
  return promise
}

/** 歌曲链接解析结果，包含实际音源、音质和歌曲元信息。 @author yahyaoo */
interface ServerSongResolveResult {
  /** 请求或资源地址。 */
  url: string
  /** 音质标识。 */
  quality: string
  /** 歌曲详情及平台扩展字段。 */
  songInfo: any
  /** 客户端选择的音乐平台。 */
  requestedSource?: string
  /** 最终解析到的下载平台。 */
  downloadSource?: string
  /** 音源显示名称。 */
  sourceName?: string
}

const resolveServerSong = async (
  rawSongInfo: any,
  requestedQuality: string,
  username: string,
  allowQualityFallback: boolean,
): Promise<ServerSongResolveResult> => {
  const originalSong = normalizeSongInfo({ ...rawSongInfo })
  if (!originalSong?.source) throw new Error('Missing song source')

  const qualities = allowQualityFallback
    ? getDownloadQualityCandidates(requestedQuality)
    : [requestedQuality]
  const errors: string[] = []

  const tryCandidates = async (quality: string, rawCandidates: any[]) => {
    for (const rawCandidate of rawCandidates) {
      const candidate = normalizeSongInfo({ ...rawCandidate })
      const source = candidate?.source
      if (!source || !isSourceSupported(source, username)) continue

      try {
        const result = await callUserApiGetMusicUrl(source, candidate, quality, username, undefined, true)
        if (!result?.url) throw new Error('audio source returned no URL')
        return {
          url: result.url,
          quality: result.type || quality,
          songInfo: candidate,
          requestedSource: originalSong.source,
          downloadSource: fileCache.detectDownloadSource(result.url, source),
          sourceName: result.sourceName,
        }
      } catch (err: any) {
        errors.push(`${source}/${quality}: ${err?.message || 'resolve failed'}`)
      }
    }
    return null
  }

  const originalResult = await tryCandidates(requestedQuality, [originalSong])
  if (originalResult) return originalResult

  const matches = await findServerSourceMatches(originalSong, username)
  const switchedResult = await tryCandidates(requestedQuality, matches)
  if (switchedResult) return switchedResult

  for (const quality of qualities.slice(1)) {
    const fallbackResult = await tryCandidates(quality, [originalSong, ...matches])
    if (fallbackResult) return fallbackResult
  }

  throw new Error(`No downloadable source found (${errors.join('; ')})`)
}

const isPathInside = (child: string, parent: string): boolean => {
  const resolvedParent = path.resolve(parent)
  const resolvedChild = path.resolve(child)
  if (resolvedChild === resolvedParent) return true
  const withSep = resolvedParent.endsWith(path.sep) ? resolvedParent : resolvedParent + path.sep
  return resolvedChild.startsWith(withSep)
}

const serveStatic = (req: IncomingMessage, res: http.ServerResponse, filePath: string) => {
  // Prevent path traversal: ensure the resolved file path stays within staticPath
  if (!isPathInside(filePath, global.lx.staticPath)) {
    res.writeHead(403)
    res.end('Forbidden')
    return
  }
  const contentType = getMime(filePath)

  // 原路由及鉴权通过后才交接资源；独立服务端无需读取客户端文件内容。
  if (externalClient()) {
    res.writeHead(200, { 'Content-Type': contentType, 'X-LLX-Client-Asset': encodeURIComponent(path.relative(global.lx.staticPath, filePath).replace(/\\/g, '/')) })
    res.end()
    return
  }

  void deliverStatic(req, res, filePath, contentType)
}

/** 应用能力装配，状态通过 getter 保留热更新，避免两个域直接依赖。 @author yahyaoo */
export function createServerRuntime() {
  return {
    get databaseLocation() { return new DatabaseLocationService() },
    get ElFinderConnector() { return ElFinderConnector },
    get File() { return File },
    get MetaPicture() { return MetaPicture },
    get MusicTagger() { return MusicTagger },
    get SESSION_COOKIE_NAME() { return SESSION_COOKIE_NAME },
    get SESSION_TTL() { return SESSION_TTL },
    get SYNC_CLOSE_CODE() { return SYNC_CLOSE_CODE },
    get accessLog() { return accessLog },
    get appUpdates() { return appUpdates },
    get callUserApiGetMusicUrl() { return callUserApiGetMusicUrl },
    get cancelUserSync() { return cancelUserSync },
    get checkAndCreateDir() { return checkAndCreateDir },
    get checkPlayerAuth() { return checkPlayerAuth },
    get crypto() { return crypto },
    get customMusicManager() { return customMusicManager },
    get customSourceHandlers() { return customSourceHandlers },
    get dislikeMatchOptions() { return dislikeMatchOptions },
    get encodeAlbumRule() { return encodeAlbumRule },
    get fetchAlbumPicShared() { return fetchAlbumPicShared },
    get fetchArtistPicShared() { return fetchArtistPicShared },
    get fileCache() { return fileCache },
    get finishRenameUserSpace() { return finishRenameUserSpace },
    get formatBytes() { return formatBytes },
    get formidable() { return formidable },
    get generateSessionId() { return generateSessionId },
    get getAudioRemoteSize() { return getAudioRemoteSize },
    get getCacheRequestUsername() { return getCacheRequestUsername },
    get getLoadedApisCount() { return getLoadedApisCount },
    get getMime() { return getMime },
    get getProxyAgent() { return getProxyAgent },
    get getSyncDownloadData() { return getSyncDownloadData },
    get getSystemRoot() { return getSystemRoot },
    get getUpdatedListIds() { return getUpdatedListIds },
    get getUserConfig() { return getUserConfig },
    get getUserDirname() { return getUserDirname },
    get getUserSpace() { return getUserSpace },
    get getUserSyncProgress() { return getUserSyncProgress },
    get getUserSyncStorageLocation() { return getUserSyncStorageLocation },
    get getUserTokenConfig() { return getUserTokenConfig },
    get invalidateDislikeCache() { return invalidateDislikeCache },
    get isSourceSupported() { return isSourceSupported },
    get isUserSyncRunning() { return isUserSyncRunning },
    get loginLog() { return loginLog },
    get migrateSyncStorage() { return migrateSyncStorage },
    get migrateUserData() { return migrateUserData },
    get musicProgressClients() { return musicProgressClients },
    get musicSdk() { return musicSdk },
    get needle() { return needle },
    get normalizeSongInfo() { return normalizeSongInfo },
    get normalizeText() { return normalizeText },
    get os() { return os },
    get parseCookies() { return parseCookies },
    get path() { return path },
    get playerSessions() { return playerSessions },
    get readBody() { return readBody },
    get reloadServerData() { return reloadServerData },
    get refreshLibraryBackground() { return refreshLibraryBackground },
    get remasterQueue() { return remasterQueue },
    get removeUpdatedListId() { return removeUpdatedListId },
    get renameUserSpace() { return renameUserSpace },
    get resolveServerSong() { return resolveServerSong },
    get saveSyncDownloadData() { return saveSyncDownloadData },
    get saveUserTokenConfig() { return saveUserTokenConfig },
    get saveUsers() { return saveUsers },
    get scheduler() { return scheduler },
    get serializeDislikeRules() { return serializeDislikeRules },
    get serverDownloadQueue() { return serverDownloadQueue },
    get serverDownloads() { return serverDownloads },
    get splitSingers() { return splitSingers },
    get sseClients() { return sseClients },
    get startupLog() { return startupLog },
    get status() { return status },
    get storageFs() { return storageFs },
    get tokenLog() { return tokenLog },
    get triggerUserSync() { return triggerUserSync },
    get updateAllUserSnapshotDirs() { return updateAllUserSnapshotDirs },
    get url() { return url },
    get userSessions() { return userSessions },
    get validateCustomDirectoryUpdates() { return validateCustomDirectoryUpdates },
    get verifyUserAuth() { return verifyUserAuth },
    get wss() { return wss },
  }
}

const handleStartServer = async (port = 9527, ip = '0.0.0.0') => await new Promise((resolve, reject) => {
  const serverRuntime = createServerRuntime()
  const requestHandler = async (req: http.IncomingMessage, res: http.ServerResponse): Promise<void> => {
    // CORS 跨域处理
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', '*')
    res.setHeader('Access-Control-Allow-Private-Network', 'true')

    if (req.method === 'OPTIONS') {
      res.writeHead(204)
      res.end()
      return
    }

    const ip = getIP(req)
    if (!(req as any).clientDispatch) accessLog.info(`${req.method} ${req.url} from ${ip}`)
    // console.log(req.url)
    const urlObj = new URL(req.url ?? '', `http://${req.headers.host}`)
    const pathname = urlObj.pathname
    if (!(req as any).clientDispatch && req.method !== 'GET') res.once('finish', () => {
      if (res.statusCode >= 300) return
      const scoped = /^\/api\/(user\/|music\/(storage|cache|library|custom)\/)/.test(pathname)
      const owner = scoped ? (req.headers['x-user-name'] === '_open' || urlObj.searchParams.get('user') === '_open' ? '_open' : verifyUserAuth(req) || undefined) : undefined
      clientChannel.notify(pathname, owner)
    })

    // 远程账号通过当前入口访问远端接口，Cookie 与管理员凭据不转发。
    // 已有播放器音频链接携带会话令牌，沿用其访问方式。
    const mediaToken = urlObj.searchParams.get('token')
    if (mediaToken && !req.headers['x-user-token'] && !parseCookies(req.headers.cookie)[USER_SESSION_COOKIE] && (/^\/api\/music\/(cache|custom|server-download)\//.test(pathname) || pathname === '/api/music/artwork')) req.headers['x-user-token'] = mediaToken
    const accountToken = (req.headers['x-user-token'] as string) || /^Bearer (.+)$/i.exec(req.headers.authorization || '')?.[1] || parseCookies(req.headers.cookie)[USER_SESSION_COOKIE]
    const accountSession = accountToken ? userSessions.get(accountToken) : undefined
    const accountApi = pathname.startsWith('/api/')
    const authEntry = req.method === 'POST' && ['/api/login', '/api/user/login', '/api/user/verify'].includes(pathname)
    if (accountSession?.remoteUrl && pathname === '/api/user/auth/verify') {
      try {
        const response = await fetch(accountSession.remoteUrl + '/api/user/auth/verify', { headers: { 'x-user-token': accountSession.remoteToken || '' }, signal: AbortSignal.timeout(10000), redirect: 'error' })
        const result = await response.json() as any
        if (!response.ok || !result.valid) { userSessions.delete(accountToken); res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ valid: false })); return }
        res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
        res.end(JSON.stringify({ ...result, username: accountSession.username, token: accountToken, rememberMe: accountSession.rememberMe, expiresAt: Math.min(accountSession.expiresAt, result.expiresAt || Infinity) }))
      } catch { res.writeHead(502, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ valid: false, message: '无法连接远程服务器' })) }
      return
    }
    if (accountSession?.remoteUrl && accountApi && pathname !== '/api/user/login' && pathname !== '/api/user/logout') {
      if (req.headers['x-lx-remote-hop']) { res.writeHead(409); res.end('远程服务器不能循环连接'); return }
      await proxyRemoteRequest(req, res, accountSession)
      return
    }
    const adminToken = parseCookies(req.headers.cookie)[ADMIN_SESSION_COOKIE] || (req.headers['x-admin-token'] as string)
    const adminSession = adminToken ? userSessions.get(adminToken) : undefined
    const adminAuthenticated = adminSession?.username === ADMIN_USERNAME
    if (adminAuthenticated) req.headers['x-frontend-auth'] = global.lx.config['frontend.password']
    if (accountApi && !authEntry && !verifyUserAuth(req) && !adminAuthenticated) {
      res.writeHead(401, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
      res.end(JSON.stringify({ success: false, message: '请登录后访问系统' }))
      return
    }

    if (await handleLibraryAdmin(req, res, urlObj)) return

    if (pathname === '/api/user/client-bootstrap' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
      const entries = await clientChannel.snapshot(req)
      res.end(JSON.stringify({ entries, versions: cacheVersions(entries) })); return
    }
    if (pathname === '/api/user/client-sync' && req.method === 'POST') {
      try { const result = await clientChannel.report(req, JSON.parse(await readBody(req))); res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(result)) }
      catch (error: any) { res.writeHead(400); res.end(JSON.stringify({ message: error.message })) }
      return
    }

    if (pathname === '/api/admin/logout' && req.method === 'POST') {
      if (adminToken) userSessions.delete(adminToken)
      res.writeHead(200, { 'Content-Type': 'application/json', 'Set-Cookie': ADMIN_SESSION_COOKIE + '=; HttpOnly; Path=/; SameSite=Strict; Max-Age=0' })
      res.end(JSON.stringify({ success: true }))
      return
    }
    if (pathname === '/api/user/account' || pathname.startsWith('/api/user/account/')) {
      await handleAccount({ req, res, pathname, urlObj, ip }, serverRuntime)
      return
    }

    // 读取路径配置（每次请求都重新读取，保存后立刻生效）
    const normalizePath = (p: string) => (p || '').replace(/\/+$/, '')
    const playerPath = global.lx.config['player.path'] ?? '/'
    const adminPath = global.lx.config['admin.path'] ?? '/admin'
    // [修复] Subsonic 访问路径可配置；此前这里只排除写死的 /rest/，
    // 而本段判断先于下方的 Subsonic 路由执行，导致自定义 subsonic.path 会被当成播放器请求、后端接口整个失效。
    const subsonicPath = normalizePath(global.lx.config['subsonic.path'] || '/rest') || '/rest'
    const isSubsonicRequest = pathname === subsonicPath || pathname.startsWith(subsonicPath + '/')

    // [修复] 判断是否为 LX 同步客户端协议路由 (如 /hello, /id, /ah 以及 /<username>/hello, /<username>/ah 等)
    const isSyncProtocolRequest = /^\/([^/]+\/)?(hello|id|ah)$/.test(pathname)

    // 映射播放器逻辑 (无论是自定义路径还是前端硬编码的 /music/)
    const isPlayerRequest = (playerPath === '/' || playerPath === '')
      ? (pathname === '/' || (!pathname.startsWith('/api/') && !isSyncProtocolRequest && pathname !== '/js/config.js' && !isSubsonicRequest && (adminPath === '' || (pathname !== adminPath && !pathname.startsWith(adminPath + '/')))))
      : (pathname.startsWith(playerPath + '/') || pathname === playerPath)

    // [新增] 映射管理后台逻辑
    const isAdminRequest = adminPath && (pathname.startsWith(adminPath + '/') || pathname === adminPath)

    if (isAdminRequest) {
      if (pathname === adminPath) {
        res.writeHead(301, { 'Location': pathname + '/' })
        res.end()
        return
      }
      const subPath = pathname.slice(adminPath.length)
      let targetPath = ''
      if (subPath === '/' || subPath === '') {
        targetPath = 'index.html'
      } else {
        targetPath = subPath.startsWith('/') ? subPath.slice(1) : subPath
      }
      const filePath = path.join(global.lx.staticPath, targetPath)
      if (clientFileExists(filePath)) {
        serveStatic(req, res, filePath)
        return
      }
    }

    const isLegacyPlayerAsset = playerPath !== '/music' && (
      pathname.startsWith('/music/assets/') ||
      pathname.startsWith('/music/css/') ||
      pathname.startsWith('/music/js/') ||
      pathname.startsWith('/music/fonts/') ||
      pathname.startsWith('/music/img/') ||
      pathname === '/music/manifest.json' ||
      pathname === '/music/sw.js'
    )

    if (isPlayerRequest || isLegacyPlayerAsset) {
      const activePrefix = isPlayerRequest ? playerPath : '/music'
      const normalizedPrefix = (activePrefix === '/' || activePrefix === '') ? '' : activePrefix.replace(/\/+$/, '')
      // 白名单：登录页、静态资源无需认证
      const isLoginPage = pathname === `${normalizedPrefix}/login` || pathname === `${normalizedPrefix}/login.html`
      const isPublicAsset = pathname.startsWith(`${normalizedPrefix}/assets/`) ||
        pathname.startsWith(`${normalizedPrefix}/css/`) ||
        pathname.startsWith(`${normalizedPrefix}/js/`) ||
        pathname.startsWith(`${normalizedPrefix}/fonts/`) ||
        pathname.startsWith(`${normalizedPrefix}/img/`) ||
        pathname === `${normalizedPrefix}/manifest.json` ||
        pathname === `${normalizedPrefix}/sw.js` ||
        isLegacyPlayerAsset

      // 认证检查
      if (!isLoginPage && !isPublicAsset) {
        if (!verifyUserAuth(req)) {
          res.writeHead(302, { 'Location': `${normalizedPrefix}/login` })
          res.end()
          return
        }
      }

      // 规范化物理路径
      let targetPath = pathname
      // 将请求路径中的前缀映射到真实的 /music 物理目录
      if (pathname === activePrefix && activePrefix !== '/') {
        res.writeHead(301, { 'Location': pathname + '/' })
        res.end()
        return
      }

      // [PWA 适配] 动态生成播放器的 manifest.json，自动匹配当前 playerPath
      if (pathname === `${normalizedPrefix}/manifest.json` || (isLegacyPlayerAsset && pathname === '/music/manifest.json')) {
        const manifestFilePath = path.join(global.lx.staticPath, 'music', 'manifest.json')
        try {
          const raw = externalClient() ? JSON.stringify(clientMetadata().manifest) : storageFs.readFileSync(manifestFilePath, 'utf-8')
          const manifest = JSON.parse(raw)
          // 规范化当前播放器的 base URL（必须以 / 结尾）
          const effectivePlayerBase = (playerPath === '/' || playerPath === '') ? '/' : `${playerPath.replace(/\/+$/, '')}/`
          manifest.start_url = effectivePlayerBase
          manifest.scope = effectivePlayerBase
          // 图标使用相对于当前有效根路径或者播放器物理路径的地址
          if (Array.isArray(manifest.icons)) {
            manifest.icons = manifest.icons.map((icon: any) => ({
              ...icon,
              src: icon.src ? (icon.src.startsWith('http') ? icon.src : `${effectivePlayerBase}${icon.src.replace(/^\.\//, '')}`) : icon.src
            }))
          }
          res.writeHead(200, {
            'Content-Type': 'application/manifest+json; charset=utf-8',
            'Cache-Control': 'no-cache, no-store, must-revalidate',
          })
          res.end(JSON.stringify(manifest, null, 2))
          return
        } catch { }
      }

      const subPath = pathname.slice(normalizedPrefix.length)
      if (subPath === '/' || subPath === '') {
        targetPath = 'music/index.html'
      } else if (isLoginPage) {
        targetPath = 'music/login.html'
      } else {
        // [优化] 如果根路径是播放器，且请求已经包含 /music/ 前缀，则不再重复叠加
        if ((activePrefix === '/' || activePrefix === '') && subPath.startsWith('/music/')) {
          targetPath = subPath.slice(1)
        } else {
          targetPath = path.posix.join('music', subPath.startsWith('/') ? subPath.slice(1) : subPath)
        }
      }

      const filePath = path.join(global.lx.staticPath, targetPath)
      if (clientFileExists(filePath)) {
        serveStatic(req, res, filePath)
        return
      }
    }

    // [动态配置注入] 优先拦截 /js/config.js 请求，确保后端配置能注入到前端 window.CONFIG
    if (pathname === '/js/config.js') {
      // 从静态文件读取版本号和构建哈希
      const staticConfigPath = path.join(global.lx.staticPath, 'js', 'config.js')
      let version = 'v1.0.0'
      let buildHash = 'unknown'
      try {
        const content = externalClient() ? JSON.stringify(clientMetadata()) : storageFs.readFileSync(staticConfigPath, 'utf-8')
        const matchVersion = content.match(/version:\s*['"]([^'"]+)['"]/)
        if (matchVersion) version = matchVersion[1]
        const matchHash = content.match(/buildHash:\s*['"]([^'"]+)['"]/)
        if (matchHash) buildHash = matchHash[1]
      } catch { }

      if (externalClient()) { version = clientMetadata().version; buildHash = clientMetadata().buildHash }

      // 构造前端配置 暴露给前端
      const frontendConfig = {
        version,
        buildHash,
        updateEnabled: global.lx.config['update.enabled'] === true,
        updateServer: global.lx.config['update.server'] || appUpdates.DEFAULT_UPDATE_SERVER,
        serverName: global.lx.config.serverName,
        disableTelemetry: global.lx.config.disableTelemetry || false,
        'proxy.enabled': global.lx.config['proxy.enabled'],
        'user.enablePath': global.lx.config['user.enablePath'],
        'user.enableRoot': global.lx.config['user.enableRoot'],
        'user.enablePublicRestriction': global.lx.config['user.enablePublicRestriction'] || false,
        'user.enablePublicNonAdminBrowserDownload': global.lx.config['user.enablePublicNonAdminBrowserDownload'] ?? true,
        'user.enablePublicNonAdminServerCache': global.lx.config['user.enablePublicNonAdminServerCache'] ?? false,
        'user.enableLoginCacheRestriction': global.lx.config['user.enableLoginCacheRestriction'] || false,
        'user.enableCacheSizeLimit': global.lx.config['user.enableCacheSizeLimit'] || false,
        'user.cacheSizeLimit': global.lx.config['user.cacheSizeLimit'] || 2000,
        maxSnapshotNum: global.lx.config.maxSnapshotNum,
        'list.addMusicLocationType': global.lx.config['list.addMusicLocationType'],
        'player.enableAuth': global.lx.config['player.enableAuth'] || false,
        port: global.lx.config.port,
        bindIP: global.lx.config.bindIP,
        'admin.path': global.lx.config['admin.path'] ?? '/admin',
        'player.path': global.lx.config['player.path'] ?? '/',
      }

      const configJs = `window.CONFIG = ${JSON.stringify(frontendConfig, null, 2)};`
      res.writeHead(200, {
        'Content-Type': 'application/javascript; charset=utf-8',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      })
      res.end(configJs)
      return
    }

    // [管理界面]
    const effectiveAdminPath = adminPath || '/'
    const isAdminPath = (pathname === effectiveAdminPath || pathname === effectiveAdminPath + '/' || pathname === effectiveAdminPath + '/index.html')

    if (isAdminPath) {
      const rootHtmlPath = path.join(global.lx.staticPath, 'index.html')
      if (clientFileExists(rootHtmlPath)) {
        serveStatic(req, res, rootHtmlPath)
        return
      }
    }

    // 注意：如果设置了 adminPath，则不允许通过 / 直接访问后台资源文件，除非它是公共资源
    if (!pathname.startsWith('/api/')) {
      const generalFilePath = path.join(global.lx.staticPath, pathname)
      // 禁止绕过 adminPath 直接访问后台 index.html
      if (pathname === '/' || pathname === '/index.html') {
        if (adminPath !== '' && playerPath !== '/') {
          res.writeHead(404)
          res.end('Not Found')
          return
        }
      }

      if (clientFileExists(generalFilePath)) {
        if (path.resolve(generalFilePath) === path.resolve(global.lx.staticPath, 'music/index.html') && !verifyUserAuth(req)) {
          res.writeHead(302, { Location: (playerPath === '/' ? '' : playerPath.replace(/\/+$/, '')) + '/login' }); res.end(); return
        }
        serveStatic(req, res, generalFilePath)
        return
      }
    }

    // [Subsonic API]
    const subsonicEnable = global.lx.config['subsonic.enable']
    if (subsonicEnable && isSubsonicRequest) {
      const { subsonicHandler } = require('../../music/service/subsonic/SubsonicService')
      return subsonicHandler.handleRequest(req, res, urlObj)
    }


    if (pathname.startsWith('/api/')) {
      if (pathname === '/api/music/file-status' && req.method === 'POST') {
        await songFileStatus({ req, res, pathname, urlObj, ip }, serverRuntime, songFileStatusService)
        return
      }
      if (pathname === '/api/music/storage/list' || pathname === '/api/music/storage/playback' || pathname === '/api/music/storage/queue') {
        await browserList(req, res, {
          verifyUser: verifyUserAuth,
          userDirectory: username => path.join(global.lx.userPath, getUserDirname(username)),
          service: new BrowserStorageService(new BrowserStorageRepository(repositories().music)),
        }, pathname.endsWith('/playback') ? 'playback' : pathname.endsWith('/queue') ? 'queue' : 'list')
        return
      }
      if (pathname === '/api/music/playlists/import' && req.method === 'POST') {
        await importPlaylists(req, res, urlObj.searchParams.get('user'), {
          verifyUser: verifyUserAuth,
          userSpace: getUserSpace,
          service: new LxConfigurationImportService(new MusicConfigurationRepository(repositories().music)),
        })
        return
      }
      if (pathname === '/api/music/configuration/import' && req.method === 'POST') {
        await importConfiguration(req, res, {
          verifyUser: verifyUserAuth,
          userSpace: getUserSpace,
          service: new LxConfigurationImportService(new MusicConfigurationRepository(repositories().music)),
          afterImport: (username, sections) => {
            invalidateDislikeCache(username)
            if (sections.includes('settings')) {
              const settings = repositories().music.read('client_settings', path.join(getUserSpace(username).dataManage.userDir, File.userSettingsJSON))?.value as any
              const taskConfig: { /** 执行间隔，单位毫秒。 */
intervalMs?: number; /** 功能是否启用。 */
enabled?: boolean } = {}
              const interval = scheduler.parseIntervalMs(settings?.networkListAutoCheckInterval)
              if (interval) taskConfig.intervalMs = interval
              if (settings?.autoUpdateNetworkList !== undefined) taskConfig.enabled = !!settings.autoUpdateNetworkList
              if (Object.keys(taskConfig).length) scheduler.updateTaskConfig('network_list_autocheck', taskConfig)
            }
          },
        })
        return
      }


      if (pathname === '/api/login' && req.method === 'POST') {
        await adminOperationsController.postLogin({ req, res, pathname, urlObj, ip }, serverRuntime)
        return
      }



      // [新增] 获取服务器状态
      if (pathname === '/api/status' && req.method === 'GET') {
        await adminOperationsController.getStatus({ req, res, pathname, urlObj, ip }, serverRuntime)
        return
      }

      if (pathname === '/api/app/update/check' && req.method === 'GET') {
        await adminOperationsController.getAppUpdateCheck({ req, res, pathname, urlObj, ip }, serverRuntime)
        return
      }
      if (pathname === '/api/users') {
        await adminUserController.handleUsers({ req, res, pathname, urlObj, ip }, serverRuntime)
        return
      }

      if (pathname === '/api/data' && req.method === 'GET') {
        await musicPlaylistController.getData({ req, res, pathname, urlObj, ip }, serverRuntime)
        return
      }
      // 获取快照列表
      if (pathname === '/api/data/snapshots' && req.method === 'GET') {
        await musicPlaylistController.getDataSnapshots({ req, res, pathname, urlObj, ip }, serverRuntime)
        return
      }

      // 下载快照数据
      if (pathname === '/api/data/snapshot' && req.method === 'GET') {
        await musicPlaylistController.getDataSnapshot({ req, res, pathname, urlObj, ip }, serverRuntime)
        return
      }

      // 恢复快照
      if (pathname === '/api/data/restore-snapshot' && req.method === 'POST') {
        await musicPlaylistController.postDataRestoreSnapshot({ req, res, pathname, urlObj, ip }, serverRuntime)
        return
      }

      // [新增] Batch Remove Songs from List (User Auth)
      if (pathname === '/api/music/user/list/remove' && req.method === 'POST') {
        await musicPlaylistController.postMusicUserListRemove({ req, res, pathname, urlObj, ip }, serverRuntime)
        return
      }

      // [新增] Reorder Songs in List (User Auth)
      if (pathname === '/api/music/user/list/reorder' && req.method === 'POST') {
        await musicPlaylistController.postMusicUserListReorder({ req, res, pathname, urlObj, ip }, serverRuntime)
        return
      }

      // [新增] Batch Add Songs to List (User Auth)
      if (pathname === '/api/music/user/list/add' && req.method === 'POST') {
        await musicPlaylistController.postMusicUserListAdd({ req, res, pathname, urlObj, ip }, serverRuntime)
        return
      }



      // [新增] 删除快照 API
      if (pathname === '/api/data/delete-snapshot' && req.method === 'POST') {
        await musicPlaylistController.postDataDeleteSnapshot({ req, res, pathname, urlObj, ip }, serverRuntime)
        return
      }
      // [新增] 上传快照 API
      if (pathname === '/api/data/upload-snapshot' && req.method === 'POST') {
        await musicPlaylistController.postDataUploadSnapshot({ req, res, pathname, urlObj, ip }, serverRuntime)
        return
      }

      // [新增] User Login Verification
      if (pathname === '/api/user/verify' && req.method === 'POST') {
        await musicAuthenticationController.postUserVerify({ req, res, pathname, urlObj, ip }, serverRuntime)
        return
      }

      // [新增] 用户登录 - 颁发 Token（替代明文密码传输）
      if (pathname === '/api/user/login' && req.method === 'POST') {
        await musicAuthenticationController.postUserLogin({ req, res, pathname, urlObj, ip }, serverRuntime)
        return
      }

      // [新增] 用户登出 - 注销 Token
      if (pathname === '/api/user/logout' && req.method === 'POST') {
        await musicAuthenticationController.postUserLogout({ req, res, pathname, urlObj, ip }, serverRuntime)
        return
      }

      // [新增] Token 有效性检查
      if (pathname === '/api/user/auth/verify' && req.method === 'GET') {
        await musicAuthenticationController.getUserAuthVerify({ req, res, pathname, urlObj, ip }, serverRuntime)
        return
      }

      // [新增] Get User List (User Auth)
      // [新增] Get User List (User Auth)
      if (pathname === '/api/user/list/meta' && req.method === 'GET') {
        await musicPlaylistController.getUserListMeta({ req, res, pathname, urlObj, ip }, serverRuntime)
        return
      }
      if (pathname === '/api/user/list/songs' && req.method === 'GET') {
        await musicPlaylistController.getUserListSongs({ req, res, pathname, urlObj, ip }, serverRuntime)
        return
      }
      if (pathname === '/api/user/list' && req.method === 'GET') {
        await musicPlaylistController.getUserList({ req, res, pathname, urlObj, ip }, serverRuntime)
        return
      }

      if (pathname === '/api/user/favorites' && (req.method === 'GET' || req.method === 'POST')) {
        await musicFavoriteController.favorites({ req, res, pathname, urlObj, ip }, serverRuntime)
        return
      }

      // [新增] Update User List (User Auth) - Full Restore/Overwrite
      if (pathname === '/api/user/list' && req.method === 'POST') {
        await musicPlaylistController.postUserList({ req, res, pathname, urlObj, ip }, serverRuntime)
        return
      }

      // [新增] 用户 Library API — 收藏歌手 & 收藏专辑
      const getLibUsername = (req: any): string | null => {
        const url = new URL(req.url || '', 'http://localhost')
        const userParam = url.searchParams.get('user') || ''
        const reqUsername = (req.headers['x-user-name'] as string) || userParam
        const auth = req.headers['x-frontend-auth']
        const isAdmin = !!(auth && auth === global.lx.config['frontend.password'])

        const canAccessOpen = global.lx.config['user.enablePublicFavorites'] && (
          global.lx.config['user.enablePublicNonAdminAccess'] || isAdmin || !!verifyUserAuth(req)
        )
        if ((reqUsername === '_open' || userParam === '_open' || (!reqUsername && !verifyUserAuth(req))) && canAccessOpen) {
          return '_open'
        }

        let username = verifyUserAuth(req)
        if (!username && reqUsername && reqUsername !== '_open') {
          username = reqUsername
        }
        return username || '_open'
      }

      // GET /api/user/library/artists  — 读取收藏歌手列表（自动补全缺失头像 picUrl）
      if (pathname === '/api/user/library/artists' && req.method === 'GET') {
        await musicLibraryController.getUserLibraryArtists({ req, res, pathname, urlObj, ip, getLibUsername }, serverRuntime)
        return
      }

      // POST /api/user/library/artists  — 完整覆盖写入收藏歌手列表
      if (pathname === '/api/user/library/artists' && req.method === 'POST') {
        await musicLibraryController.postUserLibraryArtists({ req, res, pathname, urlObj, ip, getLibUsername }, serverRuntime)
        return
      }

      // GET /api/user/library/albums  — 读取收藏专辑列表
      if (pathname === '/api/user/library/albums' && req.method === 'GET') {
        await musicLibraryController.getUserLibraryAlbums({ req, res, pathname, urlObj, ip, getLibUsername }, serverRuntime)
        return
      }

      // POST /api/user/library/albums  — 完整覆盖写入收藏专辑列表
      if (pathname === '/api/user/library/albums' && req.method === 'POST') {
        await musicLibraryController.postUserLibraryAlbums({ req, res, pathname, urlObj, ip, getLibUsername }, serverRuntime)
        return
      }

      // --- DISLIKE LIBRARY ENDPOINTS ---

      // GET /api/user/dislike/library/artists
      if (pathname === '/api/user/dislike/library/artists' && req.method === 'GET') {
        await musicLibraryController.getUserDislikeLibraryArtists({ req, res, pathname, urlObj, ip, getLibUsername }, serverRuntime)
        return
      }

      // POST /api/user/dislike/library/artists
      if (pathname === '/api/user/dislike/library/artists' && req.method === 'POST') {
        await musicLibraryController.postUserDislikeLibraryArtists({ req, res, pathname, urlObj, ip, getLibUsername }, serverRuntime)
        return
      }

      // GET /api/user/dislike/library/albums
      if (pathname === '/api/user/dislike/library/albums' && req.method === 'GET') {
        await musicLibraryController.getUserDislikeLibraryAlbums({ req, res, pathname, urlObj, ip, getLibUsername }, serverRuntime)
        return
      }

      // POST /api/user/dislike/library/albums
      if (pathname === '/api/user/dislike/library/albums' && req.method === 'POST') {
        await musicLibraryController.postUserDislikeLibraryAlbums({ req, res, pathname, urlObj, ip, getLibUsername }, serverRuntime)
        return
      }

      // ─── 同步下载 API ─────────────────────────────────────────────────────
      // GET /api/user/sync-download/status  查询当前用户同步下载配置 + 歌单列表 + 进度
      if (pathname === '/api/user/sync-download/status' && req.method === 'GET') {
        await musicDownloadController.getUserSyncDownloadStatus({ req, res, pathname, urlObj, ip }, serverRuntime)
        return
      }

      // PUT /api/user/sync-download/settings  保存同步下载配置
      if (pathname === '/api/user/sync-download/settings' && req.method === 'PUT') {
        await musicSettingsController.putUserSyncDownloadSettings({ req, res, pathname, urlObj, ip }, serverRuntime)
        return
      }

      // POST /api/user/sync-download/trigger  手动触发同步
      if (pathname === '/api/user/sync-download/trigger' && req.method === 'POST') {
        await musicDownloadController.postUserSyncDownloadTrigger({ req, res, pathname, urlObj, ip }, serverRuntime)
        return
      }

      // POST /api/user/sync-download/cancel  取消/暂停当前同步
      if ((pathname === '/api/user/sync-download/cancel' || pathname === '/api/user/sync-download/pause') && req.method === 'POST') {
        await musicDownloadController.postUserSyncDownloadCancel({ req, res, pathname, urlObj, ip }, serverRuntime)
        return
      }

      // GET /api/user/sync-download/progress  轮询实时进度
      if (pathname === '/api/user/sync-download/progress' && req.method === 'GET') {
        await musicDownloadController.getUserSyncDownloadProgress({ req, res, pathname, urlObj, ip }, serverRuntime)
        return
      }

      // POST /api/user/sync-download/migrate-storage  迁移存储位置
      if (pathname === '/api/user/sync-download/migrate-storage' && req.method === 'POST') {
        await musicDownloadController.postUserSyncDownloadMigrateStorage({ req, res, pathname, urlObj, ip }, serverRuntime)
        return
      }
      // ─────────────────────────────────────────────────────────────────────


      if (['/api/user/appearance', '/api/user/appearance/background', '/api/user/notifications', '/api/user/notifications/read', '/api/user/recent', '/api/user/roaming/weights', '/api/music/library/search', '/api/music/library/avatar', '/api/music/artwork'].includes(pathname)) {
        await handleExperience({ req, res, pathname, urlObj, ip }, serverRuntime)
        return
      }

      // [新增] Get User Settings (User Auth)
      if (pathname === '/api/user/settings' && req.method === 'GET') {
        await musicSettingsController.getUserSettings({ req, res, pathname, urlObj, ip }, serverRuntime)
        return
      }

      // [新增] Update User Settings (User Auth)
      if (pathname === '/api/user/settings' && req.method === 'POST') {
        await musicSettingsController.postUserSettings({ req, res, pathname, urlObj, ip }, serverRuntime)
        return
      }

      // [核心路由记录] Token 管理相关 API
      // 1. 获取/更新 Token 配置 (开启状态及列表)
      if (pathname === '/api/user/token/config') {
        await musicAuthenticationController.handleUserTokenConfig({ req, res, pathname, urlObj, ip }, serverRuntime)
        return
      }

      // 3. 生成新 Token
      if (pathname === '/api/user/token/add' && req.method === 'POST') {
        await musicAuthenticationController.postUserTokenAdd({ req, res, pathname, urlObj, ip }, serverRuntime)
        return
      }

      // 3. 删除 Token
      if (pathname === '/api/user/token/remove' && req.method === 'POST') {
        await musicAuthenticationController.postUserTokenRemove({ req, res, pathname, urlObj, ip }, serverRuntime)
        return
      }

      // 4. 更新 Token 信息 (名称/有效期)
      if (pathname === '/api/user/token/update' && req.method === 'POST') {
        await musicAuthenticationController.postUserTokenUpdate({ req, res, pathname, urlObj, ip }, serverRuntime)
        return
      }

      // 5. 切换 Token 启用/禁用状态
      if (pathname === '/api/user/token/toggle' && req.method === 'POST') {
        await musicAuthenticationController.postUserTokenToggle({ req, res, pathname, urlObj, ip }, serverRuntime)
        return
      }

      // 5. 获取特定 Token 的审计日志
      if (pathname === '/api/user/token/logs' && req.method === 'GET') {
        await musicAuthenticationController.getUserTokenLogs({ req, res, pathname, urlObj, ip }, serverRuntime)
        return
      }

      // [新增] Get User Sound Effects (User Auth)
      if (pathname === '/api/user/sound-effects' && req.method === 'GET') {
        await musicSettingsController.getUserSoundEffects({ req, res, pathname, urlObj, ip }, serverRuntime)
        return
      }

      // [后台任务] 获取所有后台定时任务状态
      if ((pathname === '/api/tasks/status' || pathname === '/api/music/tasks/status') && req.method === 'GET') {
        await musicDownloadController.getTasksStatus({ req, res, pathname, urlObj, ip }, serverRuntime)
        return
      }

      // [后台任务] 手动触发后台定时任务执行
      if ((pathname === '/api/tasks/trigger' || pathname === '/api/music/tasks/trigger') && req.method === 'POST') {
        await musicDownloadController.postTasksTrigger({ req, res, pathname, urlObj, ip }, serverRuntime)
        return
      }

      // [后台任务] 通用任务用户数据接口（内存临时，重启后自动清除）
      // GET  /api/tasks/user-data?task=<taskId>  → 返回当前用户该任务的状态数据
      // POST /api/tasks/user-data?task=<taskId>  → 更新（如清除红点）
      if ((pathname === '/api/tasks/user-data' || pathname === '/api/music/tasks/user-data') &&
          (req.method === 'GET' || req.method === 'POST')) {
        await musicDownloadController.getTasksUserData({ req, res, pathname, urlObj, ip }, serverRuntime)
        return
      }

      // [新增] Update User Sound Effects (User Auth)
      if (pathname === '/api/user/sound-effects' && req.method === 'POST') {
        await musicSettingsController.postUserSoundEffects({ req, res, pathname, urlObj, ip }, serverRuntime)
        return
      }

      // Local music remaster APIs use the same account access rules as other cache operations.
      if (pathname.startsWith('/api/music/remaster/')) {
        await musicDownloadController.handleMusicRemaster({ req, res, pathname, urlObj, ip }, serverRuntime)
        return
      }

      // [新增] File Cache APIs
      // 1. Config Cache Location
      if (pathname === '/api/music/cache/config' && req.method === 'POST') {
        await musicDownloadController.postMusicCacheConfig({ req, res, pathname, urlObj, ip }, serverRuntime)
        return
      }

      // 1.05 Get Real Cache & Download Directories
      if (pathname === '/api/music/cache/directories' && req.method === 'GET') {
        await musicDownloadController.getMusicCacheDirectories({ req, res, pathname, urlObj, ip }, serverRuntime)
        return
      }

      // 1.1 Sync Cache Index
      if (pathname === '/api/music/cache/sync' && req.method === 'POST') {
        await musicDownloadController.postMusicCacheSync({ req, res, pathname, urlObj, ip }, serverRuntime)
        return
      }

      // 1.1-B Get Subdirectories
      if (pathname === '/api/music/cache/subdirs' && req.method === 'GET') {
        await musicDownloadController.getMusicCacheSubdirs({ req, res, pathname, urlObj, ip }, serverRuntime)
        return
      }

      // 1.1-C Create Subdirectory
      if (pathname === '/api/music/cache/mkdir' && req.method === 'POST') {
        await musicDownloadController.postMusicCacheMkdir({ req, res, pathname, urlObj, ip }, serverRuntime)
        return
      }

      // 1.1-D Categorize Files
      if (pathname === '/api/music/cache/categorize' && req.method === 'POST') {
        await musicDownloadController.postMusicCacheCategorize({ req, res, pathname, urlObj, ip }, serverRuntime)
        return
      }

      // 1.1-E Rename Subdirectory
      if (pathname === '/api/music/cache/subdirs/rename' && req.method === 'POST') {
        await musicDownloadController.postMusicCacheSubdirsRename({ req, res, pathname, urlObj, ip }, serverRuntime)
        return
      }

      // 检查文件夹是否有效
      if (pathname === '/api/utils/check-dir' && req.method === 'POST') {
        await musicDownloadController.postUtilsCheckDir({ req, res, pathname, urlObj, ip }, serverRuntime)
        return
      }

      // 1.1-F Delete Subdirectory
      if (pathname === '/api/music/cache/subdirs/delete' && req.method === 'POST') {
        await musicDownloadController.postMusicCacheSubdirsDelete({ req, res, pathname, urlObj, ip }, serverRuntime)
        return
      }

      // 1.2 Batch Rename Cache Files
      if (pathname === '/api/music/cache/rename' && req.method === 'POST') {
        await musicDownloadController.postMusicCacheRename({ req, res, pathname, urlObj, ip }, serverRuntime)
        return
      }

      // 指定目录下载只按已登记索引提供文件，禁止客户端传入任意服务器路径。
      if (pathname === '/api/music/server-download/check' && req.method === 'GET') {
        await musicDownloadController.getMusicServerDownloadCheck({ req, res, pathname, urlObj, ip }, serverRuntime)
        return
      }
      if (pathname.startsWith('/api/music/server-download/file/')) {
        await musicDownloadController.handleMusicServerDownloadFile({ req, res, pathname, urlObj, ip }, serverRuntime)
        return
      }

      // 2. Check Cache
      if (pathname === '/api/music/cache/check' && req.method === 'GET') {
        await musicDownloadController.getMusicCacheCheck({ req, res, pathname, urlObj, ip }, serverRuntime)
        return
      }

      // Persistent server download queue. These tasks continue after the browser closes.
      if (pathname === '/api/music/cache/queue' && req.method === 'GET') {
        await musicDownloadController.getMusicCacheQueue({ req, res, pathname, urlObj, ip }, serverRuntime)
        return
      }

      if (pathname === '/api/music/cache/queue' && req.method === 'POST') {
        await musicDownloadController.postMusicCacheQueue({ req, res, pathname, urlObj, ip }, serverRuntime)
        return
      }

      if (pathname === '/api/music/cache/queue/concurrency' && req.method === 'POST') {
        await musicDownloadController.postMusicCacheQueueConcurrency({ req, res, pathname, urlObj, ip }, serverRuntime)
        return
      }

      if (pathname === '/api/music/cache/queue/resume' && req.method === 'POST') {
        await musicDownloadController.postMusicCacheQueueResume({ req, res, pathname, urlObj, ip }, serverRuntime)
        return
      }

      if (pathname === '/api/music/cache/queue/remove' && req.method === 'POST') {
        await musicDownloadController.postMusicCacheQueueRemove({ req, res, pathname, urlObj, ip }, serverRuntime)
        return
      }

      // 3. Trigger Download
      if (pathname === '/api/music/cache/download' && req.method === 'POST') {
        await musicDownloadController.postMusicCacheDownload({ req, res, pathname, urlObj, ip }, serverRuntime)
        return
      }

      // [New] Stop Cache Task
      if (pathname === '/api/music/cache/stop' && req.method === 'POST') {
        await musicDownloadController.postMusicCacheStop({ req, res, pathname, urlObj, ip }, serverRuntime)
        return
      }

      // 4. Serve Cached File
      if (pathname.startsWith('/api/music/cache/file/')) {
        await musicDownloadController.handleMusicCacheFile({ req, res, pathname, urlObj, ip }, serverRuntime)
        return
      }

      // 5. Get Cache Statistics
      if (pathname === '/api/music/cache/stats' && req.method === 'GET') {
        await musicDownloadController.getMusicCacheStats({ req, res, pathname, urlObj, ip }, serverRuntime)
        return
      }

      if (pathname === '/api/music/cache/clear' && req.method === 'POST') {
        await musicDownloadController.postMusicCacheClear({ req, res, pathname, urlObj, ip }, serverRuntime)
        return
      }

      if (pathname === '/api/music/cache/lyric/clear' && req.method === 'POST') {
        await musicDownloadController.postMusicCacheLyricClear({ req, res, pathname, urlObj, ip }, serverRuntime)
        return
      }

      // 7. Get Cache Progress
      if (pathname === '/api/music/cache/progress' && req.method === 'GET') {
        await musicDownloadController.getMusicCacheProgress({ req, res, pathname, urlObj, ip }, serverRuntime)
        return
      }

      // 7. Get Detailed Cache List
      if (pathname === '/api/music/directories/check' && req.method === 'POST') {
        if (req.headers['x-frontend-auth'] !== global.lx.config['frontend.password']) { res.writeHead(401); res.end('Unauthorized'); return }
        try { const body = JSON.parse(await readBody(req)); const directory = await checkDirectory(body.path); res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ success: true, path: directory, message: '目录读写检测通过' })) }
        catch (error: any) { res.writeHead(422, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ success: false, message: error.message })) }
        return
      }
      if (pathname === '/api/music/server-download/remove' && req.method === 'POST') {
        const username = verifyUserAuth(req)
        if (!username) { res.writeHead(401); res.end('Unauthorized'); return }
        try { const body = JSON.parse(await readBody(req)); if (!Array.isArray(body.ids) || body.ids.some((id: any) => typeof id !== 'string')) throw new Error('文件标识格式错误'); const deletedCount = serverDownloads.removeLibraryItems(body.ids, username); res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ success: true, deletedCount })) }
        catch (error: any) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ success: false, message: error.message })) }
        return
      }
      if (pathname === '/api/music/maintenance' && (req.method === 'GET' || req.method === 'POST')) {
        const publicRequest = req.headers['x-user-name'] === '_open' || !verifyUserAuth(req) && adminAuthenticated
        const username = publicRequest ? adminAuthenticated ? '_open' : null : verifyUserAuth(req)
        const send = (code: number, value: unknown) => { res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)) }
        if (!username) { send(401, { success: false, message: '请登录后维护歌曲' }); return }
        try {
          if (req.method === 'GET') send(200, { success: true, tasks: getMusicTasks(username) })
          else send(202, { success: true, task: await startMaintenance(username, JSON.parse(await readBody(req)), publicRequest && adminAuthenticated) })
        } catch (error: any) { send(error.statusCode || 400, { success: false, message: error.message }) }
        return
      }
      if (pathname === '/api/music/library/scan' && (req.method === 'GET' || req.method === 'POST')) {
        const username = req.headers['x-user-name'] === '_open' ? adminAuthenticated ? '_open' : null : verifyUserAuth(req) || (adminAuthenticated ? '_open' : null)
        if (!username) { res.writeHead(401); res.end('Unauthorized'); return }
        const mode = urlObj.searchParams.get('mode') || 'full'
        if (req.method === 'POST' && !['quick', 'full'].includes(mode)) { res.writeHead(400); res.end('Invalid scan mode'); return }
        const scan = req.method === 'POST' ? customMusicManager.ensureMusicScan(username, true, mode as 'quick' | 'full') : customMusicManager.getScanStatus(username)
        res.writeHead(req.method === 'POST' ? 202 : 200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify({ success: true, scan })); return
      }
      if (pathname === '/api/music/cache/page' && req.method === 'GET') {
        await musicPlaylistController.getMusicCachePage({ req, res, pathname, urlObj, ip }, serverRuntime)
        return
      }
      if (pathname === '/api/music/cache/list' && req.method === 'GET') {
        await musicPlaylistController.getMusicCacheList({ req, res, pathname, urlObj, ip }, serverRuntime)
        return
      }

      // 8. Get Cache Cover
      if (pathname === '/api/music/cache/cover' && req.method === 'GET') {
        await musicDownloadController.getMusicCacheCover({ req, res, pathname, urlObj, ip }, serverRuntime)
        return
      }

      // 9. Remove Cache File (Single or Batch)
      if (pathname === '/api/music/cache/remove' && req.method === 'POST') {
        await musicDownloadController.postMusicCacheRemove({ req, res, pathname, urlObj, ip }, serverRuntime)
        return
      }

      // ===== [新增] Custom Music APIs (独立于 cache/music) =====
      // A. 获取自定义目录歌曲列表
      if (pathname === '/api/music/custom/page' && req.method === 'GET') {
        await musicPlaylistController.getMusicCustomPage({ req, res, pathname, urlObj, ip }, serverRuntime)
        return
      }
      if (pathname === '/api/music/custom/list' && req.method === 'GET') {
        await musicPlaylistController.getMusicCustomList({ req, res, pathname, urlObj, ip }, serverRuntime)
        return
      }

      // B. 强制重新同步自定义目录
      if (pathname === '/api/music/custom/sync' && req.method === 'POST') {
        await musicDiscoveryController.postMusicCustomSync({ req, res, pathname, urlObj, ip }, serverRuntime)
        return
      }

      // C. 流式播放自定义音频文件（支持深层子目录相对路径）
      if (pathname === '/api/music/custom/file' || pathname.startsWith('/api/music/custom/file/')) {
        await musicDiscoveryController.handleMusicCustomFile({ req, res, pathname, urlObj, ip }, serverRuntime)
        return
      }

      // D. 获取自定义目录封面
      if (pathname === '/api/music/custom/cover' && req.method === 'GET') {
        await musicDiscoveryController.getMusicCustomCover({ req, res, pathname, urlObj, ip }, serverRuntime)
        return
      }

      // E. 删除自定义目录中的歌曲（受 allowOperateCustomMusicDir 限制）
      if (pathname === '/api/music/custom/remove' && req.method === 'POST') {
        await musicDiscoveryController.postMusicCustomRemove({ req, res, pathname, urlObj, ip }, serverRuntime)
        return
      }

      // F. 手动关联自定义目录歌曲
      if (pathname === '/api/music/custom/link' && req.method === 'POST') {
        await musicDiscoveryController.postMusicCustomLink({ req, res, pathname, urlObj, ip }, serverRuntime)
        return
      }

      // G. 批量补全自定义目录元信息（封面与ID3）
      if (pathname === '/api/music/custom/updateMetadata' && req.method === 'POST') {
        await musicDiscoveryController.postMusicCustomUpdateMetadata({ req, res, pathname, urlObj, ip }, serverRuntime)
        return
      }

      // H-GET. 读取自定义目录音频文件内嵌歌词（供播放时使用）
      if (pathname === '/api/music/custom/embedLyric' && req.method === 'GET') {
        await musicDiscoveryController.getMusicCustomEmbedLyric({ req, res, pathname, urlObj, ip }, serverRuntime)
        return
      }

      // H. 批量将歌词嵌入自定义目录音频标签 (USLT)
      if (pathname === '/api/music/custom/embedLyric' && req.method === 'POST') {
        await musicDiscoveryController.postMusicCustomEmbedLyric({ req, res, pathname, urlObj, ip }, serverRuntime)
        return
      }
      // ===== [结束] Custom Music APIs =====

      // [New] Batch Move Files between folders
      if (pathname === '/api/music/cache/move' && req.method === 'POST') {
        await musicDownloadController.postMusicCacheMove({ req, res, pathname, urlObj, ip }, serverRuntime)
        return
      }

      if (pathname === '/api/music/cache/switch-base' && req.method === 'POST') {
        await musicDownloadController.postMusicCacheSwitchBase({ req, res, pathname, urlObj, ip }, serverRuntime)
        return
      }



      // 10. Update Metadata (Batch)
      if (pathname === '/api/music/cache/updateMetadata' && req.method === 'POST') {
        await musicDownloadController.postMusicCacheUpdateMetadata({ req, res, pathname, urlObj, ip }, serverRuntime)
        return
      }

      // [新增-GET] 读取本地缓存音频文件内嵌歌词（供播放时使用）
      if (pathname === '/api/music/cache/embedLyric' && req.method === 'GET') {
        await musicDownloadController.getMusicCacheEmbedLyric({ req, res, pathname, urlObj, ip }, serverRuntime)
        return
      }

      // [新增] Embed Lyric into Audio File Tags (USLT)
      if (pathname === '/api/music/cache/embedLyric' && req.method === 'POST') {
        await musicDownloadController.postMusicCacheEmbedLyric({ req, res, pathname, urlObj, ip }, serverRuntime)
        return
      }

      // 11. Link Unindexed Local File
      if (pathname === '/api/music/cache/link' && req.method === 'POST') {
        await musicDownloadController.postMusicCacheLink({ req, res, pathname, urlObj, ip }, serverRuntime)
        return
      }

      // 12. Identify Local File (AcoustID)
      if (pathname === '/api/music/identify' && req.method === 'POST') {
        await musicDiscoveryController.postMusicIdentify({ req, res, pathname, urlObj, ip }, serverRuntime)
        return
      }



      // [New] Fetch Lyrics
      if (pathname === '/api/music/lyric' && req.method === 'GET') {
        await musicDiscoveryController.getMusicLyric({ req, res, pathname, urlObj, ip }, serverRuntime)
        return
      }

      // [新增] File Cache Lyric APIs
      if (pathname === '/api/music/cache/lyric' && req.method === 'GET') {
        await musicDownloadController.getMusicCacheLyric({ req, res, pathname, urlObj, ip }, serverRuntime)
        return
      }

      if (pathname === '/api/music/cache/lyric' && req.method === 'POST') {
        await musicDownloadController.postMusicCacheLyric({ req, res, pathname, urlObj, ip }, serverRuntime)
        return
      }

      // [新增] Download Proxy API
      if (pathname === '/api/music/download' && req.method === 'GET') {
        await musicDownloadController.getMusicDownload({ req, res, pathname, urlObj, ip }, serverRuntime)
        return
      }

      if (pathname === '/api/data/delete-playlist' && req.method === 'POST') {
        await musicPlaylistController.postDataDeletePlaylist({ req, res, pathname, urlObj, ip }, serverRuntime)
        return
      }

      // 删除歌曲
      if (pathname === '/api/data/delete-song' && req.method === 'POST') {
        await musicPlaylistController.postDataDeleteSong({ req, res, pathname, urlObj, ip }, serverRuntime)
        return
      }
      // 重命名歌单
      if (pathname === '/api/data/rename-playlist' && req.method === 'POST') {
        await musicPlaylistController.postDataRenamePlaylist({ req, res, pathname, urlObj, ip }, serverRuntime)
        return
      }

      // 批量删除歌曲
      if (pathname === '/api/data/batch-delete-songs' && req.method === 'POST') {
        await musicPlaylistController.postDataBatchDeleteSongs({ req, res, pathname, urlObj, ip }, serverRuntime)
        return
      }

      // [新增] Web播放器公共配置 API (无需鉴权)
      if (pathname === '/api/music/config' && req.method === 'GET') {
        await musicAuthenticationController.getMusicConfig({ req, res, pathname, urlObj, ip }, serverRuntime)
        return
      }

      // [新增] Web播放器认证 API（颁发 HttpOnly Cookie Session）
      if (pathname === '/api/music/auth' && req.method === 'POST') {
        await musicAuthenticationController.postMusicAuth({ req, res, pathname, urlObj, ip }, serverRuntime)
        return
      }

      // [新增] Web播放器登出 API（清除 Session Cookie）
      if (pathname === '/api/music/auth/logout' && req.method === 'POST') {
        await musicAuthenticationController.postMusicAuthLogout({ req, res, pathname, urlObj, ip }, serverRuntime)
        return
      }

      // [新增] Web播放器认证状态检查 API
      if (pathname === '/api/music/auth/verify' && req.method === 'GET') {
        await musicAuthenticationController.getMusicAuthVerify({ req, res, pathname, urlObj, ip }, serverRuntime)
        return
      }

      // [新增] 音乐搜索 API
      if (pathname === '/api/music/search' && req.method === 'GET') {
        await musicDiscoveryController.getMusicSearch({ req, res, pathname, urlObj, ip }, serverRuntime)
        return
      }

      // [新增] 搜索提示 (TipSearch) API
      if (pathname === '/api/music/tipSearch' && req.method === 'GET') {
        await musicDiscoveryController.getMusicTipSearch({ req, res, pathname, urlObj, ip }, serverRuntime)
        return
      }

      // [新增] 获取歌手详情 API
      if (pathname === '/api/music/artistDetail' && req.method === 'GET') {
        await musicDiscoveryController.getMusicArtistDetail({ req, res, pathname, urlObj, ip }, serverRuntime)
        return
      }

      // [新增] 获取歌手专辑列表 API
      if (pathname === '/api/music/artistAlbums' && req.method === 'GET') {
        await musicDiscoveryController.getMusicArtistAlbums({ req, res, pathname, urlObj, ip }, serverRuntime)
        return
      }

      // [新增] 获取歌手歌曲 API（循环拉取全部，前端分页）
      if (pathname === '/api/music/artistSongs' && req.method === 'GET') {
        await musicDiscoveryController.getMusicArtistSongs({ req, res, pathname, urlObj, ip }, serverRuntime)
        return
      }

      // [新增] 获取专辑歌曲 API
      if (pathname === '/api/music/albumSongs' && req.method === 'GET') {
        await musicDiscoveryController.getMusicAlbumSongs({ req, res, pathname, urlObj, ip }, serverRuntime)
        return
      }

      // [新增] 音乐解析进度 SSE 端点 (无需登录, 用 requestId 区分)
      if (pathname === '/api/music/progress' && req.method === 'GET') {
        await musicDiscoveryController.getMusicProgress({ req, res, pathname, urlObj, ip }, serverRuntime)
        return
      }

      // [新增] 音乐 URL API
      if (pathname === '/api/music/url' && req.method === 'POST') {
        const reqId = req.headers['x-req-id'] as string
        const device = req.headers['x-browser-device'] as string
        const owner = verifyUserAuth(req)
        if (owner && device && /^[\w-]{1,128}$/.test(reqId || '')) {
          // 复用原解析进度出口，原控制器的音源选择和重试规则保持不变。
          const relay = { write(chunk: string) {
            for (const line of String(chunk).split('\n')) if (line.startsWith('data:')) {
              try { clientChannel.publish(owner, 'resolve-progress', { reqId, attempt: JSON.parse(line.slice(5)) }, device) } catch {}
            }
            return true
          } } as unknown as http.ServerResponse
          musicProgressClients.set(reqId, relay)
          res.once('finish', () => { if (musicProgressClients.get(reqId) === relay) musicProgressClients.delete(reqId) })
        }
        await musicDiscoveryController.postMusicUrl({ req, res, pathname, urlObj, ip }, serverRuntime)
        return
      }

      // [新增] 音质真实大小 API
      if (pathname === '/api/music/quality/size' && req.method === 'POST') {
        await musicDiscoveryController.postMusicQualitySize({ req, res, pathname, urlObj, ip }, serverRuntime)
        return
      }

      // [新增] 歌词 API
      if (pathname === '/api/music/lyric' && req.method === 'POST') {
        await musicDiscoveryController.postMusicLyric({ req, res, pathname, urlObj, ip }, serverRuntime)
        return
      }

      // [新增] 热搜 API
      if (pathname === '/api/music/hotSearch' && req.method === 'GET') {
        await musicDiscoveryController.getMusicHotSearch({ req, res, pathname, urlObj, ip }, serverRuntime)
        return
      }

      // [新增] 歌单分类标签 API
      if (pathname === '/api/music/songList/tags' && req.method === 'GET') {
        await musicDiscoveryController.getMusicSongListTags({ req, res, pathname, urlObj, ip }, serverRuntime)
        return
      }
      // [新增] 歌单列表 API
      if (pathname === '/api/music/songList/list' && req.method === 'GET') {
        await musicPlaylistController.getMusicSongListList({ req, res, pathname, urlObj, ip }, serverRuntime)
        return
      }
      // [新增] 歌单详情 API
      if (pathname === '/api/music/songList/detail' && req.method === 'GET') {
        await musicDiscoveryController.getMusicSongListDetail({ req, res, pathname, urlObj, ip }, serverRuntime)
        return
      }
      // [新增] 歌单搜索 API
      if (pathname === '/api/music/songList/search' && req.method === 'GET') {
        await musicDiscoveryController.getMusicSongListSearch({ req, res, pathname, urlObj, ip }, serverRuntime)
        return
      }

      // [新增] 获取用户歌单 API
      if (pathname === '/api/music/songList/userPlaylist' && req.method === 'GET') {
        await musicDiscoveryController.getMusicSongListUserPlaylist({ req, res, pathname, urlObj, ip }, serverRuntime)
        return
      }

      // [新增] 排行榜 - 获取榜单列表 API
      if (pathname === '/api/music/leaderboard/boards' && req.method === 'GET') {
        await musicDiscoveryController.getMusicLeaderboardBoards({ req, res, pathname, urlObj, ip }, serverRuntime)
        return
      }

      // [新增] 排行榜 - 获取榜单内歌曲 API
      if (pathname === '/api/music/leaderboard/list' && req.method === 'GET') {
        await musicPlaylistController.getMusicLeaderboardList({ req, res, pathname, urlObj, ip }, serverRuntime)
        return
      }

      // [新增] 评论 API
      if (pathname === '/api/music/comment' && req.method === 'POST') {
        await musicDiscoveryController.postMusicComment({ req, res, pathname, urlObj, ip }, serverRuntime)
        return
      }

      // [新增] dislike 规则 API
      // 与 Subsonic 评分联动共用同一份 lx-music 原生规则，保证各端一致：
      //   GET  /api/music/dislike        返回已解析的规则集（歌曲 / 歌手 / 专辑）
      //   POST /api/music/dislike/add     body: { type, name?, singer?, source?, albumId? }
      //   POST /api/music/dislike/remove  body: 同上
      if (pathname === '/api/music/dislike' && req.method === 'GET') {
        await musicDiscoveryController.getMusicDislike({ req, res, pathname, urlObj, ip }, serverRuntime)
        return
      }

      if ((pathname === '/api/music/dislike/add' || pathname === '/api/music/dislike/remove') && req.method === 'POST') {
        await musicDiscoveryController.postMusicDislikeAdd({ req, res, pathname, urlObj, ip }, serverRuntime)
        return
      }

      // [新增] 封面 API (备用)

      // [新增] 自定义源管理 API
      // 注：此处不再进行全局强制鉴权，鉴权逻辑已下放到 customSourceHandlers 中，
      // 以便根据请求体中的 username 字段判断是否需要校验管理员密码。

      // [新增] 管理员身份验证接口
      if (pathname === '/api/admin/verify' && req.method === 'POST') {
        await adminOperationsController.postAdminVerify({ req, res, pathname, urlObj, ip }, serverRuntime)
        return
      }

      if (pathname === '/api/custom-source/validate' && req.method === 'POST') {
        await adminSourceController.postCustomSourceValidate({ req, res, pathname, urlObj, ip }, serverRuntime)
        return
      }

      // 所有自定义源修改接口通用鉴权 (如果是公开访问限制模式，则必须登录)
      if (pathname.startsWith('/api/custom-source/') && req.method === 'POST' && pathname !== '/api/custom-source/validate') {
        if (global.lx.config['user.enablePublicRestriction']) {
          const auth = req.headers['x-frontend-auth']
          const isAdmin = auth === global.lx.config['frontend.password']
          const user = verifyUserAuth(req)
          if (!isAdmin && !user) {
            res.writeHead(403, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ success: false, error: '当前系统已开启访问限制，管理操作请登录后重试。' }))
            return
          }
        }
      }

      if (pathname === '/api/custom-source/import' && req.method === 'POST') {
        await adminSourceController.postCustomSourceImport({ req, res, pathname, urlObj, ip }, serverRuntime)
        return
      }
      if (pathname === '/api/custom-source/upload' && req.method === 'POST') {
        await adminSourceController.postCustomSourceUpload({ req, res, pathname, urlObj, ip }, serverRuntime)
        return
      }
      if (pathname === '/api/custom-source/list' && req.method === 'GET') {
        await adminSourceController.getCustomSourceList({ req, res, pathname, urlObj, ip }, serverRuntime)
        return
      }
      if (pathname === '/api/custom-source/toggle' && req.method === 'POST') {
        await adminSourceController.postCustomSourceToggle({ req, res, pathname, urlObj, ip }, serverRuntime)
        return
      }
      if (pathname === '/api/custom-source/delete' && req.method === 'POST') {
        await adminSourceController.postCustomSourceDelete({ req, res, pathname, urlObj, ip }, serverRuntime)
        return
      }

      if (pathname === '/api/custom-source/reorder' && req.method === 'POST') {
        await adminSourceController.postCustomSourceReorder({ req, res, pathname, urlObj, ip }, serverRuntime)
        return
      }
      if (pathname === '/api/custom-source/update-platforms' && req.method === 'POST') {
        await adminSourceController.postCustomSourceUpdatePlatforms({ req, res, pathname, urlObj, ip }, serverRuntime)
        return
      }

      // elFinder 文件管理器连接器
      if (pathname === '/api/elfinder/connector') {
        await adminOperationsController.handleElfinderConnector({ req, res, pathname, urlObj, ip }, serverRuntime)
        return
      }


      // Configuration API
      if (pathname === '/api/config/import' && req.method === 'POST') {
        await adminConfigurationController.postConfigurationImport({ req, res, pathname, urlObj, ip }, serverRuntime)
        return
      }
      if (pathname === '/api/config') {
        await adminConfigurationController.handleConfig({ req, res, pathname, urlObj, ip }, serverRuntime)
        return
      }

      // [配置备份管理 API] 获取备份列表及状态
      if (pathname === '/api/config/backups' && req.method === 'GET') {
        await adminConfigurationController.getConfigBackups({ req, res, pathname, urlObj, ip }, serverRuntime)
        return
      }

      // [配置备份管理 API] 手动立即备份
      if (pathname === '/api/config/backup-now' && req.method === 'POST') {
        await adminConfigurationController.postConfigBackupNow({ req, res, pathname, urlObj, ip }, serverRuntime)
        return
      }

      // [配置备份管理 API] 下载指定备份文件
      if (pathname === '/api/config/backups/download' && req.method === 'GET') {
        await adminConfigurationController.getConfigBackupsDownload({ req, res, pathname, urlObj, ip }, serverRuntime)
        return
      }

      // [配置备份管理 API] 删除指定备份文件
      if (pathname.startsWith('/api/config/backups/') && req.method === 'DELETE') {
        await adminConfigurationController.deleteConfigBackups({ req, res, pathname, urlObj, ip }, serverRuntime)
        return
      }

      // [配置备份管理 API] 从备份文件还原配置
      if (pathname === '/api/config/backups/restore' && req.method === 'POST') {
        await adminConfigurationController.postConfigBackupsRestore({ req, res, pathname, urlObj, ip }, serverRuntime)
        return
      }

      // Test Proxy API
      if (pathname === '/api/config/test-proxy' && req.method === 'POST') {
        await adminConfigurationController.postConfigTestProxy({ req, res, pathname, urlObj, ip }, serverRuntime)
        return
      }

      // Logs API
      if (pathname === '/api/logs' && req.method === 'GET') {
        await adminOperationsController.getLogs({ req, res, pathname, urlObj, ip }, serverRuntime)
        return
      }

      // Stats API
      if (pathname === '/api/stats' && req.method === 'GET') {
        await adminOperationsController.getStats({ req, res, pathname, urlObj, ip }, serverRuntime)
        return
      }







      // [新增] 本地备份下载 API
      if (pathname === '/api/backup/download' && req.method === 'GET') {
        await adminBackupController.getBackupDownload({ req, res, pathname, urlObj, ip }, serverRuntime)
        return
      }

      // [新增] 本地备份还原 API
      if (pathname === '/api/backup/upload' && req.method === 'POST') {
        await adminBackupController.postBackupUpload({ req, res, pathname, urlObj, ip }, serverRuntime)
        return
      }

      // [新增] 管理重载 API
      if (pathname === '/api/admin/reload' && req.method === 'POST') {
        await adminOperationsController.postAdminReload({ req, res, pathname, urlObj, ip }, serverRuntime)
        return
      }

      // Restart Server API
      if (pathname === '/api/restart' && req.method === 'POST') {
        await adminOperationsController.postRestart({ req, res, pathname, urlObj, ip }, serverRuntime)
        return
      }
      // File Management - List Files
      if (pathname === '/api/files' && req.method === 'GET') {
        await adminOperationsController.getFiles({ req, res, pathname, urlObj, ip }, serverRuntime)
        return
      }

      // File Management - Download File
      if (pathname === '/api/files/download' && req.method === 'GET') {
        await adminOperationsController.getFilesDownload({ req, res, pathname, urlObj, ip }, serverRuntime)
        return
      }

      // File Management - Create/Update File
      if (pathname === '/api/files' && (req.method === 'POST' || req.method === 'PUT')) {
        await adminOperationsController.postFiles({ req, res, pathname, urlObj, ip }, serverRuntime)
        return
      }

      // File Management - Delete File
      if (pathname === '/api/files' && req.method === 'DELETE') {
        await adminOperationsController.deleteFiles({ req, res, pathname, urlObj, ip }, serverRuntime)
        return
      }

    }

    const endUrl = `/${req.url?.split('/').at(-1) ?? ''}`
    let code
    let msg
    switch (endUrl) {
      case '/hello':
        // 新增：如果禁用了根路径，且当前访问的是根路径 (例如 /hello 而不是 /user/hello)，则拒绝
        if (!global.lx.config['user.enableRoot']) {
          const parts = pathname.split('/').filter(p => p)
          // parts.length <= 1 说明没有用户名部分，只有 'hello'
          if (parts.length <= 1) {
            code = 403
            msg = 'Root access disabled'
            break
          }
        }
        code = 200
        msg = SYNC_CODE.helloMsg
        break
      case '/id':
        // 新增：同上，对 /id 接口也进行同样的检查
        if (!global.lx.config['user.enableRoot']) {
          const parts = pathname.split('/').filter(p => p)
          if (parts.length <= 1) {
            code = 403
            msg = 'Root access disabled'
            break
          }
        }

        code = 200
        msg = SYNC_CODE.idPrefix + getServerId()
        break
      case '/ah':
        let targetUserName

        // 1. 尝试匹配用户路径 /<userName>/ah
        if (global.lx.config['user.enablePath']) {
          const parts = pathname.split('/').filter(p => p)
          // parts 应该是 ['username', 'ah']
          if (parts.length > 1 && parts[parts.length - 1] === 'ah') {
            targetUserName = decodeURIComponent(parts[parts.length - 2])
          }
        }

        // 2. 如果没有匹配到用户名（说明是访问的根路径 /ah，或者 URL 格式不对）
        if (!targetUserName) {
          // 如果未开启根路径模式，则拒绝访问
          if (!global.lx.config['user.enableRoot']) {
            res.writeHead(403)
            res.end('Access denied: Root path access is disabled. Please use /<username>/ah')
            return
          }
          // 如果开启了根路径，targetUserName 保持 undefined，authCode 会遍历尝试所有用户
        }

        // 将 targetUserName 传递给 authCode
        void authCode(req, res, global.lx.config.users, targetUserName)
        break
      default:
        // 如果设置了独立后台路径，兜底拦截根目录访问请求
        if (global.lx.config['admin.path'] && (pathname === '/' || pathname === '/index.html')) {
          code = 404
          msg = 'Not Found'
          break
        }

        // Serve static files
        // If root, serve index.html
        let filePath = path.join(global.lx.staticPath, pathname === '/' ? 'index.html' : pathname)
        // Prevent directory traversal
        if (!filePath.startsWith(path.join(global.lx.staticPath))) {
          code = 403
          msg = 'Forbidden'
          break
        }

        // Check if file exists, if not fall back to 404 handled by serveStatic or check original logic
        if (clientFileExists(filePath)) {
          serveStatic(req, res, filePath)
          return
        }

        code = 404
        msg = 'Not Found'
        break
    }
    if (!code) return
    res.writeHead(code)
    res.end(msg)
  }
  const httpServer = http.createServer(requestHandler)
  const clientChannel = new ClientChannel(requestHandler, verifyUserAuth, req => userSessions.get((req.headers['x-user-token'] as string) || parseCookies(req.headers.cookie)[USER_SESSION_COOKIE]), username => path.join(global.lx.userPath, getUserDirname(username)))
  httpServer.on('close', () => clientChannel.close())
  httpServer.on('close', startNotificationPersistence())
  installLibraryReadGuard(httpServer)
  httpServer.on('close', () => { void stopLibraryBackground().catch(error => console.error('[音乐库] 停止失败', error)) })

  wss = new WebSocketServer({
    noServer: true,
    perMessageDeflate: false,
  }) as unknown as LX.SocketServer


  wss.on('connection', function (socket: any, request) {
    socket.isReady = false
    socket.moduleReadys = {
      list: false,
      dislike: false,
    }
    socket.feature = {
      list: false,
      dislike: false,
    }
    socket.on('pong', () => {
      socket.isAlive = true
    })

    // const events = new Map<keyof ActionsType, Array<(err: Error | null, data: LX.Sync.ActionSyncType[keyof LX.Sync.ActionSyncType]) => void>>()
    // const events = new Map<keyof LX.Sync.ActionSyncType, Array<(err: Error | null, data: LX.Sync.ActionSyncType[keyof LX.Sync.ActionSyncType]) => void>>()
    // let events: Partial<{ [K in keyof LX.Sync.ActionSyncType]: Array<(data: LX.Sync.ActionSyncType[K]) => void> }> = {}
    let closeEvents: Array<(err: Error) => (void | Promise<void>)> = []
    let disconnected = false
    const msg2call = createMsg2call<LX.Sync.ClientSyncActions>({
      funcsObj: callObj,
      timeout: 120 * 1000,
      /**
 * 向同步 WebSocket 客户端发送序列化消息。
 * @param data 需要保存或转换的数据。
 * @author yahyaoo
 */
      sendMessage(data: any) {
        if (disconnected) throw new Error('disconnected')
        void encryptMsg(socket.keyInfo, JSON.stringify(data)).then((data: string) => {
          // console.log('sendData', eventName)
          socket.send(data)
        }).catch(err => {
          syncLog.error('encrypt message error:', err)
          syncLog.error(err.message)
          socket.close(SYNC_CLOSE_CODE.failed)
        })
      },
      /**
 * 在远程调用执行前校验或补充同步协议参数。
 * @param rawArgs 远程调用的原始参数。
 * @author yahyaoo
 */
      onCallBeforeParams(rawArgs: any[]) {
        return [socket, ...rawArgs]
      },
      /**
 * 记录同步远程调用发生的异常。
 * @param error 错误原因。
 * @param path 原资源路径。
 * @param groupName 歌曲目录分类名称。
 * @author yahyaoo
 */
      onError(error: Error, path: string[], groupName: string | null) {
        const name = groupName ?? ''
        const userName = socket.userInfo?.name ?? ''
        const deviceName = socket.keyInfo?.deviceName ?? ''
        syncLog.error(`sync call ${userName} ${deviceName} ${name} ${path.join('.')} error:`, error)
        // if (groupName == null) return
        // // TODO
        // socket.close(SYNC_CLOSE_CODE.failed)
      },
    })
    socket.remote = msg2call.remote
    socket.remoteQueueList = msg2call.createQueueRemote('list')
    socket.remoteQueueDislike = msg2call.createQueueRemote('dislike')
    socket.addEventListener('message', ({ data }: any) => {
      if (typeof data != 'string') return
      void decryptMsg(socket.keyInfo, data).then((data) => {
        let syncData: any
        try {
          syncData = JSON.parse(data)
        } catch (err) {
          syncLog.error('parse message error:', err)
          socket.close(SYNC_CLOSE_CODE.failed)
          return
        }
        msg2call.message(syncData)
      }).catch(err => {
        syncLog.error('decrypt message error:', err)
        syncLog.error(err.message)
        socket.close(SYNC_CLOSE_CODE.failed)
      })
    })
    socket.addEventListener('close', () => {
      const err = new Error('closed')
      try {
        for (const handler of closeEvents) void handler(err)
      } catch (err: any) {
        syncLog.error(err?.message)
      }
      closeEvents = []
      disconnected = true
      msg2call.destroy()
      if (socket.isReady) {
        accessLog.info('deconnection', socket.userInfo.name, socket.keyInfo.deviceName)
        // events = {}
        if (!status.devices.map(d => getUserName(d.clientId)).filter(n => n == socket.userInfo.name).length) handleUnconnection(socket.userInfo.name)
      } else {
        const queryData = new URL(request.url as string, host).searchParams
        accessLog.info('deconnection', queryData.get('i'))
      }
    })
    socket.onClose = function (handler: typeof closeEvents[number]) {
      closeEvents.push(handler)
      return () => {
        closeEvents.splice(closeEvents.indexOf(handler), 1)
      }
    }
    socket.broadcast = function (handler: any) {
      if (!wss) return
      for (const client of wss.clients) handler(client)
    }

    void handleConnection(socket, request)
  })

  httpServer.on('upgrade', function upgrade(request, socket, head) {
    socket.addListener('error', onSocketError)
    if (new URL(request.url || '/', 'http://localhost').pathname === '/api/music/client-channel') {
      const origin = request.headers.origin
      try { if (origin && new URL(origin).host !== request.headers.host) { socket.destroy(); return } }
      catch { socket.destroy(); return }
      clientChannel.sockets.handleUpgrade(request, socket, head, ws => clientChannel.connect(ws, request)); return
    }

    // 调用全局定义的 authConnection (在文件顶部约113行已经定义过)
    authConnection(request, (err, success) => {
      // 如果报错或者 success 为 false，则拒绝连接
      if (err || !success) {
        // console.log('Auth failed', err)
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
        socket.destroy()
        return
      }

      socket.removeListener('error', onSocketError)

      // 鉴权通过，升级协议
      // 强制删除压缩扩展头，防止 permessage-deflate 协商导致 "RSV1 must be clear" 错误
      delete request.headers['sec-websocket-extensions']
      wss?.handleUpgrade(request, socket, head, function done(ws) {
        wss?.emit('connection', ws, request)
      })
    })
  })

  const interval = setInterval(() => {
    wss?.clients.forEach(socket => {
      if (socket.isAlive == false) {
        syncLog.info('alive check false:', socket.userInfo.name, socket.keyInfo.deviceName)
        socket.terminate()
        return
      }

      socket.isAlive = false
      socket.ping(noop)
      if (socket.keyInfo.isMobile) socket.send('ping', noop)
    })
  }, 30000)

  wss?.on('close', function close() {
    clearInterval(interval)
  })

  httpServer.on('error', error => {
    console.log(error)
    reject(error)
  })

  httpServer.on('listening', () => {
    const addr = httpServer.address()
    // console.log(addr)
    if (!addr) {
      reject(new Error('address is null'))
      return
    }
    const bind = typeof addr == 'string' ? `pipe ${addr}` : `port ${addr.port}`
    startupLog.info(`Listening on ${ip} ${bind}`)
    resolve(null)
    void registerLocalSyncEvent(wss as LX.SocketServer)
  })

  host = `http://${ip.includes(':') ? `[${ip}]` : ip}:${port}`
  httpServer.listen(port, ip)
})

// [Subsonic 独立端口] 在独立监听端口上只暴露 Subsonic API。
// 鉴权复用 subsonic 自身 verifyAuth（subsonic.ts 内部实现）——只有携带合法 Subsonic 凭据(用户/密码/token)的请求才会被处理，
// 未通过鉴权的请求一律返回错误，从而实现「只允许 Subsonic 用户通过」。
const startSubsonicStandaloneServer = () => {
  const subEnabled = global.lx.config['subsonic.enable'] !== false
  const subPort = global.lx.config['subsonic.port']
  if (!subEnabled || !(typeof subPort === 'number' && subPort > 0)) return

  // 不绑定特定 IP：监听所有网卡，访问控制交由防火墙处理
  const subBindIP = '0.0.0.0'
  const subServer = http.createServer(async (req, res) => {
    // 与主端口一致的 CORS 头，兼容跨域 Subsonic 客户端
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', '*')
    res.setHeader('Access-Control-Allow-Private-Network', 'true')

    if (req.method === 'OPTIONS') {
      res.writeHead(204)
      res.end()
      return
    }

    try {
      const { subsonicHandler } = require('../../music/service/subsonic/SubsonicService')
      const urlObj = new URL(req.url ?? '', `http://${req.headers.host}`)

      // [路由守卫] 仅允许 /rest/{method} 形式的 Subsonic API 调用，其余路径一律 404。
      // 真正的 Subsonic 客户端请求形如 /rest/ping.view，会正常进入处理方法；
      // 浏览器裸访问（/、/rest、/rest/ 等）及爬虫请求返回「像资源不存在」的 404：
      // 只给状态码、不附带任何服务器说明文案，避免暴露「这是一个服务器 / 服务在响应」的特征。
      if (!/^\/rest\/.+/.test(urlObj.pathname)) {
        res.writeHead(404)
        res.end()
        return
      }

      // 直接交给 subsonic 处理；handleRequest 内部 verifyAuth 只会放行通过 Subsonic 鉴权的用户
      await subsonicHandler.handleRequest(req, res, urlObj)
    } catch (err: any) {
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' })
        res.end('Internal Server Error')
      }
    }
  })

  subServer.on('error', (err: any) => {
    global.lx.subsonicPortConflict = {
      port: subPort,
      error: err.code === 'EADDRINUSE' ? `端口 ${subPort} 已被占用` : (err.message || '端口绑定失败'),
      time: Date.now(),
    }
    startupLog.error(`Subsonic standalone server failed on ${subBindIP}:${subPort}: ${err.message}`)
    console.error('[Subsonic] 独立服务发生异常:', err)
  })

  subServer.listen(subPort, subBindIP, () => {
    global.lx.subsonicPortConflict = undefined
    startupLog.info(`Subsonic standalone server listening on ${subBindIP}:${subPort}`)
    console.log(`[Subsonic] 独立服务已监听: http://${subBindIP}:${subPort}`)
  })
}

// const handleStopServer = async() => new Promise<void>((resolve, reject) => {
//   if (!wss) return
//   for (const client of wss.clients) client.close(SYNC_CLOSE_CODE.normal)
//   unregisterLocalSyncEvent()
//   wss.close()
//   wss = null
//   httpServer.close((err) => {
//     if (err) {
//       reject(err)
//       return
//     }
//     resolve()
//   })
// })

// export const stopServer = async() => {
//   codeTools.stop()
//   if (!status.status) {
//     status.status = false
//     status.message = ''
//     status.address = []
//     status.code = ''
//     sendStatus(status)
//     return
//   }
//   console.log('stoping sync server...')
//   await handleStopServer().then(() => {
//     console.log('sync server stoped')
//     status.status = false
//     status.message = ''
//     status.address = []
//     status.code = ''
//   }).catch(err => {
//     console.log(err)
//     status.message = err.message
//   }).finally(() => {
//     sendStatus(status)
//   })
// }

/**
 * 初始化公共账号默认数据、音乐 SDK、音源、缓存与下载解析器，再启动监听和任务调度。
 * @param port HTTP 监听端口。
 * @param ip 服务绑定地址。
 * @author yahyaoo
 */
export const startServer = async (port: number, ip: string) => {
  // 监听前持久化公共账号默认文档；数据库故障时不启动未初始化的服务。 @author yahyaoo
  const openUserSpace = getUserSpace('_open')
  await openUserSpace.listManage.listDataManage.initPromise
  // Initialize file cache settings from global config
  if (global.lx.config) {
    if (global.lx.config.serverCacheLocation) fileCache.setCacheLocation(global.lx.config.serverCacheLocation)
    global.lx.config['cache.namingPattern'] = fileCache.setNamingPattern(global.lx.config['cache.namingPattern'])

    // Background sync cache index for active users
    if (global.lx.config.users) {
      for (const user of global.lx.config.users) {
        void fileCache.syncCacheIndex(user.name)
      }
    }
  }

  // [新增] 注入歌词获取钩子：用于服务器缓存时自动嵌入 USLT 标签
  // SDK 的 getLyric() 返回 { promise, cancel }，必须 await .promise
  fileCache.setLyricFetcher(async (songInfo: any) => {
    try {
      const source = songInfo.source
      if (!source || !musicSdk[source] || !musicSdk[source].getLyric) {
        console.log(`[歌词抓取] 跳过: 不支持的音源 "${source}"`)
        return null
      }
      // [Fix] Strip source prefix from songmid (e.g. "tx_004bd0..." -> "004bd0...")
      let songmid: string = songInfo.songmid || songInfo.id || ''
      const sourcePrefix = `${source}_`
      if (songmid.startsWith(sourcePrefix)) songmid = songmid.slice(sourcePrefix.length)
      if (!songmid) {
        console.log(`[歌词抓取] 跳过: 歌曲 songmid 为空`)
        return null
      }
      console.log(`[歌词抓取] 正在获取歌词: ${source}_${songmid} (${songInfo.name})`)
      const requestObj = musicSdk[source].getLyric({
        songmid,
        name: songInfo.name || '',
        singer: songInfo.singer || '',
        hash: songInfo.hash || '',
        interval: songInfo.interval || '',
      })
      const result = await requestObj.promise
      const lyricText = result?.lyric || result?.lrc || null
      console.log(`[歌词抓取] 获取结果: ${lyricText ? lyricText.length + ' 字符' : '无歌词'}`)
      return lyricText
    } catch (e: any) {
      console.warn(`[歌词抓取] 抓取失败 (${songInfo.name}):`, e.message || e)
      return null
    }
  })

  // if (status.status) await handleStopServer()

  startupLog.info(`starting sync server in ${process.env.NODE_ENV == 'production' ? 'production' : 'development'}`)
  const proxyEnabled = global.lx.config['proxy.all.enabled']
  const proxyAddress = global.lx.config['proxy.all.address']
  console.log(`[网络代理] 音乐 SDK 代理状态: ${proxyEnabled ? `已启用 (${proxyAddress})` : '未启用'}`)
  startupLog.info(`Music SDK Proxy: ${proxyEnabled ? `Enabled (${proxyAddress})` : 'Disabled'}`)
  try {
    await musicSdk.init()
    startupLog.info('musicSdk initialized')
  } catch (err) {
    startupLog.error('musicSdk init failed:', err)
  }

  // 初始化自定义源
  try {
    console.log('[服务] 正在初始化自定义源...')
    // 修改：不传参数，默认加载 open + 所有用户源
    await initUserApis()
    console.log('[服务] 自定义源初始化完成')
  } catch (err: any) {
    console.error('[服务] 初始化自定义源失败:', err.message)
  }

  // [Fix] 服务启动时从 _open 用户 settings.json 读取 serverCacheLocation 并预初始化 fileCache，
  // 避免前端初始化同步时因服务端内存状态（默认 'root'）与持久化设置不一致而触发权限检查返回 403
  try {
    const settingsPath = path.join(openUserSpace.dataManage.userDir, File.userSettingsJSON)
    if (storageFs.existsSync(settingsPath)) {
      const savedSettings = JSON.parse(storageFs.readFileSync(settingsPath, 'utf8'))
      if (savedSettings.serverCacheLocation && !path.isAbsolute(global.lx.config.serverCacheLocation || '')) {
        fileCache.setCacheLocation(savedSettings.serverCacheLocation)
        console.log(`[缓存] 从配置恢复服务器缓存路径: ${savedSettings.serverCacheLocation}`)
      }
      if (savedSettings.serverCacheNamingPattern) {
        const normalizedNamingPattern = fileCache.setNamingPattern(savedSettings.serverCacheNamingPattern)
        console.log(`[缓存] 从配置恢复缓存文件命名模式: ${normalizedNamingPattern}`)
      }
    }
  } catch (err: any) {
    console.warn('[缓存] 恢复缓存设置失败:', err.message)
  }

  serverDownloads.initialize({
    lyric: async (song, username) => {
      const cached = fileCache.checkLyricCache(song, username)
      if (cached.exists && cached.content?.lyric) return cached.content.lyric
      return fileCache.getLyricFetcher()?.(song) || null
    },
    embed: fileCache.embedLyricsIntoFile,
  })
  serverDownloadQueue.initialize(async task => {
    const songInfo = normalizeSongInfo(task.songInfo)
    const apiUsername = task.username === '_open' ? 'open' : task.username
    const resolved = await resolveServerSong(songInfo, task.requestedQuality, apiUsername, true)
    return {
      url: resolved.url,
      quality: resolved.quality,
      songInfo: resolved.songInfo,
      requestedSource: resolved.requestedSource,
      downloadSource: resolved.downloadSource,
      sourceName: resolved.sourceName,
    }
  })

  // 注入同步下载引擎的 resolver（低耦合：由此处唯一注入）
  setSongResolver(async (songInfo, quality, username) => {
    const apiUsername = username === '_open' ? 'open' : username
    const resolved = await resolveServerSong(normalizeSongInfo(songInfo), quality, apiUsername, true)
    return {
      url: resolved.url,
      quality: resolved.quality,
      songInfo: resolved.songInfo,
    }
  })

  remasterQueue.initialize(async (songInfo, requestedQuality, username) => {
    const apiUsername = username === '_open' ? 'open' : username
    const resolved = await resolveServerSong(songInfo, requestedQuality, apiUsername, true)
    return {
      url: resolved.url,
      quality: resolved.quality,
    }
  })

  await handleStartServer(port, ip).then(async () => {
    // console.log('sync server started')
    status.status = true
    status.message = ''
    startLibraryBackground()
    scheduler.startScheduler()
    status.address = ip == '0.0.0.0' ? getAddress() : [ip]

    // [Subsonic 独立端口] 主端口就绪后启动（独立端口失败不影响主服务）
    startSubsonicStandaloneServer()



    // void generateCode()
    // codeTools.start()
  }).catch(err => {
    console.error('[服务] 启动同步服务异常:', err)
    status.status = false
    status.message = err.message
    status.address = []
    // status.code = ''
  })
  // .finally(() => {
  //   sendStatus(status)
  // })
}

/**
 * 查询服务器资源用量、用户和同步连接状态。
 * @param context 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 当前服务的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export const getStatus = (): LX.Sync.Status => status

// export const generateCode = async() => {
//   status.code = handleGenerateCode()
//   sendStatus(status)
//   return status.code
// }

/**
 * 查询指定用户空间中已配对的同步设备。
 * @param userName 用户名称。
 * @author yahyaoo
 */
export const getDevices = async (userName: string) => {
  const userSpace = getUserSpace(userName)
  return userSpace.getDecices()
}

/**
 * 关闭指定设备的在线连接，并删除用户空间中的设备记录。
 * @param userName 用户名称。
 * @param clientId 配对客户端标识。
 * @author yahyaoo
 */
export const removeDevice = async (userName: string, clientId: string) => {
  if (wss) {
    for (const client of wss.clients) {
      if (client.userInfo?.name == userName && client.keyInfo?.clientId == clientId) client.close(SYNC_CLOSE_CODE.normal)
    }
  }
  const userSpace = getUserSpace(userName)
  await userSpace.removeDevice(clientId)
}
