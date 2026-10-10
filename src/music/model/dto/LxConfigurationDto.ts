/** 上传 JSON 经格式校验后的播放器配置，不包含管理服务配置。 @author yahyaoo */
export interface LxConfigurationDto {
  /** 完整歌单结构；提供时整体覆盖当前歌单。 */
  lists?: LX.Sync.List.ListData
  /** 播放器设置；提供时整体覆盖设置。 */
  settings?: Record<string, unknown>
  /** 音效；提供时整体覆盖音效。 */
  soundEffects?: Record<string, unknown>
  /** 收藏及屏蔽媒体库。 */
  library?: { /**
 * artists 字段，沿用原业务结构与空值约定。
 */
artists?: unknown[], /**
 * albums 字段，沿用原业务结构与空值约定。
 */
albums?: unknown[], /**
 * dislikedArtists 字段，沿用原业务结构与空值约定。
 */
dislikedArtists?: unknown[], /**
 * dislikedAlbums 字段，沿用原业务结构与空值约定。
 */
dislikedAlbums?: unknown[] }
}
