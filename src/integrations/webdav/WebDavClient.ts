/** WebDAV 适配：比较文件摘要、增量同步、完整备份恢复和自动定时同步。 @author yahyaoo */
import storageFs from '../../application/persistence/documentFileSystem'
import fs from 'fs'
import path from 'path'
import http from 'http'
import https from 'https'
import { ZipArchive } from 'archiver'
import { archiveGateway } from '../archive/ArchiveGateway'
import crypto from 'crypto'
import { EventEmitter } from 'events'
import { PassThrough } from 'stream'

/** WebDAV 认证、同步路径、备份间隔和目录排除选项。 @author yahyaoo */
interface WebDAVConfig {
    /** 是否启用 WebDAV 同步。 */
    enable?: boolean
    /** 请求或资源地址。 */
    url: string
    /** 数据所属用户名。 */
    username: string
    /** 连接或服务认证密码。 */
    password: string
    /** 远端增量同步目录。 */
    syncPath?: string
    /** 远端完整备份目录。 */
    backupPath?: string
    /** 增量同步间隔，单位分钟。 */
    interval?: number
    /** 完整备份间隔，单位小时。 */
    backupInterval?: number
    /** 是否排除用户缓存目录。 */
    excludeCache?: boolean  // 排除缓存目录 (data/cache)
    /** 是否排除用户下载音乐目录。 */
    excludeMusic?: boolean  // 排除下载目录 (data/music)
}

/** 单次 WebDAV 文件操作记录，保存时间、类型、路径和结果。 @author yahyaoo */
interface SyncLog {
    /** 记录生成时间，单位毫秒。 */
    timestamp: number
    /** 记录或操作类别。 */
    type: 'upload' | 'download' | 'backup' | 'restore'

    file: string
    /** 当前处理或任务状态。 */
    status: 'success' | 'error'
    /** 处理结果或错误说明。 */
    message?: string
}

const normalizeRemotePath = (p?: string, defaultPath: string = ''): string => {
    let str = (p || '').trim()
    if (!str) str = defaultPath
    if (!str.startsWith('/')) str = '/' + str
    return str.replace(/\/+$/, '')
}

/** 管理 WebDAV 客户端、文件摘要、恢复流程和自动同步定时器。 @author yahyaoo */
class WebDAVSync extends EventEmitter {

    private config: WebDAVConfig
    /** 用户或服务的数据根目录。 */
    private dataPath: string
    /** 远端增量同步目录。 */
    private syncPath: string
    /** 远端完整备份目录。 */
    private backupPath: string
    /** 自动增量同步定时器。 */
    private syncInterval: number // 文件增量变化检测与同步间隔（毫秒）
    /** 完整备份间隔，单位小时。 */
    private backupInterval: number // 全量备份间隔（毫秒）
    /** 是否排除用户缓存目录。 */
    private excludeCache: boolean  // 是否排除缓存目录 (data/cache)
    /** 是否排除用户下载音乐目录。 */
    private excludeMusic: boolean  // 是否排除下载目录 (data/music)

    private watchTimer: NodeJS.Timeout | null = null
    /** 自动完整备份定时器。 */
    private backupTimer: NodeJS.Timeout | null = null
    /** 相对文件路径到上次内容摘要的映射。 */
    private filesHash: Map<string, string> = new Map()
    /** 最近的 WebDAV 同步操作记录。 */
    private syncLogs: SyncLog[] = []
    /** WebDAV 客户端实例。 */
    private client: any = null

    private initPromise: Promise<boolean> | null = null

    private ensuredDirs: Set<string> = new Set()

    /**
 * 保存 WebDAV 配置和本地数据目录，初始化日志与同步状态。
 * @param config 原配置对象。
 * @param dataPath 业务数据根目录。
 * @author yahyaoo
 */
    constructor(config: WebDAVConfig, dataPath: string) {
        super()
        this.syncPath = normalizeRemotePath(config.syncPath, '/lx-sync')
        this.backupPath = normalizeRemotePath(config.backupPath, '/lx-sync-backups')
        this.config = {
            enable: config.enable ?? false,
            url: config.url || '',
            username: config.username || '',
            password: config.password || '',
            syncPath: this.syncPath,
            backupPath: this.backupPath,
        }
        this.syncInterval = (config.interval || 60) * 60 * 1000
        this.backupInterval = (config.backupInterval || 24) * 60 * 60 * 1000
        this.excludeCache = config.excludeCache ?? false
        this.excludeMusic = config.excludeMusic ?? false
        this.dataPath = dataPath
    }

    /**
 * 根据 WebDAV 地址和认证信息创建客户端，并准备同步及备份目录。
 * @param force 原强制操作标记。
 * @author yahyaoo
 */
    async initClient(force = false): Promise<boolean> {
        if (!this.isConfigured()) return false
        if (this.client && !force) return true
        if (this.initPromise) return this.initPromise

        this.initPromise = (async () => {
            try {
                // 动态导入 webdav ESM 模块
                const { createClient } = await import('webdav')
                const isHttps = this.config.url.startsWith('https:')
                const agent = isHttps
                    ? new https.Agent({ keepAlive: true, maxSockets: 20, keepAliveMsecs: 60000, timeout: 60000 })
                    : new http.Agent({ keepAlive: true, maxSockets: 20, keepAliveMsecs: 60000, timeout: 60000 })

                const options: any = {
                    httpAgent: agent,
                    httpsAgent: agent,
                }
                if (this.config.username) options.username = this.config.username
                if (this.config.password) options.password = this.config.password
                this.client = createClient(this.config.url, options)
                console.log('WebDAV client initialized with Keep-Alive connection pooling')
                return true
            } catch (err) {
                console.error('Failed to initialize WebDAV client:', err)
                this.client = null
                return false
            } finally {
                this.initPromise = null
            }
        })()

        return this.initPromise
    }

    /**
 * 检查 WebDAV 是否启用且连接地址与认证配置齐备。
 * @author yahyaoo
 */
    isConfigured(): boolean {
        return !!(this.config.enable && this.config.url && this.config.url.trim() !== '')
    }

    /**
 * 将一条同步操作记录加入历史日志并限制日志长度。
 * @param log 同步操作记录。
 * @author yahyaoo
 */
    private addLog(log: SyncLog) {
        this.syncLogs.unshift(log)
        if (this.syncLogs.length > 100) {
            this.syncLogs = this.syncLogs.slice(0, 100)
        }
        this.emit('log', log)
    }

    /**
 * 返回最近的 WebDAV 同步操作记录。
 * @author yahyaoo
 */
    getSyncLogs(): SyncLog[] {
        return this.syncLogs
    }

