/** RemasterQueueService 模块：按职责组织，原业务行为保持不变。 @author yahyaoo */
import crypto from 'node:crypto'
import * as fileCache from '../cache/FileCacheService'
import * as customMusicManager from '../library/CustomMusicService'

const MAX_REMASTER_ATTEMPTS = 3
const QUALITY_ORDER = ['128k', '192k', '320k', 'flac', 'flac24bit', 'hires', 'atmos', 'atmos_plus', 'master'] as const
const QUALITY_SET = new Set<string>(QUALITY_ORDER)

/**
 * RemasterStatus 契约，按当前模块职责组织，保留原字段和扩展能力。
 * @author yahyaoo
 */
type RemasterStatus = 'running' | 'completed' | 'cancelled' | 'error'
/**
 * RemasterResultStatus 契约，按当前模块职责组织，保留原字段和扩展能力。
 * @author yahyaoo
 */
type RemasterResultStatus = 'replaced' | 'downgraded' | 'skipped' | 'failed'

/**
 * RemasterableItem 契约，按当前模块职责组织，保留原字段和扩展能力。
 * @author yahyaoo
 */
type RemasterableItem = (fileCache.CacheItem | customMusicManager.CustomCacheItem) & { /**
 * folder 字段，沿用原业务结构与空值约定。
 */
folder: string }

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
  quality: string
}

/**
 * RemasterResolver 契约，按当前模块职责组织，保留原字段和扩展能力。
 * @author yahyaoo
 */
type RemasterResolver = (songInfo: any, requestedQuality: string, username: string) => Promise<ResolveResult>

/**
 * RemasterResult 契约，按当前模块职责组织，保留原字段和扩展能力。
 * @author yahyaoo
 */
interface RemasterResult {
  /**
   * index 字段，沿用原业务结构与空值约定。
   */
  index: number
  /**
   * filename 字段，沿用原业务结构与空值约定。
   */
  filename: string
  /**
   * name 字段，沿用原业务结构与空值约定。
   */
  name: string
  /**
   * singer 字段，沿用原业务结构与空值约定。
   */
  singer: string
  /**
   * originalQuality 字段，沿用原业务结构与空值约定。
   */
  originalQuality: string
  /**
   * targetQuality 字段，沿用原业务结构与空值约定。
   */
  targetQuality: string
  /**
   * actualQuality 字段，沿用原业务结构与空值约定。
   */
  actualQuality?: string
  /**
   * status 字段，沿用原业务结构与空值约定。
   */
  status: RemasterResultStatus
  /**
   * message 字段，沿用原业务结构与空值约定。
   */
  message: string
}

/**
 * RemasterTask 契约，按当前模块职责组织，保留原字段和扩展能力。
 * @author yahyaoo
 */
interface RemasterTask {
  /**
   * id 字段，沿用原业务结构与空值约定。
   */
  id: string
  /**
   * username 字段，沿用原业务结构与空值约定。
   */
  username: string
  /**
   * targetQuality 字段，沿用原业务结构与空值约定。
   */
  targetQuality: string
  /**
   * isCustomDir 字段，沿用原业务结构与空值约定。
   */
  isCustomDir: boolean
  /**
   * status 字段，沿用原业务结构与空值约定。
   */
  status: RemasterStatus
  /**
   * total 字段，沿用原业务结构与空值约定。
   */
  total: number
  /**
   * processed 字段，沿用原业务结构与空值约定。
   */
  processed: number
  /**
   * replaced 字段，沿用原业务结构与空值约定。
   */
  replaced: number
  /**
   * downgraded 字段，沿用原业务结构与空值约定。
   */
  downgraded: number
  /**
   * skipped 字段，沿用原业务结构与空值约定。
   */
  skipped: number
  /**
   * failed 字段，沿用原业务结构与空值约定。
   */
  failed: number
  /**
   * results 字段，沿用原业务结构与空值约定。
   */
  results: RemasterResult[]
  /**
   * errorMsg 字段，沿用原业务结构与空值约定。
   */
  errorMsg: string
  /**
   * createdAt 字段，沿用原业务结构与空值约定。
   */
  createdAt: number
  /**
   * updatedAt 字段，沿用原业务结构与空值约定。
   */
  updatedAt: number
  /**
   * controller 字段，沿用原业务结构与空值约定。
   */
  controller: AbortController
}

const tasks = new Map<string, RemasterTask>()
let resolver: RemasterResolver | null = null

/**
 * 处理 initialize 对应的业务能力，参数和执行顺序保持原实现。
 * @param downloadResolver downloadResolver 原业务参数。
 * @returns 原处理结果；异步操作沿用原完成与错误传播约定。
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
}

/**
 * 启动 start 对应的业务能力，参数和执行顺序保持原实现。
 * @param username 已解析的用户名称。
 * @param targetQuality targetQuality 原业务参数。
 * @param filenames filenames 原业务参数。
 * @param explicitIsCustomDir explicitIsCustomDir 原业务参数。
 * @returns 原处理结果；异步操作沿用原完成与错误传播约定。
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
  void runTask(task, items, allItems).catch((err: any) => {
    task.status = task.controller.signal.aborted ? 'cancelled' : 'error'
    task.errorMsg = err?.message || '洗版任务异常终止'
    task.updatedAt = Date.now()
  })
  return getStatus(username, 0, 0)
}

/**
 * 取消 cancel 对应的业务能力，参数和执行顺序保持原实现。
 * @param username 已解析的用户名称。
 * @returns 原处理结果；异步操作沿用原完成与错误传播约定。
 * @author yahyaoo
 */
export const cancel = (username: string) => {
  const task = tasks.get(username)
  if (!task || task.status !== 'running') return false
  task.controller.abort()
  task.updatedAt = Date.now()
  return true
}

/**
 * 获取 getStatus 对应的业务能力，参数和执行顺序保持原实现。
 * @param username 已解析的用户名称。
 * @param offset offset 原业务参数。
 * @param limit limit 原业务参数。
 * @returns 原处理结果；异步操作沿用原完成与错误传播约定。
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
