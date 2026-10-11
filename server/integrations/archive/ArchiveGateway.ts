import path from 'node:path'
import type fs from 'node:fs'
import type { ZipArchive } from 'archiver'
import { Open } from 'unzipper'

/** 压缩包边界接口，存储由应用注入，不直接访问管理或播放器数据库。 @author yahyaoo */
export interface ArchiveGateway {
  /** 将一个文件或目录按原相对名称加入压缩包。 */
  append(archive: ZipArchive, filesystem: typeof fs, filename: string, name: string): void
  /** 解压到指定目录，拒绝越界路径。 */
  extract(filesystem: typeof fs, zipPath: string, targetPath: string, skipDatabase?: boolean): Promise<void>
}

/** 压缩包适配器，SQL 导出流和普通文件流使用同一契约。 @author yahyaoo */
export const archiveGateway: ArchiveGateway = {
  /**
 * 递归枚举目录，将 SQL 文档导出流或普通文件流按相对路径加入 ZIP。
 * @param archive 目标 ZIP 压缩包。
 * @param filesystem 应用注入的文件系统或 SQL 文档适配器。
 * @param filename 文件或文档定位路径。
 * @param name 对象名称或归档内相对名称。
 * @author yahyaoo
 */
  append(archive, filesystem, filename, name) {
    if ((filesystem as any).isBootstrapOrDatabaseFile?.(filename)) return
    if (filesystem.statSync(filename).isDirectory()) {
      for (const entry of filesystem.readdirSync(filename)) this.append(archive, filesystem, path.join(filename, entry), name + '/' + entry)
    } else {
      archive.append(filesystem.createReadStream(filename), { name: name.replace(/\\/g, '/'), date: filesystem.statSync(filename).mtime })
    }
  },
  /**
 * 校验全部 ZIP 条目路径，再逐项写入目标目录；可排除运行数据库及引导文件。
 * @param filesystem 应用注入的文件系统或 SQL 文档适配器。
 * @param zipPath 待解压 ZIP 文件路径。
 * @param targetPath 目标数据目录。
 * @param skipDatabase 是否跳过引导文件与数据库实体。
 * @author yahyaoo
 */
  async extract(filesystem, zipPath, targetPath, skipDatabase = false) {
    const archive = await Open.file(zipPath)
    const root = path.resolve(targetPath)
    const entries: Array<{ /** 文件名称或完整路径。 */
filename: string,
entry: typeof archive.files[number] }> = []
    // 校验全部路径后再写入，数据库文件不能在持有连接时被覆盖。
    for (const entry of archive.files) {
      const relative = entry.path.replace(/\\/g, '/')
      if (skipDatabase && (relative === 'database' || relative.startsWith('database/'))) continue
      const filename = path.resolve(root, relative)
      if (filename !== root && !filename.startsWith(root + path.sep)) throw new Error('备份条目超出目标目录')
      if (skipDatabase && (relative === 'config.js' || relative === 'config.js.legacy.js' || (filesystem as any).isBootstrapOrDatabaseFile?.(filename))) continue
      entries.push({ filename, entry })
    }
    for (const { filename, entry } of entries) {
      if (entry.type === 'Directory') filesystem.mkdirSync(filename, { recursive: true })
      else {
        filesystem.mkdirSync(path.dirname(filename), { recursive: true })
        filesystem.writeFileSync(filename, await entry.buffer())
      }
    }
  },
}
