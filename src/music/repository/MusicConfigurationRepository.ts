import path from 'node:path'
import type { SqliteDocumentRepository } from '../../common/persistence/SqliteDocumentRepository'
import type { LxConfigurationDto } from '../model/dto/LxConfigurationDto'

/** 配置导入仓储契约，服务依赖接口而非数据库实现。 @author yahyaoo */
export interface MusicConfigurationPort {
  /** 在单个事务中覆盖提供的配置与歌单快照。 */
  replace(userDir: string, data: LxConfigurationDto, snapshot?: { /** 本地文件或目录路径。 */
path: string,
key: string,
infoPath: string,
info: unknown }): void
}

/** 播放器配置 SQL 仓储，仅允许操作音乐库。 @author yahyaoo */
export class MusicConfigurationRepository implements MusicConfigurationPort {
  /** @param repository 应用注入的播放器库连接。 */
  constructor(private readonly repository: SqliteDocumentRepository) {}

  /** @param userDir 已鉴权用户目录。 @param data 已校验配置。 @param snapshot 完整歌单快照元信息。 */
  replace(userDir: string, data: LxConfigurationDto, snapshot?: { /** 本地文件或目录路径。 */
path: string,
key: string,
infoPath: string,
info: unknown }): void {
    this.repository.transaction(() => {
      if (data.settings !== undefined) this.repository.write('music_settings', path.join(userDir, 'settings.json'), JSON.stringify(data.settings))
      if (data.soundEffects !== undefined) this.repository.write('music_sound_effect', path.join(userDir, 'soundEffects.json'), JSON.stringify(data.soundEffects))
      for (const key of ['artists', 'albums', 'dislikedArtists', 'dislikedAlbums'] as const) {
        if (data.library?.[key] === undefined) continue
        const disliked = key.startsWith('disliked')
        const kind = key.endsWith('Artists') || key === 'artists' ? 'artists' : 'albums'
        this.repository.write(kind === 'artists' ? 'music_library_artist' : 'music_library_album', path.join(userDir, disliked ? 'dislike/library' : 'library', kind + '.json'), JSON.stringify(data.library[key]))
      }
      if (data.lists && snapshot) {
        this.repository.write('music_snapshot', snapshot.path, JSON.stringify(data.lists))
        this.repository.write('music_snapshot_info', snapshot.infoPath, JSON.stringify(snapshot.info))
      }
    })
  }
}
