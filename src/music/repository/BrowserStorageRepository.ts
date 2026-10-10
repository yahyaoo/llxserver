import type { SqliteDocumentRepository } from '../../common/persistence/SqliteDocumentRepository'
import type { BrowserStoragePort } from '../service/configuration/BrowserStorageService'

/** 播放器 SQLite 适配器；SQL 表名固定，不接收请求输入。 @author yahyaoo */
export class BrowserStorageRepository implements BrowserStoragePort {
  /** @param repository 独立播放器库。 */
  constructor(private readonly repository: SqliteDocumentRepository) {}
  /** @param key 文档作用域。 @returns 原对象或空值。 */
  get(key: string): unknown { return this.repository.read('music_browser_state', key)?.value ?? null }
  /** @param key 文档作用域。 @param value 原对象。 */
  replace(key: string, value: Record<string, unknown>): void { this.repository.write('music_browser_state', key, JSON.stringify(value)) }
  /** @param key 文档作用域。 */
  remove(key: string): void { this.repository.remove('music_browser_state', key) }
}
