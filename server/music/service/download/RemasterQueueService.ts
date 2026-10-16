/** 歌曲洗版队列：按目标音质解析并替换本地文件，跟踪逐首结果与取消状态。 @author yahyaoo */
import crypto from 'node:crypto'
import { serverEvents } from '../../../application/events/ServerEvents'
import * as fileCache from '../cache/FileCacheService'
import * as customMusicManager from '../library/CustomMusicService'

const MAX_REMASTER_ATTEMPTS = 3
const QUALITY_ORDER = ['128k', '192k', '320k', 'flac', 'flac24bit', 'hires', 'atmos', 'atmos_plus', 'master'] as const
const QUALITY_SET = new Set<string>(QUALITY_ORDER)

/** 洗版任务整体状态，包括等待、执行、完成和取消。 @author yahyaoo */
type RemasterStatus = 'running' | 'completed' | 'cancelled' | 'error'
/** 单首歌曲洗版结果状态。 @author yahyaoo */
type RemasterResultStatus = 'replaced' | 'downgraded' | 'skipped' | 'failed'

/** 可洗版的本地歌曲，包含文件定位和原音质。 @author yahyaoo */
type RemasterableItem = (fileCache.CacheItem | customMusicManager.CustomCacheItem) & { /** 歌曲分类目录。 */
folder: string }

/** 歌曲解析器返回的可下载地址、音质与歌曲元信息。 @author yahyaoo */
interface ResolveResult {
  /** 请求或资源地址。 */
  url: string
  /** 音质标识。 */
  quality: string
}

/** 按目标音质解析洗版歌曲的异步函数。 @author yahyaoo */
type RemasterResolver = (songInfo: any, requestedQuality: string, username: string) => Promise<ResolveResult>

/** 单首洗版处理结果，记录替换、降级、跳过及错误。 @author yahyaoo */
interface RemasterResult {
  /** 索引位置或索引记录。 */
  index: number
  /** 关联音频或业务文件名。 */
  filename: string
  /** 记录显示名称。 */
  name: string
  /** 歌手名称。 */
  singer: string
  /** 原本地音频音质。 */
  originalQuality: string
  /** 期望替换后的音质。 */
  targetQuality: string
  /** 最终解析或下载的音质。 */
  actualQuality?: string
  /** 当前处理或任务状态。 */
  status: RemasterResultStatus
  /** 处理结果或错误说明。 */
  message: string
}

/** 用户洗版任务，包含取消信号、进度和逐首处理结果。 @author yahyaoo */
interface RemasterTask {
  /** 业务记录标识。 */
  id: string
  /** 数据所属用户名。 */
  username: string
  /** 期望替换后的音质。 */
  targetQuality: string
  /** 是否使用用户自定义音乐目录。 */
  isCustomDir: boolean
  /** 当前处理或任务状态。 */
  status: RemasterStatus
  /** 待处理记录总数。 */
  total: number
  /** 已处理记录数量。 */
  processed: number
  /** 已经完成替换的歌曲数量。 */
  replaced: number
  /** 使用较低音质完成替换的歌曲数量。 */
  downgraded: number
  /** 已跳过的歌曲数量。 */
  skipped: number
  /** 失败数量或失败状态。 */
  failed: number
  /** 逐项处理结果。 */
  results: RemasterResult[]
  /** 任务失败说明。 */
  errorMsg: string
  /** 记录创建时间，单位毫秒。 */
  createdAt: number
  /** 记录最近更新时间，单位毫秒。 */
  updatedAt: number
  /** 用于取消当前异步任务的控制器。 */
  controller: AbortController
}

const tasks = new Map<string, RemasterTask>()
let resolver: RemasterResolver | null = null

/**
 * 注入歌曲链接解析器，恢复队列或注册下载所需依赖。
 * @param downloadResolver 由应用注入的歌曲下载链接解析函数。
 * @author yahyaoo
 */
export const initialize = (downloadResolver: RemasterResolver) => {
  resolver = downloadResolver
}

