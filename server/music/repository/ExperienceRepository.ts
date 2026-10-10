import path from 'node:path'
import type { SqliteDocumentRepository } from '../../common/persistence/SqliteDocumentRepository'

/** 账号主题、最近播放与歌手缓存的持久化入口。 @author jingyh @date 2026-10-10 */
export class ExperienceRepository {
  constructor(private readonly database: SqliteDocumentRepository, private readonly userDir: string) {}

  /** 读取指定账号文档；路径作为稳定账号作用域参与数据库迁移。 */
  read<T>(table: string, name: string, fallback: T): T {
    return (this.database.read(table, path.join(this.userDir, name))?.value as T) ?? fallback
  }

  /** 在现有 SQLite 事务中替换账号文档。 */
  write(table: string, name: string, value: unknown): void {
    this.database.write(table, path.join(this.userDir, name), JSON.stringify(value))
  }

  /** 使偏好变更与历史裁剪在同一事务中提交。 */
  transaction<T>(work: () => T): T { return this.database.transaction(work) }
}
