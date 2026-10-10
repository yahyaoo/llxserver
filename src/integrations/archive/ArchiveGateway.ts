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
   * 追加 append 对应的业务能力，参数和执行顺序保持原实现。
   * @param archive archive 原业务参数。
   * @param filesystem filesystem 原业务参数。
   * @param filename 文件或文档定位路径。
   * @param name 原名称或查询词。
   * @returns 原处理结果；异步操作沿用原完成与错误传播约定。
   * @author yahyaoo
   */
  append(archive, filesystem, filename, name) {
    if (filesystem.statSync(filename).isDirectory()) {
      for (const entry of filesystem.readdirSync(filename)) this.append(archive, filesystem, path.join(filename, entry), name + '/' + entry)
    } else {
      archive.append(filesystem.createReadStream(filename), { name: name.replace(/\\/g, '/'), date: filesystem.statSync(filename).mtime })
    }
  },
  /**
   * 提取 extract 对应的业务能力，参数和执行顺序保持原实现。
   * @param filesystem filesystem 原业务参数。
   * @param zipPath zipPath 原业务参数。
   * @param targetPath targetPath 原业务参数。
   * @param skipDatabase skipDatabase 原业务参数。
   * @returns 原处理结果；异步操作沿用原完成与错误传播约定。
   * @author yahyaoo
   */
  async extract(filesystem, zipPath, targetPath, skipDatabase = false) {
    const archive = await Open.file(zipPath)
    const root = path.resolve(targetPath)
    const entries: Array<{ /**
 * filename 字段，沿用原业务结构与空值约定。
 */
filename: string, /**
 * entry 字段，沿用原业务结构与空值约定。
 */
entry: typeof archive.files[number] }> = []
    // 校验全部路径后再写入，数据库文件不能在持有连接时被覆盖。
    for (const entry of archive.files) {
      const relative = entry.path.replace(/\\/g, '/')
      if (skipDatabase && (relative === 'database' || relative.startsWith('database/'))) continue
      const filename = path.resolve(root, relative)
      if (filename !== root && !filename.startsWith(root + path.sep)) throw new Error('备份条目超出目标目录')
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