const qualityRank = (quality: string) => QUALITY_ORDER.indexOf(quality as typeof QUALITY_ORDER[number])

const buildSongInfo = (item: RemasterableItem) => {
  if (!item.source || item.source === 'unknown' || item.source === 'local') return null
  const prefix = `${item.source}_`
  const indexedId = String(item.songmid || item.id || '')
  const rawId = indexedId.startsWith(prefix) ? indexedId.slice(prefix.length) : indexedId
  if (!rawId) return null
  return {
    id: rawId,
    songmid: rawId,
    name: item.name,
    singer: item.singer,
    source: item.source,
    albumName: item.album,
    albumId: item.albumId,
    img: item.img,
    interval: item.interval,
  }
}

const addResult = (task: RemasterTask, result: Omit<RemasterResult, 'index'>) => {
  task.results.push({ index: task.results.length, ...result })
  task.processed++
  if (result.status === 'replaced') task.replaced++
  if (result.status === 'downgraded') {
    task.replaced++
    task.downgraded++
  }
  if (result.status === 'skipped') task.skipped++
  if (result.status === 'failed') task.failed++
  task.updatedAt = Date.now()
  serverEvents.emitEvent('task:changed', { username: task.username, topic: 'remaster', reason: 'progress' })
}

const isRetryableError = (err: any) => {
  const message = String(err?.message || '')
  return ![
    'Aborted',
    '原文件已发生变化或已不存在',
    '原文件已不存在',
    '实际音质与原音质相同，无需替换',
    'Invalid music file path',
    '新文件（',
  ].some(value => message.includes(value))
}

const waitForRetry = (attempt: number, signal: AbortSignal) => new Promise<void>((resolve, reject) => {
  const onAbort = () => {
    clearTimeout(timer)
    reject(new Error('Aborted'))
  }
  const timer = setTimeout(() => {
    signal.removeEventListener('abort', onAbort)
    resolve()
  }, attempt * 500)
  signal.addEventListener('abort', onAbort, { once: true })
})

