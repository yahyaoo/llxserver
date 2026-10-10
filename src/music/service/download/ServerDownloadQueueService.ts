/** ServerDownloadQueueService 模块：按职责组织，原业务行为保持不变。 @author yahyaoo */
import storageFs from '../../../application/persistence/documentFileSystem'
import fs from 'node:fs'
import path from 'node:path'
import * as fileCache from '../cache/FileCacheService'
import * as serverDownloads from './ServerDownloadService'

/**
 * ServerDownloadStatus 契约，按当前模块职责组织，保留原字段和扩展能力。
 * @author yahyaoo
 */
export type ServerDownloadStatus = 'waiting' | 'downloading' | 'tagging' | 'paused' | 'finished' | 'exists' | 'error'

/**
 * ServerDownloadTask 契约，按当前模块职责组织，保留原字段和扩展能力。
 * @author yahyaoo
 */
export interface ServerDownloadTask {
  /**
   * id 字段，沿用原业务结构与空值约定。
   */
  id: string
  /**
   * username 字段，沿用原业务结构与空值约定。
   */
  username: string
  /**
   * songKey 字段，沿用原业务结构与空值约定。
   */
  songKey: string
  /**
   * activeSongKey 字段，沿用原业务结构与空值约定。
   */
  activeSongKey?: string
  /**
   * songInfo 字段，沿用原业务结构与空值约定。
   */
  songInfo: any
  /**
   * quality 字段，沿用原业务结构与空值约定。
   */
  quality: string
  /**
   * requestedQuality 字段，沿用原业务结构与空值约定。
   */
  requestedQuality: string
  /**
   * status 字段，沿用原业务结构与空值约定。
   */
  status: ServerDownloadStatus
  /**
   * progress 字段，沿用原业务结构与空值约定。
   */
  progress: number
  /**
   * total 字段，沿用原业务结构与空值约定。
   */
  total: number
  /**
   * received 字段，沿用原业务结构与空值约定。
   */
  received: number
  /**
   * speed 字段，沿用原业务结构与空值约定。
   */
  speed: number
  /**
   * errorMsg 字段，沿用原业务结构与空值约定。
   */
  errorMsg: string
  /**
   * enableOnlyDownloadMode 字段，沿用原业务结构与空值约定。
   */
  enableOnlyDownloadMode: boolean
  /**
   * cacheLyric 字段，沿用原业务结构与空值约定。
   */
  cacheLyric: boolean
  /**
   * embedLyric 字段，沿用原业务结构与空值约定。
   */
  embedLyric: boolean
  /**
   * serverDownload 字段，沿用原业务结构与空值约定。
   */
  serverDownload?: boolean
  /**
   * lyricMode 字段，沿用原业务结构与空值约定。
   */
  lyricMode?: serverDownloads.LyricMode
  /**
   * identitySong 字段，沿用原业务结构与空值约定。
   */
  identitySong?: any
  /**
   * createdAt 字段，沿用原业务结构与空值约定。
   */
  createdAt: number
  /**
   * updatedAt 字段，沿用原业务结构与空值约定。
   */
  updatedAt: number
}

/**
 * QueueInput 契约，按当前模块职责组织，保留原字段和扩展能力。
 * @author yahyaoo
 */
interface QueueInput {
  /**
   * id 字段，沿用原业务结构与空值约定。
   */
  id?: string
  /**
   * songInfo 字段，沿用原业务结构与空值约定。
   */
  songInfo: any
  /**
   * quality 字段，沿用原业务结构与空值约定。
   */
  quality?: string
  /**
   * enableOnlyDownloadMode 字段，沿用原业务结构与空值约定。
   */
  enableOnlyDownloadMode?: boolean
  /**
   * cacheLyric 字段，沿用原业务结构与空值约定。
   */
  cacheLyric?: boolean
  /**
   * embedLyric 字段，沿用原业务结构与空值约定。
   */
  embedLyric?: boolean
  /**
   * serverDownload 字段，沿用原业务结构与空值约定。
   */
  serverDownload?: boolean
  /**
   * lyricMode 字段，沿用原业务结构与空值约定。
   */
  lyricMode?: serverDownloads.LyricMode
}

