/** 服务器下载队列：任务入队、并发调度、暂停恢复和持久化下载状态。 @author yahyaoo */
import storageFs from '../../../application/persistence/documentFileSystem'
import fs from 'node:fs'
import path from 'node:path'
import * as fileCache from '../cache/FileCacheService'
import * as serverDownloads from './ServerDownloadService'
import { serverEvents } from '../../../application/events/ServerEvents'

/** 服务器下载任务的排队、执行、暂停或结束状态。 @author yahyaoo */
export type ServerDownloadStatus = 'waiting' | 'downloading' | 'tagging' | 'paused' | 'finished' | 'exists' | 'error'

/** 服务器下载队列记录，关联用户、歌曲、请求音质和执行进度。 @author yahyaoo */
export interface ServerDownloadTask {
  /** 业务记录标识。 */
  id: string
  /** 数据所属用户名。 */
  username: string
  /** 歌曲索引定位键。 */
  songKey: string

  activeSongKey?: string
  /** 歌曲详情及平台扩展字段。 */
  songInfo: any
  /** 音质标识。 */
  quality: string
  /** 客户端请求的音质。 */
  requestedQuality: string
  /** 当前处理或任务状态。 */
  status: ServerDownloadStatus
  /** 任务处理进度。 */
  progress: number
  /** 待处理记录总数。 */
  total: number

  received: number

  speed: number
  /** 任务失败说明。 */
  errorMsg: string

  enableOnlyDownloadMode: boolean
  /** 是否保存歌词缓存。 */
  cacheLyric: boolean
  /** 是否将歌词内嵌到音频。 */
  embedLyric: boolean
  /** 是否属于服务器下载任务。 */
  serverDownload?: boolean
  /** 歌词保存方式，内嵌或外部 LRC。 */
  lyricMode?: serverDownloads.LyricMode

  identitySong?: any
  /** 记录创建时间，单位毫秒。 */
  createdAt: number
  /** 记录最近更新时间，单位毫秒。 */
  updatedAt: number
}

/** 入队歌曲请求及下载目的配置。 @author yahyaoo */
interface QueueInput {
  /** 业务记录标识。 */
  id?: string
  /** 歌曲详情及平台扩展字段。 */
  songInfo: any
  /** 音质标识。 */
  quality?: string

  enableOnlyDownloadMode?: boolean
  /** 是否保存歌词缓存。 */
  cacheLyric?: boolean
  /** 是否将歌词内嵌到音频。 */
  embedLyric?: boolean
  /** 是否属于服务器下载任务。 */
  serverDownload?: boolean
  /** 歌词保存方式，内嵌或外部 LRC。 */
  lyricMode?: serverDownloads.LyricMode
}

/** 歌曲解析器返回的可下载地址、音质与歌曲元信息。 @author yahyaoo */
interface ResolveResult {
  /** 请求或资源地址。 */
  url: string
  /** 音质标识。 */
  quality?: string
  /** 歌曲详情及平台扩展字段。 */
  songInfo?: any
  /** 客户端选择的音乐平台。 */
  requestedSource?: string
  /** 最终解析到的下载平台。 */
  downloadSource?: string
  /** 音源显示名称。 */
  sourceName?: string
}

/** 按请求歌曲和用户解析下载地址的异步函数。 @author yahyaoo */
type DownloadResolver = (task: ServerDownloadTask) => Promise<ResolveResult>

const DEFAULT_CONCURRENT = 3
const MAX_CONCURRENT_PER_USER = 5
const tasks = new Map<string, ServerDownloadTask>()
const controllers = new Map<string, AbortController>()
const concurrencyByUser = new Map<string, number>()
let resolver: DownloadResolver | null = null
let initialized = false
let processing = false
let saveTimer: ReturnType<typeof setTimeout> | null = null