const runTask = async (task: RemasterTask, items: RemasterableItem[], allItems: RemasterableItem[]) => {
  if (!resolver) throw new Error('洗版解析器尚未初始化')
  const availableQualities = new Set(allItems.map(item => `${item.id}\0${item.quality}`))

  itemLoop: for (const item of items) {
    if (task.controller.signal.aborted) break
    const baseResult = {
      filename: item.filename,
      name: item.name,
      singer: item.singer,
      originalQuality: item.quality || 'unknown',
      targetQuality: task.targetQuality,
    }
    const songInfo = buildSongInfo(item)
    if (!songInfo) {
      addResult(task, {
        ...baseResult,
        status: 'skipped',
        message: '缺少可用的歌曲来源或歌曲 ID，请先在本地音乐中关联歌曲',
      })
      continue
    }

    const currentRank = qualityRank(item.quality)
    const targetRank = qualityRank(task.targetQuality)
    if (currentRank === targetRank) {
      addResult(task, { ...baseResult, actualQuality: item.quality, status: 'skipped', message: '当前已经是目标音质' })
      continue
    }
    if (availableQualities.has(`${item.id}\0${task.targetQuality}`)) {
      addResult(task, {
        ...baseResult,
        actualQuality: task.targetQuality,
        status: 'skipped',
        message: '同一歌曲的目标音质文件已存在，已跳过以避免覆盖',
      })
      continue
    }

    let lastError: any = null
    let lastActualQuality = ''
    let attemptsMade = 0
    for (let attempt = 1; attempt <= MAX_REMASTER_ATTEMPTS; attempt++) {
      attemptsMade = attempt
      try {
        const resolved = await resolver(songInfo, task.targetQuality, task.username)
        if (task.controller.signal.aborted) break itemLoop
        const actualQuality = resolved.quality || task.targetQuality
        lastActualQuality = actualQuality
        const actualRank = qualityRank(actualQuality)
        if (actualRank < 0) throw new Error(`无法识别解析到的音质: ${actualQuality}`)

        if (currentRank >= 0 && targetRank > currentRank && actualRank <= currentRank) {
          addResult(task, {
            ...baseResult,
            actualQuality,
            status: 'skipped',
            message: '目标音质不可用，且未获得高于当前文件的音质',
          })
          continue itemLoop
        }
        if (currentRank >= 0 && targetRank < currentRank && actualRank >= currentRank) {
          addResult(task, {
            ...baseResult,
            actualQuality,
            status: 'skipped',
            message: '未获得低于当前文件的目标音质',
          })
          continue itemLoop
        }
        if (availableQualities.has(`${item.id}\0${actualQuality}`)) {
          addResult(task, {
            ...baseResult,
            actualQuality,
            status: 'skipped',
            message: '同一歌曲的实际可用音质文件已存在，已跳过以避免覆盖',
          })
          continue itemLoop
        }

        if (task.isCustomDir) {
          await customMusicManager.replaceCustomMusicItem(
            task.username,
            item as customMusicManager.CustomCacheItem,
            songInfo,
            resolved.url,
            actualQuality,
            task.controller.signal,
          )
        } else {
          await fileCache.replaceDownloadedMusicItem(
            task.username,
            item as fileCache.CacheItem,
            songInfo,
            resolved.url,
            actualQuality,
            task.controller.signal,
          )
        }
        availableQualities.delete(`${item.id}\0${item.quality}`)
        availableQualities.add(`${item.id}\0${actualQuality}`)
        const didFallback = actualQuality !== task.targetQuality
        addResult(task, {
          ...baseResult,
          actualQuality,
          status: didFallback ? 'downgraded' : 'replaced',
          message: didFallback ? '目标音质不可用，已使用可获得的较低音质' : '替换成功',
        })
        continue itemLoop
      } catch (err: any) {
        if (task.controller.signal.aborted || err?.message === 'Aborted') break itemLoop
        lastError = err
        if (attempt < MAX_REMASTER_ATTEMPTS && isRetryableError(err)) {
          await waitForRetry(attempt, task.controller.signal)
          continue
        }
        break
      }
    }

    addResult(task, {
      ...baseResult,
      ...(lastActualQuality ? { actualQuality: lastActualQuality } : {}),
      status: 'failed',
      message: attemptsMade > 1
        ? `尝试 ${attemptsMade} 次后失败：${lastError?.message || '洗版失败，原文件已保留'}`
        : (lastError?.message || '洗版失败，原文件已保留'),
    })
  }

  task.status = task.controller.signal.aborted ? 'cancelled' : 'completed'
  task.updatedAt = Date.now()
  serverEvents.emitEvent('task:changed', { username: task.username, topic: 'remaster', reason: 'state' })
}

/**
 * 创建歌曲洗版任务，按目标音质逐项解析和替换本地文件。
 * @param username 已解析的用户名称。
 * @param targetQuality 本地歌曲期望达到的音质。
 * @param filenames 待处理文件名集合。
 * @param explicitIsCustomDir 是否明确指定自定义音乐目录。
 * @author yahyaoo
 */
