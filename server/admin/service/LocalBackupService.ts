import path from 'node:path'
import { ZipArchive } from 'archiver'
import storageFs from '../../application/persistence/documentFileSystem'
import { archiveGateway } from '../../integrations/archive/ArchiveGateway'
import { repositories } from '../../application/persistence/storage'

const directoryBackup = 'music-directories.backup.json'

/** 本地 ZIP 备份仅导出业务文档与文件，排除运行中的数据库和引导配置。 */
export class LocalBackupService {
  constructor(private readonly dataPath: string) {}
  /** 判定不能进入备份的临时文件和基础设施文件。 */
  shouldIgnore(relative: string): boolean {
    const normalized = relative.replace(/\\/g, '/').toLowerCase(), basename = path.basename(normalized)
    return basename.startsWith('.') || basename.startsWith('temp-') || /\.(log|lock|tmp)$/.test(basename)
      || /^(database|tmp|logs|runtime)(\/|$)/.test(normalized)
      || /^(lx-sync-backup-|llx-backup-).*\.zip$/.test(basename)
      || storageFs.isBootstrapOrDatabaseFile(path.join(this.dataPath, relative))
  }
  /** 遍历存储适配器，使已迁移 SQL 文档继续以业务路径导出。 */
  async scanFiles(): Promise<Map<string, string>> {
    const result = new Map<string, string>()
    const walk = async (directory: string) => {
      for (const entry of await storageFs.promises.readdir(directory, { withFileTypes: true })) {
        const filename = path.join(directory, entry.name), relative = path.relative(this.dataPath, filename)
        if (this.shouldIgnore(relative) || entry.isSymbolicLink()) continue
        if (entry.isDirectory()) await walk(filename)
        else result.set(relative, '')
      }
    }
    await walk(this.dataPath)
    return result
  }
  /** 生成一致业务文档 ZIP，错误由调用方返回。 */
  async createBackup(): Promise<string> {
    const files = await this.scanFiles()
    const name = 'llx-backup-' + new Date().toISOString().replace(/[:.]/g, '-') + '.zip'
    await new Promise<void>((resolve, reject) => {
      const output = storageFs.createWriteStream(path.join(this.dataPath, name))
      const archive = new ZipArchive({ zlib: { level: 4 } })
      output.on('close', resolve); output.on('error', reject); archive.on('error', reject)
      archive.pipe(output)
      for (const relative of files.keys()) if (relative !== directoryBackup) archiveGateway.append(archive, storageFs, path.join(this.dataPath, relative), relative)
      archive.append(JSON.stringify({ version: 1, directories: repositories(this.dataPath).admin.exportMusicDirectories() }), { name: directoryBackup })
      void archive.finalize().catch(reject)
    })
    return name
  }
  /** 经归档网关校验路径后恢复业务数据。 */
  async extractZip(filename: string, target: string): Promise<void> {
    await archiveGateway.extract(storageFs, filename, target, true)
    const manifest = path.join(target, directoryBackup)
    if (storageFs.existsSync(manifest)) {
      const backup = JSON.parse(await storageFs.promises.readFile(manifest, 'utf8'))
      if (backup.version !== 1 || !Array.isArray(backup.directories) || backup.directories.some((row: any) => typeof row.username !== 'string' || !/^[a-f0-9]{16}$/.test(row.id) || typeof row.path !== 'string' || !path.isAbsolute(row.path) || !Number.isInteger(row.scanMinutes) || row.scanMinutes < 1 || row.scanMinutes > 1440)) throw new Error('备份中的音乐目录配置无效')
      repositories(target).admin.restoreMusicDirectories(backup.directories)
      storageFs.unlinkSync(manifest)
    }
  }
}