    /**
 * 计算本地文件或 SQL 文档导出内容的 MD5 摘要，用于判断变化。
 * @param filePath 文件或文档定位路径。
 * @author yahyaoo
 */
    private getFileHash(filePath: string): string {
        try {
            const buffer = storageFs.readFileSync(filePath)
            const hash = crypto.createHash('md5')
            hash.update(buffer as any)
            return hash.digest('hex')
        } catch {
            return ''
        }
    }

    /**
 * 根据临时文件、数据库、引导文件和缓存排除选项判断是否参与备份。
 * @param relativePath 相对数据目录的文件路径。
 * @author yahyaoo
 */
    private shouldIgnore(relativePath: string): boolean {
        const norm = relativePath.replace(/\\/g, '/').toLowerCase()
        const basename = path.basename(norm)

        // 忽略临时文件、日志、锁文件、操作系统隐匿文件
        if (basename.startsWith('.') || basename.startsWith('temp-')) return true
        if (basename.endsWith('.log') || basename.endsWith('.lock') || basename.endsWith('.tmp')) return true
        if (norm.startsWith('temp-') || norm.includes('/temp-')) return true

        // 忽略全量备份 zip（避免散文件同步备份 zip 造成循环与网络巨量浪费）
        if (basename.startsWith('lx-sync-backup-') && basename.endsWith('.zip')) return true

        // 忽略运行时临时目录
        if (norm === 'tmp' || norm.startsWith('tmp/')) return true
        if (norm === 'logs' || norm.startsWith('logs/')) return true
        if (norm === 'runtime' || norm.startsWith('runtime/')) return true
        // 导出的是仓储文档，运行中的 SQLite/WAL 不进入旧格式备份。
        if (norm === 'database' || norm.startsWith('database/')) return true
        if ((storageFs as any).isBootstrapOrDatabaseFile?.(path.join(this.dataPath, relativePath))) return true

        // 用户配置：排除缓存目录 (data/cache/ 下存放各用户缓存文件)
        if (this.excludeCache) {
            if (norm === 'cache' || norm.startsWith('cache/')) return true
        }

        // 用户配置：排除下载/音乐目录 (data/music/ 下存放各用户下载音乐)
        if (this.excludeMusic) {
            if (norm === 'music' || norm.startsWith('music/')) return true
        }

        return false
    }

    /**
 * 递归扫描参与同步的本地文档与文件，建立相对路径到摘要的映射。
 * @author yahyaoo
 */
    private async scanFiles(): Promise<Map<string, string>> {
        const files = new Map<string, string>()
        const scanDir = (dir: string) => {
            if (!storageFs.existsSync(dir)) return
            let items: string[] = []
            try {
                items = storageFs.readdirSync(dir)
            } catch (err) {
                console.warn(`[WebDAV] Unable to read directory ${dir}:`, err)
                return
            }

            for (const item of items) {
                const fullPath = path.join(dir, item)
                let stat: fs.Stats
                try {
                    stat = storageFs.statSync(fullPath)
                } catch {
                    continue
                }

                const relativePath = path.relative(this.dataPath, fullPath)
                if (this.shouldIgnore(relativePath)) {
                    continue
                }

                if (stat.isDirectory()) {
                    scanDir(fullPath)
                } else {
                    files.set(relativePath, this.getFileHash(fullPath))
                }
            }
        }
        scanDir(this.dataPath)
        return files
    }

    /**
 * 比较当前摘要与上次记录，收集待上传、更新和删除的相对路径。
 * @author yahyaoo
 */
    private async getChangedFiles(): Promise<{ /** 是否发生数据变化。 */
changed: string[],
deleted: string[] }> {
        const currentFiles = await this.scanFiles()
        const changed: string[] = []
        const deleted: string[] = []

        // 检查新增和修改的文件
        for (const [file, hash] of currentFiles) {
            if (!this.filesHash.has(file) || this.filesHash.get(file) !== hash) {
                changed.push(file)
            }
        }

        // 检查已删除的文件
        for (const [file] of this.filesHash) {
            if (!currentFiles.has(file)) {
                deleted.push(file)
            }
        }

        this.filesHash = currentFiles
        return { changed, deleted }
    }

    /**
 * 将 WebDAV 返回路径转换为相对同步根目录的业务路径。
 * @param remoteFilename 远端备份文件名。
 * @author yahyaoo
 */
    private getRelativeRemotePath(remoteFilename: string): string {
        // 重要：不主动进行 decodeURIComponent！
        // 因为如果文件在磁盘上本身就是 URL 编码过的
        // 且 WebDAV 返回的也是该路径，保持原字符才能与本地文件列表精确对应！
        const normSync = this.syncPath.replace(/\\/g, '/').replace(/\/+$/, '')
        const normRemote = remoteFilename.replace(/\\/g, '/')
        const prefix = normSync + '/'

        if (normRemote.startsWith(prefix)) {
            return normRemote.slice(prefix.length).replace(/\\/g, '/')
        }
        if (normRemote.startsWith(normSync)) {
            return normRemote.slice(normSync.length).replace(/^\/+/, '').replace(/\\/g, '/')
        }
        return normRemote.replace(/^\/+/, '').replace(/\\/g, '/')
    }

