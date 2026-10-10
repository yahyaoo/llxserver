/** FileCacheService 模块：按职责组织，原业务行为保持不变。 @author yahyaoo */
import storageFs from '../../../application/persistence/documentFileSystem'


import fs from 'fs'
import type { Stats } from 'fs'
import path from 'path'
import http from 'http'
import https from 'https'
import crypto from 'crypto'
import { PassThrough } from 'stream'
const { MusicTagger, MetaPicture } = require('music-tag-native')
import { buildLyrics, parseLyrics } from '../../../utils/lrcTool'
import { formatPlayTime } from '../../../utils/common'

// --- Cache Naming Patterns ---
export const CACHE_NAMING_PATTERNS = {
    STANDARD: 'standard',       // {Name}_-_{Singer}_-_{Source}_-_{ID}_-_{Quality}
    SIMPLE: 'simple',            // {Name} - {Singer} - {Quality} - {Album}
    SINGER_NAME_QUALITY_ALBUM: 'singer_name_quality_album', // {Singer} - {Name} - {Quality} - {Album}
    SINGER_NAME: 'singer_name', // {Singer} - {Name}
    NAME_SINGER: 'name_singer'  // {Name} - {Singer}
}

let currentNamingPattern = CACHE_NAMING_PATTERNS.SIMPLE

/**
 * 规范化 normalizeNamingPattern 对应的业务能力，参数和执行顺序保持原实现。
 * @param pattern pattern 原业务参数。
 * @returns 原处理结果；异步操作沿用原完成与错误传播约定。
 * @author yahyaoo
 */
export const normalizeNamingPattern = (pattern: unknown) => {
    if (Object.values(CACHE_NAMING_PATTERNS).includes(pattern as string)) {
        return pattern as string
    }
    return CACHE_NAMING_PATTERNS.SIMPLE
}

/**
 * 设置 setNamingPattern 对应的业务能力，参数和执行顺序保持原实现。
 * @param pattern pattern 原业务参数。
 * @returns 原处理结果；异步操作沿用原完成与错误传播约定。
 * @author yahyaoo
 */
export const setNamingPattern = (pattern: unknown) => {
    currentNamingPattern = normalizeNamingPattern(pattern)
    return currentNamingPattern
}

// Define the two possible cache roots
export const CACHE_ROOTS = {
    DATA: 'data', // inside global.lx.dataPath (synced)
    ROOT: 'root'  // relative to process.cwd() (not synced)
}

let currentCacheLocation = CACHE_ROOTS.ROOT
const CACHE_LIST_SYNC_TTL = 30 * 1000
const cacheListSyncState: Map<string, { /**
 * lastSync 字段，沿用原业务结构与空值约定。
 */
lastSync: number, /**
 * pending 字段，沿用原业务结构与空值约定。
 */
pending?: Promise<void> }> = new Map()

// Helper to get actual directory path
// [Unified Enhancement] Cache Progress Tracker
export const cacheProgress: Map<string, { /**
 * progress 字段，沿用原业务结构与空值约定。
 */
progress: number; /**
 * status 字段，沿用原业务结构与空值约定。
 */
status: string; /**
 * total 字段，沿用原业务结构与空值约定。
 */
total?: number; /**
 * received 字段，沿用原业务结构与空值约定。
 */
received?: number; /**
 * speed 字段，沿用原业务结构与空值约定。
 */
speed?: number; /**
 * updatedAt 字段，沿用原业务结构与空值约定。
 */
updatedAt?: number; /**
 * errorMsg 字段，沿用原业务结构与空值约定。
 */
errorMsg?: string }> = new Map()

// [New] Active Cache Tasks Tracker: username -> [ { songKey, controller } ]
export const activeTasks: Map<string, Array<{ /**
 * songKey 字段，沿用原业务结构与空值约定。
 */
songKey: string, /**
 * controller 字段，沿用原业务结构与空值约定。
 */
controller: AbortController }>> = new Map()

// [新增] 歌词获取钩子：由 server.ts 在启动时注入，避免 fileCache 直接依赖 musicSdk
// 调用时会通过 /api/music/lyric 接口逻辑（先查本地 .lrc 缓存，再去源站）获取歌词文本
/**
 * LyricFetcher 契约，按当前模块职责组织，保留原字段和扩展能力。
 * @author yahyaoo
 */
type LyricFetcher = (songInfo: any) => Promise<string | null>
let _lyricFetcher: LyricFetcher | null = null
/**
 * 设置 setLyricFetcher 对应的业务能力，参数和执行顺序保持原实现。
 * @param fn fn 原业务参数。
 * @returns 原处理结果；异步操作沿用原完成与错误传播约定。
 * @author yahyaoo
 */
export const setLyricFetcher = (fn: LyricFetcher) => { _lyricFetcher = fn }

/**
 * 获取 getCacheDir 对应的业务能力，参数和执行顺序保持原实现。
 * @param username 已解析的用户名称。
 * @param isOnlyDownload isOnlyDownload 原业务参数。
 * @param location location 原业务参数。
 * @returns 原处理结果；异步操作沿用原完成与错误传播约定。
 * @author yahyaoo
 */
export const getCacheDir = (username?: string, isOnlyDownload?: boolean, location?: string) => {
    const userDirName = (username && username !== '_open' && username !== 'default') ? username : '_open'

    const folderName = isOnlyDownload ? 'music' : 'cache'
    const loc = location || currentCacheLocation
    let baseDir = ''
    if (path.isAbsolute(loc)) {
        // 自定义路径作为存储根目录，继续保留 cache/music 和用户隔离结构。
        baseDir = path.join(loc, folderName)
    } else if (loc === CACHE_ROOTS.DATA) {
        baseDir = path.join(global.lx.dataPath, folderName)
    } else {
        baseDir = path.join(process.cwd(), folderName)
    }

    const fullPath = path.join(baseDir, userDirName)
    if (!storageFs.existsSync(fullPath)) {
        storageFs.mkdirSync(fullPath, { recursive: true })
    }
    return fullPath
}

/**
 * 获取 getCoverCacheDir 对应的业务能力，参数和执行顺序保持原实现。
 * @param username 已解析的用户名称。
 * @returns 原处理结果；异步操作沿用原完成与错误传播约定。
 * @author yahyaoo
 */
export const getCoverCacheDir = (username: string) => {
    const baseDir = path.join(process.cwd(), 'cover_cache')
    const userDirName = (username && username !== '_open' && username !== 'default') ? username : '_open'
    const fullPath = path.join(baseDir, userDirName)
    if (!storageFs.existsSync(fullPath)) {
        storageFs.mkdirSync(fullPath, { recursive: true })
    }
    return fullPath
}

// --- Cache Index Manager ---
/**
 * CacheItem 契约，按当前模块职责组织，保留原字段和扩展能力。
 * @author yahyaoo
 */
export interface CacheItem {
    /**
     * id 字段，沿用原业务结构与空值约定。
     */
    id: string
    /**
     * songmid 字段，沿用原业务结构与空值约定。
     */
    songmid?: string
    /**
     * name 字段，沿用原业务结构与空值约定。
     */
    name: string
    /**
     * singer 字段，沿用原业务结构与空值约定。
     */
    singer: string
    /**
     * album 字段，沿用原业务结构与空值约定。
     */
    album: string
    /**
     * albumId 字段，沿用原业务结构与空值约定。
     */
    albumId?: string
    /**
     * img 字段，沿用原业务结构与空值约定。
     */
    img?: string
    /**
     * interval 字段，沿用原业务结构与空值约定。
     */
    interval?: string
    /**
     * source 字段，沿用原业务结构与空值约定。
     */
    source: string
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
    /**
     * quality 字段，沿用原业务结构与空值约定。
     */
    quality: string
    /**
     * filename 字段，沿用原业务结构与空值约定。
     */
    filename: string
    /**
     * folder 字段，沿用原业务结构与空值约定。
     */
    folder: string // 'cache' or 'music'
    /**
     * subPath 字段，沿用原业务结构与空值约定。
     */
    subPath?: string // [New] Relative path within the folder (e.g. 'Pop/2024')
    /**
     * mtime 字段，沿用原业务结构与空值约定。
     */
    mtime: number
    /**
     * size 字段，沿用原业务结构与空值约定。
     */
    size: number
    /**
     * lyricFilename 字段，沿用原业务结构与空值约定。
     */
    lyricFilename?: string
    /**
     * ext 字段，沿用原业务结构与空值约定。
     */
    ext: string
    /**
     * hasCover 字段，沿用原业务结构与空值约定。
     */
    hasCover?: boolean
    /**
     * coverType 字段，沿用原业务结构与空值约定。
     */
    coverType?: 'embedded' | 'cached' | 'remote' | 'none'
    /**
     * hasLyric 字段，沿用原业务结构与空值约定。
     */
    hasLyric?: boolean
    /**
     * hasEmbedLyric 字段，沿用原业务结构与空值约定。
     */
    hasEmbedLyric?: boolean
    /**
     * audioContainer 字段，沿用原业务结构与空值约定。
     */
    audioContainer?: string
    /**
     * metadataWritable 字段，沿用原业务结构与空值约定。
     */
    metadataWritable?: boolean
    /**
     * metadataError 字段，沿用原业务结构与空值约定。
     */
    metadataError?: string
    /**
     * embedLyricError 字段，沿用原业务结构与空值约定。
     */
    embedLyricError?: string
    /**
     * coverCheckedVersion 字段，沿用原业务结构与空值约定。
     */
    coverCheckedVersion?: number
    /**
     * coverCheckedMtime 字段，沿用原业务结构与空值约定。
     */
    coverCheckedMtime?: number
    /**
     * coverCheckedSize 字段，沿用原业务结构与空值约定。
     */
    coverCheckedSize?: number
    /**
     * bitrate 字段，沿用原业务结构与空值约定。
     */
    bitrate?: number
    /**
     * sampleRate 字段，沿用原业务结构与空值约定。
     */
    sampleRate?: number
    /**
     * bitDepth 字段，沿用原业务结构与空值约定。
     */
    bitDepth?: number
}

/**
 * CacheFolder 契约，按当前模块职责组织，保留原字段和扩展能力。
 * @author yahyaoo
 */
export type CacheFolder = 'cache' | 'music'

/**
 * RemoveCacheFileResult 契约，按当前模块职责组织，保留原字段和扩展能力。
 * @author yahyaoo
 */
export interface RemoveCacheFileResult {
    /**
     * deleted 字段，沿用原业务结构与空值约定。
     */
    deleted: boolean
    /**
     * folder 字段，沿用原业务结构与空值约定。
     */
    folder?: CacheFolder
}

/**
 * DownloadProvenance 契约，按当前模块职责组织，保留原字段和扩展能力。
 * @author yahyaoo
 */
export interface DownloadProvenance {
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
 * CacheIndexManager 契约，按当前模块职责组织，保留原字段和扩展能力。
 * @author yahyaoo
 */
class CacheIndexManager {
    /**
     * indexes 字段，沿用原业务结构与空值约定。
     */
    private indexes: Map<string, Map<string, CacheItem>> = new Map() // "location:username:folder" -> (songId -> CacheItem)

    /**
     * 获取 getIndexFile 对应的业务能力，参数和执行顺序保持原实现。
     * @param username 已解析的用户名称。
     * @param folder folder 原业务参数。
     * @param location location 原业务参数。
     * @returns 原处理结果；异步操作沿用原完成与错误传播约定。
     * @author yahyaoo
     */
    private getIndexFile(username: string, folder: 'cache' | 'music', location?: string) {
        const userDir = getCacheDir(username, folder === 'music', location)
        const fileName = folder === 'music' ? 'music_index.json' : 'cache_index.json'
        return path.join(userDir, fileName)
    }

    /**
     * 获取 getKey 对应的业务能力，参数和执行顺序保持原实现。
     * @param username 已解析的用户名称。
     * @param folder folder 原业务参数。
     * @param location location 原业务参数。
     * @returns 原处理结果；异步操作沿用原完成与错误传播约定。
     * @author yahyaoo
     */
    private getKey(username: string, folder: 'cache' | 'music', location?: string) {
        return `${location || currentCacheLocation}:${username}:${folder}`
    }

    /**
     * 加载 load 对应的业务能力，参数和执行顺序保持原实现。
     * @param username 已解析的用户名称。
     * @param folder folder 原业务参数。
     * @param location location 原业务参数。
     * @returns 原处理结果；异步操作沿用原完成与错误传播约定。
     * @author yahyaoo
     */
    load(username: string, folder: 'cache' | 'music', location?: string) {
        const key = this.getKey(username, folder, location)
        const file = this.getIndexFile(username, folder, location)
        if (storageFs.existsSync(file)) {
            try {
                const data = JSON.parse(storageFs.readFileSync(file, 'utf-8'))
                this.indexes.set(key, new Map(Object.entries(data)))
            } catch (e) {
                this.indexes.set(key, new Map())
            }
        } else {
            this.indexes.set(key, new Map())
        }
        return this.indexes.get(key)!
    }

    /**
     * 保存 save 对应的业务能力，参数和执行顺序保持原实现。
     * @param username 已解析的用户名称。
     * @param folder folder 原业务参数。
     * @param location location 原业务参数。
     * @returns 原处理结果；异步操作沿用原完成与错误传播约定。
     * @author yahyaoo
     */
    save(username: string, folder: 'cache' | 'music', location?: string) {
        const loc = location || currentCacheLocation
        const key = this.getKey(username, folder, loc)
        const index = this.indexes.get(key)
        if (!index) return

        const file = this.getIndexFile(username, folder, loc)
        try {
            const data = Object.fromEntries(index)
            storageFs.writeFileSync(file, JSON.stringify(data, null, 2))
        } catch (e) {
            console.error(`[缓存索引] 保存索引文件失败 (${key}):`, e)
        }
    }

    /**
     * 获取 get 对应的业务能力，参数和执行顺序保持原实现。
     * @param username 已解析的用户名称。
     * @param songId songId 原业务参数。
     * @param folder folder 原业务参数。
     * @param quality 原音质选择。
     * @param exact exact 原业务参数。
     * @param location location 原业务参数。
     * @returns 原处理结果；异步操作沿用原完成与错误传播约定。
     * @author yahyaoo
     */
    get(username: string, songId: string, folder: 'cache' | 'music', quality?: string, exact: boolean = false, location?: string) {
        const key = this.getKey(username, folder, location)
        const index = this.indexes.get(key) || this.load(username, folder, location)
        if (quality) {
            const item = index.get(`${songId}_${quality}`)
            if (item) return item
            // exact 模式：精确匹配失败则不 fallback，直接返回 undefined
            if (exact) return undefined
        }
        // Fallback: 非精确模式下扫描同 ID 的任意质量
        const prefix = `${songId}_`
        for (const [k, item] of index.entries()) {
            if (k === songId || k.startsWith(prefix)) return item
        }
        return undefined
    }

    /**
     * 更新 update 对应的业务能力，参数和执行顺序保持原实现。
     * @param username 已解析的用户名称。
     * @param item item 原业务参数。
     * @param folder folder 原业务参数。
     * @param location location 原业务参数。
     * @returns 原处理结果；异步操作沿用原完成与错误传播约定。
     * @author yahyaoo
     */
    update(username: string, item: CacheItem, folder: 'cache' | 'music', location?: string) {
        const key = this.getKey(username, folder, location)
        const index = this.indexes.get(key) || this.load(username, folder, location)
        // Use composite key id_quality
        const itemKey = `${item.id}_${item.quality || 'unknown'}`
        index.set(itemKey, item)
        this.save(username, folder, location)
    }

    /**
     * 移除 remove 对应的业务能力，参数和执行顺序保持原实现。
     * @param username 已解析的用户名称。
     * @param songId songId 原业务参数。
     * @param folder folder 原业务参数。
     * @param quality 原音质选择。
     * @param location location 原业务参数。
     * @returns 原处理结果；异步操作沿用原完成与错误传播约定。
     * @author yahyaoo
     */
    remove(username: string, songId: string, folder: 'cache' | 'music', quality?: string, location?: string) {
        const key = this.getKey(username, folder, location)
        const index = this.indexes.get(key) || this.load(username, folder, location)
        if (quality) {
            if (index.delete(`${songId}_${quality}`)) {
                this.save(username, folder, location)
                return true
            }
        }
        // Legacy or bulk remove by ID
        let deleted = false
        const prefix = `${songId}_`
        for (const k of Array.from(index.keys())) {
            if (k === songId || k.startsWith(prefix)) {
                index.delete(k)
                deleted = true
            }
        }
        if (deleted) this.save(username, folder, location)
        return deleted
    }

    /**
     * 获取 getAll 对应的业务能力，参数和执行顺序保持原实现。
     * @param username 已解析的用户名称。
     * @param folder folder 原业务参数。
     * @param location location 原业务参数。
     * @returns 原处理结果；异步操作沿用原完成与错误传播约定。
     * @author yahyaoo
     */
    getAll(username: string, folder: 'cache' | 'music', location?: string) {
        return Array.from((this.indexes.get(this.getKey(username, folder, location)) || this.load(username, folder, location)).values())
    }

