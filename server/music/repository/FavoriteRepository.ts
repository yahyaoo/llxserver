import path from 'node:path'
import type { SqliteDocumentRepository } from '../../common/persistence/SqliteDocumentRepository'

/** 独立喜爱歌曲仓储；账号目录隔离数据，不保存平台喜爱人数。 @author jingyh */
export class FavoriteRepository {
  private readonly key: string
  constructor(private readonly database: SqliteDocumentRepository, userDir: string) {
    this.key = path.join(userDir, 'favorites.json')
  }

  /** 首次迁移旧快照；空文档和删除标记也算已迁移，避免取消喜欢后复活旧记录。 */
  initialize(legacy: LX.Music.MusicInfo[]): LX.Music.MusicInfo[] {
    if (!this.database.hasMigration('client_favorite_song', this.key)) this.save(legacy)
    return (this.database.read('client_favorite_song', this.key)?.value as LX.Music.MusicInfo[]) ?? []
  }

  /** 使用现有事务保存有序歌曲记录，保留歌曲扩展元数据。 */
  save(items: LX.Music.MusicInfo[]): void {
    const text = JSON.stringify(items)
    if (this.database.read('client_favorite_song', this.key)?.text === text) return
    this.database.write('client_favorite_song', this.key, text)
  }
}
