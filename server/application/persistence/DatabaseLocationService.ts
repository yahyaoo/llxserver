import fs from 'node:fs'
import path from 'node:path'
import { repositories, dataRoot } from './storage'
import { createAdminRepository } from '../../admin/repository/AdminRepository'
import { createMusicRepository } from '../../music/repository/MusicRepository'
import { writeDatabasePaths, type DatabasePaths } from './BootstrapConfiguration'
import type { SqliteDocumentRepository } from '../../common/persistence/SqliteDocumentRepository'

/**
 * 应用层数据库迁移协调器，统一协调两库但不向业务域暴露其他域仓储。
 * 复制和初始化全部成功后交换连接；引导写入失败时恢复旧连接。
 * @author yahyaoo
 */
export class DatabaseLocationService {
  /** @param root 业务数据目录。 */
  constructor(private readonly root = dataRoot()) {}

  /** @returns 当前实际使用的数据库路径，不从业务配置表读取。 */
  paths(): DatabasePaths {
    const pair = repositories(this.root)
    return { 'database.adminPath': pair.admin.filename, 'database.musicPath': pair.music.filename }
  }

  /**
   * 同步复制待迁移数据库并校验，全部准备成功后切换连接和引导路径。
   * @param requested 一个或两个数据库文件路径。
   * @returns 生效路径与旧文件清理警告。
   * @throws Error 复制、初始化、校验或引导保存失败，原连接继续使用。
   */
  move(requested: Partial<DatabasePaths>): { paths: DatabasePaths, warning: string } {
    const pair = repositories(this.root), current = this.paths(), next = { ...current }
    for (const key of Object.keys(next) as Array<keyof DatabasePaths>) {
      const value = requested[key]
      if (value === undefined) continue
      if (typeof value !== 'string' || !value.trim() || /[<>"|?*\x00-\x1f]/.test(value)) throw new Error('数据库路径格式错误：' + key)
      next[key] = path.resolve(this.root, value.trim())
    }
    const same = (a: string, b: string) => process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b
    if (same(next['database.adminPath'], next['database.musicPath'])) throw new Error('管理库与播放库必须使用不同文件')
    const prepared: Array<{ repository: SqliteDocumentRepository, candidate: SqliteDocumentRepository, oldPath: string, newPath: string }> = []
    const created: string[] = []
    try {
      for (const domain of ['admin', 'music'] as const) {
        const key = domain === 'admin' ? 'database.adminPath' : 'database.musicPath'
        if (same(current[key], next[key])) continue
        fs.mkdirSync(path.dirname(next[key]), { recursive: true })
        if (fs.existsSync(next[key])) {
          // 已有目标只在校验后打开；失败不删除或覆盖用户文件。
          const Database = require('better-sqlite3')
          const probe = new Database(next[key], { readonly: true, fileMustExist: true })
          try {
            if (probe.pragma('quick_check', { simple: true }) !== 'ok') throw new Error('目标数据库完整性检查失败')
            const names = probe.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map((row: any) => row.name)
            const prefix = domain === 'admin' ? 'server_' : 'client_'
            if (names.some((name: string) => !name.startsWith(prefix))) throw new Error('目标数据库类型不匹配')
          } finally { probe.close() }
        } else {
          created.push(next[key])
          // VACUUM INTO 复制所有已提交记录，包括仍在 WAL 中的数据。
          pair[domain].copyTo(next[key])
        }
        const candidate = domain === 'admin' ? createAdminRepository(this.root, next[key]) : createMusicRepository(this.root, next[key])
        prepared.push({ repository: pair[domain], candidate, oldPath: current[key], newPath: next[key] })
        candidate.verifyIntegrity()
      }
      for (const item of prepared) item.repository.swapConnection(item.candidate)
      if (!prepared.length) return { paths: current, warning: '' }
      try { writeDatabasePaths(this.root, next) }
      catch (error) { for (const item of prepared) item.repository.swapConnection(item.candidate); throw error }
    } catch (error: any) {
      for (const item of prepared) item.candidate.close()
      for (const filename of created) for (const suffix of ['', '-wal', '-shm']) { try { fs.unlinkSync(filename + suffix) } catch {} }
      throw new Error('数据库迁移失败，仍使用原数据库：' + error.message)
    }
    const warnings: string[] = []
    for (const item of prepared) {
      item.candidate.close()
      for (const suffix of ['', '-wal', '-shm']) {
        try { if (fs.existsSync(item.oldPath + suffix)) fs.unlinkSync(item.oldPath + suffix) }
        catch { warnings.push('已切换新库，旧文件仍被占用，请稍后清理：' + item.oldPath + suffix) }
      }
    }
    return { paths: next, warning: warnings.join('\n') }
  }
}
