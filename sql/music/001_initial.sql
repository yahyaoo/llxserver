-- 播放器独立数据库；作者 yahyaoo。
-- 记录字段统一使用 snake_case，扩展值保留全部原 JSON 字段与顺序。
CREATE TABLE IF NOT EXISTS storage_document (
  table_name TEXT NOT NULL,
  document_key TEXT NOT NULL,
  value_kind TEXT NOT NULL CHECK (value_kind IN ('array', 'object', 'value', 'text')),
  original_text TEXT NOT NULL,
  modified_at INTEGER NOT NULL,
  byte_length INTEGER NOT NULL,
  present INTEGER NOT NULL CHECK (present IN (0, 1)),
  PRIMARY KEY (table_name, document_key)
);

-- 播放器用户设置；document_key 隔离用户、收藏类型及目录；record_key 保留原标识。
CREATE TABLE IF NOT EXISTS music_settings (
  document_key TEXT NOT NULL,
  record_key TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  value_json TEXT NOT NULL CHECK (json_valid(value_json)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (document_key, record_key)
);
CREATE INDEX IF NOT EXISTS idx_music_settings_order ON music_settings (document_key, sort_order);

-- 播放器音效设置；document_key 隔离用户、收藏类型及目录；record_key 保留原标识。
CREATE TABLE IF NOT EXISTS music_sound_effect (
  document_key TEXT NOT NULL,
  record_key TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  value_json TEXT NOT NULL CHECK (json_valid(value_json)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (document_key, record_key)
);
CREATE INDEX IF NOT EXISTS idx_music_sound_effect_order ON music_sound_effect (document_key, sort_order);

-- 播放器持久令牌；document_key 隔离用户、收藏类型及目录；record_key 保留原标识。
CREATE TABLE IF NOT EXISTS music_token (
  document_key TEXT NOT NULL,
  record_key TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  value_json TEXT NOT NULL CHECK (json_valid(value_json)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (document_key, record_key)
);
CREATE INDEX IF NOT EXISTS idx_music_token_order ON music_token (document_key, sort_order);

-- 用户电台；document_key 隔离用户、收藏类型及目录；record_key 保留原标识。
CREATE TABLE IF NOT EXISTS music_radio_station (
  document_key TEXT NOT NULL,
  record_key TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  value_json TEXT NOT NULL CHECK (json_valid(value_json)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (document_key, record_key)
);
CREATE INDEX IF NOT EXISTS idx_music_radio_station_order ON music_radio_station (document_key, sort_order);

-- 收藏与屏蔽歌手；document_key 隔离用户、收藏类型及目录；record_key 保留原标识。
CREATE TABLE IF NOT EXISTS music_library_artist (
  document_key TEXT NOT NULL,
  record_key TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  value_json TEXT NOT NULL CHECK (json_valid(value_json)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (document_key, record_key)
);
CREATE INDEX IF NOT EXISTS idx_music_library_artist_order ON music_library_artist (document_key, sort_order);

-- 收藏与屏蔽专辑；document_key 隔离用户、收藏类型及目录；record_key 保留原标识。
CREATE TABLE IF NOT EXISTS music_library_album (
  document_key TEXT NOT NULL,
  record_key TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  value_json TEXT NOT NULL CHECK (json_valid(value_json)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (document_key, record_key)
);
CREATE INDEX IF NOT EXISTS idx_music_library_album_order ON music_library_album (document_key, sort_order);

-- 歌单与屏蔽规则快照索引；document_key 隔离用户、收藏类型及目录；record_key 保留原标识。
CREATE TABLE IF NOT EXISTS music_snapshot_info (
  document_key TEXT NOT NULL,
  record_key TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  value_json TEXT NOT NULL CHECK (json_valid(value_json)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (document_key, record_key)
);
CREATE INDEX IF NOT EXISTS idx_music_snapshot_info_order ON music_snapshot_info (document_key, sort_order);

-- 歌单与屏蔽规则快照；document_key 隔离用户、收藏类型及目录；record_key 保留原标识。
CREATE TABLE IF NOT EXISTS music_snapshot (
  document_key TEXT NOT NULL,
  record_key TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  value_json TEXT NOT NULL CHECK (json_valid(value_json)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (document_key, record_key)
);
CREATE INDEX IF NOT EXISTS idx_music_snapshot_order ON music_snapshot (document_key, sort_order);

-- 用户同步下载配置及进度；document_key 隔离用户、收藏类型及目录；record_key 保留原标识。
CREATE TABLE IF NOT EXISTS music_sync_download (
  document_key TEXT NOT NULL,
  record_key TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  value_json TEXT NOT NULL CHECK (json_valid(value_json)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (document_key, record_key)
);
CREATE INDEX IF NOT EXISTS idx_music_sync_download_order ON music_sync_download (document_key, sort_order);

-- 音频缓存索引；document_key 隔离用户、收藏类型及目录；record_key 保留原标识。
CREATE TABLE IF NOT EXISTS music_cache_index (
  document_key TEXT NOT NULL,
  record_key TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  value_json TEXT NOT NULL CHECK (json_valid(value_json)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (document_key, record_key)
);
CREATE INDEX IF NOT EXISTS idx_music_cache_index_order ON music_cache_index (document_key, sort_order);

-- 音乐目录索引；document_key 隔离用户、收藏类型及目录；record_key 保留原标识。
CREATE TABLE IF NOT EXISTS music_music_index (
  document_key TEXT NOT NULL,
  record_key TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  value_json TEXT NOT NULL CHECK (json_valid(value_json)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (document_key, record_key)
);
CREATE INDEX IF NOT EXISTS idx_music_music_index_order ON music_music_index (document_key, sort_order);

-- 用户自定义歌曲目录索引；document_key 隔离用户、收藏类型及目录；record_key 保留原标识。
CREATE TABLE IF NOT EXISTS music_custom_index (
  document_key TEXT NOT NULL,
  record_key TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  value_json TEXT NOT NULL CHECK (json_valid(value_json)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (document_key, record_key)
);
CREATE INDEX IF NOT EXISTS idx_music_custom_index_order ON music_custom_index (document_key, sort_order);

-- 服务器已下载歌曲；document_key 隔离用户、收藏类型及目录；record_key 保留原标识。
CREATE TABLE IF NOT EXISTS music_download_record (
  document_key TEXT NOT NULL,
  record_key TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  value_json TEXT NOT NULL CHECK (json_valid(value_json)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (document_key, record_key)
);
CREATE INDEX IF NOT EXISTS idx_music_download_record_order ON music_download_record (document_key, sort_order);

-- 服务器下载队列；document_key 隔离用户、收藏类型及目录；record_key 保留原标识。
CREATE TABLE IF NOT EXISTS music_download_queue (
  document_key TEXT NOT NULL,
  record_key TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  value_json TEXT NOT NULL CHECK (json_valid(value_json)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (document_key, record_key)
);
CREATE INDEX IF NOT EXISTS idx_music_download_queue_order ON music_download_queue (document_key, sort_order);

-- Subsonic 评分与收藏元数据；document_key 隔离用户、收藏类型及目录；record_key 保留原标识。
CREATE TABLE IF NOT EXISTS music_subsonic_meta (
  document_key TEXT NOT NULL,
  record_key TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  value_json TEXT NOT NULL CHECK (json_valid(value_json)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (document_key, record_key)
);
CREATE INDEX IF NOT EXISTS idx_music_subsonic_meta_order ON music_subsonic_meta (document_key, sort_order);

-- Subsonic 播放记录；document_key 隔离用户、收藏类型及目录；record_key 保留原标识。
CREATE TABLE IF NOT EXISTS music_subsonic_scrobble (
  document_key TEXT NOT NULL,
  record_key TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  value_json TEXT NOT NULL CHECK (json_valid(value_json)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (document_key, record_key)
);
CREATE INDEX IF NOT EXISTS idx_music_subsonic_scrobble_order ON music_subsonic_scrobble (document_key, sort_order);

-- Subsonic 播放队列；document_key 隔离用户、收藏类型及目录；record_key 保留原标识。
CREATE TABLE IF NOT EXISTS music_subsonic_play_queue (
  document_key TEXT NOT NULL,
  record_key TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  value_json TEXT NOT NULL CHECK (json_valid(value_json)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (document_key, record_key)
);
CREATE INDEX IF NOT EXISTS idx_music_subsonic_play_queue_order ON music_subsonic_play_queue (document_key, sort_order);

-- Subsonic 播放书签；document_key 隔离用户、收藏类型及目录；record_key 保留原标识。
CREATE TABLE IF NOT EXISTS music_subsonic_bookmark (
  document_key TEXT NOT NULL,
  record_key TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  value_json TEXT NOT NULL CHECK (json_valid(value_json)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (document_key, record_key)
);
CREATE INDEX IF NOT EXISTS idx_music_subsonic_bookmark_order ON music_subsonic_bookmark (document_key, sort_order);

-- Subsonic 在线歌曲缓存；document_key 隔离用户、收藏类型及目录；record_key 保留原标识。
CREATE TABLE IF NOT EXISTS music_online_song (
  document_key TEXT NOT NULL,
  record_key TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  value_json TEXT NOT NULL CHECK (json_valid(value_json)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (document_key, record_key)
);
CREATE INDEX IF NOT EXISTS idx_music_online_song_order ON music_online_song (document_key, sort_order);

-- 浏览器设备歌单状态；document_key 隔离用户、收藏类型及目录；record_key 保留原标识。
CREATE TABLE IF NOT EXISTS music_browser_state (
  document_key TEXT NOT NULL,
  record_key TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  value_json TEXT NOT NULL CHECK (json_valid(value_json)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (document_key, record_key)
);
CREATE INDEX IF NOT EXISTS idx_music_browser_state_order ON music_browser_state (document_key, sort_order);

-- 播放器扩展兼容数据；document_key 隔离用户、收藏类型及目录；record_key 保留原标识。
CREATE TABLE IF NOT EXISTS music_legacy_document (
  document_key TEXT NOT NULL,
  record_key TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  value_json TEXT NOT NULL CHECK (json_valid(value_json)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (document_key, record_key)
);
CREATE INDEX IF NOT EXISTS idx_music_legacy_document_order ON music_legacy_document (document_key, sort_order);

