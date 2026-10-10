import type { DocumentTable } from '../../common/persistence/SqliteDocumentRepository'
/** 播放器表映射，仅依赖公共持久化契约。 @author yahyaoo */
export const musicTables: DocumentTable[] = [
  /** 账号主题与外观配置，不包含其他业务偏好。 */
  { table: 'client_appearance', matches: filename => /appearance\.json$/.test(filename) },
  /** 账号最近播放保存上限，独立于主题表。 */
  { table: 'client_recent_setting', matches: filename => /recent-setting\.json$/.test(filename) },
  /** 按账号隔离的最近播放。 */
  { table: 'client_recent_play', matches: filename => /recent-play\.json$/.test(filename) },
  /** 本地歌手分组和头像元数据缓存。 */
  { table: 'client_artist_group', matches: filename => /(?:artist-groups|avatar-metadata)\.json$/.test(filename) },
  /** 本地专辑分组缓存；与收藏专辑独立。 */
  { table: 'client_album_group', matches: filename => /album-groups\.json$/.test(filename) },
  /** 播放器用户设置。 */
  { table: 'client_settings', matches: filename => /settings\.json$/.test(filename) },
  /** 播放器音效设置。 */
  { table: 'client_sound_effect', matches: filename => /soundEffects\.json$/.test(filename) },
  /** 播放器持久令牌。 */
  { table: 'client_token', matches: filename => /token\.json$/.test(filename) },
  /** 用户电台。 */
  { table: 'client_radio_station', matches: filename => /radioStations\.json$/.test(filename) },
  /** 收藏与屏蔽歌手。 */
  { table: 'client_library_artist', matches: filename => /artists\.json$/.test(filename) },
  /** 收藏与屏蔽专辑。 */
  { table: 'client_library_album', matches: filename => /albums\.json$/.test(filename) },
  /** 歌单与屏蔽规则快照索引。 */
  { table: 'client_snapshot_info', matches: filename => /snapshotInfo\.json$/.test(filename) },
  /** 歌单与屏蔽规则快照。 */
  { table: 'client_snapshot', matches: filename => /(?:^|\/)snapshot_[^\/]+$/.test(filename) },
  /** 用户同步下载配置及进度。 */
  { table: 'client_sync_download', matches: filename => /(?:^|\/)data\.json$/.test(filename) },
  /** 音频缓存索引。 */
  { table: 'client_cache_index', matches: filename => /cache_index\.json$/.test(filename) },
  /** 音乐目录索引。 */
  { table: 'client_music_index', matches: filename => /music_index\.json$/.test(filename) },
  /** 用户自定义歌曲目录索引。 */
  { table: 'client_custom_index', matches: filename => /custom_index\.json$/.test(filename) },
  /** 服务器已下载歌曲。 */
  { table: 'client_download_record', matches: filename => /server-downloads\.json$/.test(filename) },
  /** 服务器下载队列。 */
  { table: 'client_download_queue', matches: filename => /server-download-queue\.json$/.test(filename) },
  /** Subsonic 评分与收藏元数据。 */
  { table: 'client_subsonic_meta', matches: filename => /subsonic-meta\.json$/.test(filename) },
  /** Subsonic 播放记录。 */
  { table: 'client_subsonic_scrobble', matches: filename => /subsonic-scrobbles\.json$/.test(filename) },
  /** Subsonic 播放队列。 */
  { table: 'client_subsonic_play_queue', matches: filename => /subsonic-playqueue\.json$/.test(filename) },
  /** Subsonic 播放书签。 */
  { table: 'client_subsonic_bookmark', matches: filename => /subsonic-bookmarks\.json$/.test(filename) },
  /** Subsonic 在线歌曲缓存。 */
  { table: 'client_online_song', matches: filename => /subsonic-online-cache\.json$/.test(filename) },
  /** 浏览器设备歌单状态。 */
  { table: 'client_browser_state', matches: filename => /browser-state\.json$/.test(filename) },
  /** 播放器扩展兼容数据。 */
  { table: 'client_legacy_document', matches: filename => /a^/.test(filename) },
]

