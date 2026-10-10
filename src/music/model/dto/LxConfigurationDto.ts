/** 上传 JSON 经格式校验后的播放器配置，不包含管理服务配置。 @author yahyaoo */
export interface LxConfigurationDto {
  /** 完整歌单结构；提供时整体覆盖当前歌单。 */
  lists?: LX.Sync.List.ListData
  /** 播放器设置；提供时整体覆盖设置。 */
  settings?: Record<string, unknown>
  /** 音效；提供时整体覆盖音效。 */
  soundEffects?: Record<string, unknown>
  /** 收藏及屏蔽媒体库。 */
  library?: { /** 歌手条目集合。 */
artists?: unknown[], /** 专辑记录集合。 */
albums?: unknown[], /** 用户不喜欢的歌手记录。 */
dislikedArtists?: unknown[], /** 用户不喜欢的专辑记录。 */
dislikedAlbums?: unknown[] }
}