/**
 * ResolveResult 契约，按当前模块职责组织，保留原字段和扩展能力。
 * @author yahyaoo
 */
interface ResolveResult {
  /**
   * url 字段，沿用原业务结构与空值约定。
   */
  url: string
  /**
   * quality 字段，沿用原业务结构与空值约定。
   */
  quality?: string
  /**
   * songInfo 字段，沿用原业务结构与空值约定。
   */
  songInfo?: any
  /**
   * requestedSource 字段，沿用原业务结构与空值约定。
   */
  requestedSource?: string
  /**
   * downloadSource 字段，沿用原业务结构与空值约定。
   */
  downloadSource?: string
  /**
   * sourceName 字段，沿用原业务结构与空值约定。
   */
  sourceName?: string
}

/**
 * DownloadResolver 契约，按当前模块职责组织，保留原字段和扩展能力。
 * @author yahyaoo
 */
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
 * 获取 getConcurrency 对应的业务能力，参数和执行顺序保持原实现。
 * @param username 已解析的用户名称。
 * @returns 原处理结果；异步操作沿用原完成与错误传播约定。
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
 * 设置 setConcurrency 对应的业务能力，参数和执行顺序保持原实现。
 * @param username 已解析的用户名称。
 * @param value 原字段值。
 * @returns 原处理结果；异步操作沿用原完成与错误传播约定。
 * @author yahyaoo
 */
export const setConcurrency = (username: string, value: unknown) => {
  const concurrency = normalizeConcurrency(value)
  concurrencyByUser.set(username, concurrency)
  saveNow()
  void processQueue()
  return concurrency
}

/**
 * 处理 initialize 对应的业务能力，参数和执行顺序保持原实现。
 * @param downloadResolver downloadResolver 原业务参数。
 * @returns 原处理结果；异步操作沿用原完成与错误传播约定。
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
 * 处理 enqueue 对应的业务能力，参数和执行顺序保持原实现。
 * @param username 已解析的用户名称。
 * @param inputs inputs 原业务参数。
 * @returns 原处理结果；异步操作沿用原完成与错误传播约定。
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
  return added.map(task => getPublicTask(task))
}

/**
 * 列举 list 对应的业务能力，参数和执行顺序保持原实现。
 * @param username 已解析的用户名称。
 * @returns 原处理结果；异步操作沿用原完成与错误传播约定。
 * @author yahyaoo
 */
export const list = (username: string) => Array.from(tasks.values())
  .filter(task => task.username === username)
  .sort((a, b) => a.createdAt - b.createdAt)
  .map(task => getPublicTask(task))

/**
 * 处理 pause 对应的业务能力，参数和执行顺序保持原实现。
 * @param username 已解析的用户名称。
 * @param id 原业务标识。
 * @returns 原处理结果；异步操作沿用原完成与错误传播约定。
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
}

/**
 * 处理 resume 对应的业务能力，参数和执行顺序保持原实现。
 * @param username 已解析的用户名称。
 * @param id 原业务标识。
 * @returns 原处理结果；异步操作沿用原完成与错误传播约定。
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
  void processQueue()
}

/**
 * 移除 remove 对应的业务能力，参数和执行顺序保持原实现。
 * @param username 已解析的用户名称。
 * @param options 可选操作参数，沿用原默认值。
 * @returns 原处理结果；异步操作沿用原完成与错误传播约定。
 * @author yahyaoo
 */
export const remove = (username: string, options: { /**
 * id 字段，沿用原业务结构与空值约定。
 */
id?: string; /**
 * all 字段，沿用原业务结构与空值约定。
 */
all?: boolean; /**
 * completed 字段，沿用原业务结构与空值约定。
 */
completed?: boolean }) => {
  for (const [key, task] of tasks) {
    if (task.username !== username) continue
    const shouldRemove = options.all || (options.id && task.id === options.id) || (options.completed && ['finished', 'exists'].includes(task.status))
    if (!shouldRemove) continue
    controllers.get(key)?.abort()
    tasks.delete(key)
  }
  saveNow()
  void processQueue()
}