const taskMapKey = (username: string, id: string) => `${username}:${id}`
const getRuntimeDir = () => {
  const dir = path.join(global.lx.dataPath, 'runtime')
  if (!storageFs.existsSync(dir)) storageFs.mkdirSync(dir, { recursive: true })
  return dir
}

const getQueueFile = () => path.join(getRuntimeDir(), 'server-download-queue.json')
const validStatuses = new Set<ServerDownloadStatus>(['waiting', 'downloading', 'tagging', 'paused', 'finished', 'exists', 'error'])

const normalizeConcurrency = (value: unknown) => {
  const parsed = Number.parseInt(String(value), 10)
  if (!Number.isFinite(parsed)) return DEFAULT_CONCURRENT
  return Math.min(MAX_CONCURRENT_PER_USER, Math.max(1, parsed))
}

/**
 * 返回下载队列当前并发任务上限。
 * @param username 已解析的用户名称。
 * @author yahyaoo
 */
export const getConcurrency = (username: string) => concurrencyByUser.get(username) || DEFAULT_CONCURRENT

const sanitizeId = (value: unknown) => {
  const id = String(value || '')
  return /^[A-Za-z0-9_-]{1,160}$/.test(id) ? id : `server_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

const saveNow = () => {
  if (!initialized) return
  const file = getQueueFile()
  const tempFile = `${file}.tmp`
  try {
    storageFs.mkdirSync(path.dirname(file), { recursive: true })
    storageFs.writeFileSync(tempFile, JSON.stringify({
      version: 2,
      concurrencyByUser: Object.fromEntries(concurrencyByUser),
      tasks: Array.from(tasks.values()),
    }, null, 2), 'utf8')
    storageFs.renameSync(tempFile, file)
  } catch (err) {
    console.warn('[下载队列] 保存任务失败:', err)
    try { if (storageFs.existsSync(tempFile)) storageFs.unlinkSync(tempFile) } catch (e) { }
  }
}

const scheduleSave = () => {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    saveTimer = null
    saveNow()
  }, 150)
}

const loadTasks = () => {
  const file = getQueueFile()
  if (!storageFs.existsSync(file)) return
  try {
    const data = JSON.parse(storageFs.readFileSync(file, 'utf8'))
    const savedTasks = Array.isArray(data) ? data : data?.tasks
    if (!Array.isArray(savedTasks)) return
    if (!Array.isArray(data) && data?.concurrencyByUser && typeof data.concurrencyByUser === 'object') {
      for (const [username, value] of Object.entries(data.concurrencyByUser)) {
        concurrencyByUser.set(username, normalizeConcurrency(value))
      }
    }
    for (const raw of savedTasks) {
      if (!raw || !raw.username || !raw.songInfo) continue
      const id = sanitizeId(raw.id)
      const savedStatus = validStatuses.has(raw.status) ? raw.status as ServerDownloadStatus : 'waiting'
      const status: ServerDownloadStatus = savedStatus === 'downloading' || savedStatus === 'tagging' ? 'waiting' : savedStatus
      const quality = String(raw.quality || raw.requestedQuality || '320k')
      const requestedQuality = String(raw.requestedQuality || quality)
      const now = Date.now()
      const task: ServerDownloadTask = {
        id,
        username: String(raw.username),
        songKey: String(raw.songKey || `${fileCache.normalizeSongId(raw.songInfo)}_${requestedQuality}`),
        activeSongKey: status === 'waiting' ? undefined : raw.activeSongKey ? String(raw.activeSongKey) : undefined,
        songInfo: raw.songInfo,
        quality: status === 'waiting' ? requestedQuality : quality,
        requestedQuality,
        status,
        progress: status === 'waiting' ? 0 : Number(raw.progress || 0),
        total: status === 'waiting' ? 0 : Number(raw.total || 0),
        received: status === 'waiting' ? 0 : Number(raw.received || 0),
        speed: 0,
        errorMsg: status === 'waiting' ? '' : String(raw.errorMsg || ''),
        enableOnlyDownloadMode: !!raw.enableOnlyDownloadMode,
        cacheLyric: raw.cacheLyric !== false,
        embedLyric: raw.embedLyric !== false,
        serverDownload: raw.serverDownload === true,
        lyricMode: raw.lyricMode === 'external' ? 'external' : 'embedded',
        identitySong: raw.identitySong || raw.songInfo,
        createdAt: Number(raw.createdAt || now),
        updatedAt: now,
      }
      tasks.set(taskMapKey(task.username, task.id), task)
    }
    console.log(`[下载队列] 已恢复 ${tasks.size} 个持久化下载任务`)
  } catch (err) {
    console.warn('[下载队列] 恢复队列任务失败:', err)
  }
}

const getPublicTask = (task: ServerDownloadTask) => {
  const live = !task.serverDownload && task.status === 'downloading' && task.activeSongKey
    ? fileCache.cacheProgress.get(task.activeSongKey)
    : undefined
  const liveStatus = live?.status as ServerDownloadStatus | undefined
  return {
    id: task.id,
    songKey: task.activeSongKey || task.songKey,
    songInfo: task.songInfo,
    quality: task.quality,
    requestedQuality: task.requestedQuality,
    serverDownload: task.serverDownload === true,
    lyricMode: task.lyricMode,
    status: liveStatus || task.status,
    progress: Number(live?.progress ?? task.progress ?? 0),
    total: Number(live?.total ?? task.total ?? 0),
    received: Number(live?.received ?? task.received ?? 0),
    speed: Number(live?.speed ?? task.speed ?? 0),
    errorMsg: String(live?.errorMsg || task.errorMsg || ''),
    createdAt: task.createdAt,
    updatedAt: Number(live?.updatedAt || task.updatedAt),
  }
}

const runTask = async (task: ServerDownloadTask) => {
  if (!resolver || task.status !== 'waiting') return
  const key = taskMapKey(task.username, task.id)
  const controller = new AbortController()
  controllers.set(key, controller)
  task.status = 'downloading'
  task.progress = 0
  task.total = 0
  task.received = 0
  task.speed = 0
  task.errorMsg = ''
  task.updatedAt = Date.now()
  scheduleSave()

  serverEvents.emitEvent('download:changed', { username: task.username, reason: 'state' })

  try {
    // 指定目录任务先查已下载文件，重复任务不触发音源解析。
    if (task.serverDownload && serverDownloads.check(task.identitySong || task.songInfo, task.username, task.requestedQuality, true, true).exists) {
      task.status = 'exists'
      task.progress = 100
      return
    }
    const resolved = await resolver(task)
    if (controller.signal.aborted) return
    if (!resolved?.url) throw new Error('无法解析下载地址')
    task.songInfo = resolved.songInfo || task.songInfo
    task.quality = resolved.quality || task.requestedQuality
    task.activeSongKey = fileCache.normalizeSongId(task.songInfo) + '_' + task.quality
    task.updatedAt = Date.now()
    scheduleSave()

    if (task.serverDownload) {
      const started = Date.now()
      await serverDownloads.download(task.songInfo, task.identitySong || task.songInfo, resolved.url, task.quality, task.username,
        task.lyricMode || 'embedded', controller.signal, (received, total) => {
          task.received = received
          task.total = total
          task.progress = total ? Math.min(99, received / total * 100) : 0
          task.speed = received / Math.max(1, (Date.now() - started) / 1000)
          task.updatedAt = Date.now()
          serverEvents.emitEvent('download:changed', { username: task.username, reason: 'progress' })
        })
    } else {
      await fileCache.downloadAndCache(task.songInfo, resolved.url, task.quality, task.username, controller.signal,
        task.enableOnlyDownloadMode, task.cacheLyric, task.embedLyric, {
        requestedSource: resolved.requestedSource,
        downloadSource: resolved.downloadSource,
        sourceName: resolved.sourceName,
      })
    }

    if (controller.signal.aborted) return
    const progress = task.serverDownload ? undefined : fileCache.cacheProgress.get(task.activeSongKey)
    task.status = progress?.status === 'exists' ? 'exists' : 'finished'
    task.progress = 100
    task.total = Number(progress?.total || progress?.received || task.total || 0)
    task.received = Number(progress?.received || task.total || 0)
    task.speed = 0
    task.errorMsg = ''
  } catch (err: any) {
    if (controller.signal.aborted || err?.message === 'Aborted') {
      task.status = 'paused'
      task.errorMsg = '已暂停'
    } else {
      task.status = 'error'
      task.errorMsg = err?.message || '下载失败'
    }
    task.speed = 0
  } finally {
    controllers.delete(key)
    task.updatedAt = Date.now()
    scheduleSave()
    serverEvents.emitEvent('download:changed', { username: task.username, reason: 'state' })
    if (task.status === 'error') serverEvents.emitEvent('notify', { username: task.username, id: task.id + ':' + task.updatedAt, level: 'error', title: '下载失败', message: task.errorMsg, createdAt: task.updatedAt })
    void processQueue()
  }
}

const processQueue = async () => {
  if (processing || !resolver) return
  processing = true
  try {
    while (true) {
      const activeByUser = new Map<string, number>()
      for (const key of controllers.keys()) {
        const username = tasks.get(key)?.username
        if (!username) continue
        activeByUser.set(username, (activeByUser.get(username) || 0) + 1)
      }
      const next = Array.from(tasks.values()).find(task => (
        task.status === 'waiting' && (activeByUser.get(task.username) || 0) < getConcurrency(task.username)
      ))
      if (!next) break
      void runTask(next)
    }
  } finally {
    processing = false
  }
}

/**
 * 校验并更新下载并发上限，安排等待任务继续执行。
 * @param username 已解析的用户名称。
 * @param value 请求的并发任务数量，按队列限制归一化。
 * @author yahyaoo
 */
export const setConcurrency = (username: string, value: unknown) => {
  const concurrency = normalizeConcurrency(value)
  concurrencyByUser.set(username, concurrency)
  saveNow()
  serverEvents.emitEvent('download:changed', { username, reason: 'queue' })
  void processQueue()
  return concurrency
}

/**
 * 注入歌曲链接解析器，恢复队列或注册下载所需依赖。
 * @param downloadResolver 由应用注入的歌曲下载链接解析函数。
 * @author yahyaoo
 */
export const initialize = (downloadResolver: DownloadResolver) => {
  resolver = downloadResolver
  if (!initialized) {
    initialized = true
    loadTasks()
    saveNow()
  }
  void processQueue()
}

/**
 * 将歌曲下载请求加入用户队列并安排执行。
 * @param username 已解析的用户名称。
 * @param inputs 批量下载入队请求。
 * @author yahyaoo
 */
export const enqueue = (username: string, inputs: QueueInput[]) => {
  const added: ServerDownloadTask[] = []
  for (const input of inputs) {
    if (!input?.songInfo) continue
    const id = sanitizeId(input.id)
    const key = taskMapKey(username, id)
    const quality = input.quality || '320k'
    const existing = tasks.get(key)
    if (existing) {
      if (['waiting', 'downloading', 'tagging'].includes(existing.status)) continue

      const now = Date.now()
      existing.songKey = fileCache.normalizeSongId(input.songInfo) + '_' + quality
      existing.activeSongKey = undefined
      existing.songInfo = input.songInfo
      existing.quality = quality
      existing.requestedQuality = quality
      existing.status = 'waiting'
      existing.progress = 0
      existing.total = 0
      existing.received = 0
      existing.speed = 0
      existing.errorMsg = ''
      existing.enableOnlyDownloadMode = !!input.enableOnlyDownloadMode
      existing.cacheLyric = input.cacheLyric !== false
      existing.embedLyric = input.embedLyric !== false
      existing.serverDownload = input.serverDownload === true
      existing.lyricMode = input.lyricMode === 'external' ? 'external' : 'embedded'
      existing.identitySong = input.songInfo
      existing.createdAt = now
      existing.updatedAt = now
      added.push(existing)
      continue
    }
    const now = Date.now()
    const task: ServerDownloadTask = {
      id, username,
      songKey: fileCache.normalizeSongId(input.songInfo) + '_' + quality,
      songInfo: input.songInfo,
      quality,
      requestedQuality: quality,
      status: 'waiting', progress: 0, total: 0, received: 0, speed: 0, errorMsg: '',
      enableOnlyDownloadMode: !!input.enableOnlyDownloadMode,
      cacheLyric: input.cacheLyric !== false,
      embedLyric: input.embedLyric !== false,
      serverDownload: input.serverDownload === true,
      lyricMode: input.lyricMode === 'external' ? 'external' : 'embedded',
      identitySong: input.songInfo,
      createdAt: now, updatedAt: now,
    }
    tasks.set(key, task)
    added.push(task)
  }
  saveNow()
  void processQueue()
  serverEvents.emitEvent('download:changed', { username, reason: 'queue' })
  return added.map(task => getPublicTask(task))
}

/**
 * 返回用户下载任务与当前状态。
 * @param username 已解析的用户名称。
 * @author yahyaoo
 */
export const list = (username: string) => Array.from(tasks.values())
  .filter(task => task.username === username)
  .sort((a, b) => a.createdAt - b.createdAt)
  .map(task => getPublicTask(task))

/**
 * 暂停用户下载队列并中止当前任务传输。
 * @param username 已解析的用户名称。
 * @param id 当前业务对象标识。
 * @author yahyaoo
 */
export const pause = (username: string, id?: string) => {
  for (const task of tasks.values()) {
    if (task.username !== username || (id && task.id !== id)) continue
    if (!['waiting', 'downloading', 'tagging'].includes(task.status)) continue
    task.status = 'paused'
    task.speed = 0
    task.errorMsg = '已暂停'
    task.updatedAt = Date.now()
    controllers.get(taskMapKey(username, task.id))?.abort()
  }
  saveNow()
  serverEvents.emitEvent('download:changed', { username, reason: 'state' })
}

/**
 * 恢复用户已暂停的下载任务，并重新安排执行。
 * @param username 已解析的用户名称。
 * @param id 当前业务对象标识。
 * @author yahyaoo
 */
export const resume = (username: string, id?: string) => {
  for (const task of tasks.values()) {
    if (task.username !== username || (id && task.id !== id)) continue
    if (task.status !== 'paused' && task.status !== 'error') continue
    task.status = 'waiting'
    task.progress = 0
    task.total = 0
    task.received = 0
    task.speed = 0
    task.errorMsg = ''
    task.activeSongKey = undefined
    task.quality = task.requestedQuality
    task.updatedAt = Date.now()
  }
  saveNow()
  serverEvents.emitEvent('download:changed', { username, reason: 'state' })
  void processQueue()
}

/**
 * 移除下载队列中的指定任务。
 * @param username 已解析的用户名称。
 * @param options 按 id 删除任务，或通过 all/completed 删除全部或已完成任务。
 * @author yahyaoo
 */
export const remove = (username: string, options: { /** 条目唯一标识。 */
id?: string;
all?: boolean;
completed?: boolean }) => {
  for (const [key, task] of tasks) {
    if (task.username !== username) continue
    const shouldRemove = options.all || (options.id && task.id === options.id) || (options.completed && ['finished', 'exists'].includes(task.status))
    if (!shouldRemove) continue
    controllers.get(key)?.abort()
    tasks.delete(key)
  }
  saveNow()
  serverEvents.emitEvent('download:changed', { username, reason: 'queue' })
  void processQueue()
}