    /**
     * 处理 discard 对应的业务能力，参数和执行顺序保持原实现。
     * @param username 已解析的用户名称。
     * @param folder folder 原业务参数。
     * @param location location 原业务参数。
     * @returns 原处理结果；异步操作沿用原完成与错误传播约定。
     * @author yahyaoo
     */
    discard(username: string, folder: 'cache' | 'music', location?: string) {
        this.indexes.delete(this.getKey(username, folder, location))
    }
}

export const indexManager = new CacheIndexManager()

const COVER_CHECK_VERSION = 4

const getCoverCacheHash = (filename: string, stats?: Stats) => {
    const version = stats ? `${stats.size}:${stats.mtimeMs}` : ''
    return crypto.createHash('md5').update(`${filename}:${version}`).digest('hex')
}

const getCoverCachePaths = (filename: string, username: string, stats?: Stats) => {
    const hash = getCoverCacheHash(filename, stats)
    const coverCacheDir = getCoverCacheDir(username)
    return {
        binPath: path.join(coverCacheDir, `${hash}.bin`),
        mimePath: path.join(coverCacheDir, `${hash}.mime`),
    }
}

const getLegacyCoverCachePaths = (filename: string, username: string, stats?: Stats) => {
    const hash = getCoverCacheHash(filename, stats)
    const userDirName = (username && username !== '_open' && username !== 'default') ? username : '_open'
    const coverCacheDir = path.join(global.lx.dataPath, 'cover_cache', userDirName)
    return {
        binPath: path.join(coverCacheDir, `${hash}.bin`),
        mimePath: path.join(coverCacheDir, `${hash}.mime`),
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

const readCoverCache = (filename: string, username: string, stats?: Stats) => {
    const candidates = [getCoverCachePaths(filename, username, stats), getLegacyCoverCachePaths(filename, username, stats)]
    for (const candidate of candidates) {
        try {
            if (!storageFs.existsSync(candidate.binPath) || !storageFs.existsSync(candidate.mimePath)) continue
            const data = storageFs.readFileSync(candidate.binPath)
            const detectedMime = detectImageMime(data)
            if (!detectedMime) continue
            const storedMime = storageFs.readFileSync(candidate.mimePath, 'utf8').trim()
            const persistent = getCoverCachePaths(filename, username, stats)
            if (candidate.binPath !== persistent.binPath) {
                storageFs.copyFileSync(candidate.binPath, persistent.binPath)
                storageFs.writeFileSync(persistent.mimePath, detectedMime || storedMime || 'image/jpeg')
            }
            return { data, mime: detectedMime || storedMime || 'image/jpeg' }
        } catch (e) { }
    }
    return null
}

const hasCachedCover = (filename: string, username: string, stats?: Stats) => {
    return !!readCoverCache(filename, username, stats)
}

const writeCoverCache = (filename: string, username: string, data: Buffer | Uint8Array, mime: string, stats?: Stats) => {
    const coverData = Buffer.from(data)
    const detectedMime = detectImageMime(coverData)
    if (!detectedMime) return false
    const { binPath, mimePath } = getCoverCachePaths(filename, username, stats)
    storageFs.writeFileSync(binPath, coverData)
    storageFs.writeFileSync(mimePath, detectedMime || mime || 'image/jpeg')
    return true
}

const resolveCacheRelativePath = (dir: string, filename: string) => {
    const root = path.resolve(dir)
    const resolved = path.resolve(root, filename)
    if (resolved !== root && !resolved.startsWith(root + path.sep)) {
        return null
    }
    return resolved
}

const hasValidPictureData = (picture: any) => {
    if (!picture || !picture.data) return false
    try {
        return !!detectImageMime(Buffer.from(picture.data))
    } catch (e) {
        return false
    }
}

const hasValidEmbeddedCover = (pictures: any) => {
    return Array.isArray(pictures) && pictures.some(hasValidPictureData)
}

const isPlaceholderCoverUrl = (url: any) => {
    return typeof url === 'string' && /\/T002R\d+x\d+M000\.jpg(?:$|\?)/.test(url)
}

const hasUsableRemoteCover = (url: any) => typeof url === 'string' && /^https?:\/\//i.test(url) && !isPlaceholderCoverUrl(url)

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
        if (head[0] === 0x7b) return 'encrypted'
        return 'unknown'
    } catch (e) {
        return 'unknown'
    }
}

const getMetadataUnsupportedMessage = (container: string) => (
    container === 'encrypted'
        ? '音频为加密或非标准容器，无法写入封面和歌词标签'
        : '当前音频容器不支持写入封面和歌词标签'
)

/**
 * 获取 getAudioMetadataUnsupportedStatus 对应的业务能力，参数和执行顺序保持原实现。
 * @param filePath 文件或文档定位路径。
 * @returns 原处理结果；异步操作沿用原完成与错误传播约定。
 * @author yahyaoo
 */
export const getAudioMetadataUnsupportedStatus = (filePath: string) => {
    const audioContainer = detectAudioContainer(filePath)
    return {
        audioContainer,
        metadataWritable: false,
        error: getMetadataUnsupportedMessage(audioContainer),
    }
}

const readEmbeddedCoverState = (filePath: string) => {
    let tagger: any
    try {
        tagger = new MusicTagger()
        tagger.loadPath(filePath)
        return hasValidEmbeddedCover(tagger.pictures)
    } catch (e) {
        return false
    } finally {
        try { if (tagger) tagger.dispose() } catch (e) { }
    }
}

/**
 * 处理 embedLyricsIntoFile 对应的业务能力，参数和执行顺序保持原实现。
 * @param filePath 文件或文档定位路径。
 * @param lyricText lyricText 原业务参数。
 * @returns 原处理结果；异步操作沿用原完成与错误传播约定。
 * @author yahyaoo
 */
export const embedLyricsIntoFile = (filePath: string, lyricText: string) => {
    const audioContainer = detectAudioContainer(filePath)
    let tagger: any
    try {
        tagger = new MusicTagger()
        tagger.loadPath(filePath)
        tagger.lyrics = lyricText
        tagger.save()
    } catch (e: any) {
        return {
            success: false,
            hasEmbedLyric: false,
            audioContainer,
            metadataWritable: false,
            error: getMetadataUnsupportedMessage(audioContainer),
        }
    } finally {
        try { if (tagger) tagger.dispose() } catch (e) { }
    }

    let verifyTagger: any
    try {
        verifyTagger = new MusicTagger()
        verifyTagger.loadPath(filePath)
        const embeddedLyrics = verifyTagger.lyrics
        const hasEmbedLyric = !!(embeddedLyrics && embeddedLyrics.trim().length > 10)
        return {
            success: hasEmbedLyric,
            hasEmbedLyric,
            audioContainer,
            metadataWritable: true,
            error: hasEmbedLyric ? undefined : '歌词标签写入后校验失败，已保留外置歌词文件',
        }
    } catch (e: any) {
        return {
            success: false,
            hasEmbedLyric: false,
            audioContainer,
            metadataWritable: false,
            error: getMetadataUnsupportedMessage(audioContainer),
        }
    } finally {
        try { if (verifyTagger) verifyTagger.dispose() } catch (e) { }
    }
}

// Ensure directory exists
const ensureDir = (username?: string, isOnlyDownload?: boolean) => {
    const dir = getCacheDir(username, isOnlyDownload)
    if (!storageFs.existsSync(dir)) {
        storageFs.mkdirSync(dir, { recursive: true })
    }
    return dir
}

// Safe rename: try rename, fall back to copy+unlink if rename fails (cross-device, permissions, etc.)
const safeRenameSync = (src: string, dst: string) => {
    try {
        storageFs.renameSync(src, dst)
        return true
    } catch (err) {
        try {
            storageFs.copyFileSync(src, dst)
            storageFs.unlinkSync(src)
            return true
        } catch (err2) {
            throw err // keep original error context
        }
    }
}

/**
 * 规范化歌曲 ID：确保带上 source 前缀，与索引中的 Key 保持一致
 */
export const normalizeSongId = (songInfo: any): string => {
    let id = String(songInfo.songmid || songInfo.songId || songInfo.id || '')
    const source = songInfo.source || 'unknown'
    if (id && !id.includes('_') && source !== 'unknown') {
        id = `${source}_${id}`
    }
    return id
}

/**
 * 提取 extractSongMetadata 对应的业务能力，参数和执行顺序保持原实现。
 * @param songInfo songInfo 原业务参数。
 * @returns 原处理结果；异步操作沿用原完成与错误传播约定。
 * @author yahyaoo
 */
export const extractSongMetadata = (songInfo: any) => {
    const meta = songInfo.meta || {}
    const id = normalizeSongId(songInfo)
    return {
        id: id,
        name: songInfo.name || meta.songName || 'Unknown',
        singer: songInfo.singer || meta.singerName || 'Unknown',
        album: songInfo.albumName || meta.albumName ||
            (typeof songInfo.album === 'string' ? songInfo.album : songInfo.album?.name) || '',
        albumId: String(songInfo.albumId || meta.albumId || ''),
        img: songInfo.img || meta.picUrl || '',
        interval: songInfo.interval || meta.interval || '',
        source: songInfo.source || 'unknown'
    }
}

/**
 * Detect quality tag from bitrate and file metadata
 */
const detectQualityFromBitrate = (bitrate: number | undefined, ext: string, tagger?: any): LX.Quality => {
    const nativeQuality = String(tagger?.quality || '').toLowerCase()
    const isLossless = ext === '.flac' || ext === '.wav' || ext === '.ape' || nativeQuality === 'sq' || nativeQuality === 'hires'
    const br = bitrate || 0 // Already in kbps from music-tag-native

    if (isLossless) {
        const bitDepth = tagger?.bitDepth || 16
        const sampleRate = tagger?.sampleRate || 44100

        if (br > 4500 || sampleRate > 96000) return 'master' as LX.Quality
        if (br > 1000 || bitDepth > 16 || sampleRate > 48000) return 'flac24bit'
        return 'flac'
    }

    // Lossy formats (mp3, m4a, etc.)
    if (br >= 240) return '320k'
    if (br >= 170) return '192k'
    return '128k'
}

const losslessQualitySet = new Set(['flac', 'flac24bit', 'hires', 'atmos', 'atmos_plus', 'master', 'ape', 'wav'])

const isClearlyLossyAudio = (container: string, tagger?: any) => {
    const nativeQuality = String(tagger?.quality || '').toLowerCase()
    return nativeQuality === 'hq' || container === 'mp3' || container === 'ogg'
}

const resolveInspectedQuality = (requestedQuality: string | undefined, detectedQuality: string, container: string, tagger?: any) => {
    if (isClearlyLossyAudio(container, tagger)) return detectedQuality
    if (requestedQuality && losslessQualitySet.has(requestedQuality)) return requestedQuality
    return detectedQuality
}

const needsQualityCorrection = (quality: string | undefined, container: string) => (
    !!quality && losslessQualitySet.has(quality) && (container === 'mp3' || container === 'ogg')
)

const inspectAudioFile = (filePath: string, requestedQuality?: string) => {
    const audioContainer = detectAudioContainer(filePath)
    const ext = audioContainer === 'unknown' || audioContainer === 'encrypted'
        ? path.extname(filePath).toLowerCase()
        : `.${audioContainer === 'mp4' ? 'm4a' : audioContainer}`
    let tagger: any
    try {
        tagger = new MusicTagger()
        tagger.loadPath(filePath)
        const bitrate = Number(tagger.bitRate) || undefined
        const detectedQuality = detectQualityFromBitrate(bitrate, ext, tagger)
        return {
            audioContainer,
            extension: ext,
            quality: resolveInspectedQuality(requestedQuality, detectedQuality, audioContainer, tagger),
            bitrate,
            sampleRate: Number(tagger.sampleRate) || undefined,
            bitDepth: Number(tagger.bitDepth) || undefined,
        }
    } catch (e) {
        const detectedQuality = detectQualityFromBitrate(undefined, ext)
        return {
            audioContainer,
            extension: ext,
            quality: needsQualityCorrection(requestedQuality, audioContainer) ? detectedQuality : (requestedQuality || detectedQuality),
            bitrate: undefined,
            sampleRate: undefined,
            bitDepth: undefined,
        }
    } finally {
        try { if (tagger) tagger.dispose() } catch (e) { }
    }
}

/**
 * 处理 detectDownloadSource 对应的业务能力，参数和执行顺序保持原实现。
 * @param rawUrl rawUrl 原业务参数。
 * @param fallbackSource fallbackSource 原业务参数。
 * @returns 原处理结果；异步操作沿用原完成与错误传播约定。
 * @author yahyaoo
 */
export const detectDownloadSource = (rawUrl: string, fallbackSource?: string) => {
    let value = String(rawUrl || '').toLowerCase()
    try { value = decodeURIComponent(value) } catch (e) { }

    const sourcePatterns: Array<[string, RegExp]> = [
        ['kw', /(?:^|[./])(?:kuwo\.cn|kuwo\.com)(?:[/:?]|$)/],
        ['wy', /(?:^|[./])(?:music\.126\.net|music\.163\.com|163yun\.com)(?:[/:?]|$)/],
        ['tx', /(?:^|[./])(?:qqmusic\.qq\.com|music\.tc\.qq\.com|stream\.qqmusic\.qq\.com)(?:[/:?]|$)/],
        ['kg', /(?:^|[./])(?:kugou\.com|kugou\.net)(?:[/:?]|$)/],
        ['mg', /(?:^|[./])(?:migu\.cn|miguvideo\.com|cmvideo\.cn)(?:[/:?]|$)/],
    ]
    for (const [source, pattern] of sourcePatterns) {
        if (pattern.test(value)) return source
    }
    return fallbackSource || undefined
}

// Generate consistent filename based on pattern with collision handling
/**
 * 获取 getFileName 对应的业务能力，参数和执行顺序保持原实现。
 * @param songInfo songInfo 原业务参数。
 * @param quality 原音质选择。
 * @param isOnlyDownload isOnlyDownload 原业务参数。
 * @param username 已解析的用户名称。
 * @returns 原处理结果；异步操作沿用原完成与错误传播约定。
 * @author yahyaoo
 */
export const getFileName = (songInfo: any, quality?: string, isOnlyDownload?: boolean, username?: string) => {
    const sanitizeFilename = (str: any) => String(str || '').replace(/[\\/:*?"<>|]/g, '_')

    const id = normalizeSongId(songInfo)
    const source = songInfo.source || 'unknown'
    const q = quality || songInfo.quality || 'unknown'
    const nameStr = sanitizeFilename(songInfo.name || 'Unknown')
    const singerStr = sanitizeFilename(songInfo.singer || 'Unknown')
    const albumValue = songInfo.albumName || songInfo.meta?.albumName ||
        (typeof songInfo.album === 'string' ? songInfo.album : songInfo.album?.name) ||
        'Unknown Album'
    const albumStr = sanitizeFilename(albumValue)

    let baseName = ''
    if (currentNamingPattern === CACHE_NAMING_PATTERNS.SIMPLE) {
        baseName = `${nameStr} - ${singerStr} - ${sanitizeFilename(q)} - ${albumStr}`
    } else if (currentNamingPattern === CACHE_NAMING_PATTERNS.SINGER_NAME_QUALITY_ALBUM) {
        baseName = `${singerStr} - ${nameStr} - ${sanitizeFilename(q)} - ${albumStr}`
    } else if (currentNamingPattern === CACHE_NAMING_PATTERNS.SINGER_NAME) {
        baseName = `${singerStr} - ${nameStr}`
    } else if (currentNamingPattern === CACHE_NAMING_PATTERNS.NAME_SINGER) {
        baseName = `${nameStr} - ${singerStr}`
    } else {
        // Default/Standard: {Name}_-_{Singer}_-_{Source}_-_{ID}_-_{Quality}
        baseName = `${nameStr}_-_${singerStr}_-_${sanitizeFilename(source)}_-_${sanitizeFilename(id)}_-_${sanitizeFilename(q)}`
    }

    // --- Collision Handling ---
    // Only apply suffix logic if we have a username and it's not the standard pattern (which is already unique)
    if (username && currentNamingPattern !== CACHE_NAMING_PATTERNS.STANDARD) {
        const folder: 'cache' | 'music' = isOnlyDownload ? 'music' : 'cache'
        const normalizedUsername = (username && username !== '_open' && username !== 'default') ? username : '_open'
        const existingItems = indexManager.getAll(normalizedUsername, folder)

        const normalizedName = nameStr.toLowerCase()
        const normalizedSinger = singerStr.toLowerCase()
        const normalizedQuality = sanitizeFilename(q).toLowerCase()
        const normalizedAlbum = albumStr.toLowerCase()

        // The album is part of the simple filename, so different album editions do not collide.
        const conflict = existingItems.find(item => {
            // 只要不是同一个文件（ID 不同，或者 ID 相同但音质不同），就有可能冲突
            const isDifferentFile = normalizeSongId(item) !== id || item.quality !== q
            if (!isDifferentFile) return false

            const itemNormalizedName = sanitizeFilename(item.name || 'Unknown').toLowerCase()
            const itemNormalizedSinger = sanitizeFilename(item.singer || 'Unknown').toLowerCase()

            if (currentNamingPattern === CACHE_NAMING_PATTERNS.SINGER_NAME || currentNamingPattern === CACHE_NAMING_PATTERNS.NAME_SINGER) {
                // 对于仅包含“歌手-歌名”的模式，只要歌手和歌名一样，必定产生同名文件冲突
                return itemNormalizedName === normalizedName && itemNormalizedSinger === normalizedSinger
            } else {
                // 对于包含音质和专辑的模式，还要判断这些字段是否也完全相同
                const itemNormalizedQuality = sanitizeFilename(item.quality || 'unknown').toLowerCase()
                const itemNormalizedAlbum = sanitizeFilename(item.album || 'Unknown Album').toLowerCase()
                return itemNormalizedName === normalizedName &&
                    itemNormalizedSinger === normalizedSinger &&
                    itemNormalizedQuality === normalizedQuality &&
                    itemNormalizedAlbum === normalizedAlbum
            }
        })

        if (conflict) {
            // The normalized ID already includes the source prefix when needed.
            baseName += ` (${sanitizeFilename(id || source || 'duplicate')})`
        }
    }

    if (baseName.length > 200) baseName = baseName.substring(0, 200)
    return baseName
}

// Helper to sanitize for URL/Path
const sanitize = (str: any) => String(str || '').replace(/[\\/:*?"<>|]/g, '_')

// --- Public APIs ---

/**
 * 同步 syncCacheIndex 对应的业务能力，参数和执行顺序保持原实现。
 * @param username 已解析的用户名称。
 * @param roots roots 原业务参数。
 * @returns 原处理结果；异步操作沿用原完成与错误传播约定。
 * @author yahyaoo
 */
export const syncCacheIndex = async (username?: string, roots: Array<'cache' | 'music'> = ['cache', 'music']) => {
    const normalizedUsername = (username && username !== '_open' && username !== 'default') ? username : '_open'
    void cleanupStaleTempFiles(normalizedUsername)
    const extensions = ['.mp3', '.flac', '.m4a', '.ogg', '.wav']

    for (const folder of roots) {
        const index = indexManager.load(normalizedUsername, folder)

        let updated = false
        const existingKeysInIndex = new Set(index.keys())
        const foundKeysOnDisk = new Set<string>()

        // Pre-build a filename to Item map within this folder for fast lookup
        const filenameToItemMap = new Map<string, { /**
 * key 字段，沿用原业务结构与空值约定。
 */
key: string, /**
 * item 字段，沿用原业务结构与空值约定。
 */
item: CacheItem }>()
        for (const [key, item] of index.entries()) {
            filenameToItemMap.set(item.filename, { key, item })
        }
        const dir = getCacheDir(normalizedUsername, folder === 'music')
        if (!storageFs.existsSync(dir)) continue

        // [Unified Enhancement] Recursive file walker (asynchronous)
        const getAllFilesAsync = async (dirPath: string, base: string = dirPath): Promise<string[]> => {
            const acc: string[] = []
            try {
                const exists = await storageFs.promises.access(dirPath).then(() => true).catch(() => false)
                if (!exists) return acc
                const entries = await storageFs.promises.readdir(dirPath, { withFileTypes: true })
                for (const entry of entries) {
                    const fullPath = path.join(dirPath, entry.name)
                    if (entry.isDirectory()) {
                        const subFiles = await getAllFilesAsync(fullPath, base)
                        acc.push(...subFiles)
                    } else {
                        acc.push(path.relative(base, fullPath).replace(/\\/g, '/'))
                    }
                }
            } catch (e) {
                console.error(`[文件缓存] 遍历目录失败 (${dirPath}):`, e)
            }
            return acc
        }

        const files = await getAllFilesAsync(dir)
        for (const file of files) {
            if (file === 'cache_index.json' || file === 'music_index.json') continue
            const ext = path.extname(file).toLowerCase()
            if (!extensions.includes(ext)) continue

            const filePath = path.join(dir, file)
            const stats = await storageFs.promises.stat(filePath)

            // Try to find if this file is already known in index by its filename
            let existingEntry = filenameToItemMap.get(file)
            let existing = existingEntry?.item
            let oldKey = existingEntry?.key

            let songId = existing?.id || ''
            let songName = existing?.name || ''
            let singer = existing?.singer || ''
            let source = existing?.source || ''
            let quality = existing?.quality || ''
            let album = existing?.album || ''
            let hasCover = existing?.hasCover || false

            // subPath calculation: the directory part of the relative path
            const subPath = path.dirname(file) === '.' ? '' : path.dirname(file).replace(/\\/g, '/')
            const fileNameOnly = path.basename(file)

            const nameWithoutExt = path.basename(fileNameOnly, ext)

            if (!existing) {
                // 先尝试从标准防碰撞命名格式解析 (Name_-_Singer_-_Source_-_ID_-_Quality)
                const segments = nameWithoutExt.split('_-_')
                if (segments.length >= 5) {
                    songName = segments[0]
                    singer = segments[1]
                    source = segments[2]
                    songId = segments[3]
                    quality = segments[4]
                } else {
                    // 非标准格式（如未关联本地文件 / 简单命名），默认先标记为 local
                    source = 'local'
                    songId = nameWithoutExt
                }
            }

            if (!songId) continue
            // Normalize ID
            const normalizedId = songId.includes('_') ? songId : `${source || 'local'}_${songId}`

            // Always check for companion lyric file
            const lrcFile = file.substring(0, file.length - ext.length) + '.lrc'
            const hasLyricOnDisk = await storageFs.promises.access(path.join(dir, lrcFile)).then(() => true).catch(() => false)

            let finalQuality = quality || 'unknown'

            const needsCoverCheck = !existing ||
                existing.coverCheckedVersion !== COVER_CHECK_VERSION ||
                existing.coverCheckedMtime !== stats.mtimeMs ||
                existing.coverCheckedSize !== stats.size ||
                existing.hasCover === undefined ||
                (existing.coverType === 'cached' && !hasCachedCover(file, normalizedUsername, stats))
            const currentAudioContainer = existing?.audioContainer || detectAudioContainer(filePath)
            const qualityCorrectionNeeded = !!existing && needsQualityCorrection(existing.quality, currentAudioContainer)

            // Update or add to index if anything changed (size, mtime, lyric status, or cover status)
            if (!existing || existing.size !== stats.size || existing.hasLyric !== hasLyricOnDisk || needsCoverCheck || !existing.interval || existing.quality === 'unknown' || !existing.bitrate || qualityCorrectionNeeded) {
                if (existing) {
                    existing.size = stats.size
                    existing.mtime = stats.mtimeMs
                    existing.hasLyric = hasLyricOnDisk
                    existing.lyricFilename = hasLyricOnDisk ? lrcFile : undefined

                    if (existing.subPath !== subPath) {
                        existing.subPath = subPath
                        updated = true
                    }

                    if (needsCoverCheck) {
                        const hasEmbeddedCover = readEmbeddedCoverState(filePath)
                        const hasExternalCover = !hasEmbeddedCover && hasCachedCover(file, normalizedUsername, stats)
                        const coverType: CacheItem['coverType'] = hasEmbeddedCover
                            ? 'embedded'
                            : hasExternalCover
                                ? 'cached'
                                : hasUsableRemoteCover(existing.img)
                                    ? 'remote'
                                    : 'none'
                        const actualHasCover = coverType !== 'none'
                        if (existing.hasCover !== actualHasCover) updated = true
                        existing.hasCover = actualHasCover
                        existing.coverType = coverType
                        existing.coverCheckedVersion = COVER_CHECK_VERSION
                        existing.coverCheckedMtime = stats.mtimeMs
                        existing.coverCheckedSize = stats.size
                    }

                    // If interval or quality/bitrate is missing/unknown, or hasEmbedLyric not yet detected, try to extract it
                    if (!existing.interval || existing.quality === 'unknown' || !existing.bitrate || existing.hasEmbedLyric === undefined || existing.metadataWritable === undefined || qualityCorrectionNeeded) {
                        let tagger: any
                        try {
                            tagger = new MusicTagger()
                            tagger.loadPath(filePath)
                            // 若为 local 未关联文件，元数据优先校准歌名歌手
                            if (existing.source === 'local' || !existing.source) {
                                if (tagger.title) existing.name = tagger.title
                                if (tagger.artist) existing.singer = tagger.artist
                                if (tagger.album) existing.album = tagger.album
                            }
                            const dur = tagger.duration
                            if (dur && !existing.interval) existing.interval = formatPlayTime(dur / 1000)
                            existing.bitrate = tagger.bitRate
                            existing.sampleRate = tagger.sampleRate
                            existing.bitDepth = tagger.bitDepth
                            if (!existing.quality || existing.quality === 'unknown' || qualityCorrectionNeeded) {
                                const detectedQuality = detectQualityFromBitrate(tagger.bitRate, ext, tagger)
                                existing.quality = resolveInspectedQuality(existing.quality, detectedQuality, currentAudioContainer, tagger)
                            }
                            // [新增] 检测是否已嵌入歌词 USLT 标签
                            if (existing.hasEmbedLyric === undefined) {
                                const lyricsInTag = tagger.lyrics
                                existing.hasEmbedLyric = !!(lyricsInTag && lyricsInTag.trim().length > 10)
                            }
                            existing.audioContainer = currentAudioContainer
                            existing.metadataWritable = true
                            existing.metadataError = undefined
                        } catch (e: any) {
                            existing.audioContainer = currentAudioContainer
                            existing.metadataWritable = false
                            existing.metadataError = getMetadataUnsupportedMessage(existing.audioContainer)
                            existing.hasEmbedLyric = false
                        } finally {
                            try { if (tagger) tagger.dispose() } catch (e) { }
                        }
                        updated = true
                    }
                    if (existing.size !== stats.size || existing.hasLyric !== hasLyricOnDisk) updated = true
                    finalQuality = existing.quality
                } else {
                    // (New file logic remains same but uses hasLyricOnDisk)
                    let interval = ''
                    let bitrate: number | undefined
                    let sampleRate: number | undefined
                    let bitDepth: number | undefined
                    let hasEmbedLyric = false
                    let metadataWritable = false
                    let metadataError: string | undefined
                    const audioContainer = detectAudioContainer(filePath)

                    try {
                        const tagger = new MusicTagger()
                        tagger.loadPath(filePath)
                        // ① 优先从 ID3 读取元数据
                        if (tagger.title) songName = tagger.title
                        if (tagger.artist) singer = tagger.artist
                        if (tagger.album) album = tagger.album
                        if (hasValidEmbeddedCover(tagger.pictures)) hasCover = true

                        const dur = tagger.duration
                        interval = dur ? formatPlayTime(dur / 1000) : ''

                        bitrate = tagger.bitRate
                        sampleRate = tagger.sampleRate
                        bitDepth = tagger.bitDepth
                        finalQuality = detectQualityFromBitrate(tagger.bitRate, ext, tagger)

                        // [新增] 检测是否已嵌入歌词 USLT 标签
                        const lyricsInTag = tagger.lyrics
                        hasEmbedLyric = !!(lyricsInTag && lyricsInTag.trim().length > 10)
                        metadataWritable = true

                        tagger.dispose()
                    } catch (e: any) {
                        metadataError = getMetadataUnsupportedMessage(audioContainer)
                    }

                    // ② 若 ID3 元数据缺失，尝试从文件名解析兜底
                    if (!songName || !singer) {
                        const segmentsShort = nameWithoutExt.split(' - ')
                        if (segmentsShort.length >= 2) {
                            if (!songName) songName = segmentsShort[0]
                            if (!singer) singer = segmentsShort[1]
                            if (!album && segmentsShort.length > 3) album = segmentsShort.slice(3).join(' - ')
                        }
                    }

                    const hasExternalCover = !hasCover && hasCachedCover(file, normalizedUsername, stats)
                    if (hasExternalCover) hasCover = true
                    const coverType: CacheItem['coverType'] = hasCover && !hasExternalCover
                        ? 'embedded'
                        : hasExternalCover
                            ? 'cached'
                            : 'none'
                    hasCover = coverType !== 'none'

                    const item: CacheItem = {
                        id: normalizedId,
                        songmid: normalizedId,
                        name: songName || nameWithoutExt || 'Unknown',
                        singer: singer || 'Unknown',
                        album: album || '',
                        albumId: '',
                        img: '',
                        interval: interval,
                        source: source || 'local',
                        quality: finalQuality as any,
                        filename: file,
                        folder: folder as any,
                        subPath,
                        mtime: stats.mtimeMs,
                        size: stats.size,
                        lyricFilename: hasLyricOnDisk ? lrcFile : undefined,
                        ext: ext.replace('.', ''),
                        hasCover: hasCover,
                        coverType,
                        hasLyric: hasLyricOnDisk,
                        hasEmbedLyric,
                        audioContainer,
                        metadataWritable,
                        metadataError,
                        coverCheckedVersion: COVER_CHECK_VERSION,
                        coverCheckedMtime: stats.mtimeMs,
                        coverCheckedSize: stats.size,
                        bitrate: bitrate,
                        sampleRate: sampleRate,
                        bitDepth: bitDepth
                    }
                    existing = item
                }
                updated = true
            }

            const compositeKey = `${normalizedId}_${finalQuality || 'unknown'}`
            foundKeysOnDisk.add(compositeKey)

            if (oldKey && oldKey !== compositeKey) {
                index.delete(oldKey)
                index.set(compositeKey, existing!)
                updated = true
            } else if (!oldKey) {
                index.set(compositeKey, existing!)
            }

            // Yield control back to Node.js event loop
            await new Promise(resolve => setImmediate(resolve))
        }

        // Remove deleted files from index
        for (const key of existingKeysInIndex) {
            if (!foundKeysOnDisk.has(key)) {
                index.delete(key)
                updated = true
            }
        }

        if (updated) {
            indexManager.save(normalizedUsername, folder)
        }
    }

    const syncKey = `${currentCacheLocation}:${normalizedUsername}`
    const syncState = cacheListSyncState.get(syncKey) || { lastSync: 0 }
    syncState.lastSync = Date.now()
    cacheListSyncState.set(syncKey, syncState)
}

/**
 * 获取 getCacheList 对应的业务能力，参数和执行顺序保持原实现。
 * @param username 已解析的用户名称。
 * @returns 原处理结果；异步操作沿用原完成与错误传播约定。
 * @author yahyaoo
 */
export const getCacheList = async (username?: string) => {
    const normalizedUsername = (username && username !== '_open' && username !== 'default') ? username : '_open'

    // Keep indexed metadata aligned with disk. This also repairs stale hasCover values
    // from older indexes where the cover endpoint may already return 404.
    const cacheDir = getCacheDir(normalizedUsername, false)
    const musicDir = getCacheDir(normalizedUsername, true)
    const hasCacheIndex = storageFs.existsSync(path.join(cacheDir, 'cache_index.json'))
    const hasMusicIndex = storageFs.existsSync(path.join(musicDir, 'music_index.json'))

    const syncKey = `${currentCacheLocation}:${normalizedUsername}`
    const syncState = cacheListSyncState.get(syncKey) || { lastSync: 0 }
    const mustSync = !hasCacheIndex || !hasMusicIndex
    const shouldSync = mustSync || Date.now() - syncState.lastSync > CACHE_LIST_SYNC_TTL

    if (shouldSync) {
        if (!syncState.pending) {
            syncState.pending = syncCacheIndex(normalizedUsername)
                .then(() => { syncState.lastSync = Date.now() })
                .finally(() => { syncState.pending = undefined })
            cacheListSyncState.set(syncKey, syncState)
        }
        await syncState.pending
    }

    const cacheItems = indexManager.getAll(normalizedUsername, 'cache')
    const musicItems = indexManager.getAll(normalizedUsername, 'music')
    const items = [...cacheItems, ...musicItems]

    return items.map(item => ({
        ...item,
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
            type: item.quality, // Compatibility
            types: {} // To be filled if needed
        },
        hasLyric: item.hasLyric || !!item.lyricFilename
    }))
}

/**
 * 处理 batchRenameCacheFiles 对应的业务能力，参数和执行顺序保持原实现。
 * @param username 已解析的用户名称。
 * @returns 原处理结果；异步操作沿用原完成与错误传播约定。
 * @author yahyaoo
 */
export const batchRenameCacheFiles = async (username: string | undefined) => {
    const normalizedUsername = (username && username !== '_open' && username !== 'default') ? username : '_open'
    const folders: Array<'cache' | 'music'> = ['cache', 'music']

    let successCount = 0
    let failCount = 0
    let skipCount = 0

    for (const folder of folders) {
        const index = indexManager.load(normalizedUsername, folder)
        const items = Array.from(index.values())
        let folderUpdated = false

        for (const item of items) {
            const songInfo = {
                id: item.id,
                songmid: item.songmid || item.id,
                name: item.name,
                singer: item.singer,
                source: item.source,
                quality: item.quality,
                albumName: item.album,
                albumId: item.albumId,
                img: item.img,
                interval: item.interval
            }

            const newBaseName = getFileName(songInfo, item.quality, folder === 'music', normalizedUsername)
            const newFilename = `${newBaseName}.${item.ext}`

            if (newFilename === item.filename) {
                skipCount++
                continue
            }

            const dir = getCacheDir(normalizedUsername, folder === 'music')
            const oldPath = path.join(dir, item.filename)
            const newPath = path.join(dir, newFilename)

            try {
                if (storageFs.existsSync(oldPath)) {
                    if (!storageFs.existsSync(newPath)) {
                        const oldStats = storageFs.statSync(oldPath)
                        const externalCover = readCoverCache(item.filename, normalizedUsername, oldStats)
                        storageFs.renameSync(oldPath, newPath)

                        if (item.lyricFilename) {
                            const oldLrcPath = path.join(dir, item.lyricFilename)
                            const newLrcFilename = `${newBaseName}.lrc`
                            const newLrcPath = path.join(dir, newLrcFilename)
                            if (storageFs.existsSync(oldLrcPath)) {
                                storageFs.renameSync(oldLrcPath, newLrcPath)
                                item.lyricFilename = newLrcFilename
                            }
                        }

                        item.filename = newFilename
                        if (externalCover) {
                            writeCoverCache(newFilename, normalizedUsername, externalCover.data, externalCover.mime, storageFs.statSync(newPath))
                            item.coverType = 'cached'
                            item.hasCover = true
                        }
                        successCount++
                        folderUpdated = true
                    } else {
                        failCount++
                    }
                } else {
                    failCount++
                }
            } catch (e) {
                console.error(`[文件缓存] 批量重命名文件失败 (${folder}/${item.filename}):`, e)
                failCount++
            }
        }

        if (folderUpdated) {
            indexManager.save(normalizedUsername, folder)
        }
    }

    return { success: true, successCount, failCount, skipCount }
}

/**
 * 处理 batchUpdateMetadata 对应的业务能力，参数和执行顺序保持原实现。
 * @param filenames filenames 原业务参数。
 * @param username 已解析的用户名称。
 * @returns 原处理结果；异步操作沿用原完成与错误传播约定。
 * @author yahyaoo
 */
export const batchUpdateMetadata = async (filenames: string[], username: string | undefined) => {
    const normalizedUsername = (username && username !== '_open' && username !== 'default') ? username : '_open'
    let successCount = 0
    let failCount = 0

    const allItems = [
        ...indexManager.getAll(normalizedUsername, 'cache'),
        ...indexManager.getAll(normalizedUsername, 'music')
    ]

    for (const filename of filenames) {
        const item = allItems.find(i => i.filename === filename)
        if (!item) {
            failCount++
            continue
        }

        const dir = getCacheDir(normalizedUsername, item.folder === 'music')
        const filePath = path.join(dir, item.filename)

        if (!storageFs.existsSync(filePath)) {
            failCount++
            continue
        }

        try {
            let imageBuffer: Buffer | undefined
            let imageMime = 'image/jpeg'
            const imageUrl = item.img
            if (imageUrl && imageUrl.startsWith('http') && !isPlaceholderCoverUrl(imageUrl)) {
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
            let taggerError: any
            try {
                tagger = new MusicTagger()
                tagger.loadPath(filePath)
                tagger.title = item.name || 'Unknown'
                tagger.artist = item.singer || 'Unknown'
                if (item.album) tagger.album = item.album
                if (imageBuffer && imageBuffer.length > 0) {
                    tagger.pictures = [new MetaPicture(imageMime, new Uint8Array(imageBuffer), 'Cover')]
                }
                tagger.save()
            } catch (e) {
                taggerError = e
            } finally {
                try { if (tagger) tagger.dispose() } catch (e) { }
            }

            const stats = storageFs.statSync(filePath)
            const hasEmbeddedCover = readEmbeddedCoverState(filePath)
            let hasCover = hasEmbeddedCover || hasCachedCover(item.filename, normalizedUsername, stats)
            if (!hasCover && imageBuffer?.length) {
                hasCover = writeCoverCache(item.filename, normalizedUsername, imageBuffer, imageMime, stats)
                if (taggerError) {
                    console.warn(`[文件缓存] 无法向音频写入标签信息 (${filename})，已转存为外置封面缓存`)
                }
            }
            if (taggerError && !hasCover) throw taggerError
            item.hasCover = hasCover
            item.coverType = hasEmbeddedCover ? 'embedded' : hasCover ? 'cached' : hasUsableRemoteCover(item.img) ? 'remote' : 'none'
            item.metadataWritable = !taggerError
            item.audioContainer = detectAudioContainer(filePath)
            item.metadataError = taggerError ? getMetadataUnsupportedMessage(item.audioContainer) : undefined
            item.coverCheckedVersion = COVER_CHECK_VERSION
            item.coverCheckedMtime = stats.mtimeMs
            item.coverCheckedSize = stats.size
            item.mtime = stats.mtimeMs
            item.size = stats.size

            indexManager.update(normalizedUsername, item, item.folder as 'cache' | 'music')
            successCount++
        } catch (e) {
            console.error(`[文件缓存] 更新元数据标签失败 (${filename}):`, e)
            failCount++
        }
    }

    return { successCount, failCount }
}

/**
 * 处理 linkLocalFile 对应的业务能力，参数和执行顺序保持原实现。
 * @param oldFilename oldFilename 原业务参数。
 * @param songInfo songInfo 原业务参数。
 * @param username 已解析的用户名称。
 * @returns 原处理结果；异步操作沿用原完成与错误传播约定。
 * @author yahyaoo
 */
export const linkLocalFile = async (oldFilename: string, songInfo: any, username: string | undefined) => {
    const normalizedUsername = (username && username !== '_open' && username !== 'default') ? username : '_open'

    // Find the item in all possible folders
    const allItems = [
        ...indexManager.getAll(normalizedUsername, 'cache'),
        ...indexManager.getAll(normalizedUsername, 'music')
    ]
    const item = allItems.find(i => i.filename === oldFilename)
    if (!item) throw new Error('File not found in index')

    const folder = item.folder as 'cache' | 'music'
    const dir = getCacheDir(normalizedUsername, folder === 'music')
    const oldPath = path.join(dir, item.filename)
    if (!storageFs.existsSync(oldPath)) throw new Error('Physical file not found')

    // Prepare new metadata from songInfo
    const metadata = extractSongMetadata(songInfo)
    const newId = metadata.id
    const quality = item.quality || 'unknown'
    const ext = item.ext ? `.${item.ext}` : path.extname(oldFilename)

    // Generate new filename based on pattern (preserving subPath)
    const newBaseName = getFileName(songInfo, quality, folder === 'music', normalizedUsername)
    const subPath = item.subPath || ''
    const newFilename = subPath ? path.join(subPath, newBaseName + ext).replace(/\\/g, '/') : newBaseName + ext
    const newPath = path.join(dir, newFilename)

    // Check collision
    if (newFilename !== oldFilename && storageFs.existsSync(newPath)) {
        throw new Error('Target filename already exists on disk')
    }

    // 1. Rename physical file
    if (newFilename !== oldFilename) {
        storageFs.renameSync(oldPath, newPath)
        // Also rename lyrics if exists
        if (item.lyricFilename) {
            const oldLrcPath = path.join(dir, item.lyricFilename)
            const newLrcFilename = subPath ? path.join(subPath, newBaseName + '.lrc').replace(/\\/g, '/') : newBaseName + '.lrc'
            const newLrcPath = path.join(dir, newLrcFilename)
            if (storageFs.existsSync(oldLrcPath)) {
                storageFs.renameSync(oldLrcPath, newLrcPath)
                item.lyricFilename = newLrcFilename
            }
        }
    }

    // 2. Update Index
    // Remove old entry (keyed by old ID and quality)
    indexManager.remove(normalizedUsername, item.id, folder, item.quality)

    // Update item properties
    item.id = newId
    item.songmid = newId
    item.name = metadata.name
    item.singer = metadata.singer
    item.album = metadata.album
    item.albumId = metadata.albumId
    item.img = metadata.img
    item.source = metadata.source
    item.filename = newFilename
    item.mtime = Date.now()

    // Add back to index with new identity
    indexManager.update(normalizedUsername, item, folder)

    // 3. Post-link processing: Update ID3 tags and cover
    await batchUpdateMetadata([newFilename], normalizedUsername)

    return {
        success: true,
        filename: newFilename,
        id: newId,
        metadata
    }
}


const downloadCoverImage = async (imageUrl: string, redirects = 0): Promise<{ /**
 * data 字段，沿用原业务结构与空值约定。
 */
data: Buffer; /**
 * mime 字段，沿用原业务结构与空值约定。
 */
mime: string } | null> => {
    if (!hasUsableRemoteCover(imageUrl) || redirects > 3) return null
    return await new Promise((resolve) => {
        const client = imageUrl.startsWith('https:') ? https : http
        const req = client.get(imageUrl, response => {
            const statusCode = response.statusCode || 500
            if (statusCode >= 300 && statusCode < 400 && response.headers.location) {
                response.resume()
                const redirectedUrl = new URL(response.headers.location, imageUrl).toString()
                void downloadCoverImage(redirectedUrl, redirects + 1).then(resolve)
                return
            }
            if (statusCode >= 400) {
                response.resume()
                resolve(null)
                return
            }
            const chunks: Buffer[] = []
            let received = 0
            response.on('data', chunk => {
                const buffer = Buffer.from(chunk)
                received += buffer.length
                if (received <= 20 * 1024 * 1024) chunks.push(buffer)
            })
            response.on('end', () => {
                if (received > 20 * 1024 * 1024) {
                    resolve(null)
                    return
                }
                const data = Buffer.concat(chunks)
                const mime = detectImageMime(data)
                resolve(mime ? { data, mime } : null)
            })
            response.on('error', () => resolve(null))
        })
        req.on('error', () => resolve(null))
        req.setTimeout(10000, () => {
            req.destroy()
            resolve(null)
        })
    })
}

const setIndexCoverState = (filename: string, username: string, coverType: CacheItem['coverType'], stats?: Stats, location?: string) => {
    for (const folder of ['cache', 'music'] as const) {
        const item = indexManager.getAll(username, folder, location).find(candidate => candidate.filename === filename)
        if (!item) continue
        item.coverType = coverType
        item.hasCover = coverType !== 'none'
        item.coverCheckedVersion = COVER_CHECK_VERSION
        if (stats) {
            item.coverCheckedMtime = stats.mtimeMs
            item.coverCheckedSize = stats.size
        }
        indexManager.save(username, folder, location)
        return item
    }
    return null
}

/**
 * 获取 getCacheCover 对应的业务能力，参数和执行顺序保持原实现。
 * @param filename 文件或文档定位路径。
 * @param username 已解析的用户名称。
 * @returns 原处理结果；异步操作沿用原完成与错误传播约定。
 * @author yahyaoo
 */
export const getCacheCover = async (filename: string, username?: string) => {
    const normalizedUsername = (username && username !== '_open' && username !== 'default') ? username : '_open'

    const locations = [
        currentCacheLocation,
        currentCacheLocation === CACHE_ROOTS.DATA ? CACHE_ROOTS.ROOT : CACHE_ROOTS.DATA
    ]
    const roots: Array<'cache' | 'music'> = ['cache', 'music']

    for (const loc of locations) {
        for (const folder of roots) {
            const dir = getCacheDir(normalizedUsername, folder === 'music', loc)
            const filePath = resolveCacheRelativePath(dir, filename) // [Fix] Allow subfolders safely

            if (filePath && storageFs.existsSync(filePath)) {
                let stats: Stats | undefined
                try {
                    stats = storageFs.statSync(filePath)
                    const cachedCover = readCoverCache(filename, normalizedUsername, stats)
                    if (cachedCover) {
                        setIndexCoverState(filename, normalizedUsername, 'cached', stats, loc)
                        return cachedCover
                    }
                } catch (e) {
                    console.error(`[文件缓存] 读取封面缓存失败 (${filename}):`, e)
                }

                let tagger: any
                try {
                    tagger = new MusicTagger()
                    tagger.loadPath(filePath)
                    const pics = tagger.pictures
                    const pic = Array.isArray(pics) ? pics.find(hasValidPictureData) : null
                    if (pic) {
                        const mime = pic.mimeType || 'image/jpeg'
                        const data = Buffer.from(pic.data)
                        writeCoverCache(filename, normalizedUsername, data, mime, stats)
                        setIndexCoverState(filename, normalizedUsername, 'embedded', stats, loc)
                        return { data, mime: detectImageMime(data) || mime }
                    }
                } catch (e) {
                    // console.error(`[文件缓存] 读取音频内嵌封面标签失败 (${filename}):`, e)
                } finally {
                    try { if (tagger) tagger.dispose() } catch (e) { }
                }

                const item = [...indexManager.getAll(normalizedUsername, 'cache', loc), ...indexManager.getAll(normalizedUsername, 'music', loc)]
                    .find(candidate => candidate.filename === filename)
                if (item && hasUsableRemoteCover(item.img)) {
                    const remoteCover = await downloadCoverImage(item.img!)
                    if (remoteCover && writeCoverCache(filename, normalizedUsername, remoteCover.data, remoteCover.mime, stats)) {
                        setIndexCoverState(filename, normalizedUsername, 'cached', stats, loc)
                        return remoteCover
                    }
                }

                setIndexCoverState(filename, normalizedUsername, 'none', stats, loc)
            }
        }
    }
    return null
}

/**
 * 递归安全清理空文件夹（不会删除根目录 baseDir）
 */
export const cleanEmptyParentDirs = (filePath: string, baseDir: string) => {
    try {
        const resolvedBase = path.resolve(baseDir)
        let currentDir = path.resolve(path.dirname(filePath))

        while (currentDir !== resolvedBase && currentDir.startsWith(resolvedBase + path.sep)) {
            if (storageFs.existsSync(currentDir)) {
                const entries = storageFs.readdirSync(currentDir)
                if (entries.length === 0) {
                    try {
                        storageFs.rmdirSync(currentDir)
                        if (global.lx?.config?.['debug.enabled']) {
                            console.log(`[文件缓存] [Debug] 已清理空歌单目录: ${currentDir}`)
                        }
                    } catch (rmErr) {
                        break
                    }
                } else {
                    // 当前目录非空，无需继续向上清理
                    break
                }
            } else {
                break
            }
            currentDir = path.dirname(currentDir)
        }
    } catch (e) {
        if (global.lx?.config?.['debug.enabled']) {
            console.warn(`[文件缓存] [Debug] 清理空目录失败:`, e)
        }
    }
}

/**
 * 移除 removeCacheFile 对应的业务能力，参数和执行顺序保持原实现。
 * @param filename 文件或文档定位路径。
 * @param username 已解析的用户名称。
 * @param requestedFolder requestedFolder 原业务参数。
 * @returns 原处理结果；异步操作沿用原完成与错误传播约定。
 * @author yahyaoo
 */
export const removeCacheFile = (filename: string, username?: string, requestedFolder?: CacheFolder): RemoveCacheFileResult => {
    if (!filename || typeof filename !== 'string') throw new Error('Invalid filename')
    if (requestedFolder && requestedFolder !== 'cache' && requestedFolder !== 'music') throw new Error('Invalid folder')

    const normalizedUsername = (username && username !== '_open' && username !== 'default') ? username : '_open'
    const candidateFolders: CacheFolder[] = requestedFolder ? [requestedFolder] : ['cache', 'music']
    const matches = candidateFolders.map(folder => {
        const dir = getCacheDir(normalizedUsername, folder === 'music')
        const filePath = resolveCacheRelativePath(dir, filename)
        return filePath && storageFs.existsSync(filePath) ? { folder, dir, filePath } : null
    }).filter((entry): entry is { /**
 * folder 字段，沿用原业务结构与空值约定。
 */
folder: CacheFolder; /**
 * dir 字段，沿用原业务结构与空值约定。
 */
dir: string; /**
 * filePath 字段，沿用原业务结构与空值约定。
 */
filePath: string } => entry !== null)

    // Older clients only sent a filename. Keep that format safe when the file has
    // a unique location, but never guess if cache and download both contain it.
    if (!requestedFolder && matches.length > 1) {
        throw new Error(`Ambiguous file location for ${filename}; folder is required`)
    }
    if (matches.length === 0) return { deleted: false }

    const { folder, dir, filePath } = matches[0]
    let coverCacheHash = ''
    try {
        coverCacheHash = getCoverCacheHash(filename, storageFs.statSync(filePath))
    } catch (e) { }

    try {
        storageFs.unlinkSync(filePath)
    } catch (e: any) {
        if (e?.code !== 'ENOENT') throw e
    }
    const folderName = folder === 'music' ? '下载目录(music)' : '缓存目录(cache)'
    console.log(`[文件缓存] 已从 ${folderName} 删除: ${filename}`)

    const ext = path.extname(filename)
    if (ext !== '.lrc') {
        const baseWithoutExt = filename.substring(0, filename.length - ext.length)
        const lrcPath = resolveCacheRelativePath(dir, baseWithoutExt + '.lrc')
        if (lrcPath && storageFs.existsSync(lrcPath)) {
            try {
                storageFs.unlinkSync(lrcPath)
            } catch (e: any) {
                if (e?.code !== 'ENOENT') throw e
            }
        }
    }

    // 删除音频与歌词后，清理可能变空的父级歌单分类目录
    cleanEmptyParentDirs(filePath, dir)

    const items = indexManager.getAll(normalizedUsername, folder)
    const item = items.find(i => i.filename === filename)
    if (item) indexManager.remove(normalizedUsername, item.id, folder, item.quality)

    // Cover cache is shared by filename. Preserve it while the same relative file
    // still exists in the other root so deleting cache does not affect downloads.
    const otherFolder: CacheFolder = folder === 'cache' ? 'music' : 'cache'
    const otherDir = getCacheDir(normalizedUsername, otherFolder === 'music')
    const otherPath = resolveCacheRelativePath(otherDir, filename)
    const hasCounterpart = !!otherPath && storageFs.existsSync(otherPath)
    if (!hasCounterpart) {
        try {
            const coverCacheDir = getCoverCacheDir(normalizedUsername)
            const hashes = [coverCacheHash, crypto.createHash('md5').update(filename).digest('hex')].filter(Boolean)
            for (const hash of hashes) {
                const binPath = path.join(coverCacheDir, `${hash}.bin`)
                const mimePath = path.join(coverCacheDir, `${hash}.mime`)
                if (storageFs.existsSync(binPath)) storageFs.unlinkSync(binPath)
                if (storageFs.existsSync(mimePath)) storageFs.unlinkSync(mimePath)
            }
        } catch (e) { }
    }

    return { deleted: true, folder }
}

/**
 * 设置 setCacheLocation 对应的业务能力，参数和执行顺序保持原实现。
 * @param location location 原业务参数。
 * @returns 原处理结果；异步操作沿用原完成与错误传播约定。
 * @author yahyaoo
 */
export const setCacheLocation = (location: string) => {
    if (location === CACHE_ROOTS.DATA || location === CACHE_ROOTS.ROOT || path.isAbsolute(location)) {
        currentCacheLocation = location
        console.log(`[文件缓存] 基础缓存根路径设置为: ${location}`)
    }
}

/**
 * 获取 getCacheLocation 对应的业务能力，参数和执行顺序保持原实现。
 * @returns 原处理结果；异步操作沿用原完成与错误传播约定。
 * @author yahyaoo
 */
export const getCacheLocation = () => currentCacheLocation

/**
 * 检查 checkCache 对应的业务能力，参数和执行顺序保持原实现。
 * @param songInfo songInfo 原业务参数。
 * @param username 已解析的用户名称。
 * @param isLyricCheck isLyricCheck 原业务参数。
 * @returns 原处理结果；异步操作沿用原完成与错误传播约定。
 * @author yahyaoo
 */
export const checkCache = (songInfo: any, username?: string, isLyricCheck: boolean = false) => {
    try {
        const id = normalizeSongId(songInfo)
        const quality = songInfo.quality || 'unknown'
        const normalizedUsername = (username && username !== '_open' && username !== 'default') ? username : '_open'

        // 1. Search by exact ID and Quality (Primary Check)
        // exactQuality=true 时：精确匹配，不允许 fallback 到不同音质
        const useExact = !!songInfo.exactQuality
        const folderTypes: Array<'cache' | 'music'> = ['cache', 'music']
        for (const folder of folderTypes) {
            const cached = indexManager.get(normalizedUsername, id, folder, quality, useExact)
            if (cached) {
                // 二次校验：exactQuality 模式下确保音质匹配
                if (useExact && quality && cached.quality !== quality) continue
                const dir = getCacheDir(normalizedUsername, folder === 'music')
                const fileName = isLyricCheck ? cached.lyricFilename : cached.filename
                if (!fileName) continue
                const filePath = path.join(dir, fileName)
                if (storageFs.existsSync(filePath)) {
                    return {
                        exists: true,
                        path: filePath,
                        filename: fileName,
                        foundIn: normalizedUsername,
                        quality: cached.quality,
                        folder: folder,
                        url: `/api/music/cache/file/${encodeURIComponent(normalizedUsername)}/${encodeURIComponent(fileName)}?folder=${folder}`
                    }
                } else {
                    // Stale index entry, cleanup
                    if (!isLyricCheck) indexManager.remove(normalizedUsername, id, folder, cached.quality)
                }
            }
        }

        // 2. Search for Naming Collisions (Same Name + Singer + Quality, but different ID)
        const allItems = [
            ...indexManager.getAll(normalizedUsername, 'cache'),
            ...indexManager.getAll(normalizedUsername, 'music')
        ]

        const collision = allItems.find(item =>
            item.id !== id && // 排除当前正在查询的 ID 本身
            item.name.toLowerCase() === String(songInfo.name || '').toLowerCase() &&
            item.singer.toLowerCase() === String(songInfo.singer || '').toLowerCase() &&
            item.quality === quality &&
            (!isLyricCheck || item.hasLyric)
        )

        if (collision) {
            return {
                exists: true,
                isCollision: true,
                collisionSource: collision.source,
                collisionSongmid: collision.songmid,
                filename: isLyricCheck ? collision.lyricFilename : collision.filename,
                quality: collision.quality,
                foundIn: normalizedUsername,
                folder: collision.folder
            }
        }

        // 3. Fallback for non-exact (only if requested)
        if (!songInfo.exactQuality && !isLyricCheck) {
            const folderTypes: Array<'cache' | 'music'> = ['cache', 'music']
            for (const folder of folderTypes) {
                const cachedAny = indexManager.get(normalizedUsername, id, folder)
                if (cachedAny) {
                    const dir = getCacheDir(normalizedUsername, folder === 'music')
                    const fileName = cachedAny.filename
                    const filePath = path.join(dir, fileName)
                    if (storageFs.existsSync(filePath)) {
                        return {
                            exists: true,
                            path: filePath,
                            filename: fileName,
                            foundIn: normalizedUsername,
                            quality: cachedAny.quality,
                            folder: folder,
                            url: `/api/music/cache/file/${encodeURIComponent(normalizedUsername)}/${encodeURIComponent(fileName)}?folder=${folder}`
                        }
                    }
                }
            }
        }

    } catch (e) {
        console.error('[文件缓存] 检查缓存状态异常:', e)
    }

    return { exists: false }
}

/**
 * 检查 checkLyricCache 对应的业务能力，参数和执行顺序保持原实现。
 * @param songInfo songInfo 原业务参数。
 * @param username 已解析的用户名称。
 * @returns 原处理结果；异步操作沿用原完成与错误传播约定。
 * @author yahyaoo
 */
export const checkLyricCache = (songInfo: any, username?: string) => {
    const id = normalizeSongId(songInfo)
    const normalizedUsername = (username && username !== '_open' && username !== 'default') ? username : '_open'

    // Check index first
    const folderTypes: Array<'cache' | 'music'> = ['cache', 'music']
    for (const folder of folderTypes) {
        const cached = indexManager.get(normalizedUsername, id, folder, songInfo.quality)
        if (cached && cached.hasLyric && cached.lyricFilename) {
            const dir = getCacheDir(normalizedUsername, folder === 'music')
            const lrcPath = path.join(dir, cached.lyricFilename)
            if (storageFs.existsSync(lrcPath)) {
                return {
                    exists: true,
                    path: lrcPath,
                    content: parseLyrics(storageFs.readFileSync(lrcPath, 'utf-8')),
                    filename: cached.lyricFilename
                }
            }
        }
    }

    // [Fix] Index-based name+singer fallback for the simple naming pattern
    // When the lrc filename does not contain a song ID, match by name + singer from the index
    if (songInfo.name && songInfo.singer) {
        const targetName = String(songInfo.name).toLowerCase()
        const targetSinger = String(songInfo.singer).toLowerCase()
        for (const folder of folderTypes) {
            const allItems = indexManager.getAll(normalizedUsername, folder)
            const matched = allItems.find(item =>
                item.hasLyric &&
                item.lyricFilename &&
                item.name.toLowerCase() === targetName &&
                item.singer.toLowerCase() === targetSinger
            )
            if (matched && matched.lyricFilename) {
                const dir = getCacheDir(normalizedUsername, folder === 'music')
                const lrcPath = path.join(dir, matched.lyricFilename)
                if (storageFs.existsSync(lrcPath)) {
                    return {
                        exists: true,
                        path: lrcPath,
                        content: parseLyrics(storageFs.readFileSync(lrcPath, 'utf-8')),
                        filename: matched.lyricFilename
                    }
                }
            }
        }
    }

    // Physical scan fallback (for standard naming pattern: Name_-_Singer_-_Source_-_ID_-_Quality)
    const roots = ['cache', 'music']
    const basePaths = roots.map(folder => getCacheDir(normalizedUsername, folder === 'music'))

    // [Fix] Recursively search for lyrics if not in index
    const getAllLrcFiles = (dirPath: string, acc: string[] = []) => {
        if (!storageFs.existsSync(dirPath)) return acc
        const entries = storageFs.readdirSync(dirPath, { withFileTypes: true })
        for (const entry of entries) {
            const fullPath = path.join(dirPath, entry.name)
            if (entry.isDirectory()) {
                getAllLrcFiles(fullPath, acc)
            } else if (entry.name.endsWith('.lrc')) {
                acc.push(fullPath)
            }
        }
        return acc
    }

    const cleanId = (sid: string) => String(sid || '').replace(/^(tx|mg|wy|kg|kw|bd|mg)_/, '')
    const targetCleanId = cleanId(id)

    for (const dirPath of basePaths) {
        const lrcFiles = getAllLrcFiles(dirPath)
        for (const filePath of lrcFiles) {
            const file = path.basename(filePath)
            const fileNameWithoutExt = file.substring(0, file.lastIndexOf('.'))
            const segments = fileNameWithoutExt.split('_-_')
            if (segments.length >= 2) {
                const fileId = segments[segments.length - 2]
                const fileCleanId = cleanId(fileId)
                if (fileId === id || fileCleanId === id || fileId === targetCleanId || fileCleanId === targetCleanId) {
                    return {
                        exists: true,
                        path: filePath,
                        content: parseLyrics(storageFs.readFileSync(filePath, 'utf-8')),
                        filename: path.relative(dirPath, filePath).replace(/\\/g, '/')
                    }
                }
            }
        }
    }

    return { exists: false }
}

/**
 * 保存 saveLyricCache 对应的业务能力，参数和执行顺序保持原实现。
 * @param songInfo songInfo 原业务参数。
 * @param lyricsObj lyricsObj 原业务参数。
 * @param username 已解析的用户名称。
 * @param isOnlyDownload isOnlyDownload 原业务参数。
 * @returns 原处理结果；异步操作沿用原完成与错误传播约定。
 * @author yahyaoo
 */
export const saveLyricCache = (songInfo: any, lyricsObj: any, username?: string, isOnlyDownload?: boolean) => {
    try {
        let baseName: string
        let quality = songInfo.quality || 'unknown'
        let dir: string

        const normalizedUsername = (username && username !== '_open' && username !== 'default') ? username : '_open'
        const id = normalizeSongId(songInfo)
        const preferredFolders: Array<'cache' | 'music'> = isOnlyDownload ? ['music', 'cache'] : ['cache', 'music']
        let audioResult: any = { exists: false }
        for (const folder of preferredFolders) {
            const cached = indexManager.get(normalizedUsername, id, folder, songInfo.quality, false)
            if (!cached?.filename) continue
            const root = getCacheDir(normalizedUsername, folder === 'music')
            const filePath = path.join(root, cached.filename)
            if (storageFs.existsSync(filePath)) {
                audioResult = {
                    exists: true,
                    path: filePath,
                    quality: cached.quality,
                    folder,
                    filename: cached.filename
                }
                break
            }
        }

        if (audioResult.exists && audioResult.path) {
            // If audio exists, save lyric in the same folder
            dir = path.dirname(audioResult.path)
            quality = audioResult.quality || quality
            baseName = path.basename(audioResult.path, path.extname(audioResult.path))
        } else {
            // Audio not found, fallback to target dir
            dir = ensureDir(username, isOnlyDownload)
            if (songInfo.quality) {
                baseName = getFileName(songInfo, songInfo.quality, isOnlyDownload, username)
            } else {
                baseName = getFileName(songInfo, 'unknown', isOnlyDownload, username)
            }
        }

        const lyricFile = baseName + '.lrc'
        const finalPath = path.join(dir, lyricFile)

        const formattedLrc = buildLyrics(lyricsObj)
        if (!formattedLrc) {
            console.log(`[文件缓存] 歌词内容为空 (${baseName})，跳过保存`)
            return false
        }

        storageFs.writeFileSync(finalPath, formattedLrc, { encoding: 'utf-8' })
        console.log(`[文件缓存] 歌词已成功保存至: ${finalPath}`)

        // Update index — use normalizeSongId to ensure the ID has source prefix, matching index keys
        const foldersToUpdate: Array<'cache' | 'music'> = isOnlyDownload ? ['music', 'cache'] : ['cache', 'music']
        for (const folder of foldersToUpdate) {
            const existing = indexManager.get(normalizedUsername, id, folder, quality)
            if (existing) {
                const root = getCacheDir(normalizedUsername, folder === 'music')
                existing.lyricFilename = path.relative(root, finalPath).replace(/\\/g, '/')
                existing.hasLyric = true
                indexManager.save(normalizedUsername, folder)
                break
            }
        }
        void checkAndCleanupCache(username)
        return true
    } catch (err: any) {
        console.error(`[文件缓存] 保存歌词缓存失败: ${err.message}`)
        return false
    }
}

const ensureCachedLyrics = async (
    songInfo: any,
    quality: string | undefined,
    username: string | undefined,
    isOnlyDownload: boolean | undefined,
    audioPath: string,
    folder: 'cache' | 'music',
    shouldCacheLyric: boolean,
    shouldEmbedLyric: boolean,
) => {
    if ((!shouldCacheLyric && !shouldEmbedLyric) || !_lyricFetcher || !storageFs.existsSync(audioPath)) return

    const normalizedUsername = (username && username !== '_open' && username !== 'default') ? username : '_open'
    const id = normalizeSongId(songInfo)
    const resolvedQuality = quality || 'unknown'
    const relativeAudioPath = path.relative(getCacheDir(normalizedUsername, folder === 'music'), audioPath).replace(/\\/g, '/')
    const item = indexManager.get(normalizedUsername, id, folder, resolvedQuality, true)
        || indexManager.getAll(normalizedUsername, folder).find(candidate => candidate.filename === relativeAudioPath)
    const lyricPath = audioPath.substring(0, audioPath.length - path.extname(audioPath).length) + '.lrc'
    let hasCachedLyric = storageFs.existsSync(lyricPath)
    let hasEmbedLyric = item?.hasEmbedLyric === true
    let metadataWritable = item?.metadataWritable !== false
    let metadataError = item?.metadataError
    let embedLyricError = item?.embedLyricError
    const audioContainer = item?.audioContainer || detectAudioContainer(audioPath)

    if (shouldEmbedLyric && !hasEmbedLyric && metadataWritable) {
        let tagger: any
        try {
            tagger = new MusicTagger()
            tagger.loadPath(audioPath)
            const lyricsInTag = tagger.lyrics
            hasEmbedLyric = !!(lyricsInTag && lyricsInTag.trim().length > 10)
        } catch (e: any) {
            metadataWritable = false
            metadataError = getMetadataUnsupportedMessage(audioContainer)
            embedLyricError = metadataError
        } finally {
            try { if (tagger) tagger.dispose() } catch (e) { }
        }
    }

    const embedRequirementHandled = !shouldEmbedLyric || hasEmbedLyric || !metadataWritable
    if ((!shouldCacheLyric || hasCachedLyric) && embedRequirementHandled) {
        if (item && (item.hasLyric !== hasCachedLyric || item.hasEmbedLyric !== hasEmbedLyric || item.metadataWritable !== metadataWritable || item.embedLyricError !== embedLyricError)) {
            item.hasLyric = hasCachedLyric
            item.lyricFilename = hasCachedLyric
                ? path.relative(getCacheDir(normalizedUsername, folder === 'music'), lyricPath).replace(/\\/g, '/')
                : undefined
            item.hasEmbedLyric = hasEmbedLyric
            item.audioContainer = audioContainer
            item.metadataWritable = metadataWritable
            item.metadataError = metadataError
            item.embedLyricError = embedLyricError
            indexManager.save(normalizedUsername, folder)
        }
        return
    }

    try {
        const lyricText = await _lyricFetcher({ ...songInfo, quality: resolvedQuality })
        if (!lyricText) return

        if (shouldCacheLyric && !hasCachedLyric) {
            const lyricsObj = parseLyrics(lyricText)
            hasCachedLyric = saveLyricCache(
                { ...songInfo, quality: resolvedQuality },
                lyricsObj,
                username,
                isOnlyDownload,
            ) || storageFs.existsSync(lyricPath)
        }

        if (shouldEmbedLyric && !hasEmbedLyric && metadataWritable) {
            const embedResult = embedLyricsIntoFile(audioPath, lyricText)
            hasEmbedLyric = embedResult.hasEmbedLyric
            metadataWritable = embedResult.metadataWritable
            metadataError = embedResult.metadataWritable ? undefined : embedResult.error
            embedLyricError = embedResult.error
            if (embedResult.success) {
                console.log(`[文件缓存] 已成功嵌入 USLT 歌词标签: ${songInfo.name || songInfo.title || path.basename(audioPath)}`)
            } else {
                console.warn(`[文件缓存] 无法写入歌词标签 (${path.basename(audioPath)}): ${embedResult.error}`)
            }
        }

        const finalItem = indexManager.get(normalizedUsername, id, folder, resolvedQuality, true) || item
        if (finalItem) {
            if (shouldCacheLyric && hasCachedLyric) {
                finalItem.hasLyric = true
                finalItem.lyricFilename = path.relative(getCacheDir(normalizedUsername, folder === 'music'), lyricPath).replace(/\\/g, '/')
            }
            if (shouldEmbedLyric) {
                finalItem.hasEmbedLyric = hasEmbedLyric
                finalItem.audioContainer = audioContainer
                finalItem.metadataWritable = metadataWritable
                finalItem.metadataError = metadataError
                finalItem.embedLyricError = embedLyricError
            }
            indexManager.save(normalizedUsername, folder)
        }
    } catch (err: any) {
        console.warn(`[文件缓存] 补全歌词缓存失败 (${path.basename(audioPath)}): ${err?.message || err}`)
    }
}

/**
 * DownloadProvenance 契约，按当前模块职责组织，保留原字段和扩展能力。
 * @author yahyaoo
 */
export interface DownloadProvenance {
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
    /**
     * customTargetDir 字段，沿用原业务结构与空值约定。
     */
    customTargetDir?: string
}

/**
 * 下载 downloadAndCache 对应的业务能力，参数和执行顺序保持原实现。
 * @param songInfo songInfo 原业务参数。
 * @param url url 原业务参数。
 * @param quality 原音质选择。
 * @param username 已解析的用户名称。
 * @param signal 调用方取消信号。
 * @param isOnlyDownload isOnlyDownload 原业务参数。
 * @param shouldCacheLyric shouldCacheLyric 原业务参数。
 * @param shouldEmbedLyric shouldEmbedLyric 原业务参数。
 * @param provenance provenance 原业务参数。
 * @returns 原处理结果；异步操作沿用原完成与错误传播约定。
 * @author yahyaoo
 */
export const downloadAndCache = async (songInfo: any, url: string, quality?: string, username?: string, signal?: AbortSignal, isOnlyDownload?: boolean, shouldCacheLyric: boolean = true, shouldEmbedLyric: boolean = true, provenance: DownloadProvenance = {}) => {
    const dir = provenance.customTargetDir || ensureDir(username, isOnlyDownload)
    const baseName = getFileName(songInfo, quality, isOnlyDownload, username)
    const tempPath = path.join(dir, baseName + '.tmp')
    const songKey = normalizeSongId(songInfo) + '_' + (quality || 'unknown')
    const requestedSource = provenance.requestedSource || songInfo.requestedSource || songInfo.source || 'unknown'
    const downloadSource = detectDownloadSource(url, provenance.downloadSource || songInfo.downloadSource || songInfo.source)
    const sourceName = provenance.sourceName || songInfo.sourceName

    const result = checkCache({ ...songInfo, quality, exactQuality: true }, username, false)
    if (result.exists && !result.isCollision) {
        const targetFolder: 'cache' | 'music' = isOnlyDownload ? 'music' : 'cache'
        if (result.folder === targetFolder && result.path) {
            await ensureCachedLyrics(songInfo, quality || result.quality, username, isOnlyDownload, result.path, targetFolder, shouldCacheLyric, shouldEmbedLyric)
            console.log(`[文件缓存] 歌曲已存在于 ${targetFolder}，跳过下载: ${result.filename}`)
            // 通知前端轮询：目标目录文件已存在，视为立即完成
            cacheProgress.set(songKey, { progress: 100, status: 'exists' })
            setTimeout(() => cacheProgress.delete(songKey), 30000)
            return Promise.resolve()
        }

        if (isOnlyDownload && result.folder === 'cache' && result.path) {
            const requestedOrCachedQuality = quality || result.quality || 'unknown'
            const inspection = inspectAudioFile(result.path, requestedOrCachedQuality)
            const actualQuality = inspection.quality || requestedOrCachedQuality
            const sourceExt = path.extname(result.filename || result.path) || '.mp3'
            const ext = inspection.extension || sourceExt
            const finalBaseName = getFileName(songInfo, actualQuality, isOnlyDownload, username)
            const finalPath = path.join(dir, finalBaseName + ext)
            if (!storageFs.existsSync(finalPath)) {
                storageFs.copyFileSync(result.path, finalPath)
            }

            const metadata = extractSongMetadata(songInfo)
            const id = metadata.id || String(songInfo.id || songInfo.songmid)
            const normalizedUsername = (username && username !== '_open' && username !== 'default') ? username : '_open'
            const cachedItem = getIndexItemByFilename(result.filename, normalizedUsername)
            const actualDownloadSource = cachedItem?.downloadSource || downloadSource
            const actualSourceName = cachedItem?.sourceName || sourceName
            const stat = storageFs.statSync(finalPath)
            let hasCover = false
            let hasEmbedLyric = false
            let metadataWritable = false
            const audioContainer = inspection.audioContainer
            try {
                const tagger = new MusicTagger()
                tagger.loadPath(finalPath)
                hasCover = hasValidEmbeddedCover(tagger.pictures)
                const lyricsInTag = tagger.lyrics
                hasEmbedLyric = !!(lyricsInTag && lyricsInTag.trim().length > 10)
                metadataWritable = true
                tagger.dispose()
            } catch (e) { }

            let coverType: CacheItem['coverType'] = hasCover ? 'embedded' : 'none'
            if (!hasCover) {
                const sourceCover = await getCacheCover(result.filename, normalizedUsername)
                if (sourceCover?.data?.length && writeCoverCache(path.basename(finalPath), normalizedUsername, sourceCover.data, sourceCover.mime, stat)) {
                    hasCover = true
                    coverType = 'cached'
                } else if (hasUsableRemoteCover(metadata.img)) {
                    hasCover = true
                    coverType = 'remote'
                }
            }

            let lyricFilename: string | undefined
            const sourceLyricPath = result.path.substring(0, result.path.length - sourceExt.length) + '.lrc'
            if (shouldCacheLyric && storageFs.existsSync(sourceLyricPath)) {
                const targetLyricPath = path.join(dir, finalBaseName + '.lrc')
                storageFs.copyFileSync(sourceLyricPath, targetLyricPath)
                lyricFilename = path.basename(targetLyricPath)
            }

            indexManager.update(normalizedUsername, {
                id, songmid: id, name: metadata.name, singer: metadata.singer,
                album: metadata.album, albumId: metadata.albumId, img: metadata.img,
                interval: metadata.interval, source: metadata.source, requestedSource,
                downloadSource: actualDownloadSource, sourceName: actualSourceName,
                quality: actualQuality, filename: path.basename(finalPath),
                folder: 'music', mtime: Date.now(), size: stat.size,
                lyricFilename,
                ext: ext.replace('.', ''),
                hasCover,
                coverType,
                hasLyric: !!lyricFilename,
                hasEmbedLyric,
                audioContainer,
                bitrate: inspection.bitrate,
                sampleRate: inspection.sampleRate,
                bitDepth: inspection.bitDepth,
                metadataWritable,
                metadataError: metadataWritable ? undefined : getMetadataUnsupportedMessage(audioContainer)
            }, 'music')

            await ensureCachedLyrics(songInfo, actualQuality, username, true, finalPath, 'music', shouldCacheLyric, shouldEmbedLyric)

            console.log(`[文件缓存] 已复制缓存歌曲至下载目录: ${path.basename(finalPath)}`)
            cacheProgress.set(songKey, { progress: 100, status: 'finished', total: stat.size, received: stat.size })
            setTimeout(() => cacheProgress.delete(songKey), 30000)
            return Promise.resolve()
        }

        console.log(`[文件缓存] 歌曲已存在于 ${result.folder}，跳过下载: ${result.filename}`)
        cacheProgress.set(songKey, { progress: 100, status: 'exists' })
        setTimeout(() => cacheProgress.delete(songKey), 30000)
        return Promise.resolve()
    }

    // [去重] 同一 songKey 正在下载/写标签时直接跳过，避免并发重复下载
    // (如 Subsonic 客户端反复请求 stream、或音流并行触发原生缓存)
    const inFlight = cacheProgress.get(songKey)
    if (inFlight && (inFlight.status === 'downloading' || inFlight.status === 'tagging')) {
        const age = Date.now() - (inFlight.updatedAt || 0)
        // 超过 10 分钟仍无进展视为卡死，允许本次重新下载（避免永久阻塞该歌曲，
        // 尤其 fire-and-forget 的 Subsonic 缓存触发没有 abort 信号）
        if (age < 10 * 60 * 1000) {
            console.log(`[文件缓存] 任务已在下载队列中 (${songKey})，跳过重复请求`)
            return Promise.resolve()
        }
    }
    if (signal?.aborted) return
    // 立即同步占坑标记下载中，关闭“拿到 200 响应前”的并发竞态窗口；
    // 后续到达的相同 songKey 请求会被上面的守卫跳过，不再重复下载。
    cacheProgress.set(songKey, { progress: 0, status: 'downloading', total: 0, received: 0, speed: 0, updatedAt: Date.now() })
    console.log(`[文件缓存] 开始下载歌曲: ${baseName}`)

    return new Promise<void>((resolve, reject) => {
        let req: http.ClientRequest
        let fileStream: fs.WriteStream | undefined
        let settled = false
        let redirectCount = 0
        const MAX_REDIRECTS = 10

        const safeUnlink = (stream?: fs.WriteStream, filePath?: string) => {
            if (!filePath) return
            try {
                if (stream && !stream.destroyed) {
                    stream.destroy()
                }
            } catch { }
            setTimeout(() => {
                try {
                    if (storageFs.existsSync(filePath)) {
                        storageFs.unlink(filePath, () => { })
                    }
                } catch { }
            }, 50)
        }

        const fail = (err: Error) => {
            if (settled) return
            const message = err.message || 'Download failed'
            cacheProgress.set(songKey, { progress: 0, status: 'error', errorMsg: message })
            settle(() => reject(err))
        }

        const settle = (fn: () => void) => {
            if (settled) return
            settled = true
            if (signal) signal.removeEventListener('abort', abortHandler)
            fn()
        }

        const abortHandler = () => {
            if (req) req.destroy()
            safeUnlink(fileStream, tempPath)
            cacheProgress.delete(songKey)
            settle(() => reject(new Error('Aborted')))
        }

        if (signal) signal.addEventListener('abort', abortHandler)

        // 递归下载，自动跟随 3xx 重定向（浏览器会自动跟随，但 http.get 不会）
        const downloadFrom = (currentUrl: string) => {
            if (signal?.aborted) {
                fail(new Error('Aborted'))
                return
            }
            const protocol = currentUrl.startsWith('https') ? https : http
            req = protocol.get(currentUrl, (res) => {
                const status = res.statusCode || 0
                // 处理重定向：301/302/303/307/308
                if ([301, 302, 303, 307, 308].includes(status)) {
                    const location = res.headers['location']
                    res.resume() // 消费响应体，避免连接挂起
                    if (!location) {
                        safeUnlink(fileStream, tempPath)
                        fail(new Error(`Status: ${status} (missing Location header)`))
                        return
                    }
                    if (redirectCount >= MAX_REDIRECTS) {
                        safeUnlink(fileStream, tempPath)
                        fail(new Error(`Too many redirects (${MAX_REDIRECTS})`))
                        return
                    }
                    redirectCount++
                    const nextUrl = new URL(location, currentUrl).toString()
                    console.log(`[文件缓存] 触发重定向 ${status} -> ${nextUrl} (${redirectCount}/${MAX_REDIRECTS})`)
                    downloadFrom(nextUrl)
                    return
                }
                if (status !== 200) {
                    safeUnlink(fileStream, tempPath)
                    fail(new Error(`Status: ${status}`))
                    return
                }


            cacheProgress.set(songKey, { progress: 0, status: 'downloading', total: 0, received: 0, speed: 0, updatedAt: Date.now() })
            const total = parseInt(res.headers['content-length'] || '0', 10)
            let received = 0
            let lastSpeedAt = Date.now()
            let lastSpeedBytes = 0
            let currentSpeed = 0
            const contentType = res.headers['content-type'] || ''
            let headerExt = '.mp3'
            if (contentType.includes('audio/flac')) headerExt = '.flac'
            else if (contentType.includes('audio/ogg')) headerExt = '.ogg'
            else if (contentType.includes('audio/x-m4a') || contentType.includes('audio/mp4')) headerExt = '.m4a'
            else if (contentType.includes('audio/wav')) headerExt = '.wav'

            fileStream = storageFs.createWriteStream(tempPath)
            let writeFinished = false
            res.on('data', (chunk) => {
                received += chunk.length
                const now = Date.now()
                if (now - lastSpeedAt >= 1000) {
                    currentSpeed = Math.max(0, (received - lastSpeedBytes) / ((now - lastSpeedAt) / 1000))
                    lastSpeedAt = now
                    lastSpeedBytes = received
                }
                const progress = total > 0 ? Math.round((received / total) * 100) : 0
                cacheProgress.set(songKey, { progress, status: 'downloading', total, received, speed: currentSpeed, updatedAt: now })
            })

            res.pipe(fileStream)
            fileStream.on('finish', () => { writeFinished = true })
            fileStream.on('close', async () => {
                if (settled) return
                if (!writeFinished) {
                    safeUnlink(fileStream, tempPath)
                    fail(new Error('Download stream closed before write finished'))
                    return
                }
                if (total > 0 && received < total) {
                    safeUnlink(fileStream, tempPath)
                    fail(new Error(`Download incomplete: ${received}/${total}`))
                    return
                }
                cacheProgress.set(songKey, { progress: 100, status: 'tagging', total, received, speed: 0, updatedAt: Date.now() })

                let ext = headerExt
                if (storageFs.existsSync(tempPath)) {
                    try {
                        const { fileTypeFromFile } = await import('file-type')
                        const type = await fileTypeFromFile(tempPath)
                        if (type) ext = `.${type.ext}`
                    } catch (e) { }
                }

                const inspection = inspectAudioFile(tempPath, quality)
                ext = inspection.extension || ext
                const actualQuality = inspection.quality || quality || 'unknown'
                const finalBaseName = getFileName(songInfo, actualQuality, isOnlyDownload, username)
                const finalPath = path.join(dir, finalBaseName + ext)
                storageFs.rename(tempPath, finalPath, async (err) => {
                    if (err) {
                        safeUnlink(fileStream, tempPath)
                        fail(err)
                        return
                    }

                    let imageBuffer: Buffer | undefined
                    let imageMime = 'image/jpeg'
                    try {
                        const imageUrl = songInfo.img || (songInfo.meta && songInfo.meta.picUrl)
                        if (imageUrl && imageUrl.startsWith('http') && !isPlaceholderCoverUrl(imageUrl)) {
                            const chunks: Buffer[] = []
                            const p = imageUrl.startsWith('https') ? https : http
                            imageBuffer = await new Promise((resolveI, rejectI) => {
                                const imgReq = p.get(imageUrl, ires => {
                                    if (ires.statusCode && ires.statusCode >= 400) {
                                        ires.resume()
                                        rejectI(new Error(`Cover status: ${ires.statusCode}`))
                                        return
                                    }
                                    imageMime = String(ires.headers['content-type'] || 'image/jpeg').split(';')[0]
                                    ires.on('data', c => chunks.push(c))
                                    ires.on('end', () => resolveI(Buffer.concat(chunks)))
                                    ires.on('error', rejectI)
                                })
                                imgReq.on('error', rejectI)
                                imgReq.setTimeout(10000, () => {
                                    imgReq.destroy(new Error('Cover download timeout'))
                                })
                            })
                        }
                    } catch (e) { }

                    const metadata = extractSongMetadata(songInfo)
                    const id = metadata.id || String(songInfo.id || songInfo.songmid)
                    const normalizedUsername = (username && username !== '_open' && username !== 'default') ? username : '_open'
                    const folderType: 'cache' | 'music' = isOnlyDownload ? 'music' : 'cache'

                    indexManager.update(normalizedUsername, {
                        id, songmid: id, name: metadata.name, singer: metadata.singer,
                        album: metadata.album, albumId: metadata.albumId, img: metadata.img,
                        interval: metadata.interval, source: metadata.source, requestedSource,
                        downloadSource, sourceName,
                        quality: actualQuality, filename: finalBaseName + ext,
                        folder: folderType, mtime: Date.now(), size: received,
                        ext: ext.replace('.', ''), hasCover: false, hasLyric: false,
                        audioContainer: inspection.audioContainer,
                        bitrate: inspection.bitrate,
                        sampleRate: inspection.sampleRate,
                        bitDepth: inspection.bitDepth,
                    }, folderType)

                    let tagger: any
                    let metadataWritable = false
                    try {
                        tagger = new MusicTagger()
                        tagger.loadPath(finalPath)
                        tagger.title = metadata.name
                        tagger.artist = metadata.singer
                        tagger.album = metadata.album
                        if (imageBuffer && imageBuffer.length > 0) tagger.pictures = [new MetaPicture(imageMime, new Uint8Array(imageBuffer), 'Cover')]
                        tagger.save()
                        metadataWritable = true
                    } catch (e) {
                    } finally {
                        try { if (tagger) tagger.dispose() } catch (e) { }
                    }

                    const taggedStats = storageFs.statSync(finalPath)
                    let finalHasCover = readEmbeddedCoverState(finalPath)
                    if (!finalHasCover && imageBuffer?.length) {
                        finalHasCover = writeCoverCache(finalBaseName + ext, normalizedUsername, imageBuffer, imageMime, taggedStats)
                    }
                    const taggedItem = indexManager.get(normalizedUsername, id, folderType, actualQuality)
                    if (taggedItem) {
                        taggedItem.coverType = readEmbeddedCoverState(finalPath)
                            ? 'embedded'
                            : finalHasCover
                                ? 'cached'
                                : hasUsableRemoteCover(metadata.img)
                                    ? 'remote'
                                    : 'none'
                        taggedItem.hasCover = taggedItem.coverType !== 'none'
                        taggedItem.audioContainer = inspection.audioContainer
                        taggedItem.metadataWritable = metadataWritable
                        taggedItem.metadataError = metadataWritable ? undefined : getMetadataUnsupportedMessage(taggedItem.audioContainer)
                        taggedItem.coverCheckedVersion = COVER_CHECK_VERSION
                        taggedItem.coverCheckedMtime = taggedStats.mtimeMs
                        taggedItem.coverCheckedSize = taggedStats.size
                        taggedItem.mtime = taggedStats.mtimeMs
                        taggedItem.size = taggedStats.size
                        indexManager.save(normalizedUsername, folderType)
                    }

                    await ensureCachedLyrics(songInfo, actualQuality, username, isOnlyDownload, finalPath, folderType, shouldCacheLyric, shouldEmbedLyric)

                    cacheProgress.set(songKey, { progress: 100, status: 'finished', total: total || received, received, speed: 0, updatedAt: Date.now() })
                    setTimeout(() => cacheProgress.delete(songKey), 30000)
                    settle(() => { resolve(); void checkAndCleanupCache(username) })
                })
            })
            fileStream.on('error', (err) => { safeUnlink(fileStream, tempPath); fail(err) })
        })
        req.on('error', (err) => { safeUnlink(fileStream, tempPath); fail(err) })
        req.setTimeout(30000, () => {
            safeUnlink(fileStream, tempPath)
            req.destroy(new Error('Download request timeout'))
        })
        }

        downloadFrom(url)
    })
}

const normalizeCacheUsername = (username?: string) => (
    username && username !== '_open' && username !== 'default' ? username : '_open'
)

const resolveMusicPath = (root: string, relativePath: string) => {
    const resolvedRoot = path.resolve(root)
    const resolvedPath = path.resolve(root, relativePath)
    if (resolvedPath !== resolvedRoot && !resolvedPath.startsWith(resolvedRoot + path.sep)) {
        throw new Error('Invalid music file path')
    }
    return resolvedPath
}

const getAvailableRemasterTarget = (
    root: string,
    subPath: string,
    preferredBaseName: string,
    extension: string,
    oldAudioPath: string,
    oldLyricPath: string,
    needsLyric: boolean,
) => {
    for (let index = 0; index < 10000; index++) {
        const suffix = index === 0 ? '' : ` (${index + 1})`
        const baseName = preferredBaseName.substring(0, Math.max(1, 200 - suffix.length)) + suffix
        const audioFilename = path.join(subPath, baseName + extension).replace(/\\/g, '/').replace(/^\.\//, '')
        const lyricFilename = path.join(subPath, baseName + '.lrc').replace(/\\/g, '/').replace(/^\.\//, '')
        const audioPath = resolveMusicPath(root, audioFilename)
        const lyricPath = resolveMusicPath(root, lyricFilename)
        const audioConflict = audioPath !== oldAudioPath && storageFs.existsSync(audioPath)
        const lyricConflict = needsLyric && lyricPath !== oldLyricPath && storageFs.existsSync(lyricPath)
        if (!audioConflict && !lyricConflict) {
            return { audioFilename, lyricFilename, audioPath, lyricPath }
        }
    }
    throw new Error('无法生成不冲突的目标文件名')
}

/**
 * 获取 getDownloadedMusicItems 对应的业务能力，参数和执行顺序保持原实现。
 * @param username 已解析的用户名称。
 * @returns 原处理结果；异步操作沿用原完成与错误传播约定。
 * @author yahyaoo
 */
export const getDownloadedMusicItems = async (username?: string) => {
    const normalizedUsername = normalizeCacheUsername(username)
    await syncCacheIndex(normalizedUsername, ['music'])
    return indexManager.getAll(normalizedUsername, 'music').map(item => ({ ...item }))
}

/**
 * 处理 replaceDownloadedMusicItem 对应的业务能力，参数和执行顺序保持原实现。
 * @param username 已解析的用户名称。
 * @param originalItem originalItem 原业务参数。
 * @param songInfo songInfo 原业务参数。
 * @param url url 原业务参数。
 * @param quality 原音质选择。
 * @param signal 调用方取消信号。
 * @returns 原处理结果；异步操作沿用原完成与错误传播约定。
 * @author yahyaoo
 */
export const replaceDownloadedMusicItem = async (
    username: string,
    originalItem: CacheItem,
    songInfo: any,
    url: string,
    quality: string,
    signal?: AbortSignal,
) => {
    const normalizedUsername = normalizeCacheUsername(username)
    const root = getCacheDir(normalizedUsername, true)
    const currentItem = indexManager.get(normalizedUsername, originalItem.id, 'music', originalItem.quality, true)
    if (!currentItem || currentItem.filename !== originalItem.filename) {
        throw new Error('原文件已发生变化或已不存在')
    }
    if (quality === currentItem.quality) throw new Error('实际音质与原音质相同，无需替换')

    const oldAudioPath = resolveMusicPath(root, currentItem.filename)
    if (!storageFs.existsSync(oldAudioPath)) throw new Error('原文件已不存在')
    const oldAudioSize = storageFs.statSync(oldAudioPath).size

    const stageId = crypto.randomBytes(12).toString('hex')
    const stageUsername = `.remaster-staging/${stageId}`
    const stageRoot = getCacheDir(stageUsername, true)
    const stageCoverRoot = getCoverCacheDir(stageUsername)
    const backupSuffix = `.remaster-${crypto.randomBytes(6).toString('hex')}.bak`
    const oldAudioBackup = oldAudioPath + backupSuffix
    let oldLyricPath = ''
    let oldLyricBackup = ''
    let targetAudioPath = ''
    let targetLyricPath = ''
    let replacementItem: CacheItem | null = null
    let backedUpOldAudio = false
    let backedUpOldLyric = false
    let installedNewAudio = false
    let installedNewLyric = false
    let updatedNewIndex = false
    let removedOldIndex = false

    try {
        await downloadAndCache(songInfo, url, quality, stageUsername, signal, true, true, true)
        if (signal?.aborted) throw new Error('Aborted')

        const stagedItems = indexManager.getAll(stageUsername, 'music')
        const targetId = normalizeSongId(songInfo)
        const downloadedItem = stagedItems.find(item => item.id === targetId) || stagedItems[0]
        if (!downloadedItem) throw new Error('新音质文件未写入暂存索引')

        const sourceAudioPath = resolveMusicPath(stageRoot, downloadedItem.filename)
        const sourceStats = storageFs.existsSync(sourceAudioPath) ? storageFs.statSync(sourceAudioPath) : null
        if (!sourceStats?.isFile() || sourceStats.size <= 0) throw new Error('新音质文件无效或为空')
        if (sourceStats.size < oldAudioSize) {
            throw new Error(`新文件（${sourceStats.size} 字节）小于原文件（${oldAudioSize} 字节），音源可能返回了低质量文件，已拒绝替换`)
        }
        const stagedHasCover = readEmbeddedCoverState(sourceAudioPath)
        const originalCover = stagedHasCover
            ? null
            : ((await getCacheCover(downloadedItem.filename, stageUsername)) || (await getCacheCover(currentItem.filename, normalizedUsername)))

        oldLyricPath = currentItem.lyricFilename ? resolveMusicPath(root, currentItem.lyricFilename) : ''
        oldLyricBackup = oldLyricPath ? oldLyricPath + backupSuffix : ''
        const sourceLyricPath = downloadedItem.lyricFilename
            ? resolveMusicPath(stageRoot, downloadedItem.lyricFilename)
            : ''
        const targetSubPath = currentItem.subPath || ''
        const downloadedExtension = path.extname(downloadedItem.filename) || `.${downloadedItem.ext || 'mp3'}`
        const preferredBaseName = getFileName(songInfo, quality, true, normalizedUsername)
        const target = getAvailableRemasterTarget(
            root,
            targetSubPath,
            preferredBaseName,
            downloadedExtension,
            oldAudioPath,
            oldLyricPath,
            !!((sourceLyricPath && storageFs.existsSync(sourceLyricPath)) || (oldLyricPath && storageFs.existsSync(oldLyricPath))),
        )
        const targetFilename = target.audioFilename
        const targetLyricFilename = target.lyricFilename
        targetAudioPath = target.audioPath
        targetLyricPath = target.lyricPath

        storageFs.renameSync(oldAudioPath, oldAudioBackup)
        backedUpOldAudio = true
        if (oldLyricPath && storageFs.existsSync(oldLyricPath)) {
            storageFs.renameSync(oldLyricPath, oldLyricBackup)
            backedUpOldLyric = true
        }

        storageFs.mkdirSync(path.dirname(targetAudioPath), { recursive: true })
        safeRenameSync(sourceAudioPath, targetAudioPath)
        installedNewAudio = true

        let finalHasCover = readEmbeddedCoverState(targetAudioPath)
        if (!finalHasCover && originalCover?.data?.length) {
            let tagger: any
            try {
                tagger = new MusicTagger()
                tagger.loadPath(targetAudioPath)
                tagger.pictures = [
                    new MetaPicture(originalCover.mime || 'image/jpeg', new Uint8Array(originalCover.data), 'Cover'),
                ]
                tagger.save()
            } catch (e) {
                console.warn(`[文件缓存] 无法嵌入原封面 (${targetFilename})，转存为外置封面缓存`)
            } finally {
                try { if (tagger) tagger.dispose() } catch (e) { }
            }
            finalHasCover = readEmbeddedCoverState(targetAudioPath)
        }

        let finalLyricFilename: string | undefined
        if (sourceLyricPath && storageFs.existsSync(sourceLyricPath)) {
            storageFs.mkdirSync(path.dirname(targetLyricPath), { recursive: true })
            if (sourceLyricPath !== targetLyricPath) {
                safeRenameSync(sourceLyricPath, targetLyricPath)
                installedNewLyric = true
            }
            finalLyricFilename = targetLyricFilename
        } else if (backedUpOldLyric && storageFs.existsSync(oldLyricBackup)) {
            storageFs.mkdirSync(path.dirname(targetLyricPath), { recursive: true })
            storageFs.copyFileSync(oldLyricBackup, targetLyricPath)
            installedNewLyric = true
            finalLyricFilename = targetLyricFilename
        }

        const finalStats = storageFs.statSync(targetAudioPath)
        if (!finalHasCover && originalCover?.data?.length) {
            finalHasCover = writeCoverCache(
                targetFilename,
                normalizedUsername,
                originalCover.data,
                originalCover.mime || 'image/jpeg',
                finalStats,
            )
        }
        replacementItem = {
            ...downloadedItem,
            id: currentItem.id,
            songmid: currentItem.songmid || currentItem.id,
            source: currentItem.source,
            filename: targetFilename,
            folder: 'music',
            subPath: targetSubPath,
            lyricFilename: finalLyricFilename,
            hasLyric: !!finalLyricFilename,
            hasCover: finalHasCover,
            coverType: readEmbeddedCoverState(targetAudioPath) ? 'embedded' : finalHasCover ? 'cached' : hasUsableRemoteCover(downloadedItem.img) ? 'remote' : 'none',
            coverCheckedVersion: COVER_CHECK_VERSION,
            coverCheckedMtime: finalStats.mtimeMs,
            coverCheckedSize: finalStats.size,
            mtime: finalStats.mtimeMs,
            size: finalStats.size,
        }
        replacementItem.hasCover = replacementItem.coverType !== 'none'
        indexManager.update(normalizedUsername, replacementItem, 'music')
        updatedNewIndex = true
        indexManager.remove(normalizedUsername, currentItem.id, 'music', currentItem.quality)
        removedOldIndex = true

        try {
            if (backedUpOldAudio && storageFs.existsSync(oldAudioBackup)) storageFs.unlinkSync(oldAudioBackup)
        } catch (cleanupError) {
            console.warn('[文件缓存] 清理重制音频备份失败:', cleanupError)
        }
        try {
            if (backedUpOldLyric && storageFs.existsSync(oldLyricBackup)) storageFs.unlinkSync(oldLyricBackup)
        } catch (cleanupError) {
            console.warn('[文件缓存] 清理重制歌词备份失败:', cleanupError)
        }
        return { ...replacementItem }
    } catch (err) {
        try {
            if (updatedNewIndex && replacementItem) {
                indexManager.remove(normalizedUsername, replacementItem.id, 'music', replacementItem.quality)
            }
            if (installedNewLyric && targetLyricPath && storageFs.existsSync(targetLyricPath)) storageFs.unlinkSync(targetLyricPath)
            if (installedNewAudio && targetAudioPath && storageFs.existsSync(targetAudioPath)) storageFs.unlinkSync(targetAudioPath)
            if (backedUpOldAudio && storageFs.existsSync(oldAudioBackup) && !storageFs.existsSync(oldAudioPath)) {
                storageFs.renameSync(oldAudioBackup, oldAudioPath)
            }
            if (backedUpOldLyric && storageFs.existsSync(oldLyricBackup) && !storageFs.existsSync(oldLyricPath)) {
                storageFs.renameSync(oldLyricBackup, oldLyricPath)
            }
            if (removedOldIndex || updatedNewIndex) {
                indexManager.update(normalizedUsername, currentItem, 'music')
            }
        } catch (rollbackError) {
            console.error('[文件缓存] 回滚重制替换操作失败:', rollbackError)
        }
        throw err
    } finally {
        indexManager.discard(stageUsername, 'music')
        try {
            if (storageFs.existsSync(stageRoot)) storageFs.rmSync(stageRoot, { recursive: true, force: true })
        } catch (cleanupError) {
            console.warn('[文件缓存] 清理重制暂存目录失败:', cleanupError)
        }
        try {
            if (storageFs.existsSync(stageCoverRoot)) storageFs.rmSync(stageCoverRoot, { recursive: true, force: true })
        } catch (cleanupError) {
            console.warn('[文件缓存] 清理重制封面暂存目录失败:', cleanupError)
        }
    }
}

/**
 * 停止 stopUserTasks 对应的业务能力，参数和执行顺序保持原实现。
 * @param username 已解析的用户名称。
 * @param songKey songKey 原业务参数。
 * @returns 原处理结果；异步操作沿用原完成与错误传播约定。
 * @author yahyaoo
 */
export const stopUserTasks = (username: string, songKey?: string) => {
    const tasks = activeTasks.get(username)
    if (!tasks) return
    if (songKey) {
        const idx = tasks.findIndex(t => t.songKey === songKey)
        if (idx !== -1) { tasks[idx].controller.abort(); tasks.splice(idx, 1) }
    } else {
        tasks.forEach(t => t.controller.abort())
        activeTasks.delete(username)
    }
}

// [新增] 根据文件名从索引中查找对应条目（跨 cache/music 两个目录）
/**
 * 获取 getIndexItemByFilename 对应的业务能力，参数和执行顺序保持原实现。
 * @param filename 文件或文档定位路径。
 * @param username 已解析的用户名称。
 * @returns 原处理结果；异步操作沿用原完成与错误传播约定。
 * @author yahyaoo
 */
export const getIndexItemByFilename = (filename: string, username: string) => {
    const normalizedUsername = (username && username !== '_open' && username !== 'default') ? username : '_open'
    for (const folder of ['cache', 'music'] as const) {
        const items = indexManager.getAll(normalizedUsername, folder)
        const found = items.find((i: any) => i.filename === filename)
        if (found) return { ...found, folder }
    }
    return null
}

// [新增] 暴露 lyricFetcher 引用，供外部接口（如 embedLyric）使用
/**
 * 获取 getLyricFetcher 对应的业务能力，参数和执行顺序保持原实现。
 * @returns 原处理结果；异步操作沿用原完成与错误传播约定。
 * @author yahyaoo
 */
export const getLyricFetcher = () => _lyricFetcher

// [新增] 更新索引中指定文件的 hasEmbedLyric 状态（由 embedLyric 接口成功写入后调用）
/**
 * 设置 setIndexEmbedLyric 对应的业务能力，参数和执行顺序保持原实现。
 * @param filename 文件或文档定位路径。
 * @param username 已解析的用户名称。
 * @param value 原字段值。
 * @param metadata metadata 原业务参数。
 * @returns 原处理结果；异步操作沿用原完成与错误传播约定。
 * @author yahyaoo
 */
export const setIndexEmbedLyric = (
    filename: string,
    username: string,
    value: boolean,
    metadata?: Pick<CacheItem, 'audioContainer' | 'metadataWritable' | 'metadataError' | 'embedLyricError'>,
) => {
    const normalizedUsername = (username && username !== '_open' && username !== 'default') ? username : '_open'
    for (const folder of ['cache', 'music'] as const) {
        const items = indexManager.getAll(normalizedUsername, folder)
        const found = items.find((i: any) => i.filename === filename)
        if (found) {
            (found as any).hasEmbedLyric = value
            if (metadata) Object.assign(found, metadata)
            indexManager.save(normalizedUsername, folder)
            return true
        }
    }
    return false
}

/**
 * 响应 serveCacheFile 对应的业务能力，参数和执行顺序保持原实现。
 * @param req 原 HTTP 请求。
 * @param res 原 HTTP 响应。
 * @param filename 文件或文档定位路径。
 * @param username 已解析的用户名称。
 * @returns 原处理结果；异步操作沿用原完成与错误传播约定。
 * @author yahyaoo
 */
export const serveCacheFile = (req: http.IncomingMessage, res: http.ServerResponse, filename: string, username?: string) => {
    const locations = [
        currentCacheLocation,
        currentCacheLocation === CACHE_ROOTS.DATA ? CACHE_ROOTS.ROOT : CACHE_ROOTS.DATA
    ]
    const roots = ['cache', 'music']
    let filePath = ''
    const normalizedUsername = (username && username !== '_open' && username !== 'default') ? username : '_open'
    for (const loc of locations) {
        for (const folder of roots) {
            const dir = getCacheDir(normalizedUsername, folder === 'music', loc)
            const checkPath = path.join(dir, filename) // [Fix] Allow subfolders
            if (storageFs.existsSync(checkPath)) { filePath = checkPath; break }
        }
        if (filePath) break
    }
    if (!filePath) { res.writeHead(404); res.end('Not Found'); return }
    const stat = storageFs.statSync(filePath)
    const ext = path.extname(filePath).toLowerCase()
    const mimeTypes: Record<string, string> = {
        '.mp3': 'audio/mpeg', '.flac': 'audio/flac', '.m4a': 'audio/mp4', '.ogg': 'audio/ogg', '.wav': 'audio/wav'
    }
    const contentType = mimeTypes[ext] || 'application/octet-stream'
    const range = req.headers.range
    if (range) {
        const parts = range.replace(/bytes=/, "").split("-")
        const start = parseInt(parts[0], 10)
        const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1
        const chunksize = (end - start) + 1
        res.writeHead(206, {
            'Content-Range': `bytes ${start}-${end}/${stat.size}`,
            'Accept-Ranges': 'bytes', 'Content-Length': chunksize, 'Content-Type': contentType,
        })
        storageFs.createReadStream(filePath, { start, end }).pipe(res)
    } else {
        res.writeHead(200, { 'Content-Length': stat.size, 'Content-Type': contentType, 'Accept-Ranges': 'bytes' })
        storageFs.createReadStream(filePath).pipe(res)
    }
}

/**
 * 获取 getCacheStats 对应的业务能力，参数和执行顺序保持原实现。
 * @param username 已解析的用户名称。
 * @returns 原处理结果；异步操作沿用原完成与错误传播约定。
 * @author yahyaoo
 */
export const getCacheStats = (username?: string) => {
    const roots = ['cache', 'music']
    const result: any = { cache: { totalSize: 0, fileCount: 0 }, music: { totalSize: 0, fileCount: 0 }, totalSize: 0, fileCount: 0 }
    const normalizedUsername = (username && username !== '_open' && username !== 'default') ? username : '_open'
    for (const folder of roots) {
        const dir = getCacheDir(normalizedUsername, folder === 'music')
        if (!storageFs.existsSync(dir)) continue
        const files = storageFs.readdirSync(dir)
        const extensions = ['.mp3', '.flac', '.m4a', '.ogg', '.wav', '.lrc']
        for (const file of files) {
            const ext = path.extname(file).toLowerCase()
            if (extensions.includes(ext)) {
                try {
                    const stats = storageFs.statSync(path.join(dir, file))
                    result[folder].totalSize += stats.size
                    result.totalSize += stats.size
                    if (ext !== '.lrc') { result[folder].fileCount++; result.fileCount++ }
                } catch (e) { }
            }
        }
    }
    return result
}

/**
 * 清理 clearAllCache 对应的业务能力，参数和执行顺序保持原实现。
 * @param username 已解析的用户名称。
 * @returns 原处理结果；异步操作沿用原完成与错误传播约定。
 * @author yahyaoo
 */
export const clearAllCache = (username?: string) => {
    const roots = ['cache', 'music']
    let deletedCount = 0
    let freedSize = 0
    const normalizedUsername = (username && username !== '_open' && username !== 'default') ? username : '_open'
    for (const folder of roots) {
        const dir = getCacheDir(normalizedUsername, folder === 'music')
        if (!storageFs.existsSync(dir)) continue
        const files = storageFs.readdirSync(dir)
        for (const file of files) {
            try {
                const stats = storageFs.statSync(path.join(dir, file))
                storageFs.unlinkSync(path.join(dir, file))
                deletedCount++; freedSize += stats.size
            } catch (e) { }
        }
        indexManager.load(normalizedUsername, folder as any).clear()
        indexManager.save(normalizedUsername, folder as any)
    }
    return { deletedCount, freedSize }
}

/**
 * 清理 clearLyricCache 对应的业务能力，参数和执行顺序保持原实现。
 * @param username 已解析的用户名称。
 * @returns 原处理结果；异步操作沿用原完成与错误传播约定。
 * @author yahyaoo
 */
export const clearLyricCache = (username?: string) => {
    const roots: Array<'cache' | 'music'> = ['cache', 'music']
    let deletedCount = 0
    let freedSize = 0
    const normalizedUsername = (username && username !== '_open' && username !== 'default') ? username : '_open'
    for (const folder of roots) {
        const dir = getCacheDir(normalizedUsername, folder === 'music')
        if (!storageFs.existsSync(dir)) continue
        const files = storageFs.readdirSync(dir)
        for (const file of files) {
            if (file.endsWith('.lrc')) {
                try {
                    const stats = storageFs.statSync(path.join(dir, file))
                    storageFs.unlinkSync(path.join(dir, file))
                    deletedCount++; freedSize += stats.size
                } catch (e) { }
            }
        }
        const items = indexManager.getAll(normalizedUsername, folder)
        items.forEach(item => { if (item.hasLyric) { item.hasLyric = false; item.lyricFilename = undefined } })
        indexManager.save(normalizedUsername, folder)
    }
    return { deletedCount, freedSize }
}

/**
 * 清理过期的 .tmp 临时下载文件
 * @param username 用户名（可选）
 * @param maxAgeMs 最大存活时间（默认 10 分钟）
 */
export const cleanupStaleTempFiles = async (username?: string, maxAgeMs: number = 10 * 60 * 1000) => {
    const normalizedUsername = (username && username !== '_open' && username !== 'default') ? username : '_open'
    const roots: Array<'cache' | 'music'> = ['cache', 'music']
    const now = Date.now()
    let cleanedCount = 0

    for (const folder of roots) {
        const dir = getCacheDir(normalizedUsername, folder === 'music')
        if (!storageFs.existsSync(dir)) continue
        try {
            const scanAndClean = (currentDir: string) => {
                if (!storageFs.existsSync(currentDir)) return
                const entries = storageFs.readdirSync(currentDir, { withFileTypes: true })
                for (const entry of entries) {
                    const fullPath = path.join(currentDir, entry.name)
                    if (entry.isDirectory()) {
                        scanAndClean(fullPath)
                    } else if (entry.isFile() && entry.name.endsWith('.tmp')) {
                        try {
                            const stat = storageFs.statSync(fullPath)
                            if (now - stat.mtimeMs > maxAgeMs) {
                                storageFs.unlinkSync(fullPath)
                                cleanedCount++
                            }
                        } catch { }
                    }
                }
            }
            scanAndClean(dir)
        } catch (e) {
            console.warn(`[文件缓存] 清理临时文件失败 (${dir}):`, e)
        }
    }
    if (cleanedCount > 0) {
        console.log(`[文件缓存] [${normalizedUsername}] 已清理 ${cleanedCount} 个遗留 .tmp 临时文件`)
    }
    return cleanedCount
}

/**
 * 检查 checkAndCleanupCache 对应的业务能力，参数和执行顺序保持原实现。
 * @param username 已解析的用户名称。
 * @returns 原处理结果；异步操作沿用原完成与错误传播约定。
 * @author yahyaoo
 */
export const checkAndCleanupCache = async (username?: string) => {
    void cleanupStaleTempFiles(username)
    const config = (global as any).lx.config
    if (!config || !config['user.enableCacheSizeLimit']) return
    const { totalSize } = getCacheStats(username)
    const limitBytes = (config['user.cacheSizeLimit'] || 2000) * 1024 * 1024
    if (totalSize <= limitBytes) return
    const roots: Array<'cache' | 'music'> = ['cache', 'music']
    const allFiles: Array<{ /**
 * path 字段，沿用原业务结构与空值约定。
 */
path: string, /**
 * size 字段，沿用原业务结构与空值约定。
 */
size: number, /**
 * mtime 字段，沿用原业务结构与空值约定。
 */
mtime: number }> = []
    const normalizedUsername = (username && username !== '_open' && username !== 'default') ? username : '_open'
    for (const folder of roots) {
        const dir = getCacheDir(normalizedUsername, folder === 'music')
        if (!storageFs.existsSync(dir)) continue
        const files = storageFs.readdirSync(dir)
        for (const file of files) {
            try {
                const filePath = path.join(dir, file)
                const stats = storageFs.statSync(filePath)
                allFiles.push({ path: filePath, size: stats.size, mtime: stats.mtime.getTime() })
            } catch (e) { }
        }
    }
    allFiles.sort((a, b) => a.mtime - b.mtime)
    let currentSize = totalSize
    const targetSize = limitBytes * 0.95
    let deletedCount = 0
    for (const file of allFiles) {
        if (currentSize <= targetSize) break
        try { storageFs.unlinkSync(file.path); currentSize -= file.size; deletedCount++ } catch (e) { }
    }
    console.log(`[文件缓存] 用户 ${normalizedUsername} 缓存空间清理完成，已删除 ${deletedCount} 个过期文件`)
}

// 启动 5 秒后自动扫描并清理系统遗留的过期 .tmp 文件
setTimeout(() => {
    try {
        void cleanupStaleTempFiles()
    } catch { }
}, 5000)
/**
 * 处理 switchFolder 对应的业务能力，参数和执行顺序保持原实现。
 * @param filenames filenames 原业务参数。
 * @param username 已解析的用户名称。
 * @returns 原处理结果；异步操作沿用原完成与错误传播约定。
 * @author yahyaoo
 */
export const switchFolder = async (filenames: string[], username: string | undefined) => {
    const normalizedUsername = (username && username !== '_open' && username !== 'default') ? username : '_open'
    let successCount = 0
    let failCount = 0

    const cacheIndex = indexManager.load(normalizedUsername, 'cache')
    const musicIndex = indexManager.load(normalizedUsername, 'music')

    const cacheDir = getCacheDir(normalizedUsername, false)
    const musicDir = getCacheDir(normalizedUsername, true)

    for (const filename of filenames) {
        let sourceFolder: 'cache' | 'music' | null = null
        let item: CacheItem | null = null
        let inMusic: CacheItem | undefined = undefined

        // Find which folder it belongs to
        const inCache = Array.from(cacheIndex.values()).find(i => i.filename === filename)
        if (inCache) {
            sourceFolder = 'cache'
            item = inCache
        } else {
            inMusic = Array.from(musicIndex.values()).find(i => i.filename === filename)
            if (inMusic) {
                sourceFolder = 'music'
                item = inMusic
            }
        }

        if (!sourceFolder || !item) {
            console.log(`[文件缓存][调试] 目录切换: 索引中未找到文件`, { filename, inCache: !!inCache, inMusic: !!inMusic })
            failCount++
            continue
        }

        const targetFolder: 'cache' | 'music' = sourceFolder === 'cache' ? 'music' : 'cache'

        // [Constraint] Cannot move from music subfolder to cache
        if (sourceFolder === 'music' && item.subPath && item.subPath !== '') {
            console.log(`[文件缓存] 移动已被拦截: ${filename} 位于分类子目录中，不支持直接移入缓存目录`)
            failCount++
            continue
        }

        const sourceDir = sourceFolder === 'music' ? musicDir : cacheDir
        const targetDir = targetFolder === 'music' ? musicDir : cacheDir

        const sourcePath = path.join(sourceDir, filename)
        const targetPath = path.join(targetDir, filename)

        try {
            console.log(`[文件缓存][调试] 开始切换目录`, { filename, sourceFolder, targetFolder, sourcePath, targetPath })
            const srcExists = storageFs.existsSync(sourcePath)
            const tgtExists = storageFs.existsSync(targetPath)
            console.log(`[文件缓存][调试] 文件存在性校验`, { filename, srcExists, tgtExists })

            if (srcExists) {
                // Ensure target directory exists (including any nested subfolders)
                const targetPathDir = path.dirname(targetPath)
                if (!storageFs.existsSync(targetPathDir)) storageFs.mkdirSync(targetPathDir, { recursive: true })

                // Check collision in target folder
                if (storageFs.existsSync(targetPath)) {
                    console.log(`[文件缓存] 移动冲突: ${filename} 已存在于 ${targetFolder}，跳过`)
                    failCount++
                    continue
                }

                // Move audio file
                try {
                    safeRenameSync(sourcePath, targetPath)
                    console.log(`[文件缓存][调试] 音频文件已移动`, { filename, sourcePath, targetPath })
                } catch (moveErr) {
                    const errMsg = moveErr instanceof Error ? moveErr.stack : String(moveErr)
                    console.error(`[文件缓存][错误] 移动音频文件失败 (${filename}):`, errMsg)
                    failCount++
                    continue
                }

                // Move lyric file if exists
                if (item.lyricFilename) {
                    const sourceLrcPath = path.join(sourceDir, item.lyricFilename)
                    const targetLrcPath = path.join(targetDir, item.lyricFilename)
                    const targetLrcDir = path.dirname(targetLrcPath)
                    if (storageFs.existsSync(sourceLrcPath)) {
                        if (!storageFs.existsSync(targetLrcDir)) storageFs.mkdirSync(targetLrcDir, { recursive: true })
                        if (storageFs.existsSync(targetLrcPath)) storageFs.unlinkSync(targetLrcPath)
                        try {
                            safeRenameSync(sourceLrcPath, targetLrcPath)
                            console.log(`[文件缓存][调试] 歌词文件已移动`, { filename, sourceLrcPath, targetLrcPath })
                        } catch (lrErr) {
                            const errMsg = lrErr instanceof Error ? lrErr.stack : String(lrErr)
                            console.error(`[文件缓存][错误] 移动歌词文件失败 (${filename}):`, errMsg)
                        }
                    } else {
                        console.log(`[文件缓存][调试] 未找到关联歌词文件`, { filename, sourceLrcPath })
                    }
                }

                // Update Index
                const removed = indexManager.remove(normalizedUsername, item.id, sourceFolder, item.quality)
                console.log(`[文件缓存][调试] 索引移除结果`, { filename, removed })
                item.folder = targetFolder
                indexManager.update(normalizedUsername, item, targetFolder)

                // 清理源位置可能变空的歌单/分类目录
                cleanEmptyParentDirs(sourcePath, sourceDir)

                successCount++
            } else {
                console.log(`[文件缓存][调试] 源文件不存在`, { filename, sourcePath })
                failCount++
            }
        } catch (e) {
            const errMsg = e instanceof Error ? e.stack : String(e)
            console.error(`[文件缓存] 移动文件失败 (${filename}):`, errMsg)
            failCount++
        }
    }

    return { successCount, failCount }
}

/**
 * 处理 switchBaseLocation 对应的业务能力，参数和执行顺序保持原实现。
 * @param filenames filenames 原业务参数。
 * @param username 已解析的用户名称。
 * @returns 原处理结果；异步操作沿用原完成与错误传播约定。
 * @author yahyaoo
 */
export const switchBaseLocation = async (filenames: string[], username: string | undefined) => {
    const normalizedUsername = (username && username !== '_open' && username !== 'default') ? username : '_open'
    let successCount = 0
    let failCount = 0
    const sourceLoc = currentCacheLocation
    const targetLoc = sourceLoc === CACHE_ROOTS.DATA ? CACHE_ROOTS.ROOT : CACHE_ROOTS.DATA

    const folders: Array<'cache' | 'music'> = ['cache', 'music']

    // Helper to get dir for a specific location
    const getLocalDir = (folder: string, loc: string) => {
        const folderName = folder === 'music' ? 'music' : 'cache'
        const base = path.isAbsolute(loc) ? loc : (loc === CACHE_ROOTS.DATA ? global.lx.dataPath : process.cwd())
        const userDir = (username && username !== '_open' && username !== 'default') ? username : '_open'
        return path.join(base, folderName, userDir)
    }

    for (const filename of filenames) {
        let sourceFolder: 'cache' | 'music' | null = null
        let item: CacheItem | null = null

        // Find folder in SOURCE location
        for (const folder of folders) {
            const items = indexManager.getAll(normalizedUsername, folder, sourceLoc)
            const found = items.find(i => i.filename === filename)
            if (found) {
                sourceFolder = folder
                item = found
                break
            }
        }

        if (!sourceFolder || !item) {
            failCount++
            continue
        }

        const sourceDir = getLocalDir(sourceFolder, sourceLoc)
        const targetDir = getLocalDir(sourceFolder, targetLoc)

        const sourcePath = path.join(sourceDir, filename)
        const targetPath = path.join(targetDir, filename)

        try {
            if (storageFs.existsSync(sourcePath)) {
                const targetPathDir = path.dirname(targetPath)
                if (!storageFs.existsSync(targetPathDir)) storageFs.mkdirSync(targetPathDir, { recursive: true })

                // Check collision in target location
                if (storageFs.existsSync(targetPath)) {
                    console.log(`[文件缓存] 根路径迁移冲突: ${filename} 已存在于目标位置 ${targetLoc}，跳过`)
                    failCount++
                    continue
                }

                // Move audio file
                safeRenameSync(sourcePath, targetPath)

                // Move lyrics
                if (item.lyricFilename) {
                    const sourceLrcPath = path.join(sourceDir, item.lyricFilename)
                    const targetLrcPath = path.join(targetDir, item.lyricFilename)
                    const targetLrcDir = path.dirname(targetLrcPath)
                    if (storageFs.existsSync(sourceLrcPath)) {
                        if (!storageFs.existsSync(targetLrcDir)) storageFs.mkdirSync(targetLrcDir, { recursive: true })
                        if (storageFs.existsSync(targetLrcPath)) storageFs.unlinkSync(targetLrcPath)
                        safeRenameSync(sourceLrcPath, targetLrcPath)
                    }
                }

                // Update Indices
                indexManager.remove(normalizedUsername, item.id, sourceFolder, item.quality, sourceLoc)
                // item is now in the other location's index
                indexManager.update(normalizedUsername, item, sourceFolder, targetLoc)

                // 清理源位置可能变空的歌单/分类目录
                cleanEmptyParentDirs(sourcePath, sourceDir)

                successCount++
            } else {
                failCount++
            }
        } catch (e) {
            console.error(`[文件缓存] 迁移文件失败 (${filename} 从 ${sourceLoc} 到 ${targetLoc}):`, e)
            failCount++
        }
    }

    return { successCount, failCount, targetLoc }
}

/**
 * 获取 getSubDirectories 对应的业务能力，参数和执行顺序保持原实现。
 * @param username 已解析的用户名称。
 * @param folder folder 原业务参数。
 * @returns 原处理结果；异步操作沿用原完成与错误传播约定。
 * @author yahyaoo
 */
export const getSubDirectories = (username: string | undefined, folder: 'cache' | 'music') => {
    const normalizedUsername = (username && username !== '_open' && username !== 'default') ? username : '_open'
    const root = getCacheDir(normalizedUsername, folder === 'music')
    if (!storageFs.existsSync(root)) return []

    const dirs = new Set<string>()

    // 1. Get from index
    const items = indexManager.getAll(normalizedUsername, folder)
    items.forEach(item => { if (item.subPath) dirs.add(item.subPath) })

    // 2. Scan physical tree (to include empty folders)
    const scanDirs = (dirPath: string, base: string) => {
        if (!storageFs.existsSync(dirPath)) return
        const entries = storageFs.readdirSync(dirPath, { withFileTypes: true })
        for (const entry of entries) {
            if (entry.isDirectory()) {
                const fullPath = path.join(dirPath, entry.name)
                dirs.add(path.relative(base, fullPath).replace(/\\/g, '/'))
                scanDirs(fullPath, base)
            }
        }
    }
    scanDirs(root, root)

    return Array.from(dirs).sort()
}

/**
 * 创建 createSubDirectory 对应的业务能力，参数和执行顺序保持原实现。
 * @param username 已解析的用户名称。
 * @param folder folder 原业务参数。
 * @param subPath subPath 原业务参数。
 * @returns 原处理结果；异步操作沿用原完成与错误传播约定。
 * @author yahyaoo
 */
export const createSubDirectory = (username: string | undefined, folder: 'cache' | 'music', subPath: string) => {
    const root = getCacheDir(username, folder === 'music')
    const target = path.join(root, subPath)
    if (!storageFs.existsSync(target)) {
        storageFs.mkdirSync(target, { recursive: true })
        return true
    }
    return false
}

/**
 * 处理 categorizeFiles 对应的业务能力，参数和执行顺序保持原实现。
 * @param filenames filenames 原业务参数。
 * @param targetSubPath targetSubPath 原业务参数。
 * @param username 已解析的用户名称。
 * @returns 原处理结果；异步操作沿用原完成与错误传播约定。
 * @author yahyaoo
 */
export const categorizeFiles = async (filenames: string[], targetSubPath: string, username: string | undefined) => {
    const normalizedUsername = (username && username !== '_open' && username !== 'default') ? username : '_open'
    const folder = 'music' // Categorization is primarily for music folder
    const root = getCacheDir(normalizedUsername, true)
    const targetDir = path.join(root, targetSubPath)

    if (targetSubPath && !storageFs.existsSync(targetDir)) {
        storageFs.mkdirSync(targetDir, { recursive: true })
    }

    const allItems = indexManager.getAll(normalizedUsername, folder)
    let successCount = 0
    let failCount = 0

    for (const filename of filenames) {
        const item = allItems.find(i => i.filename === filename)
        if (!item) {
            console.warn(`[文件缓存] 分类归档: 未在索引中找到歌曲 ${filename}`)
            failCount++;
            continue
        }

        const oldPath = path.join(root, filename)
        const newFilename = targetSubPath ? path.join(targetSubPath, path.basename(filename)).replace(/\\/g, '/') : path.basename(filename)
        const newPath = path.join(root, newFilename)

        if (oldPath === newPath) { successCount++; continue }

        try {
            // Physically move file
            if (storageFs.existsSync(oldPath)) {
                safeRenameSync(oldPath, newPath)

                // Move lyrics if exist
                const ext = path.extname(filename)
                const oldLrcPath = oldPath.substring(0, oldPath.length - ext.length) + '.lrc'
                const newLrcPath = newPath.substring(0, newPath.length - ext.length) + '.lrc'
                if (storageFs.existsSync(oldLrcPath)) {
                    safeRenameSync(oldLrcPath, newLrcPath)
                }

                // Update index
                item.filename = newFilename
                item.subPath = targetSubPath
                if (item.lyricFilename) {
                    const musicExt = path.extname(newFilename)
                    const lrcExt = path.extname(item.lyricFilename) || '.lrc'
                    item.lyricFilename = newFilename.substring(0, newFilename.length - musicExt.length) + lrcExt
                }

                // 清理原分类目录如果已变空
                cleanEmptyParentDirs(oldPath, root)
            } else {
                failCount++
                continue
            }

            successCount++
        } catch (e: any) {
            console.error('[文件缓存] 分类归档操作失败 (' + filename + '):', e)
            failCount++
        }
    }

    indexManager.save(normalizedUsername, folder)
    return { successCount, failCount }
}

/**
 * 处理 renameSubDirectory 对应的业务能力，参数和执行顺序保持原实现。
 * @param username 已解析的用户名称。
 * @param folder folder 原业务参数。
 * @param oldSubPath oldSubPath 原业务参数。
 * @param newSubPath newSubPath 原业务参数。
 * @returns 原处理结果；异步操作沿用原完成与错误传播约定。
 * @author yahyaoo
 */
export const renameSubDirectory = (username: string | undefined, folder: 'cache' | 'music', oldSubPath: string, newSubPath: string) => {
    const normalizedUsername = (username && username !== '_open' && username !== 'default') ? username : '_open'
    const root = getCacheDir(normalizedUsername, folder === 'music')
    const oldDir = path.join(root, oldSubPath)
    const newDir = path.join(root, newSubPath)

    if (!storageFs.existsSync(oldDir)) return { success: false, message: '原分类目录不存在' }
    if (storageFs.existsSync(newDir)) return { success: false, message: '目标分类目录名称已存在' }

    try {
        safeRenameSync(oldDir, newDir)
    } catch (e: any) {
        console.error('[文件缓存] 重命名目录失败:', e)
        return { success: false, message: e?.message || '重命名目录失败' }
    }

    // Update indexes
    const allItems = indexManager.getAll(normalizedUsername, folder)
    let updatedCount = 0
    for (const item of allItems) {
        if (item.subPath === oldSubPath || item.subPath?.startsWith(oldSubPath + '/')) {
            const relSub = item.subPath === oldSubPath ? '' : item.subPath.slice(oldSubPath.length + 1)
            const updatedSub = relSub ? `${newSubPath}/${relSub}` : newSubPath
            item.subPath = updatedSub

            if (item.filename) {
                const baseName = path.basename(item.filename)
                item.filename = `${updatedSub}/${baseName}`
            }
            if (item.lyricFilename) {
                const baseLrc = path.basename(item.lyricFilename)
                item.lyricFilename = `${updatedSub}/${baseLrc}`
            }
            updatedCount++
        }
    }
    indexManager.save(normalizedUsername, folder)
    return { success: true, updatedCount }
}

/**
 * 删除 deleteSubDirectory 对应的业务能力，参数和执行顺序保持原实现。
 * @param username 已解析的用户名称。
 * @param folder folder 原业务参数。
 * @param subPath subPath 原业务参数。
 * @param deleteSongs deleteSongs 原业务参数。
 * @returns 原处理结果；异步操作沿用原完成与错误传播约定。
 * @author yahyaoo
 */
export const deleteSubDirectory = (username: string | undefined, folder: 'cache' | 'music', subPath: string, deleteSongs: boolean) => {
    const normalizedUsername = (username && username !== '_open' && username !== 'default') ? username : '_open'
    const root = getCacheDir(normalizedUsername, folder === 'music')
    const targetDir = path.join(root, subPath)

    if (!storageFs.existsSync(targetDir)) return { success: false, message: '分类目录不存在' }

    const allItems = indexManager.getAll(normalizedUsername, folder)
    const affectedItems = allItems.filter(item => item.subPath === subPath || item.subPath?.startsWith(subPath + '/'))

    if (deleteSongs) {
        // Remove from index
        for (const item of affectedItems) {
            indexManager.remove(normalizedUsername, item.id, folder, item.quality)
        }
        indexManager.save(normalizedUsername, folder)

        // Remove physically
        try {
            storageFs.rmSync(targetDir, { recursive: true, force: true })
        } catch (e: any) {
            console.error('[文件缓存] 物理删除分类目录失败:', e)
            return { success: false, message: e?.message || '删除物理目录失败' }
        }
        return { success: true, affectedCount: affectedItems.length, action: 'deleted' }
    } else {
        // Move songs and lyrics to root
        let movedCount = 0
        for (const item of affectedItems) {
            const oldAudioPath = path.join(root, item.filename)
            const newFilename = path.basename(item.filename)
            const newAudioPath = path.join(root, newFilename)

            try {
                if (storageFs.existsSync(oldAudioPath)) {
                    if (oldAudioPath !== newAudioPath) {
                        safeRenameSync(oldAudioPath, newAudioPath)
                    }
                }
                if (item.lyricFilename) {
                    const oldLrcPath = path.join(root, item.lyricFilename)
                    const newLrcFilename = path.basename(item.lyricFilename)
                    const newLrcPath = path.join(root, newLrcFilename)
                    if (storageFs.existsSync(oldLrcPath) && oldLrcPath !== newLrcPath) {
                        safeRenameSync(oldLrcPath, newLrcPath)
                    }
                    item.lyricFilename = newLrcFilename
                }

                item.filename = newFilename
                item.subPath = ''
                movedCount++
            } catch (e: any) {
                console.error('[文件缓存] 移动歌曲至根目录失败 (' + item.filename + '):', e)
            }
        }
        indexManager.save(normalizedUsername, folder)

        // Remove empty directory (or with leftover unknown files)
        try {
            storageFs.rmSync(targetDir, { recursive: true, force: true })
        } catch (e: any) {
            console.warn('[文件缓存] 删除已清空分类目录警告:', e)
        }
        return { success: true, affectedCount: movedCount, action: 'moved_to_root' }
    }
}

