import { readMusicMetadata } from './MusicMetadataWorker'
import { Worker } from 'node:worker_threads'
import { musicScanWorker } from './MusicScanWorker'
import { ScanStateStore } from './ScanStateStore'
import { pageItems, type PageQuery } from './PagedListService'
import { serverEvents, type ScanReason } from '../../../application/events/ServerEvents'
import { getMusicDirectories, resolveMusicFile } from '../../../application/library/MusicDirectoryService'
/** 用户自定义音乐目录服务：扫描音频、索引元信息、播放、关联与文件维护。 @author yahyaoo */
import storageFs from '../../../application/persistence/documentFileSystem'
import fs from 'fs'
import path from 'path'
import http from 'http'
import https from 'https'
import crypto from 'crypto'
const { MusicTagger, MetaPicture } = require('music-tag-native')
import { getUserConfig } from '../../../user'
import { formatPlayTime } from '../../../utils/common'
import { buildLyrics } from '../../../utils/lrcTool'
import { getLyricFetcher, embedLyricsIntoFile, getAudioMetadataUnsupportedStatus } from '../cache/FileCacheService'
import * as fileCache from '../cache/FileCacheService'

/** 自定义音乐目录的音频索引记录及元信息。 @author yahyaoo */
export interface CustomCacheItem {
    /** 业务记录标识。 */
    id: string
    /** 音乐平台歌曲标识。 */
    songmid?: string
    /** 记录显示名称。 */
    name: string
    /** 歌手名称。 */
    singer: string
    /** 歌曲专辑信息。 */
    album: string
    /** 平台专辑标识。 */
    albumId?: string

    img?: string
    /** 增量同步间隔，单位分钟。 */
    interval?: string
    /** 歌曲或详情所属的音乐平台。 */
    source: string
    /** 音质标识。 */
    quality: string
    /** 关联音频或业务文件名。 */
    filename: string

    subPath?: string
    /** 缓存或下载目录类别。 */
    folder: 'custom'

    mtime: number
    /** 文件字节数或记录数量。 */
    size: number

    lyricFilename?: string
    /** 文件扩展名。 */
    ext: string
    /** 是否已获取封面。 */
    hasCover?: boolean

    coverType?: 'embedded' | 'cached' | 'remote' | 'none'
    /** 是否存在歌词。 */
    hasLyric?: boolean
    /** 是否已将歌词内嵌到音频。 */
    hasEmbedLyric?: boolean
    directoryId?: string
    coverVersion?: string
    lyricVersion?: string
    /** 音频码率。 */
    bitrate?: number
    /** 音频采样率。 */
    sampleRate?: number
    /** 音频采样位深。 */
    bitDepth?: number
}

// 获取用户配置的自定义音乐目录
/**
 * 读取用户独立歌曲目录配置，未启用时返回无可用目录。
 * @param username 已解析的用户名称。
 * @author yahyaoo
 */
export const getCustomMusicDir = (username: string): string | null => getMusicDirectories(username)[0]?.path || null

const detectAudioContainer = (filePath: string) => {
    try {
        const fd = storageFs.openSync(filePath, 'r')
        const buffer = Buffer.alloc(16)
        const bytesRead = storageFs.readSync(fd, buffer, 0, buffer.length, 0)
        storageFs.closeSync(fd)
        const head = buffer.subarray(0, bytesRead)
        if (head.subarray(0, 3).toString('ascii') === 'ID3' || (head.length >= 2 && head[0] === 0xff && (head[1] & 0xe0) === 0xe0)) return 'mp3'
        if (head.subarray(0, 4).toString('ascii') === 'fLaC') return 'flac'
        if (head.subarray(0, 4).toString('ascii') === 'OggS') return 'ogg'
        if (head.subarray(0, 4).toString('ascii') === 'RIFF' && head.subarray(8, 12).toString('ascii') === 'WAVE') return 'wav'
        if (head.length >= 12 && head.subarray(4, 8).toString('ascii') === 'ftyp') return 'mp4'
        if (head.subarray(0, 4).toString('ascii') === 'MAC ') return 'ape'
        return 'unknown'
    } catch (e) {
        return 'unknown'
    }
}

