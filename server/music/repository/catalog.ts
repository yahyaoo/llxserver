import type { DocumentTable } from '../../common/persistence/SqliteDocumentRepository'
/** 播放器表映射，仅依赖公共持久化契约。 @author yahyaoo */
export const musicTables: DocumentTable[] = [
  /** 播放器用户设置。 */
  { table: 'music_settings', matches: filename => /settings\.json$/.test(filename) },
  /** 播放器音效设置。 */
  { table: 'music_sound_effect', matches: filename => /soundEffects\.json$/.test(filename) },
  /** 播放器持久令牌。 */
  { table: 'music_token', matches: filename => /token\.json$/.test(filename) },
  /** 用户电台。 */
  { table: 'music_radio_station', matches: filename => /radioStations\.json$/.test(filename) },
  /** 收藏与屏蔽歌手。 */
  { table: 'music_library_artist', matches: filename => /artists\.json$/.test(filename) },
  /** 收藏与屏蔽专辑。 */
  { table: 'music_library_album', matches: filename => /albums\.json$/.test(filename) },
  /** 歌单与屏蔽规则快照索引。 */
  { table: 'music_snapshot_info', matches: filename => /snapshotInfo\.json$/.test(filename) },
  /** 歌单与屏蔽规则快照。 */
  { table: 'music_snapshot', matches: filename => /(?:^|\/)snapshot_[^\/]+$/.test(filename) },
  /** 用户同步下载配置及进度。 */
  { table: 'music_sync_download', matches: filename => /(?:^|\/)data\.json$/.test(filename) },
  /** 音频缓存索引。 */
  { table: 'music_cache_index', matches: filename => /cache_index\.json$/.test(filename) },
  /** 音乐目录索引。 */
  { table: 'music_music_index', matches: filename => /music_index\.json$/.test(filename) },
  /** 用户自定义歌曲目录索引。 */
  { table: 'music_custom_index', matches: filename => /custom_index\.json$/.test(filename) },
  /** 服务器已下载歌曲。 */
  { table: 'music_download_record', matches: filename => /server-downloads\.json$/.test(filename) },
  /** 服务器下载队列。 */
  { table: 'music_download_queue', matches: filename => /server-download-queue\.json$/.test(filename) },
  /** Subsonic 评分与收藏元数据。 */
  { table: 'music_subsonic_meta', matches: filename => /subsonic-meta\.json$/.test(filename) },
  /** Subsonic 播放记录。 */
  { table: 'music_subsonic_scrobble', matches: filename => /subsonic-scrobbles\.json$/.test(filename) },
  /** Subsonic 播放队列。 */
  { table: 'music_subsonic_play_queue', matches: filename => /subsonic-playqueue\.json$/.test(filename) },
  /** Subsonic 播放书签。 */
  { table: 'music_subsonic_bookmark', matches: filename => /subsonic-bookmarks\.json$/.test(filename) },
  /** Subsonic 在线歌曲缓存。 */
  { table: 'music_online_song', matches: filename => /subsonic-online-cache\.json$/.test(filename) },
  /** 浏览器设备歌单状态。 */
  { table: 'music_browser_state', matches: filename => /browser-state\.json$/.test(filename) },
  /** 播放器扩展兼容数据。 */
  { table: 'music_legacy_document', matches: filename => /a^/.test(filename) },
]