    /**
 * 按并发上限消费异步操作队列，等待全部操作结束。
 * @param items 批量处理的业务记录。
 * @param concurrency 允许同时执行的下载任务数。
 * @param fn 待执行的异步操作。
 * @author yahyaoo
 */
    private async runConcurrent<T, R>(
        items: T[],
        concurrency: number,
        fn: (item: T, index: number) => Promise<R>
    ): Promise<R[]> {
        if (items.length === 0) return []
        const results: R[] = new Array(items.length)
        let index = 0
        const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
            while (index < items.length) {
                const currentIndex = index++
                results[currentIndex] = await fn(items[currentIndex], currentIndex)
            }
        })
        await Promise.all(workers)
        return results
    }

    /**
     * 逐级安全确保远程目录存在（严格遵循 POSIX 路径与 WebDAV 规约）
     * 自动捕获 405 (MKCOL Method Not Allowed, 目录已存在)、409 (Conflict)、301 等并容错处理
     */
    async ensureRemoteDir(remoteDirPath: string): Promise<boolean> {
        if (!this.client) await this.initClient()
        if (!this.client) return false

        const normalizedDir = remoteDirPath.replace(/\\/g, '/').replace(/\/+$/, '')
        if (!normalizedDir || normalizedDir === '/' || this.ensuredDirs.has(normalizedDir)) {
            return true
        }

        const segments = normalizedDir.split('/').filter(Boolean)
        let cur = ''

        for (const seg of segments) {
            cur += '/' + seg
            if (this.ensuredDirs.has(cur)) continue

            try {
                // 部分 WebDAV 服务器调用 createDirectory 时若目录已存在会报 405
                await this.client.createDirectory(cur, { recursive: false })
            } catch (err: any) {
                const msg = String(err?.message || '')
                const status = err?.status || err?.response?.status
                // 405 (Method Not Allowed), 301, 409 (Conflict) 均表示目录已存在或无需再建
                if (status === 405 || status === 409 || msg.includes('405') || msg.includes('exists')) {
                    // benign - directory already exists
                } else {
                    // 其他错误打印提示但继续允许尝试后续操作
                    // console.warn(`[WebDAV] ensureRemoteDir warning for ${cur}:`, msg)
                }
            }
            this.ensuredDirs.add(cur)
        }

        return true
    }

    /**
 * 删除同步目录中对应的远端文件，并记录成功或失败日志。
 * @param relativePath 相对数据目录的文件路径。
 * @author yahyaoo
 */
    async deleteRemoteFile(relativePath: string): Promise<boolean> {
        if (!this.client) await this.initClient()
        if (!this.client) return false

        try {
            const remotePath = `${this.syncPath}/${relativePath.replace(/\\/g, '/')}`
            await this.client.deleteFile(remotePath)
            this.addLog({
                timestamp: Date.now(),
                type: 'upload', // 借用 upload 类型表示同步操作
                file: relativePath,
                status: 'success',
                message: 'Remote file deleted'
            })
            return true
        } catch (err: any) {
            // 如果远程文件已经不存在，也认为成功
            if (err.status === 404) return true
            console.error(`Failed to delete remote file ${relativePath}:`, err.message)
            return false
        }
    }

    /**
 * 读取本地文件或 SQL 导出内容，上传至对应远端路径并记录结果。
 * @param relativePath 相对数据目录的文件路径。
 * @author yahyaoo
 */
    async uploadFile(relativePath: string): Promise<boolean> {
        if (storageFs.isBootstrapOrDatabaseFile(path.join(this.dataPath, relativePath))) return false
        if (!this.client) await this.initClient()
        if (!this.client) return false

        const localPath = path.join(this.dataPath, relativePath)
        if (!storageFs.existsSync(localPath)) return false

        let stat: fs.Stats
        try {
            stat = storageFs.statSync(localPath)
        } catch {
            return false
        }

        const remotePath = `${this.syncPath}/${relativePath.replace(/\\/g, '/')}`
        const remoteDir = path.posix.dirname(remotePath)

        // 确保远程父目录存在
        await this.ensureRemoteDir(remoteDir)

        // 重试机制：最多 3 次尝试，针对 423 Locked、405、网络波动进行智能退避
        const maxRetries = 3
        let lastError: any = null

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                // 使用流式上传并监控进度
                const readStream = storageFs.createReadStream(localPath)
                const passThrough = new PassThrough()
                let uploadedBytes = 0

                passThrough.on('data', (chunk) => {
                    uploadedBytes += chunk.length
                    this.emit('progress', {
                        type: 'file',
                        status: 'uploading',
                        file: relativePath,
                        current: uploadedBytes,
                        total: stat.size
                    })
                })

                readStream.pipe(passThrough)
                await this.client.putFileContents(remotePath, passThrough, { overwrite: true })

                this.emit('progress', {
                    type: 'file',
                    status: 'success',
                    file: relativePath,
                    current: stat.size,
                    total: stat.size
                })

                this.addLog({
                    timestamp: Date.now(),
                    type: 'upload',
                    file: relativePath,
                    status: 'success',
                })
                return true
            } catch (err: any) {
                lastError = err
                const errMsg = String(err?.message || '')
                const status = err?.status || err?.response?.status

                // 如果是 423 Locked，等待锁释放
                const isLocked = status === 423 || errMsg.includes('423') || errMsg.includes('Locked')
                const isMethodNotAllowed = status === 405 || errMsg.includes('405')

                if (attempt < maxRetries) {
                    const delay = isLocked ? attempt * 1200 : attempt * 600
                    console.warn(`[WebDAV] Upload ${relativePath} attempt ${attempt} failed (${errMsg}), retrying in ${delay}ms...`)
                    if (isMethodNotAllowed) {
                        // 尝试重新确保父目录
                        this.ensuredDirs.delete(remoteDir)
                        await this.ensureRemoteDir(remoteDir)
                    }
                    await new Promise(r => setTimeout(r, delay))
                }
            }
        }

        console.error(`[WebDAV] Failed to upload file ${relativePath} after ${maxRetries} attempts:`, lastError?.message)
        this.emit('progress', {
            type: 'file',
            status: 'error',
            file: relativePath,
            error: lastError?.message || 'Upload failed'
        })
        this.addLog({
            timestamp: Date.now(),
            type: 'upload',
            file: relativePath,
            status: 'error',
            message: `重试${maxRetries}次失败: ${lastError?.message || '未知错误'}`
        })
        // 优雅跳过，返回 false，不阻断整个批量流程
        return false
    }

    /**
 * 获取远端内容，比较摘要后写入本地业务文档或普通文件。
 * @param relativePath 相对数据目录的文件路径。
 * @param rawRemotePath WebDAV 返回的远端原始路径。
 * @author yahyaoo
 */
    async downloadFile(relativePath: string, rawRemotePath?: string): Promise<boolean> {
        if (storageFs.isBootstrapOrDatabaseFile(path.join(this.dataPath, relativePath))) return false
        if (!this.client) await this.initClient()
        if (!this.client) return false

        const defaultRemotePath = `${this.syncPath}/${relativePath.replace(/\\/g, '/')}`
        const primaryRemotePath = rawRemotePath || defaultRemotePath
        const localPath = path.join(this.dataPath, relativePath)

        // 确保本地目录存在
        const localDir = path.dirname(localPath)
        if (!storageFs.existsSync(localDir)) {
            storageFs.mkdirSync(localDir, { recursive: true })
        }

        const maxRetries = 3
        let lastError: any = null

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                let content: any = null
                try {
                    content = await this.client.getFileContents(primaryRemotePath) as any
                } catch (firstErr: any) {
                    // 如果因为 URL 编码差异导致 404，尝试自动回退 (如原始路径 vs decodeURIComponent vs encodeURI)
                    const status = firstErr?.status || firstErr?.response?.status
                    if (status === 404 || String(firstErr?.message).includes('404')) {
                        const candidates = new Set<string>()
                        candidates.add(defaultRemotePath)
                        try { candidates.add(decodeURIComponent(primaryRemotePath)) } catch { }
                        try { candidates.add(encodeURI(decodeURI(primaryRemotePath))) } catch { }

                        let recovered = false
                        for (const altPath of candidates) {
                            if (altPath === primaryRemotePath) continue
                            try {
                                content = await this.client.getFileContents(altPath) as any
                                recovered = true
                                break
                            } catch { }
                        }
                        if (!recovered) throw firstErr
                    } else {
                        throw firstErr
                    }
                }

                // 对比内容哈希，如果一致则跳过写入，避免触发文件系统监控
                if (storageFs.existsSync(localPath)) {
                    const localContent = storageFs.readFileSync(localPath) as any
                    const localHash = crypto.createHash('md5').update(localContent).digest('hex')
                    const remoteHash = crypto.createHash('md5').update(content).digest('hex')

                    if (localHash === remoteHash) {
                        return true
                    }
                }

                storageFs.writeFileSync(localPath, content)


                this.addLog({
                    timestamp: Date.now(),
                    type: 'download',
                    file: relativePath,
                    status: 'success',
                })
                return true
            } catch (err: any) {
                lastError = err
                if (attempt < maxRetries) {
                    await new Promise(r => setTimeout(r, attempt * 600))
                }
            }
        }

        console.error(`[WebDAV] Failed to download file ${relativePath} after ${maxRetries} attempts:`, lastError?.message)
        this.addLog({
            timestamp: Date.now(),
            type: 'download',
            file: relativePath,
            status: 'error',
            message: `下载失败: ${lastError?.message || '未知错误'}`,
        })
        return false
    }

    /**
 * 将当前参与备份的数据打包为 ZIP，排除数据库实体、运行临时目录和备份 ZIP。
 * @author yahyaoo
 */
    async createBackup(): Promise<string | null> {
        try {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
            const zipName = `lx-sync-backup-${timestamp}.zip`
            const zipPath = path.join(this.dataPath, zipName)

            // 预扫描待备份的文件总数，以便提供精确的打包进度条
            const allFiles = await this.scanFiles()
            const totalFiles = Math.max(allFiles.size, 1)

            this.emit('progress', {
                type: 'backup',
                status: 'packing',
                message: `正在准备打包，共 ${totalFiles} 个文件...`,
                current: 0,
                total: totalFiles,
                percent: 2
            })

            await new Promise<void>((resolve, reject) => {
                const output = storageFs.createWriteStream(zipPath)
                // 压缩级别调优：对于音乐、封面及数据库等混合文件，level: 4 或 5 可在保留极佳压缩比的同时将打包装箱耗时提升 3~4 倍
                const archive = new ZipArchive({ zlib: { level: 4 } })

                let fileCount = 0

                // 监听文件添加事件
                archive.on('entry', (entry: any) => {
                    fileCount++
                    const packingPercent = Math.min(48, Math.round(5 + (fileCount / totalFiles) * 43))
                    this.emit('progress', {
                        type: 'backup',
                        status: 'packing',
                        message: `正在打包: ${entry.name}`,
                        current: fileCount,
                        total: totalFiles,
                        percent: packingPercent,
                        file: entry.name
                    })
                })

                output.on('close', () => resolve())
                archive.on('error', (err: Error) => reject(err))

                archive.pipe(output)
                // 统一从存储契约读取，SQL 文档以旧路径导出，便于跨数据目录恢复。
                for (const relative of allFiles.keys()) {
                    const filename = path.join(this.dataPath, relative)
                    archiveGateway.append(archive, storageFs, filename, relative)
                }

                archive.finalize()
            })

            this.emit('progress', {
                type: 'backup',
                status: 'packed',
                message: 'ZIP 压缩包创建完成，准备上传云端...',
                percent: 50
            })

            return zipName
        } catch (err) {
            console.error('Failed to create backup:', err)
            return null
        }
    }

    /**
 * 创建完整备份并上传到远端备份目录，然后按保留规则清理。
 * @param force 原强制操作标记。
 * @author yahyaoo
 */
    async uploadBackup(force = false): Promise<boolean> {
        if (!this.client) await this.initClient()
        if (!this.client) return false

        let zipPath: string | null = null
        try {
            // 检查是否有文件变化
            if (!force) {
                const { changed, deleted } = await this.getChangedFiles()
                if (changed.length === 0 && deleted.length === 0) {
                    console.log('No changes detected, skipping backup')
                    return true
                }
            }

            this.emit('progress', { type: 'backup', status: 'preparing', message: '正在创建备份...' })

            const zipName = await this.createBackup()
            if (!zipName) return false

            zipPath = path.join(this.dataPath, zipName)
            const stat = storageFs.statSync(zipPath)
            const remotePath = `${this.backupPath}/${zipName}`

            // 高性能流式上传：增大缓冲区至 1MB (1024 * 1024)，减少操作系统 I/O 切换与背压调度
            const readStream = storageFs.createReadStream(zipPath, { highWaterMark: 1024 * 1024 })
            const passThrough = new PassThrough({ highWaterMark: 1024 * 1024 })
            let uploadedBytes = 0

            // 节流控制，避免发送过多 SSE 消息
            let lastProgressTime = 0

            passThrough.on('data', (chunk) => {
                uploadedBytes += chunk.length
                const now = Date.now()
                if (now - lastProgressTime > 100 || uploadedBytes === stat.size) { // 至少间隔100ms
                    this.emit('progress', {
                        type: 'backup',
                        status: 'uploading',
                        file: zipName,
                        total: stat.size,
                        current: uploadedBytes
                    })
                    lastProgressTime = now
                }
            })

            // 确保远程备份目录存在
            const remoteDir = path.posix.dirname(remotePath)
            await this.ensureRemoteDir(remoteDir)

            readStream.pipe(passThrough)

            await this.client.putFileContents(remotePath, passThrough, { overwrite: true })

            this.emit('progress', {
                type: 'backup',
                status: 'success',
                file: zipName,
                total: stat.size,
                current: stat.size
            })

            this.addLog({
                timestamp: Date.now(),
                type: 'backup',
                file: zipName,
                status: 'success',
            })

            // 清理旧备份（保留最近5个）
            try {
                await this.cleanOldBackups()
            } catch (e) {
                console.error('Failed to clean old remote backups:', e)
            }

            return true
        } catch (err: any) {
            this.emit('progress', { type: 'backup', status: 'error', error: err.message })
            this.addLog({
                timestamp: Date.now(),
                type: 'backup',
                file: 'backup',
                status: 'error',
                message: err.message,
            })
            return false
        } finally {
            // 确保无论上传成功还是失败，总是及时清理本地临时 zip 文件
            if (zipPath && storageFs.existsSync(zipPath)) {
                try {
                    storageFs.unlinkSync(zipPath)
                } catch (e) {
                    console.error('Failed to cleanup local backup zip:', e)
                }
            }
        }
    }

    /**
 * 扫描全部参与同步的文件并批量上传，报告当前同步进度。
 * @author yahyaoo
 */
    async syncAllFiles(): Promise<boolean> {
        if (!this.client) await this.initClient()
        if (!this.client) {
            this.emit('progress', { type: 'sync', status: 'error', message: 'WebDAV 客户端未初始化' })
            return false
        }

        let total = 0
        let successCount = 0
        let failCount = 0

        try {
            const files = await this.scanFiles()
            const fileList = Array.from(files.keys())
            let count = 0
            total = fileList.length

            if (total === 0) {
                this.emit('progress', { type: 'sync', status: 'finish', total: 0, message: '没有检测到需要同步的数据文件' })
                return true
            }

            this.emit('progress', { type: 'sync', status: 'start', total })

            // 适度并发（4 连接），兼顾吞吐量同时防止 WebDAV 服务端 423 Locked 冲突
            await this.runConcurrent(fileList, 4, async (file) => {
                const ok = await this.uploadFile(file)
                count++
                if (ok) successCount++
                else failCount++

                this.emit('progress', {
                    type: 'sync',
                    status: 'processing',
                    current: count,
                    total,
                    file
                })
            })

            if (failCount > 0) {
                console.warn(`[WebDAV] Sync all files finished: ${successCount} succeeded, ${failCount} skipped/failed.`)
            } else {
                console.log(`[WebDAV] Sync all files finished successfully (${successCount} files).`)
            }
            return failCount === 0
        } catch (err: any) {
            console.error('Sync all files failed:', err)
            this.emit('progress', { type: 'sync', status: 'error', message: err.message || '同步失败' })
            return false
        } finally {
            // 无论如何，在最后必须发射 finish 或 error，保证前端进度条绝对不悬挂！
            this.emit('progress', {
                type: 'sync',
                status: 'finish',
                total,
                successCount,
                failCount,
                message: failCount > 0 ? `同步完成: ${successCount} 个成功，${failCount} 个失败/跳过` : `全部 ${total} 个文件同步成功`
            })
        }
    }

    /**
 * 从备份文件名中解析生成时间，供备份排序和清理使用。
 * @param item 待处理索引记录。
 * @author yahyaoo
 */
    private parseBackupTime(item: any): number {
        if (item.lastmod) {
            const parsed = Date.parse(item.lastmod)
            if (!isNaN(parsed)) return parsed
        }
        const match = item.basename?.match(/lx-sync-backup-(.+?)\.zip$/)
        if (match && match[1]) {
            const parts = match[1].split('T')
            if (parts.length === 2) {
                const timeStr = parts[1].replace(/(\d{2})-(\d{2})-(\d{2})-(\d{3}Z)/, '$1:$2:$3.$4')
                const parsed = Date.parse(`${parts[0]}T${timeStr}`)
                if (!isNaN(parsed)) return parsed
            }
        }
        return 0
    }

    /**
 * 读取远端备份列表，删除超出保留规则的旧备份。
 * @author yahyaoo
 */
    async cleanOldBackups() {
        if (!this.client) return

        try {
            const items = await this.client.getDirectoryContents(`${this.backupPath}/`)
            const backups = items
                .filter((item: any) => item.basename.startsWith('lx-sync-backup-'))
                .sort((a: any, b: any) => this.parseBackupTime(b) - this.parseBackupTime(a))

            // 删除第6个及以后的备份
            for (let i = 5; i < backups.length; i++) {
                await this.client.deleteFile(backups[i].filename)
            }
        } catch (err) {
            console.error('Failed to clean old backups:', err)
        }
    }

    /**
 * 查询远端备份目录，汇总文件大小、生成时间和下载定位信息。
 * @author yahyaoo
 */
    async getBackupList(): Promise<Array<{ /** 文件名称或完整路径。 */
filename: string;
basename: string; /** 文件字节数或记录数量。 */
size?: number;
time: number;
timeStr: string }>> {
        if (!this.client) await this.initClient()
        if (!this.client) return []

        try {
            const items = await this.client.getDirectoryContents(`${this.backupPath}/`)
            const backups = items
                .filter((item: any) => item.basename && item.basename.startsWith('lx-sync-backup-'))
                .sort((a: any, b: any) => this.parseBackupTime(b) - this.parseBackupTime(a))

            return backups.map((item: any) => {
                const time = this.parseBackupTime(item)
                let timeStr = ''
                if (time > 0) {
                    const d = new Date(time)
                    timeStr = d.toLocaleString('zh-CN', { hour12: false })
                } else {
                    timeStr = item.lastmod || '未知时间'
                }
                return {
                    filename: item.filename,
                    basename: item.basename,
                    size: item.size,
                    time,
                    timeStr,
                }
            })
        } catch (err: any) {
            console.error('[WebDAV] Failed to get backup list:', err.message)
            return []
        }
    }

    /**
 * 删除指定远端备份文件，返回操作是否成功。
 * @param targetFilename 目标音频文件名。
 * @author yahyaoo
 */
    async deleteBackupFile(targetFilename: string): Promise<boolean> {
        if (!this.client) await this.initClient()
        if (!this.client) return false

        try {
            const remotePath = targetFilename.startsWith('/') ? targetFilename : `${this.backupPath}/${targetFilename}`
            await this.client.deleteFile(remotePath)
            const basename = path.basename(remotePath)
            this.addLog({
                timestamp: Date.now(),
                type: 'backup',
                file: basename,
                status: 'success',
                message: `已删除云端备份: ${basename}`
            })
            return true
        } catch (err: any) {
            console.error(`[WebDAV] Failed to delete backup ${targetFilename}:`, err.message)
            this.addLog({
                timestamp: Date.now(),
                type: 'backup',
                file: targetFilename,
                status: 'error',
                message: `删除备份失败: ${err.message}`
            })
            return false
        }
    }

    /**
 * 下载选定完整备份，解压到业务数据目录并发出恢复进度。
 * @param targetFilename 目标音频文件名。
 * @author yahyaoo
 */
    async restoreBackupFile(targetFilename?: string): Promise<boolean> {
        if (!this.client) await this.initClient()
        if (!this.client) return false

        try {
            this.emit('progress', { type: 'restore', status: 'start', message: '正在检索备份数据...' })

            let targetItem: any = null
            if (targetFilename) {
                // 用户指定了恢复的文件名或路径
                const basename = path.basename(targetFilename)
                targetItem = {
                    filename: targetFilename.startsWith('/') ? targetFilename : `${this.backupPath}/${targetFilename}`,
                    basename
                }
            } else {
                const items = await this.client.getDirectoryContents(`${this.backupPath}/`)
                const backups = items
                    .filter((item: any) => item.basename.startsWith('lx-sync-backup-'))
                    .sort((a: any, b: any) => this.parseBackupTime(b) - this.parseBackupTime(a))

                if (backups.length === 0) {
                    this.emit('progress', { type: 'restore', status: 'error', message: '云端未找到任何全量备份文件' })
                    return false
                }
                targetItem = backups[0]
            }

            this.emit('progress', {
                type: 'restore',
                status: 'downloading',
                message: `正在下载备份: ${targetItem.basename}`
            })

            const content = await this.client.getFileContents(targetItem.filename)
            const zipPath = path.join(this.dataPath, 'temp-restore.zip')

            storageFs.writeFileSync(zipPath, content as any)

            this.emit('progress', {
                type: 'restore',
                status: 'extracting',
                message: '正在解压备份文件...'
            })

            await this.extractZip(zipPath, this.dataPath)
            storageFs.unlinkSync(zipPath)

            // 检查恢复后是否包含 SQL 系统配置文档，缺失时导出当前配置补传
            const targetConfigPath = path.join(this.dataPath, 'system-configuration.json')
            if (!storageFs.existsSync(targetConfigPath)) {
                console.log('Backup restored but system configuration is missing in SQL storage, saving current config and uploading...')
                if (global.lx && global.lx.saveConfig) {
                    global.lx.saveConfig()
                }
                await this.uploadFile('system-configuration.json')
            }

            this.emit('progress', { type: 'restore', status: 'finish', message: '全量备份已成功恢复并还原！' })

            this.addLog({
                timestamp: Date.now(),
                type: 'restore',
                file: targetItem.basename,
                status: 'success',
            })

            return true
        } catch (err: any) {
            this.emit('progress', { type: 'restore', status: 'error', message: `备份恢复失败: ${err.message}` })
            this.addLog({
                timestamp: Date.now(),
                type: 'restore',
                file: targetFilename || 'backup',
                status: 'error',
                message: err.message,
            })
            return false
        }
    }

    /**
 * 选择最新远端备份并恢复其业务数据。
 * @author yahyaoo
 */
    async downloadLatestBackup(): Promise<boolean> {
        return this.restoreBackupFile()
    }

    /**
 * 递归下载远端增量同步目录中的业务文件，并恢复本地文档。
 * @author yahyaoo
 */
    async restoreScatteredFiles(): Promise<boolean> {
        if (!this.client) await this.initClient()
        if (!this.client) return false

        try {
            const items = await this.client.getDirectoryContents(`${this.syncPath}/`, { deep: true })
            const files = items.filter((item: any) => item.type === 'file')

            if (files.length === 0) {
                this.emit('progress', { type: 'restore', status: 'error', message: `云端散文件目录 (${this.syncPath}) 为空` })
                return false
            }

            console.log(`Restoring ${files.length} scattered files from WebDAV (${this.syncPath})...`)
            let current = 0
            let hasConfig = false

            this.emit('progress', { type: 'restore', status: 'start', total: files.length, message: '开始比对并增量恢复散文件...' })

            const remoteFileSet = new Set<string>()
            const localFiles = await this.scanFiles()
            const filesToDownload: { /** 待处理的文件条目。 */
file: any; /** 相对业务目录的路径。 */
relativePath: string }[] = []

            for (const file of files) {
                const relativePath = this.getRelativeRemotePath(file.filename)
                if (this.shouldIgnore(relativePath)) {
                    continue
                }

                if (relativePath === 'system-configuration.json') hasConfig = true
                remoteFileSet.add(relativePath)

                // 如果本地存在该文件，且大小一致，跳过不必要下载
                const localPath = path.join(this.dataPath, relativePath)
                if (storageFs.existsSync(localPath)) {
                    const localStat = storageFs.statSync(localPath)
                    const remoteSize = file.size !== undefined ? Number(file.size) : NaN
                    if (!isNaN(remoteSize) && localStat.size === remoteSize) {
                        continue
                    }
                }
                filesToDownload.push({ file, relativePath })
            }

            if (filesToDownload.length === 0) {
                console.log(`All remote files are up to date locally, skipping restore download.`)
            } else {
                console.log(`Downloading ${filesToDownload.length} updated/new files from WebDAV (${this.syncPath})...`)
                const total = filesToDownload.length
                for (const item of filesToDownload) {
                    current++
                    this.emit('progress', {
                        type: 'restore',
                        status: 'processing',
                        current,
                        total,
                        file: item.relativePath,
                        message: `正在恢复散文件 (${current}/${total})`
                    })
                    await this.downloadFile(item.relativePath, item.file.filename)
                }
            }

            // 云端缺少系统配置文档时，将当前生效配置写入管理库并补传
            if (!hasConfig) {
                console.log('Cloud system configuration not found, saving current memory config and uploading...')
                if (global.lx && global.lx.saveConfig) {
                    global.lx.saveConfig()
                }
                await this.uploadFile('system-configuration.json')
            }

            // 双向数据一致性补齐：检查本地是否存在但云端缺失的文件，自动补传至云端
            const missingOnRemote: string[] = []
            for (const relativePath of localFiles.keys()) {
                const normLocal = relativePath.replace(/\\/g, '/')
                if (!remoteFileSet.has(normLocal) && !this.shouldIgnore(normLocal)) {
                    missingOnRemote.push(normLocal)
                }
            }
            if (missingOnRemote.length > 0) {
                console.log(`[WebDAV] Found ${missingOnRemote.length} local files missing on cloud, uploading missing files...`)
                let uploadedCount = 0
                const uploadTotal = missingOnRemote.length
                for (const file of missingOnRemote) {
                    uploadedCount++
                    this.emit('progress', {
                        type: 'restore',
                        status: 'processing',
                        current: uploadedCount,
                        total: uploadTotal,
                        file,
                        message: `正在向云端补齐缺失文件 (${uploadedCount}/${uploadTotal})`
                    })
                    await this.uploadFile(file)
                }
            }

            this.emit('progress', { type: 'restore', status: 'finish', total: files.length, message: '散文件增量恢复完成' })
            return true
        } catch (err: any) {
            console.error(`[WebDAV] Restore scattered files failed:`, err.message)
            this.emit('progress', { type: 'restore', status: 'error', message: `恢复散文件失败: ${err.message}` })
            return false
        }
    }

    /**
 * 通过压缩包接口还原业务数据，阻止路径越界和运行数据库覆盖。
 * @param zipPath 待解压 ZIP 文件路径。
 * @param targetPath 目标数据目录。
 * @author yahyaoo
 */
    public async extractZip(zipPath: string, targetPath: string): Promise<void> {
        await archiveGateway.extract(storageFs, zipPath, targetPath, true)
    }

    /**
 * 比较本地和远端变化，执行增量上传、下载及删除并更新同步时间。
 * @author yahyaoo
 */
    async syncChangedFiles() {
        const { changed, deleted } = await this.getChangedFiles()
        if (changed.length === 0 && deleted.length === 0) return

        if (changed.length > 0) {
            console.log(`Syncing ${changed.length} changed files to WebDAV...`)
            let failCount = 0
            await this.runConcurrent(changed, 5, async (file) => {
                const ok = await this.uploadFile(file)
                if (!ok) failCount++
            })
            if (failCount > 0) {
                console.error(`[WebDAV] Sync changed files completed with ${failCount} errors out of ${changed.length} files.`)
            }
        }

        if (deleted.length > 0) {
            console.log(`Deleting ${deleted.length} remote files...`)
            for (const file of deleted) {
                await this.deleteRemoteFile(file)
            }
        }
    }

    /**
 * 优先还原远端散文件，失败或无数据时尝试最新完整备份。
 * @param options 可选操作参数，沿用原默认值。
 * @author yahyaoo
 */
    async restoreFromRemote(options?: { /** 当前处理模式。 */
mode?: 'auto' | 'zip' | 'files';
targetFilename?: string }): Promise<boolean> {
        if (!this.client) await this.initClient()
        if (!this.client) return false

        const mode = options?.mode || 'auto'

        if (mode === 'zip') {
            return this.restoreBackupFile(options?.targetFilename)
        }

        if (mode === 'files') {
            return this.restoreScatteredFiles()
        }

        // 1. 尝试恢复散文件
        try {
            const items = await this.client.getDirectoryContents(`${this.syncPath}/`, { deep: true })
            const files = items.filter((item: any) => item.type === 'file')

            if (files.length > 0) {
                console.log(`Restoring ${files.length} files from WebDAV (${this.syncPath})...`)
                const total = files.length
                let current = 0
                let hasConfig = false

                this.emit('progress', { type: 'restore', status: 'start', total, message: '开始从云端恢复数据...' })

                const remoteFileSet = new Set<string>()
                const localFiles = await this.scanFiles()
                const filesToDownload: { /** 待处理的文件条目。 */
file: any; /** 相对业务目录的路径。 */
relativePath: string }[] = []

                for (const file of files) {
                    const relativePath = this.getRelativeRemotePath(file.filename)
                    if (this.shouldIgnore(relativePath)) {
                        continue
                    }

                    if (relativePath === 'system-configuration.json') hasConfig = true
                    remoteFileSet.add(relativePath)

                    // 如果本地存在该文件，且大小一致，跳过不必要下载
                    const localPath = path.join(this.dataPath, relativePath)
                    if (storageFs.existsSync(localPath)) {
                        const localStat = storageFs.statSync(localPath)
                        const remoteSize = file.size !== undefined ? Number(file.size) : NaN
                        if (!isNaN(remoteSize) && localStat.size === remoteSize) {
                            continue
                        }
                    }
                    filesToDownload.push({ file, relativePath })
                }

                if (filesToDownload.length === 0) {
                    console.log(`All ${files.length} remote files are up to date locally, skipping restore download.`)
                } else {
                    console.log(`Downloading ${filesToDownload.length} updated/new files from WebDAV (${this.syncPath})...`)
                    const downloadTotal = filesToDownload.length
                    for (const item of filesToDownload) {
                        current++
                        this.emit('progress', {
                            type: 'restore',
                            status: 'processing',
                            current,
                            total: downloadTotal,
                            file: item.relativePath,
                            message: `正在恢复文件 (${current}/${downloadTotal})`
                        })
                        await this.downloadFile(item.relativePath, item.file.filename)
                    }
                }

                // 云端缺少系统配置文档时，将当前生效配置写入管理库并补传
                if (!hasConfig) {
                    console.log('Cloud system configuration not found, saving current memory config and uploading...')
                    if (global.lx && global.lx.saveConfig) {
                        global.lx.saveConfig()
                    }
                    await this.uploadFile('system-configuration.json')
                }

                // 双向数据一致性补齐：检查本地是否存在但云端缺失的文件，自动补传至云端
                const missingOnRemote: string[] = []
                for (const relativePath of localFiles.keys()) {
                    const normLocal = relativePath.replace(/\\/g, '/')
                    if (!remoteFileSet.has(normLocal) && !this.shouldIgnore(normLocal)) {
                        missingOnRemote.push(normLocal)
                    }
                }
                if (missingOnRemote.length > 0) {
                    console.log(`[WebDAV] Found ${missingOnRemote.length} local files missing on cloud, uploading missing files...`)
                    let uploadedCount = 0
                    const uploadTotal = missingOnRemote.length
                    for (const file of missingOnRemote) {
                        uploadedCount++
                        this.emit('progress', {
                            type: 'restore',
                            status: 'processing',
                            current: uploadedCount,
                            total: uploadTotal,
                            file,
                            message: `正在向云端补齐缺失文件 (${uploadedCount}/${uploadTotal})`
                        })
                        await this.uploadFile(file)
                    }
                }

                this.emit('progress', { type: 'restore', status: 'finish', total, message: '数据恢复完成' })
                return true
            }
        } catch (err: any) {
            // 忽略远程同步目录不存在的错误，继续尝试恢复备份
            console.log(`Scattered files not found at ${this.syncPath} or error, trying backup...`, err.message)
        }

        // 2. 尝试恢复备份
        try {
            console.log('Downloading latest backup...')
            this.emit('progress', { type: 'restore', status: 'start', message: '正在从云端下载备份...' })
            const result = await this.downloadLatestBackup()
            if (result) {
                // 检查恢复后是否包含 SQL 系统配置文档，缺失时导出当前配置补传
                const targetConfigPath = path.join(this.dataPath, 'system-configuration.json')
                if (!storageFs.existsSync(targetConfigPath)) {
                    console.log('Backup restored but system configuration is missing in SQL storage, saving current config and uploading...')
                    if (global.lx && global.lx.saveConfig) {
                        global.lx.saveConfig()
                    }
                    await this.uploadFile('system-configuration.json')
                }
                this.emit('progress', { type: 'restore', status: 'finish', message: '备份恢复完成' })
                return true
            } else {
                // 如果未找到散文件也未找到备份，说明是第一次配置或云端为空
                // 主动全量上传本地所有文件到云端进行初始化（后台异步执行，不阻塞启动）
                console.log(`Cloud is empty, saving current config and uploading all files to initialize ${this.syncPath}...`)
                this.emit('progress', { type: 'restore', status: 'processing', message: '云端为空，正在后台同步本地全部数据到云端...' })

                // 保存当前内存中的配置（包含环境变量生效后的结果）到磁盘
                if (global.lx && global.lx.saveConfig) {
                    global.lx.saveConfig()
                }

                void this.syncAllFiles().then((res) => {
                    if (res) {
                        this.emit('progress', { type: 'restore', status: 'finish', message: '云端配置与全部数据初始化完成' })
                    }
                })
                return false
            }
        } catch (err: any) {
            console.error('Failed to restore from remote:', err)
            this.emit('progress', { type: 'restore', status: 'error', message: '恢复失败: ' + err.message })
            return false
        }
    }

    /**
 * 验证 WebDAV 地址和认证，返回测试结果及错误原因。
 * @author yahyaoo
 */
    async testConnection(): Promise<{ /** 操作是否成功。 */
success: boolean; /** 处理结果或错误说明。 */
message: string }> {
        // 检查配置是否完整
        if (!this.config.enable) {
            return {
                success: false,
                message: '请先在系统配置中启用 WebDAV 同步服务'
            };
        }
        if (!this.config.url || this.config.url.trim() === '') {
            return {
                success: false,
                message: '请先在系统配置中填写 WebDAV 服务器地址 (URL)'
            };
        }

        try {
            const initialized = await this.initClient();
            if (!initialized || !this.client) {
                return { success: false, message: 'WebDAV客户端初始化失败，请检查配置是否正确' };
            }

            // 增加 10 秒超时控制，避免请求无限挂起
            const timeoutPromise = new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error('连接超时，请检查 WebDAV 地址及网络连接')), 10000)
            )

            await Promise.race([
                this.client.getDirectoryContents('/'),
                timeoutPromise
            ])

            return { success: true, message: '连接成功！WebDAV配置正确' };
        } catch (err: any) {
            let errorMsg = '连接失败';
            if (err.message) {
                if (err.message.includes('401')) {
                    errorMsg = '认证失败，请检查用户名和密码';
                } else if (err.message.includes('404')) {
                    errorMsg = 'WebDAV路径不存在，请检查URL';
                } else if (err.message.includes('ENOTFOUND') || err.message.includes('ECONNREFUSED')) {
                    errorMsg = '无法连接到服务器，请检查URL和网络';
                } else {
                    errorMsg = err.message;
                }
            }
            return { success: false, message: errorMsg };
        }
    }

    /**
 * 设置增量同步和完整备份定时任务；使用当前配置的分钟与小时间隔。
 * @author yahyaoo
 */
    startAutoSync() {
        if (!this.isConfigured()) return

        // 避免重复启动定时器
        this.stopAutoSync()

        console.log('Starting auto file change detection...')

        // 初始化文件哈希
        void this.scanFiles().then(files => {
            this.filesHash = files
        })

        // 按配置的时间间隔检查增量文件变化
        this.watchTimer = setInterval(() => {
            void this.syncChangedFiles()
        }, this.syncInterval)

        // 每24小时创建备份（如果有变化）
        this.backupTimer = setInterval(() => {
            void this.uploadBackup()
        }, this.backupInterval)
    }

    /**
 * 清除增量同步和完整备份定时器。
 * @author yahyaoo
 */
    stopAutoSync() {
        if (this.watchTimer) {
            clearInterval(this.watchTimer)
            this.watchTimer = null
        }
        if (this.backupTimer) {
            clearInterval(this.backupTimer)
            this.backupTimer = null
        }
        console.log('Auto sync stopped')
    }

    /**
 * 更新 WebDAV 连接与排除配置，重建客户端并重新安排自动任务。
 * @param config 原配置对象。
 * @author yahyaoo
 */
    updateConfig(config: Partial<WebDAVConfig>) {
        let changed = false
        if (config.enable !== undefined && config.enable !== this.config.enable) {
            this.config.enable = config.enable
            changed = true
        }
        if (config.url !== undefined && config.url !== this.config.url) {
            this.config.url = config.url
            changed = true
        }
        if (config.username !== undefined && config.username !== this.config.username) {
            this.config.username = config.username
            changed = true
        }
        if (config.password !== undefined && config.password !== this.config.password) {
            this.config.password = config.password
            changed = true
        }
        if (config.syncPath !== undefined) {
            const newSyncPath = normalizeRemotePath(config.syncPath, '/lx-sync')
            if (newSyncPath !== this.syncPath) {
                this.syncPath = newSyncPath
                this.config.syncPath = newSyncPath
                changed = true
            }
        }
        if (config.backupPath !== undefined) {
            const newBackupPath = normalizeRemotePath(config.backupPath, '/lx-sync-backups')
            if (newBackupPath !== this.backupPath) {
                this.backupPath = newBackupPath
                this.config.backupPath = newBackupPath
                changed = true
            }
        }
        if (config.interval !== undefined && (config.interval * 60 * 1000) !== this.syncInterval) {
            this.syncInterval = config.interval * 60 * 1000
            changed = true
        }
        if (config.backupInterval !== undefined && (config.backupInterval * 60 * 60 * 1000) !== this.backupInterval) {
            this.backupInterval = config.backupInterval * 60 * 60 * 1000
            changed = true
        }
        if (config.excludeCache !== undefined && config.excludeCache !== this.excludeCache) {
            this.excludeCache = config.excludeCache
            changed = true
        }
        if (config.excludeMusic !== undefined && config.excludeMusic !== this.excludeMusic) {
            this.excludeMusic = config.excludeMusic
            changed = true
        }

        if (changed) {
            this.client = null
            this.ensuredDirs.clear()
            this.stopAutoSync()
            if (this.isConfigured()) {
                void this.initClient(true).then(() => {
                    this.startAutoSync()
                })
            }
        }
    }
}

export default WebDAVSync