const detectImageMime = (data: Buffer | Uint8Array) => {
    const buffer = Buffer.from(data)
    if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg'
    if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png'
    if (buffer.length >= 6 && ['GIF87a', 'GIF89a'].includes(buffer.subarray(0, 6).toString('ascii'))) return 'image/gif'
    if (buffer.length >= 12 && buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp'
    if (buffer.length >= 2 && buffer.subarray(0, 2).toString('ascii') === 'BM') return 'image/bmp'
    return null
}

/** 按用户管理自定义歌曲目录索引并保存到 SQL 文档。 @author yahyaoo */
class CustomIndexManager {
    /** 按用户和存储位置分组的内存索引。 */
    private indexes: Map<string, Map<string, CustomCacheItem>> = new Map() // username -> (compositeKey -> CustomCacheItem)
    private saved = new Map<string, string>()
    private saveTimers = new Map<string, NodeJS.Timeout>()
    private revisions = new Map<string, number>()
    private epoch = crypto.randomUUID()
    version(username: string) { return `${this.epoch}:${username}:${this.revisions.get(username) || 0}` }

    /**
 * 计算自定义歌曲目录对应的用户 SQL 索引文档路径。
 * @param username 已解析的用户名称。
 * @author yahyaoo
 */
    private getIndexFilePath(username: string): string | null {
        const customDir = getCustomMusicDir(username)
        if (!customDir) return null
        return path.join(global.lx.dataPath, 'library', crypto.createHash('sha256').update(username).digest('hex'), 'custom_index.json')
    }

    /**
 * 读取并缓存用户自定义歌曲索引，缺失文档时初始化空索引。
 * @param username 已解析的用户名称。
 * @author yahyaoo
 */
    load(username: string): Map<string, CustomCacheItem> {
        const cached = this.indexes.get(username)
        if (cached) return cached
        let file = this.getIndexFilePath(username)
        const directory = getMusicDirectories(username)[0]
        if (file && !storageFs.existsSync(file) && directory) {
            const legacy = path.join(directory.path, 'custom_index.json')
            if (storageFs.existsSync(legacy)) {
                const old = JSON.parse(storageFs.readFileSync(legacy, 'utf8'))
                const migrated = Object.fromEntries(Object.values(old).map((item: any) => {
                    const filename = '@' + directory.id + '/' + item.filename
                    return [filename, { ...item, filename, directoryId: directory.id }]
                }))
                storageFs.writeFileSync(file, JSON.stringify(migrated), 'utf8')
            }
        }
        if (!file || !storageFs.existsSync(file)) {
            const empty = new Map<string, CustomCacheItem>()
            this.indexes.set(username, empty)
            return empty
        }
        try {
            const data = JSON.parse(storageFs.readFileSync(file, 'utf-8'))
            this.saved.set(username, JSON.stringify(data, null, 2))
            const map = new Map<string, CustomCacheItem>(Object.entries(data))
            this.indexes.set(username, map)
            return map
        } catch (e) {
            const empty = new Map<string, CustomCacheItem>()
            this.indexes.set(username, empty)
            return empty
        }
    }

    /**
 * 将用户自定义歌曲索引保存到 SQLite 文档。
 * @param username 已解析的用户名称。
 * @author yahyaoo
 */
    save(username: string) {
        const timer = this.saveTimers.get(username)
        if (timer) { clearTimeout(timer); this.saveTimers.delete(username) }
        const file = this.getIndexFilePath(username)
        const index = this.indexes.get(username)
        if (!file || !index) return
        try {
            const obj = Object.fromEntries(index)
            const text = JSON.stringify(obj, null, 2)
            if (this.saved.get(username) === text) return
            // The existing SQLite document adapter is a single atomic commit, not competing file snapshots.
            storageFs.writeFileSync(file, text, 'utf-8')
            this.saved.set(username, text)
            this.revisions.set(username, (this.revisions.get(username) || 0) + 1)
        } catch (e) {
            throw e
        }
    }

    /** Merge into the latest in-memory entry; a scan must never overwrite a stale media snapshot. */
    merge(username: string, filename: string, patch: Partial<CustomCacheItem>, expected?: string) {
        const item = this.load(username).get(filename)
        if (!item || (expected && expected !== item.size + ':' + item.mtime)) return false
        this.set(username, filename, { ...item, ...patch })
        if (!this.saveTimers.has(username)) {
            const timer = setTimeout(() => { this.saveTimers.delete(username); try { this.save(username) } catch (error) { console.error('[音乐索引] 保存失败', error) } }, 2000)
            timer.unref(); this.saveTimers.set(username, timer)
        }
        return true
    }
    flush() { for (const username of [...this.saveTimers.keys()]) this.save(username) }

    /**
 * 返回用户自定义歌曲索引中的全部歌曲记录。
 * @param username 已解析的用户名称。
 * @author yahyaoo
 */
    getAll(username: string): CustomCacheItem[] {
        const index = this.indexes.get(username) || this.load(username)
        return Array.from(index.values())
    }

    /**
 * 向用户自定义歌曲索引写入或替换歌曲记录。
 * @param username 已解析的用户名称。
 * @param key 业务作用域或缓存键。
 * @param item 待处理索引记录。
 * @author yahyaoo
 */
    set(username: string, key: string, item: CustomCacheItem) {
        const index = this.indexes.get(username) || this.load(username)
        index.set(key, item)
        this.revisions.set(username, (this.revisions.get(username) || 0) + 1)
    }

    /**
 * 从用户自定义歌曲索引删除对应歌曲记录。
 * @param username 已解析的用户名称。
 * @param filenameOrKey 文件名或索引记录键。
 * @author yahyaoo
 */
    remove(username: string, filenameOrKey: string): boolean {
        const index = this.indexes.get(username) || this.load(username)
        let deleted = false
        for (const [k, item] of Array.from(index.entries())) {
            if (item.filename === filenameOrKey || k === filenameOrKey) {
                index.delete(k)
                deleted = true
            }
        }
        if (deleted) this.save(username)
        return deleted
    }
}

export const customIndexManager = new CustomIndexManager()

/** 异步读取目录中的旧索引，保留已有平台关联信息。 */
const buildLinkedInfoMap = async (rootDir: string, onlyFolders?: string[]): Promise<Map<string, any>> => {
    const map = new Map<string, any>()

    const scanDir = async (dir: string) => {
        // dir 相对于 rootDir 的前缀，用于路径重映射
        const prefix = path.relative(rootDir, dir).replace(/\\/g, '/')
        const addPrefix = (filename: string) =>
            prefix && prefix !== '.' ? `${prefix}/${filename}` : filename

        // 读取当前目录下的索引文件
        const indexFiles = ['music_index.json', 'cache_index.json', 'custom_index.json']
        for (const fname of indexFiles) {
            const fp = path.join(dir, fname)
            if (!storageFs.existsSync(fp)) continue
            try {
                const data: Record<string, any> = JSON.parse(await storageFs.promises.readFile(fp, 'utf-8'))
                for (const item of Object.values(data)) {
                    if (!item || !item.filename) continue
                    // 仅收录有真实来源（非 custom）或已手动关联（有 songmid 且 songmid !== id）的条目
                    const isLinked = item.source && item.source !== 'custom' && item.id
                    const isManualLinked = item.id && item.songmid && item.songmid !== item.id
                    if (!isLinked && !isManualLinked) continue
                    // 将条目的 filename 重映射为相对于 rootDir 的路径
                    const remappedFilename = addPrefix(item.filename)
                    // 深层（更靠近文件本身）的索引优先级更高，后扫描的子目录条目覆盖父目录条目
                    map.set(remappedFilename, { ...item, filename: remappedFilename })
                }
            } catch (e) {
                console.warn(`[自定义音乐] 读取 ${fname} 失败（${dir}）:`, e)
            }
        }

        if (onlyFolders) return
        // 递归处理子目录
        try {
            const entries = await storageFs.promises.readdir(dir, { withFileTypes: true })
            for (const entry of entries) {
                if (!entry.isDirectory()) continue
                if (entry.name.startsWith('.') || entry.name === 'node_modules') continue
                await scanDir(path.join(dir, entry.name))
            }
        } catch (e) { /* 无权限或不可读时跳过 */ }
    }

    if (onlyFolders) { for (const relative of new Set(['', ...onlyFolders])) await scanDir(path.join(rootDir, relative)) }
    else await scanDir(rootDir)
    return map
}

// 同步扫描并更新自定义目录索引
/**
 * 扫描用户自定义目录中的音频文件，补齐元信息并更新 SQL 索引。
 * @param username 已解析的用户名称。
 * @param strict 是否传播目录读取错误；文件状态查询启用，避免误报未下载。
 * @author yahyaoo
 */
export interface ScanStatus { status: 'idle' | 'running' | 'completed' | 'error'; completed: number; total: number; percent: number; startedAt?: number; finishedAt?: number; errors: any[] }
const scans = new Map<string, { state: ScanStatus; pending?: Promise<CustomCacheItem[]>; signature?: string }>()
let scanSerial: Promise<unknown> = Promise.resolve()
const scanStores = new Map<string, ScanStateStore>()
export const getScanStateStore = (username: string) => {
    let store = scanStores.get(username)
    if (!store) { store = new ScanStateStore(username); scanStores.set(username, store) }
    return store
}
export interface ScanOptions { mode?: 'quick' | 'full' | 'paths'; directoryIds?: string[]; paths?: Record<string, string[]>; reason?: ScanReason }
const emptyScan = (): ScanStatus => ({ status: 'idle', completed: 0, total: 0, percent: 0, errors: [] })

/** 查询后台扫描进度，客户端轮询不会启动新扫描。 */
export const getScanStatus = (username: string): ScanStatus => scans.get(username)?.state || emptyScan()

/** 合并重复扫描；标签解析由独立工作线程执行，完成后原子替换索引。 */
export const syncCustomIndex = (username: string, strict = false, force = true, options: ScanOptions = {}): Promise<CustomCacheItem[]> => {
    const directories = getMusicDirectories(username)
    const current = scans.get(username)
    if (current?.pending && !options.paths && (options.reason || 'manual') === 'manual') return current.pending
    // Keep independent dirty paths queued while another scan is running; quick never absorbs them.
    const entry: { state: ScanStatus; pending?: Promise<CustomCacheItem[]>; signature?: string } = { state: { ...emptyScan(), status: 'running', startedAt: Date.now() }, signature: JSON.stringify(directories) }
    scans.set(username, entry)
    const operation = async () => {
        if (options.reason && options.reason !== 'manual' && global.lx.config['library.scan.enabled'] === false) { Object.assign(entry.state, { status: 'idle', finishedAt: Date.now() }); return customIndexManager.getAll(username) }
        const selected = options.directoryIds ? directories.filter(directory => options.directoryIds!.includes(directory.id)) : directories
        const store = getScanStateStore(username)
        const requestedMode = options.mode || 'full'
        const mode = global.lx.config['library.scan.legacy'] === true || selected.some(directory => !Object.keys(store.get(directory.id, directory.path).folders).length) ? 'full' : requestedMode
        const reason = options.reason || 'manual'
        serverEvents.emitEvent('library:scan-started', { username, directoryIds: selected.map(directory => directory.id), reason, startedAt: entry.state.startedAt! })
        const cacheScan = mode === 'full' || reason === 'manual' ? fileCache.syncCacheIndex(username) : Promise.resolve()
        // 立刻安装失败处理，缓存扫描异常会在索引合并时一并呈现。
        let cacheError: any
        const cacheDone = cacheScan.catch(error => { cacheError = error })
        const beforeScan = new Map(customIndexManager.getAll(username).map(item => [item.filename, JSON.stringify(item)]))
        const prior = new Map<string, CustomCacheItem>()
        for (const directory of selected) for (const [relative, item] of mode === 'full' ? await buildLinkedInfoMap(directory.path) : new Map<string, any>()) {
            const filename = "@" + directory.id + "/" + relative
            prior.set(filename, { ...item, filename, directoryId: directory.id })
        }
        for (const item of customIndexManager.getAll(username)) if (selected.some(directory => directory.id === item.directoryId)) prior.set(item.filename, item)
        return new Promise<CustomCacheItem[]>((resolve, reject) => {
        const worker = new Worker(musicScanWorker, { eval: true, workerData: { directories: selected, previous: Array.from(prior.values()), compact: true, taggerModule: require.resolve('music-tag-native'), mode, paths: options.paths, folders: Object.fromEntries(selected.map(directory => [directory.id, store.get(directory.id, directory.path).folders])), ioPauseMs: global.lx.config['library.scan.ioPauseMs'] || 0 } })
        let done = false
        worker.on('message', async message => {
            if (message.type === 'progress') Object.assign(entry.state, { completed: message.completed, total: message.total, percent: message.total ? Math.min(99, Math.floor(message.completed / message.total * 100)) : 0 })
            if (message.type === 'done') {
                done = true
                await cacheDone
                if (cacheError) message.errors.push({ message: cacheError.message })
                try {
                // 配置变化时丢弃旧任务，避免旧目录索引再次发布。
                if (entry.signature !== JSON.stringify(getMusicDirectories(username))) { reject(Error('扫描期间目录配置变化，丢弃旧结果')); return }
                const index = customIndexManager.load(username)
                const scanned = new Map<string, CustomCacheItem>(Array.from(index.values()).filter(item => !selected.some(directory => directory.id === item.directoryId)).map(item => [item.filename, item]))
                for (const filename of message.unchanged || []) if (prior.has(filename)) scanned.set(filename, prior.get(filename)!)
                for (const item of message.items as CustomCacheItem[]) scanned.set(item.filename, item)
                if (mode !== 'full') for (const directory of selected) {
                    const added = (message.added || []).filter((filename: string) => filename.startsWith('@' + directory.id + '/'))
                    const linked = await buildLinkedInfoMap(directory.path, added.map((filename: string) => path.posix.dirname(filename.split('/').slice(1).join('/'))))
                    for (const filename of added) { const link = linked.get(filename.split('/').slice(1).join('/')); if (link) scanned.set(filename, { ...scanned.get(filename)!, ...link, filename, directoryId: directory.id }) }
                }
                for (const [filename, item] of index) if (beforeScan.get(filename) !== JSON.stringify(item)) {
                    const original = beforeScan.has(filename) ? JSON.parse(beforeScan.get(filename)!) : {}
                    const latest = scanned.get(filename)
                    const updates = Object.fromEntries(Object.entries(item).filter(([key, value]) => JSON.stringify(value) !== JSON.stringify(original[key])))
                    if (latest) scanned.set(filename, { ...latest, ...updates })
                    else if (!beforeScan.has(filename)) scanned.set(filename, item)
                }
                for (const filename of beforeScan.keys()) if (!index.has(filename)) scanned.delete(filename)
                message.items = Array.from(scanned.values())
                index.clear()
                for (const item of message.items) customIndexManager.set(username, item.filename, item)
                customIndexManager.save(username)
                const added = message.items.filter((item: CustomCacheItem) => !beforeScan.has(item.filename)).map((item: CustomCacheItem) => item.filename)
                const changed = message.items.filter((item: CustomCacheItem) => beforeScan.has(item.filename) && beforeScan.get(item.filename) !== JSON.stringify(item)).map((item: CustomCacheItem) => item.filename)
                const removed = [...beforeScan.keys()].filter(filename => !scanned.has(filename))
                for (const directory of selected) {
                    if (message.errors.length) continue // Incomplete scans never advance the correctness watermark.
                    const previous = store.get(directory.id, directory.path)
                    store.update(directory.id, { ...previous, folders: message.folders[directory.id], lastQuickScanAt: Date.now(), lastFullScanAt: mode === 'full' ? Date.now() : previous.lastFullScanAt })
                }
                // 手动和后台扫描都在完成前重建歌曲与文件的聚合子表。作者：yahyaoo
                const { aggregateLibrary } = require('./LibraryAggregationService')
                const { getLibraryItems } = require('../download/ServerDownloadService')
                if (added.length || changed.length || removed.length || mode === 'full') aggregateLibrary(username, [...await fileCache.getCacheList(username), ...message.items.map((item: any) => ({ ...item, folder: 'custom' })), ...getLibraryItems(username)])
                Object.assign(entry.state, { status: message.errors.length ? 'error' : 'completed', completed: message.items.length, percent: 100, errors: message.errors, finishedAt: Date.now() })
                if (strict && message.errors.length) reject(new Error(message.errors[0].message)); else resolve(message.items)
                serverEvents.emitEvent('library:scan-finished', { username, directoryIds: selected.map(directory => directory.id), reason, added, changed, removed, total: message.items.length, durationMs: Date.now() - entry.state.startedAt!, ...(message.errors.length ? { error: message.errors.map((error: any) => error.message).join('; '), errors: message.errors } : {}) })
                } catch (error) { reject(error) }
            }
        })
        worker.on('error', reject)
        worker.on('exit', code => { if (!done) reject(new Error('扫描线程退出：' + code)) })
        })
    }
    entry.pending = scanSerial.then(operation).catch(error => {
        Object.assign(entry.state, { status: 'error', finishedAt: Date.now(), errors: [{ message: error.message }] })
        serverEvents.emitEvent('library:scan-finished', { username, directoryIds: directories.map(directory => directory.id), reason: options.reason || 'manual', added: [], changed: [], removed: [], total: customIndexManager.getAll(username).length, durationMs: Date.now() - entry.state.startedAt!, error: error.message })
        throw error
    }).finally(() => { entry.pending = undefined })
    scanSerial = entry.pending.catch(() => {})
    return entry.pending
}

/** 首次读取和周期到期仅安排后台任务，立即返回已有索引。 */
export const ensureMusicScan = (username: string, force = false, mode: 'quick' | 'full' = 'full'): ScanStatus => {
    if (force) void syncCustomIndex(username, false, true, { mode, reason: 'manual' }).catch(error => console.warn('[音乐扫描]', error.message))
    return getScanStatus(username)
}
export const waitForScans = async () => { await scanSerial; customIndexManager.flush() }

// 获取自定义音乐列表（带 songInfo 转换）
/**
 * 同步目录索引后返回用户自定义目录歌曲列表。
 * @param username 已解析的用户名称。
 * @author yahyaoo
 */
export const mapCustomMusicItem = (item: CustomCacheItem) => ({
        ...item,
        folder: 'custom',
        songInfo: {
            id: item.id, songmid: item.songmid || item.id, name: item.name, singer: item.singer,
            source: item.source, quality: item.quality, albumName: item.album, albumId: item.albumId,
            img: item.img, interval: item.interval, type: item.quality,
            bitrate: item.bitrate, sampleRate: item.sampleRate, bitDepth: item.bitDepth,
            types: { [item.quality]: {} }, isCustomFile: true, customFilename: item.filename
        },
        hasLyric: item.hasLyric || !!item.lyricFilename
    })

/** 只读原始索引，供分页与缓存库聚合使用，不触发扫描。 */
export const getCustomRawItems = (username: string) => {
    const allowed = new Set(getMusicDirectories(username).map(directory => directory.id))
    return customIndexManager.getAll(username).filter(item => allowed.has(item.directoryId || ''))
}

/** 先分页后映射，媒体提示只使用既有状态。 */
export const getCustomMusicPage = (username: string, query: PageQuery, directoryId?: string) => {
    const directories = getMusicDirectories(username)
    if (directoryId && !directories.some(directory => directory.id === directoryId)) throw Object.assign(new Error('无权访问该目录'), { statusCode: 403 })
    const items = getCustomRawItems(username)
    const version = `${customIndexManager.version(username)}:${directories.map(directory => directory.id).join(',')}`
    const result = pageItems(items, query, { scope: username + ':custom', version, filterKey: directoryId, filter: item => !directoryId || item.directoryId === directoryId,
        text: item => `${item.name} ${item.singer} ${item.album || ''}`, id: item => item.filename,
        sort: { name: item => item.name || '', singer: item => item.singer || '', album: item => item.album || '', mtime: item => item.mtime || 0, interval: item => String(item.interval || '').split(':').reduce((sum, n) => sum * 60 + (Number(n) || 0), 0) } })
    return { ...result, items: result.items.map(item => ({ ...mapCustomMusicItem(item), coverCached: hasCachedCover(username, item.filename) })), scan: getScanStatus(username) }
}

export const getCustomMusicList = async (username: string) => {
    const customDir = getCustomMusicDir(username)
    if (!customDir) return []

    const allowed = new Set(getMusicDirectories(username).map(directory => directory.id))
    const items = customIndexManager.getAll(username).filter(item => allowed.has((item as any).directoryId))
    return items.map(item => ({
        ...item,
        folder: 'custom',
        songInfo: {
            id: item.id,
            songmid: item.songmid || item.id,
            name: item.name,
            singer: item.singer,
            source: item.source,
            quality: item.quality,
            albumName: item.album,
            albumId: item.albumId,
            img: item.img,
            interval: item.interval,
            type: item.quality,
            bitrate: item.bitrate, sampleRate: item.sampleRate, bitDepth: item.bitDepth,
            types: { [item.quality]: {} }, isCustomFile: true, customFilename: item.filename
        },
        hasLyric: item.hasLyric || !!item.lyricFilename
    }))
}

// 获取自定义目录音频封面
/**
 * 提取自定义目录歌曲封面，并使用封面缓存避免重复读取。
 * @param filename 文件或文档定位路径。
 * @param username 已解析的用户名称。
 * @author yahyaoo
 */
export interface MediaEnsureOptions { network?: boolean; background?: boolean; beforeNetwork?: () => Promise<void>; runNetwork?: (run: () => Promise<any>) => Promise<any> }
const coverRequests = new Map<string, { promise: Promise<any>; foreground: boolean }>()
const cachedCovers = new Map<string, { signature: string; version: string }>()
export const invalidateCustomCoverHints = (username: string) => { for (const key of cachedCovers.keys()) if (key.startsWith(username + ':')) cachedCovers.delete(key) }
export const hasCachedCover = (username: string, filename: string) => {
    const item = customIndexManager.load(username).get(filename)
    return !!item && cachedCovers.get(username + ':' + filename)?.signature === item.size + ':' + item.mtime + ':' + (item.img || '')
}
export const getCoverVersion = (username: string, filename: string) => hasCachedCover(username, filename) ? cachedCovers.get(username + ':' + filename)?.version : undefined
export const ensureCustomCover = async (filename: string, username: string, options: MediaEnsureOptions = {}) => {
    const item = customIndexManager.load(username).get(filename)
    const signature = item ? item.size + ':' + item.mtime + ':' + (item.img || '') : ''
    const key = username + ':' + filename + ':' + signature + ':' + (options.network !== false)
    const existing = coverRequests.get(key)
    if (existing) { if (!options.background) existing.foreground = true; return existing.promise }
    const entry = { foreground: !options.background, promise: Promise.resolve<any>(null) }
    entry.promise = extractCustomCover(filename, username, options, () => entry.foreground).finally(() => coverRequests.delete(key))
    coverRequests.set(key, entry); return entry.promise
}
export const getCustomCover = (filename: string, username: string) => ensureCustomCover(filename, username)
const extractCustomCover = async (filename: string, username: string, options: MediaEnsureOptions, foreground: () => boolean) => {
    const customDir = getCustomMusicDir(username)
    if (!customDir) return null
    const filePath = resolveMusicFile(username, filename)
    if (!filePath || !storageFs.existsSync(filePath)) return null

    const stats = storageFs.statSync(filePath), item = customIndexManager.load(username).get(filename)
    const signature = stats.size + ':' + stats.mtimeMs
    const coverKey = 'custom/' + filename + (item?.img ? ':' + crypto.createHash('sha256').update(item.img).digest('hex') : '')
    const valid = () => {
        const latest = customIndexManager.load(username).get(filename)
        const currentPath = resolveMusicFile(username, filename)
        if (currentPath !== filePath) return false
        const current = fs.statSync(filePath)
        return current.size === stats.size && current.mtimeMs === stats.mtimeMs && latest?.img === item?.img
    }
    // 只回写封面可用来源，标签缺失和内嵌歌词状态由原扫描逻辑判断。
    const remember = (coverType: CustomCacheItem['coverType'], data: Buffer) => {
        if (!item) return
        const version = crypto.createHash('sha256').update(data).digest('hex')
        cachedCovers.set(username + ':' + filename, { signature: signature + ':' + (item.img || ''), version })
        if (item.hasCover && item.coverType === coverType && item.coverVersion === version) return
        customIndexManager.merge(username, filename, { hasCover: true, coverType, coverVersion: version }, signature)
    }
    const cached = fileCache.readCoverCache(coverKey, username, stats)
    if (cached) { remember(item?.coverType === 'embedded' ? 'embedded' : 'cached', cached.data); return cached }
    cachedCovers.delete(username + ':' + filename)

    const embedded = await readMusicMetadata(filePath, signature, 'cover', !!options.background)
    if (!valid()) throw Error('BUSY: 封面读取时文件变化')
    if (embedded?.data?.length) {
        const data = Buffer.from(embedded.data), mime = detectImageMime(data)
        if (mime) {
            fileCache.writeCoverCache(coverKey, username, data, mime, stats)
            remember('embedded', data)
            return { data, mime }
        }
    }
    if (options.network !== false && item?.img && /^https?:\/\//.test(item.img)) {
        if (!foreground()) await options.beforeNetwork?.()
        const remote = options.runNetwork && !foreground() ? await options.runNetwork(() => fileCache.downloadCoverImage(item.img!)) : await fileCache.downloadCoverImage(item.img)
        if (!valid()) throw Error('BUSY: 封面下载时文件变化')
        if (remote && fileCache.writeCoverCache(coverKey, username, remote.data, remote.mime, stats)) { remember('cached', remote.data); return remote }
        if (!remote) throw Error('NETWORK: 封面下载失败')
    }
    return null
}

// 流式服务自定义目录音频文件（支持 Range 206）
/**
 * 向客户端流式传输自定义目录音频，校验用户目录与 Range 范围。
 * @param req HTTP 请求，包含认证头、查询参数和上传正文。
 * @param res HTTP 响应，用于写入状态码、数据或媒体流。
 * @param filename 文件或文档定位路径。
 * @param username 已解析的用户名称。
 * @author yahyaoo
 */
export const serveCustomFile = (req: http.IncomingMessage, res: http.ServerResponse, filename: string, username: string) => {
    const customDir = getCustomMusicDir(username)
    if (!customDir) {
        res.writeHead(404)
        res.end('Custom directory not found or not enabled')
        return
    }

    const filePath = resolveMusicFile(username, filename)
    if (!filePath || !storageFs.existsSync(filePath)) {
        res.writeHead(404)
        res.end('File Not Found')
        return
    }

    const stat = storageFs.statSync(filePath)
    const ext = path.extname(filePath).toLowerCase()
    const mimeTypes: Record<string, string> = {
        '.mp3': 'audio/mpeg',
        '.flac': 'audio/flac',
        '.m4a': 'audio/mp4',
        '.ogg': 'audio/ogg',
        '.wav': 'audio/wav',
        '.ape': 'audio/x-ape'
    }
    const contentType = mimeTypes[ext] || 'application/octet-stream'
    const range = req.headers.range

    if (range) {
        const parts = range.replace(/bytes=/, '').split('-')
        const start = parts[0] ? Number(parts[0]) : Math.max(0, stat.size - Number(parts[1]))
        const end = parts[0] && parts[1] ? Math.min(Number(parts[1]), stat.size - 1) : stat.size - 1
        if (!/^bytes=\d*-\d*$/.test(range) || !Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start > end || start >= stat.size) {
            res.writeHead(416, { 'Content-Range': `bytes */${stat.size}` }); res.end(); return
        }
        const chunksize = end - start + 1
        res.writeHead(206, {
            'Content-Range': `bytes ${start}-${end}/${stat.size}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': chunksize,
            'Content-Type': contentType
        })
        if (req.method === 'HEAD') res.end()
        else storageFs.createReadStream(filePath, { start, end }).pipe(res)
    } else {
        res.writeHead(200, {
            'Content-Length': stat.size,
            'Content-Type': contentType,
            'Accept-Ranges': 'bytes'
        })
        if (req.method === 'HEAD') res.end()
        else storageFs.createReadStream(filePath).pipe(res)
    }
}

// 删除自定义目录下的文件
/**
 * 删除自定义目录歌曲文件及关联索引记录。
 * @param filename 文件或文档定位路径。
 * @param username 已解析的用户名称。
 * @author yahyaoo
 */
export const removeCustomFile = (filename: string, username: string): boolean => {
    const customDir = getCustomMusicDir(username)
    if (!customDir) return false

    const filePath = resolveMusicFile(username, filename)
    if (!filePath || !storageFs.existsSync(filePath)) return false

    try {
        storageFs.unlinkSync(filePath)
        const ext = path.extname(filePath)
        const lrcPath = filePath.substring(0, filePath.length - ext.length) + '.lrc'
        if (storageFs.existsSync(lrcPath)) {
            try { storageFs.unlinkSync(lrcPath) } catch (e) { }
        }
        customIndexManager.remove(username, filename)

        // 安全清理变空的父级子目录
        try {
            const resolvedBase = path.resolve(customDir)
            let currentDir = path.resolve(path.dirname(filePath))
            while (currentDir !== resolvedBase && currentDir.startsWith(resolvedBase + path.sep)) {
                if (storageFs.existsSync(currentDir)) {
                    const entries = storageFs.readdirSync(currentDir)
                    if (entries.length === 0) {
                        try {
                            storageFs.rmdirSync(currentDir)
                            if (global.lx?.config?.['debug.enabled']) {
                                console.log(`[自定义音乐] [Debug] 已清理空歌单目录: ${currentDir}`)
                            }
                        } catch {
                            break
                        }
                    } else {
                        break
                    }
                } else {
                    break
                }
                currentDir = path.dirname(currentDir)
            }
        } catch (e) {
            if (global.lx?.config?.['debug.enabled']) {
                console.warn(`[自定义音乐] [Debug] 清理空目录失败:`, e)
            }
        }

        return true
    } catch (e) {
        console.error(`[自定义音乐] 删除文件 ${filename} 失败:`, e)
        return false
    }
}

// 手动关联自定义目录歌曲（更新 ID3 标签及 custom_index.json）
/**
 * 将自定义目录音频与在线歌曲信息关联，更新文件元信息和索引。
 * @param filename 文件或文档定位路径。
 * @param songInfo 歌曲详情及平台扩展字段。
 * @param username 已解析的用户名称。
 * @author yahyaoo
 */
export const linkCustomSong = async (filename: string, songInfo: any, username: string) => {
    const customDir = getCustomMusicDir(username)
    if (!customDir) throw new Error('用户未启用或未配置自定义目录')

    const filePath = resolveMusicFile(username, filename)
    if (!filePath || !storageFs.existsSync(filePath)) throw new Error('音频文件未找到: ' + filename)

    // 1. 尝试使用 MusicTagger 写入 ID3 标签
    try {
        const tagger = new MusicTagger()
        tagger.loadPath(filePath)
        if (songInfo.name) tagger.title = songInfo.name
        if (songInfo.singer) tagger.artist = songInfo.singer
        if (songInfo.albumName) tagger.album = songInfo.albumName
        tagger.save()
        tagger.dispose()
    } catch (e: any) {
        console.warn(`[自定义音乐] 写入音频标签失败: ${e.message}，继续更新索引`)
    }

    // 2. 更新 custom_index.json 中的元数据
    const index = customIndexManager.load(username)
    const existing = index.get(filename)
    const stats = storageFs.statSync(filePath)

    const updatedItem: CustomCacheItem = {
        ...(existing || {}),
        filename,
        subPath: existing?.subPath || '',
        folder: 'custom',
        source: songInfo.source || 'custom',
        id: songInfo.id || existing?.id || `custom_${crypto.createHash('md5').update(filename).digest('hex')}`,
        songmid: songInfo.songmid || songInfo.id || existing?.songmid,
        name: songInfo.name || existing?.name || path.basename(filename),
        singer: songInfo.singer || existing?.singer || '未知歌手',
        album: songInfo.albumName || songInfo.album || existing?.album || '',
        albumId: songInfo.albumId || existing?.albumId || '',
        img: songInfo.img || existing?.img || '',
        interval: songInfo.interval || existing?.interval || '',
        quality: existing?.quality || '128k',
        size: stats.size,
        mtime: stats.mtimeMs,
        ext: path.extname(filePath).replace('.', ''),
        hasCover: existing?.hasCover || !!songInfo.img,
        hasLyric: existing?.hasLyric || false,
        hasEmbedLyric: existing?.hasEmbedLyric || false
    }

    customIndexManager.set(username, filename, updatedItem)
    customIndexManager.save(username)

    return { success: true, message: '关联成功', data: updatedItem }
}

// 批量补全自定义目录音乐元信息（封面与ID3标签）
/**
 * 批量写入歌曲元信息，汇总成功、跳过和失败结果。
 * @param filenames 待处理文件名集合。
 * @param username 已解析的用户名称。
 * @author yahyaoo
 */
export const batchUpdateMetadata = async (filenames: string[], username: string) => {
    const customDir = getCustomMusicDir(username)
    if (!customDir) throw new Error('用户未启用或未配置自定义目录')

    let successCount = 0
    let failCount = 0
    const index = customIndexManager.load(username)

    for (const filename of filenames) {
        const item = index.get(filename)
        const filePath = resolveMusicFile(username, filename)
        if (!filePath || !storageFs.existsSync(filePath)) {
            failCount++
            continue
        }

        try {
            let imageBuffer: Buffer | undefined
            let imageMime = 'image/jpeg'
            const imageUrl = item?.img
            if (imageUrl && imageUrl.startsWith('http') && !imageUrl.includes('logo.svg')) {
                const chunks: Buffer[] = []
                const p = imageUrl.startsWith('https') ? https : http
                imageBuffer = await new Promise<Buffer>((resolveI, rejectI) => {
                    const req = p.get(imageUrl, ires => {
                        if ((ires.statusCode || 500) >= 400) {
                            ires.resume()
                            rejectI(new Error(`Cover status: ${ires.statusCode}`))
                            return
                        }
                        imageMime = String(ires.headers['content-type'] || 'image/jpeg').split(';')[0]
                        ires.on('data', c => chunks.push(c))
                        ires.on('end', () => resolveI(Buffer.concat(chunks)))
                        ires.on('error', rejectI)
                    })
                    req.on('error', rejectI)
                    setTimeout(() => { req.destroy(); rejectI(new Error('Timeout')) }, 8000)
                }).catch(() => undefined)
            }

            let tagger: any
            try {
                tagger = new MusicTagger()
                tagger.loadPath(filePath)
                if (item?.name) tagger.title = item.name
                if (item?.singer) tagger.artist = item.singer
                if (item?.album) tagger.album = item.album
                if (imageBuffer && imageBuffer.length > 0) {
                    tagger.pictures = [new MetaPicture(imageMime, new Uint8Array(imageBuffer), 'Cover')]
                }
                tagger.save()
            } catch (e) {
                console.warn(`[自定义音乐] 批量写入标签失败: ${filename}`, e)
            } finally {
                try { if (tagger) tagger.dispose() } catch (e) { }
            }

            if (item) {
                if (imageBuffer && imageBuffer.length > 0) {
                    item.hasCover = true
                    item.coverType = 'embedded'
                }
                const stats = storageFs.statSync(filePath)
                item.mtime = stats.mtimeMs
                item.size = stats.size
                customIndexManager.set(username, filename, item)
            }
            successCount++
        } catch (e) {
            failCount++
        }
    }

    customIndexManager.save(username)
    return { successCount, failCount }
}

// 批量将歌词嵌入自定义目录音频标签 (USLT)
/**
 * 批量获取并内嵌自定义目录歌曲歌词，汇总成功与失败结果。
 * @param filenames 待处理文件名集合。
 * @param username 已解析的用户名称。
 * @author yahyaoo
 */
export const batchEmbedLyric = async (filenames: string[], username: string) => {
    const customDir = getCustomMusicDir(username)
    if (!customDir) throw new Error('用户未启用或未配置自定义目录')

    let successCount = 0
    let skippedCount = 0
    let failCount = 0
    const details: any[] = []
    const index = customIndexManager.load(username)

    for (const filename of filenames) {
        const filePath = resolveMusicFile(username, filename)
        if (!filePath || !storageFs.existsSync(filePath)) {
            details.push({ filename, status: 'fail', reason: '文件不存在' })
            failCount++
            continue
        }

        try {
            const item = index.get(filename)
            // 检查现有嵌入歌词
            let checkTagger: any
            let existingLyrics = ''
            try {
                checkTagger = new MusicTagger()
                checkTagger.loadPath(filePath)
                existingLyrics = checkTagger.lyrics || ''
            } catch (checkError: any) {
                const unsupportedStatus = getAudioMetadataUnsupportedStatus(filePath)
                details.push({ filename, status: 'fail', reason: unsupportedStatus.error || '当前音频容器不支持嵌入歌词' })
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

            // 优先读取同名 .lrc 文件
            const ext = path.extname(filePath)
            const lrcPath = filePath.substring(0, filePath.length - ext.length) + '.lrc'
            let lyricText: string | null = null

            if (storageFs.existsSync(lrcPath)) {
                lyricText = storageFs.readFileSync(lrcPath, 'utf8')
            } else if (item && item.source && item.source !== 'unknown' && item.source !== 'local' && item.source !== 'custom') {
                const lyricFetcherFn = getLyricFetcher()
                if (lyricFetcherFn) {
                    lyricText = await lyricFetcherFn(item)
                }
            }

            if (!lyricText) {
                details.push({ filename, status: 'fail', reason: '无法获取歌词' })
                failCount++
                continue
            }

            const embedResult = embedLyricsIntoFile(filePath, lyricText)
            if (!embedResult.success) {
                details.push({ filename, status: 'fail', reason: embedResult.error || '歌词写入失败' })
                failCount++
                continue
            }

            if (item) {
                item.hasEmbedLyric = true
                customIndexManager.set(username, filename, item)
            }
            details.push({ filename, status: 'success' })
            successCount++
        } catch (itemErr: any) {
            details.push({ filename, status: 'fail', reason: itemErr.message || '未知错误' })
            failCount++
        }
    }

    customIndexManager.save(username)
    return { successCount, skippedCount, failCount, details }
}

// 为自定义目录保存歌词缓存 (.lrc 文件并同步索引)
/**
 * 保存自定义目录歌曲歌词缓存并更新歌词索引标记。
 * @param songInfo 歌曲详情及平台扩展字段。
 * @param lyricsObj 歌词及翻译等扩展内容。
 * @param username 已解析的用户名称。
 * @author yahyaoo
 */
export const saveCustomLyricCache = (songInfo: any, lyricsObj: any, username: string): boolean => {
    try {
        const customDir = getCustomMusicDir(username)
        if (!customDir) return false

        const index = customIndexManager.load(username)
        // 查找匹配项：优先 filename，其次 songmid/id
        let matchedItem: CustomCacheItem | undefined
        for (const item of Array.from(index.values())) {
            if (songInfo.filename && item.filename === songInfo.filename) {
                matchedItem = item
                break
            }
            if (songInfo.songmid && item.songmid === songInfo.songmid) {
                matchedItem = item
                break
            }
            if (songInfo.id && item.id === songInfo.id) {
                matchedItem = item
                break
            }
        }

        if (!matchedItem) return false

        const filePath = resolveMusicFile(username, matchedItem.filename)
        if (!filePath || !storageFs.existsSync(filePath)) return false

        const ext = path.extname(filePath)
        const lrcPath = filePath.substring(0, filePath.length - ext.length) + '.lrc'
        const formattedLrc = buildLyrics(lyricsObj)
        if (!formattedLrc) return false

        storageFs.writeFileSync(lrcPath, formattedLrc, { encoding: 'utf-8' })
        matchedItem.hasLyric = true
        matchedItem.lyricFilename = path.relative(customDir, lrcPath).replace(/\\/g, '/')
        customIndexManager.set(username, matchedItem.filename, matchedItem)
        customIndexManager.save(username)
        return true
    } catch (e) {
        console.error('[自定义音乐] 保存自定义歌词缓存失败:', e)
        return false
    }
}

// 跨设备/分区安全重命名
const safeRenameFile = (src: string, dst: string) => {
    try {
        storageFs.renameSync(src, dst)
    } catch (err) {
        storageFs.copyFileSync(src, dst)
        storageFs.unlinkSync(src)
    }
}

// 自定义目录歌曲洗版替换：下载新音质并替换自定义目录目标文件，保留封面和歌词，并更新 custom_index.json
/**
 * 以新解析歌曲替换自定义目录中的音频，保持目录和索引对应。
 * @param username 已解析的用户名称。
 * @param originalItem 替换前的本地歌曲索引记录。
 * @param songInfo 歌曲详情及平台扩展字段。
 * @param url 请求或播放地址。
 * @param quality 原音质选择。
 * @param signal 调用方取消信号。
 * @author yahyaoo
 */
export const replaceCustomMusicItem = async (
    username: string,
    originalItem: CustomCacheItem,
    songInfo: any,
    url: string,
    quality: string,
    signal?: AbortSignal,
): Promise<CustomCacheItem> => {
    const userCfg = getUserConfig(username)
    if (!userCfg?.allowOperateCustomMusicDir) {
        throw new Error('未开启操作自定义音乐目录权限 (allowOperateCustomMusicDir)')
    }

    const customDir = getCustomMusicDir(username)
    if (!customDir) throw new Error('用户未开启或未配置自定义音乐目录')

    const index = customIndexManager.load(username)
    const currentItem = index.get(originalItem.filename)
    if (!currentItem) {
        throw new Error('原自定义目录文件已发生变化或已不存在')
    }
    if (quality === currentItem.quality) {
        throw new Error('实际音质与原音质相同，无需替换')
    }

    const oldAudioPath = resolveMusicFile(username, currentItem.filename)
    if (!oldAudioPath || !storageFs.existsSync(oldAudioPath)) {
        throw new Error('原音频文件已不存在')
    }
    const oldAudioSize = storageFs.statSync(oldAudioPath).size

    const stageId = crypto.randomBytes(12).toString('hex')
    const stageUsername = `.remaster-staging/${stageId}`
    const stageRoot = fileCache.getCacheDir(stageUsername, true)
    const stageCoverRoot = fileCache.getCoverCacheDir(stageUsername)
    const backupSuffix = `.remaster-${crypto.randomBytes(6).toString('hex')}.bak`
    const oldAudioBackup = oldAudioPath + backupSuffix

    const ext = path.extname(oldAudioPath)
    const oldLyricPath = oldAudioPath.substring(0, oldAudioPath.length - ext.length) + '.lrc'
    const hasOldLyric = storageFs.existsSync(oldLyricPath)
    const oldLyricBackup = oldLyricPath + backupSuffix

    let backedUpOldAudio = false
    let backedUpOldLyric = false
    let installedNewAudio = false
    let installedNewLyric = false
    let targetAudioPath = ''
    let targetLyricPath = ''
    let replacementItem: CustomCacheItem | null = null

    try {
        await fileCache.downloadAndCache(songInfo, url, quality, stageUsername, signal, true, true, true)
        if (signal?.aborted) throw new Error('Aborted')

        const stagedItems = fileCache.indexManager.getAll(stageUsername, 'music')
        const targetId = fileCache.normalizeSongId(songInfo)
        const downloadedItem = stagedItems.find(item => item.id === targetId) || stagedItems[0]
        if (!downloadedItem) throw new Error('新音质文件未写入暂存索引')

        const sourceAudioPath = path.join(stageRoot, downloadedItem.filename)
        const sourceStats = storageFs.existsSync(sourceAudioPath) ? storageFs.statSync(sourceAudioPath) : null
        if (!sourceStats?.isFile() || sourceStats.size <= 0) throw new Error('新音质文件无效或为空')
        if (sourceStats.size < oldAudioSize) {
            throw new Error(`新文件（${sourceStats.size} 字节）小于原文件（${oldAudioSize} 字节），音源可能返回了低质量文件，已拒绝替换`)
        }

        // 提取原音频封面作为备用
        const originalCover = await getCustomCover(currentItem.filename, username)

        // 确定自定义目录中的目标音频文件名（保留其原相对子路径 subPath）
        const downloadedExt = path.extname(downloadedItem.filename) || `.${downloadedItem.ext || 'mp3'}`
        const subDir = currentItem.subPath || (path.dirname(currentItem.filename) === '.' ? '' : path.dirname(currentItem.filename).replace(/\\/g, '/'))
        const baseNameWithoutExt = path.basename(currentItem.filename, ext)
        const directoryPrefix = /^@[a-f0-9]{16}\//.exec(currentItem.filename)?.[0] || ''
        const targetAudioFilename = (subDir ? path.join(subDir, `${baseNameWithoutExt}${downloadedExt}`).replace(/\\/g, '/') : `${baseNameWithoutExt}${downloadedExt}`)
        const targetLyricFilename = (subDir ? path.join(subDir, `${baseNameWithoutExt}.lrc`).replace(/\\/g, '/') : `${baseNameWithoutExt}.lrc`)

        const indexedAudioFilename = targetAudioFilename.startsWith('@') ? targetAudioFilename : directoryPrefix + targetAudioFilename
        const indexedLyricFilename = targetLyricFilename.startsWith('@') ? targetLyricFilename : directoryPrefix + targetLyricFilename
        targetAudioPath = resolveMusicFile(username, indexedAudioFilename, true)!
        targetLyricPath = resolveMusicFile(username, indexedLyricFilename, true)!

        // 备份旧音频
        storageFs.renameSync(oldAudioPath, oldAudioBackup)
        backedUpOldAudio = true

        // 备份旧歌词（若存在）
        if (hasOldLyric) {
            storageFs.renameSync(oldLyricPath, oldLyricBackup)
            backedUpOldLyric = true
        }

        // 写入新音频到目标位置
        storageFs.mkdirSync(path.dirname(targetAudioPath), { recursive: true })
        safeRenameFile(sourceAudioPath, targetAudioPath)
        installedNewAudio = true

        // 检查新音频封面，若缺失且原音频有封面，则写入封面标签
        let taggerCheck: any
        let finalHasCover = false
        try {
            taggerCheck = new MusicTagger()
            taggerCheck.loadPath(targetAudioPath)
            const pics = taggerCheck.pictures
            finalHasCover = Array.isArray(pics) && pics.some((p: any) => p && p.data)
        } catch (e) {
        } finally {
            try { if (taggerCheck) taggerCheck.dispose() } catch (e) { }
        }

        if (!finalHasCover && originalCover?.data?.length) {
            let tagger: any
            try {
                tagger = new MusicTagger()
                tagger.loadPath(targetAudioPath)
                tagger.pictures = [
                    new MetaPicture(originalCover.mime || 'image/jpeg', new Uint8Array(originalCover.data), 'Cover'),
                ]
                tagger.save()
                finalHasCover = true
            } catch (e) {
                console.warn(`[自定义音乐] 无法将原封面写入 ${targetAudioFilename}:`, e)
            } finally {
                try { if (tagger) tagger.dispose() } catch (e) { }
            }
        }

        // 处理歌词文件
        const sourceLyricPath = downloadedItem.lyricFilename ? path.join(stageRoot, downloadedItem.lyricFilename) : ''
        let finalHasLyric = false
        let finalLyricFilename: string | undefined

        if (sourceLyricPath && storageFs.existsSync(sourceLyricPath)) {
            storageFs.mkdirSync(path.dirname(targetLyricPath), { recursive: true })
            safeRenameFile(sourceLyricPath, targetLyricPath)
            installedNewLyric = true
            finalHasLyric = true
            finalLyricFilename = indexedLyricFilename
        } else if (backedUpOldLyric && storageFs.existsSync(oldLyricBackup)) {
            storageFs.mkdirSync(path.dirname(targetLyricPath), { recursive: true })
            storageFs.copyFileSync(oldLyricBackup, targetLyricPath)
            installedNewLyric = true
            finalHasLyric = true
            finalLyricFilename = targetLyricFilename
        }

        const finalStats = storageFs.statSync(targetAudioPath)
        replacementItem = {
            ...currentItem,
            name: songInfo.name || currentItem.name,
            singer: songInfo.singer || currentItem.singer,
            album: songInfo.albumName || songInfo.album || currentItem.album,
            albumId: songInfo.albumId || currentItem.albumId,
            img: songInfo.img || currentItem.img,
            interval: songInfo.interval || currentItem.interval,
            quality: quality,
            filename: indexedAudioFilename,
            subPath: subDir,
            folder: 'custom',
            source: currentItem.source || 'custom',
            mtime: finalStats.mtimeMs,
            size: finalStats.size,
            ext: downloadedExt.replace('.', ''),
            hasCover: finalHasCover,
            coverType: finalHasCover ? 'embedded' : 'none',
            hasLyric: finalHasLyric,
            hasEmbedLyric: downloadedItem.hasEmbedLyric ?? currentItem.hasEmbedLyric,
            lyricFilename: finalLyricFilename,
            bitrate: downloadedItem.bitrate,
            sampleRate: downloadedItem.sampleRate,
            bitDepth: downloadedItem.bitDepth,
        }

        // 如果文件名改变，移除旧键并设置新键
        if (indexedAudioFilename !== currentItem.filename) {
            customIndexManager.remove(username, currentItem.filename)
        }
        customIndexManager.set(username, indexedAudioFilename, replacementItem)
        customIndexManager.save(username)

        // 清理备份文件
        try {
            if (backedUpOldAudio && storageFs.existsSync(oldAudioBackup)) storageFs.unlinkSync(oldAudioBackup)
        } catch (cleanupErr) {
            console.warn('[自定义音乐] 清理旧音频备份失败:', cleanupErr)
        }
        try {
            if (backedUpOldLyric && storageFs.existsSync(oldLyricBackup)) storageFs.unlinkSync(oldLyricBackup)
        } catch (cleanupErr) {
            console.warn('[自定义音乐] 清理旧歌词备份失败:', cleanupErr)
        }

        return replacementItem
    } catch (err) {
        // 回滚操作
        try {
            if (installedNewAudio && targetAudioPath && storageFs.existsSync(targetAudioPath)) {
                storageFs.unlinkSync(targetAudioPath)
            }
            if (installedNewLyric && targetLyricPath && storageFs.existsSync(targetLyricPath)) {
                storageFs.unlinkSync(targetLyricPath)
            }
            if (backedUpOldAudio && storageFs.existsSync(oldAudioBackup) && !storageFs.existsSync(oldAudioPath)) {
                storageFs.renameSync(oldAudioBackup, oldAudioPath)
            }
            if (backedUpOldLyric && storageFs.existsSync(oldLyricBackup) && !storageFs.existsSync(oldLyricPath)) {
                storageFs.renameSync(oldLyricBackup, oldLyricPath)
            }
            customIndexManager.set(username, currentItem.filename, currentItem)
            customIndexManager.save(username)
        } catch (rollbackErr) {
            console.error('[自定义音乐] 洗版回滚失败:', rollbackErr)
        }
        throw err
    } finally {
        fileCache.indexManager.discard(stageUsername, 'music')
        try {
            if (storageFs.existsSync(stageRoot)) storageFs.rmSync(stageRoot, { recursive: true, force: true })
        } catch (e) { }
        try {
            if (storageFs.existsSync(stageCoverRoot)) storageFs.rmSync(stageCoverRoot, { recursive: true, force: true })
        } catch (e) { }
    }
}
