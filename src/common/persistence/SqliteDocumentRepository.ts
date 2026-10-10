import fs from 'node:fs'
import path from 'node:path'
import type { DocumentVo } from '../model/vo/DocumentVo'
const Database = require('better-sqlite3')

/** 文档表定义；表名由应用常量提供，禁止拼接请求参数。 @author yahyaoo */
export interface DocumentTable {
  /** SQL 表名。 */
  table: string
  /** 原持久化路径的匹配函数。 */
  matches: (filename: string) => boolean
}

/**
 * SQLite 文档记录仓储。对象和数组拆分为有序记录，标量保留原值。
 * 元数据同时记录空文档与删除标记，避免重启后重新导入已删除的旧文件。
 * @author yahyaoo
 */
export class SqliteDocumentRepository {
  /** 独立数据库连接，业务代码不能直接使用。 */
  private readonly database: any
  /** 当前数据库允许操作的表名。 */
  private readonly tables: Set<string>
  /** 数据根目录；内部作用域使用相对路径，移动数据目录后仍可读取。 */
  private readonly scopeRoot: string

  /** @param filename 数据库绝对路径。 @param schema SQL 初始化脚本。 @param tables 允许操作的业务表。 */
  constructor(readonly filename: string, schema: string, tables: DocumentTable[]) {
    fs.mkdirSync(path.dirname(filename), { recursive: true })
    this.database = new Database(filename)
    this.database.pragma('journal_mode = WAL')
    this.database.pragma('busy_timeout = 5000')
    this.database.pragma('foreign_keys = ON')
    this.database.exec(schema)
    this.tables = new Set(tables.map(item => item.table))
    this.scopeRoot = path.dirname(path.dirname(path.resolve(filename)))
  }

