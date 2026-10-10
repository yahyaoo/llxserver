import fs from 'node:fs'
import path from 'node:path'
import { EventEmitter } from 'node:events'
import { createAdminRepository } from '../../admin/repository/AdminRepository'
import { adminTables } from '../../admin/repository/catalog'
import { createMusicRepository } from '../../music/repository/MusicRepository'
import { musicTables } from '../../music/repository/catalog'
import type { SqliteDocumentRepository } from '../../common/persistence/SqliteDocumentRepository'
import { readDatabasePaths } from './BootstrapConfiguration'

/** 应用装配层：只在此处选择数据库，两个业务域不导入彼此仓储。 @author yahyaoo */
export interface StorageTarget {
  /** 所属数据库连接。 */
  repository: SqliteDocumentRepository
  /** 注册的业务表名。 */
  table: string
  /** 原有持久化位置，用于兼容定位及迁移。 */
  key: string
}
/** 数据变动通知用于保留音源热加载；不暴露数据库内容。 @author yahyaoo */
export const storageEvents = new EventEmitter()
const stores = new Map<string, { /** 管理域 SQLite 仓储。 */
admin: SqliteDocumentRepository,
music: SqliteDocumentRepository }>()

/** @returns 当前数据根目录，沿用原 DATA_PATH 配置优先级。 */
export function dataRoot(): string { return path.resolve(global.lx?.dataPath || process.env.DATA_PATH || path.join(process.cwd(), 'data')) }

/** @param root 数据目录。 @returns 两个独立仓储实例。 */
export function repositories(root = dataRoot()) {
  root = path.resolve(root)
  let pair = stores.get(root)
  if (!pair) {
    const paths = readDatabasePaths(root)
    const admin = createAdminRepository(root, paths['database.adminPath'])
    try { pair = { admin, music: createMusicRepository(root, paths['database.musicPath']) } }
    catch (error) { admin.close(); throw error }
    stores.set(root, pair)
  }
  return pair
}

/**
 * 解析受管理的业务数据路径。静态资源、音频、歌词、脚本及任意其他文件不接管。
 * @param filename 原文件路径。 @returns 仓储目标；普通文件返回空值。
 */
export function resolveStorage(filename: unknown): StorageTarget | null {
  if (typeof filename !== 'string') return null
  const key = path.resolve(filename)
  const normalized = key.replace(/\\/g, '/')
  const music = musicTables.find(item => item.matches(normalized))
  const admin = adminTables.find(item => item.matches(normalized))
  const underData = key.startsWith(dataRoot() + path.sep)
  // SQL 自身及临时文件由真正的文件系统处理，最终 rename 再提交数据库。
  if (!music && !admin && !(underData && normalized.endsWith('.json'))) return null
  const domain = music ? 'music' : 'admin'
  const table = (music || admin)?.table || 'server_legacy_document'
  return { repository: repositories()[domain], table, key }
}

/** @param target 仓储目标。首次读取从旧文件导入，已迁移或已删除时不再回读。 */
export function migrateLegacy(target: StorageTarget): void {
  if (target.repository.hasMigration(target.table, target.key) || !fs.existsSync(target.key)) return
  const text = fs.readFileSync(target.key, 'utf8')
  target.repository.write(target.table, target.key, text, fs.statSync(target.key).mtimeMs, true)
}

/** @param filename 原业务路径。 @returns 真实业务文档；无文档时返回空值。 */
export function readDocument(filename: string) {
  const target = resolveStorage(filename)
  if (!target) throw new Error('未注册的业务持久化路径')
  migrateLegacy(target)
  return target.repository.read(target.table, target.key)
}

/** @param filename 原业务路径。 @param value 原业务值。以单次事务替换完整文档。 */
export function writeDocument(filename: string, value: unknown): void {
  const target = resolveStorage(filename)
  if (!target) throw new Error('未注册的业务持久化路径')
  target.repository.write(target.table, target.key, JSON.stringify(value))
  storageEvents.emit('change', target.key)
}

/** @returns 所有仓储文档，供文件枚举及兼容备份使用。 */
export function storedDocuments() {
  const pair = repositories()
  return [pair.admin, pair.music].flatMap(repository => repository.documents().map(document => ({ ...document, repository })))
}

/** @param root 已完成测试的数据根目录；省略时关闭全部连接。 */
export function closeStorage(root?: string): void {
  for (const [key, pair] of stores) {
    if (root && path.resolve(root) !== key) continue
    pair.admin.close(); pair.music.close(); stores.delete(key)
  }
}
process.once('exit', () => closeStorage())
