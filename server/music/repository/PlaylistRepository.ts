import path from 'node:path'
import { randomUUID } from 'node:crypto'
import type { SqliteDocumentRepository } from '../../common/persistence/SqliteDocumentRepository'

/** 普通歌单仓储：默认列表仅在首次迁移时创建，删除后不重新生成。@author jingyh */
export class PlaylistRepository {
  private readonly key: string
  constructor(private readonly database: SqliteDocumentRepository, userDir: string) {
    this.key = path.join(userDir, 'playlists.json')
  }

  /** 初始化有序歌单表，旧默认歌曲和自定义歌单只迁移一次，空文档也视为已初始化。 */
  initialize(legacy: LX.List.UserListInfoFull[], defaultSongs: LX.Music.MusicInfo[]): LX.List.UserListInfoFull[] {
    if (!this.database.hasMigration('client_playlist', this.key)) {
      this.save([{ id: 'webplayer_' + randomUUID(), name: '默认列表', list: defaultSongs, locationUpdateTime: null }, ...legacy])
    }
    return (this.database.read('client_playlist', this.key)?.value as LX.List.UserListInfoFull[]) ?? []
  }

  /** 保存完整歌单及歌曲顺序；使用文档仓储事务与空数组标记，防止旧快照复活已删除歌单。 */
  save(lists: LX.List.UserListInfoFull[]): void {
    this.database.write('client_playlist', this.key, JSON.stringify(lists))
  }
}