  /** @param filename 业务绝对路径。 @returns 可随数据目录搬移的 SQL 作用域键。 */
  documentKey(filename: string): string {
    const resolved = path.resolve(filename)
    const relative = path.relative(this.scopeRoot, resolved)
    return relative && relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative)
      ? 'data:' + relative.replace(/\\/g, '/') : resolved
  }

  /** @param key SQL 作用域。 @returns 当前数据目录中的兼容路径。 */
  private filenameFor(key: string): string { return key.startsWith('data:') ? path.join(this.scopeRoot, key.slice(5)) : key }

  /** @param table 应用注册的表名。 @throws Error 表名不属于当前数据库时拒绝操作。 */
  private checkTable(table: string) {
    if (!this.tables.has(table)) throw new Error('未注册的数据表：' + table)
  }

  /** @param table 业务表。 @param key 文档作用域。 @returns 是否已经迁移过，包括删除后的文档。 */
  hasMigration(table: string, key: string): boolean {
    this.checkTable(table)
    key = this.documentKey(key)
    return !!this.database.prepare('SELECT 1 FROM storage_document WHERE table_name = ? AND document_key = ?').get(table, key)
  }

  /** @param table 业务表。 @param key 文档作用域。 @returns 文档及原始文本；不存在或已删除时返回空值。 */
  read(table: string, key: string): (DocumentVo & { /**
 * text 字段，沿用原业务结构与空值约定。
 */
text: string }) | null {
    this.checkTable(table)
    const filename = key
    key = this.documentKey(key)
    const meta = this.database.prepare('SELECT * FROM storage_document WHERE table_name = ? AND document_key = ? AND present = 1').get(table, key)
    if (!meta) return null
    const records = this.database.prepare(`SELECT record_key, value_json FROM ${table} WHERE document_key = ? ORDER BY sort_order`).all(key)
    let value: unknown
    if (meta.value_kind === 'array') value = records.map((item: any) => JSON.parse(item.value_json))
    else if (meta.value_kind === 'object') value = Object.fromEntries(records.map((item: any) => [item.record_key, JSON.parse(item.value_json)]))
    else value = records.length ? JSON.parse(records[0].value_json) : null
    // 保留原格式及字节数，使文件下载、快照大小、设置响应保持一致。
    return { documentKey: filename, value, text: meta.original_text, modifiedAt: meta.modified_at, byteLength: meta.byte_length }
  }

  /**
   * 原子替换文档的有序记录与元数据，更新时保留已有记录的创建时间。
   * @param table 注册的业务表。
   * @param key 文档作用域。
   * @param text 原 JSON 文本或文件编辑器文本。
   * @param time 历史时间，毫秒。
   * @param allowRawText 仅文件系统兼容入口允许原始文本；业务导入保持严格 JSON 校验。
   * @throws SyntaxError 严格模式下非法 JSON 不产生写入。
   * @author yahyaoo
   */
  write(table: string, key: string, text: string, time = Date.now(), allowRawText = false): void {
    this.checkTable(table)
    key = this.documentKey(key)
    let value: any, raw = false
    try { value = JSON.parse(text) } catch (error) {
      if (!allowRawText) throw error
      value = text; raw = true
    }
    const kind = raw ? 'text' : Array.isArray(value) ? 'array' : value !== null && typeof value === 'object' ? 'object' : 'value'
    const records: Array<[string, unknown]> = kind === 'array' ? value.map((item: unknown, index: number) => [String(index), item]) : kind === 'object' ? Object.entries(value) : [['value', value]]
    this.transaction(() => {
      const created = new Map<string, number>(this.database.prepare(`SELECT record_key, created_at FROM ${table} WHERE document_key = ?`).all(key).map((item: any) => [item.record_key, item.created_at]))
      this.database.prepare(`DELETE FROM ${table} WHERE document_key = ?`).run(key)
      const insert = this.database.prepare(`INSERT INTO ${table} (document_key, record_key, sort_order, value_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`)
      records.forEach(([recordKey, item], index) => insert.run(key, recordKey, index, JSON.stringify(item), created.get(recordKey) ?? time, time))
      this.database.prepare(`INSERT INTO storage_document (table_name, document_key, value_kind, original_text, modified_at, byte_length, present)
        VALUES (?, ?, ?, ?, ?, ?, 1) ON CONFLICT (table_name, document_key) DO UPDATE SET
        value_kind = excluded.value_kind, original_text = excluded.original_text, modified_at = excluded.modified_at, byte_length = excluded.byte_length, present = 1`).run(table, key, kind, text, time, Buffer.byteLength(text))
    })
  }

  /** @param table 业务表。 @param key 作用域。保留墓碑，禁止再次读取旧文件。 */
  remove(table: string, key: string): void {
    this.checkTable(table)
    key = this.documentKey(key)
    this.transaction(() => {
      this.database.prepare(`DELETE FROM ${table} WHERE document_key = ?`).run(key)
      this.database.prepare(`INSERT INTO storage_document (table_name, document_key, value_kind, original_text, modified_at, byte_length, present)
        VALUES (?, ?, 'value', 'null', ?, 0, 0) ON CONFLICT (table_name, document_key) DO UPDATE SET present = 0`).run(table, key, Date.now())
    })
  }

  /** @param work 同步数据库操作。 @returns 操作结果。 @throws Error 任一步骤失败时整个事务回滚。 */
  transaction<T>(work: () => T): T { return this.database.transaction(work)() }

  /** @returns 已迁移文档目录，包括删除标记，用于兼容文件枚举和备份。 */
  documents(): Array<{ /**
 * table_name 字段，沿用原业务结构与空值约定。
 */
table_name: string, /**
 * document_key 字段，沿用原业务结构与空值约定。
 */
document_key: string, /**
 * modified_at 字段，沿用原业务结构与空值约定。
 */
modified_at: number, /**
 * byte_length 字段，沿用原业务结构与空值约定。
 */
byte_length: number, /**
 * present 字段，沿用原业务结构与空值约定。
 */
present: number }> {
    return this.database.prepare('SELECT table_name, document_key, modified_at, byte_length, present FROM storage_document').all().map((item: any) => ({ ...item, document_key: this.filenameFor(item.document_key) }))
  }

  /** @param table 业务表。 @param key 文档。 @param time 快照历史时间。 */
  touch(table: string, key: string, time: number): void {
    this.checkTable(table)
    key = this.documentKey(key)
    this.database.prepare('UPDATE storage_document SET modified_at = ? WHERE table_name = ? AND document_key = ?').run(time, table, key)
  }

  /** @returns 一致的数据库快照，不包含运行中的 WAL 文件。 */
  serialize(): Buffer { return this.database.serialize() }

  /** 关闭连接；测试和应用退出时释放文件句柄。 */
  close(): void { this.database.close() }
}