export const start = async (username: string, targetQuality: string, filenames: unknown, explicitIsCustomDir?: boolean) => {
  if (!resolver) throw new Error('洗版服务尚未就绪')
  if (!QUALITY_SET.has(targetQuality)) throw new Error('不支持该目标音质')
  const current = tasks.get(username)
  if (current?.status === 'running') throw new Error('已有洗版任务正在运行')

  if (!Array.isArray(filenames)) throw new Error('请选择需要洗版的歌曲')
  const selectedFilenames = [...new Set(filenames.filter((filename): filename is string => (
    typeof filename === 'string' && filename.length > 0 && filename.length <= 4096
  )))]
  if (selectedFilenames.length === 0) throw new Error('请至少选择一首歌曲')
  if (selectedFilenames.length > 10000) throw new Error('单次洗版最多选择 10000 首歌曲')

  const selectedSet = new Set(selectedFilenames)

  // 1. 优先根据 explicitIsCustomDir 或从自定义音乐目录中匹配文件
  let isCustomDir = false
  let allItems: RemasterableItem[] = []
  const customDir = customMusicManager.getCustomMusicDir(username)

  if (explicitIsCustomDir === true) {
    if (!customDir) throw new Error('用户未开启或未配置自定义音乐目录')
    isCustomDir = true
    allItems = await customMusicManager.getCustomMusicList(username)
  } else if (explicitIsCustomDir === false) {
    allItems = await fileCache.getDownloadedMusicItems(username)
  } else {
    if (customDir) {
      const customList = await customMusicManager.getCustomMusicList(username)
      const customItems = customList.filter(item => selectedSet.has(item.filename))
      if (customItems.length === selectedSet.size) {
        isCustomDir = true
        allItems = customList
      }
    }
  }

  // 2. 如果不是自定义目录，且尚未获取 items，则走常规音乐下载目录
  if (!isCustomDir && allItems.length === 0) {
    allItems = await fileCache.getDownloadedMusicItems(username)
  }

  const items = allItems.filter(item => selectedSet.has(item.filename))
  const matchedFilenames = new Set(items.map(item => item.filename))
  if (matchedFilenames.size !== selectedSet.size) {
    throw new Error('部分所选歌曲已不存在，请刷新本地音乐后重新选择')
  }

  const now = Date.now()
  const task: RemasterTask = {
    id: crypto.randomUUID(),
    username,
    targetQuality,
    isCustomDir,
    status: 'running',
    total: items.length,
    processed: 0,
    replaced: 0,
    downgraded: 0,
    skipped: 0,
    failed: 0,
    results: [],
    errorMsg: '',
    createdAt: now,
    updatedAt: now,
    controller: new AbortController(),
  }
  tasks.set(username, task)
  serverEvents.emitEvent('task:changed', { username, topic: 'remaster', reason: 'state' })
  void runTask(task, items, allItems).catch((err: any) => {
    task.status = task.controller.signal.aborted ? 'cancelled' : 'error'
    task.errorMsg = err?.message || '洗版任务异常终止'
    task.updatedAt = Date.now()
    serverEvents.emitEvent('task:changed', { username, topic: 'remaster', reason: 'state' })
  })
  return getStatus(username, 0, 0)
}

/**
 * 取消用户洗版任务，并向正在执行的下载发送中止信号。
 * @param username 已解析的用户名称。
 * @author yahyaoo
 */
export const cancel = (username: string) => {
  const task = tasks.get(username)
  if (!task || task.status !== 'running') return false
  task.controller.abort()
  task.updatedAt = Date.now()
  serverEvents.emitEvent('task:changed', { username, topic: 'remaster', reason: 'state' })
  return true
}

/**
 * 查询服务器资源用量、用户和同步连接状态。
 * @param context 请求上下文，包括请求头、查询参数和 HTTP 响应对象。
 * @param runtime 当前服务的应用依赖。
 * @returns 请求分派完成的 Promise；响应内容由服务写入 context.res。
 * @author yahyaoo
 */
export const getStatus = (username: string, offset = 0, limit = 200) => {
  const task = tasks.get(username)
  if (!task) return {
    status: 'idle',
    total: 0,
    processed: 0,
    replaced: 0,
    downgraded: 0,
    skipped: 0,
    failed: 0,
    results: [],
    nextOffset: 0,
  }
  const safeOffset = Math.max(0, Math.floor(offset))
  const safeLimit = Math.min(200, Math.max(0, Math.floor(limit)))
  const results = safeLimit > 0 ? task.results.slice(safeOffset, safeOffset + safeLimit) : []
  return {
    id: task.id,
    targetQuality: task.targetQuality,
    status: task.status,
    total: task.total,
    processed: task.processed,
    replaced: task.replaced,
    downgraded: task.downgraded,
    skipped: task.skipped,
    failed: task.failed,
    errorMsg: task.errorMsg,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    results,
    nextOffset: safeOffset + results.length,
  }
}
