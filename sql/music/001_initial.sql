-- 播放器独立数据库；作者 yahyaoo。
-- 记录字段统一使用 snake_case，扩展值保留全部原 JSON 字段与顺序。
CREATE TABLE IF NOT EXISTS client_storage_document (
  table_name TEXT NOT NULL, -- 所属业务表名
  document_key TEXT NOT NULL, -- 文档作用域键；用户文档包含账号目录，随数据目录迁移保持稳定
  value_kind TEXT NOT NULL CHECK (value_kind IN ('array', 'object', 'value', 'text')), -- 文档类型：数组、对象、标量或原始文本
  original_text TEXT NOT NULL, -- 完整原始文本，用于保留格式与兼容导出
  modified_at INTEGER NOT NULL, -- 文档最后修改时间，Unix 毫秒
  byte_length INTEGER NOT NULL, -- 原始文本 UTF-8 字节数
  present INTEGER NOT NULL CHECK (present IN (0, 1)), -- 有效标记：1 有效，0 已删除且禁止重新导入
  PRIMARY KEY (table_name, document_key)
);

-- 播放器用户设置；document_key 隔离用户、收藏类型及目录；record_key 保留原标识。
CREATE TABLE IF NOT EXISTS client_settings (
  document_key TEXT NOT NULL, -- 文档作用域键；用户文档包含账号目录，随数据目录迁移保持稳定
  record_key TEXT NOT NULL, -- 文档内记录标识；对象字段名或数组序号
  sort_order INTEGER NOT NULL, -- 文档内显示顺序，从零开始
  value_json TEXT NOT NULL CHECK (json_valid(value_json)), -- 记录 JSON 内容；保留业务字段与扩展元数据
  created_at INTEGER NOT NULL, -- 记录创建时间，Unix 毫秒
  updated_at INTEGER NOT NULL, -- 记录最后更新时间，Unix 毫秒
  PRIMARY KEY (document_key, record_key)
);
CREATE INDEX IF NOT EXISTS idx_client_settings_order ON client_settings (document_key, sort_order);

-- 播放器音效设置；document_key 隔离用户、收藏类型及目录；record_key 保留原标识。
CREATE TABLE IF NOT EXISTS client_sound_effect (
  document_key TEXT NOT NULL, -- 文档作用域键；用户文档包含账号目录，随数据目录迁移保持稳定
  record_key TEXT NOT NULL, -- 文档内记录标识；对象字段名或数组序号
  sort_order INTEGER NOT NULL, -- 文档内显示顺序，从零开始
  value_json TEXT NOT NULL CHECK (json_valid(value_json)), -- 记录 JSON 内容；保留业务字段与扩展元数据
  created_at INTEGER NOT NULL, -- 记录创建时间，Unix 毫秒
  updated_at INTEGER NOT NULL, -- 记录最后更新时间，Unix 毫秒
  PRIMARY KEY (document_key, record_key)
);
CREATE INDEX IF NOT EXISTS idx_client_sound_effect_order ON client_sound_effect (document_key, sort_order);

-- 播放器持久令牌；document_key 隔离用户、收藏类型及目录；record_key 保留原标识。
CREATE TABLE IF NOT EXISTS client_token (
  document_key TEXT NOT NULL, -- 文档作用域键；用户文档包含账号目录，随数据目录迁移保持稳定
  record_key TEXT NOT NULL, -- 文档内记录标识；对象字段名或数组序号
  sort_order INTEGER NOT NULL, -- 文档内显示顺序，从零开始
  value_json TEXT NOT NULL CHECK (json_valid(value_json)), -- 记录 JSON 内容；保留业务字段与扩展元数据
  created_at INTEGER NOT NULL, -- 记录创建时间，Unix 毫秒
  updated_at INTEGER NOT NULL, -- 记录最后更新时间，Unix 毫秒
  PRIMARY KEY (document_key, record_key)
);
CREATE INDEX IF NOT EXISTS idx_client_token_order ON client_token (document_key, sort_order);

-- 用户电台；document_key 隔离用户、收藏类型及目录；record_key 保留原标识。
CREATE TABLE IF NOT EXISTS client_radio_station (
  document_key TEXT NOT NULL, -- 文档作用域键；用户文档包含账号目录，随数据目录迁移保持稳定
  record_key TEXT NOT NULL, -- 文档内记录标识；对象字段名或数组序号
  sort_order INTEGER NOT NULL, -- 文档内显示顺序，从零开始
  value_json TEXT NOT NULL CHECK (json_valid(value_json)), -- 记录 JSON 内容；保留业务字段与扩展元数据
  created_at INTEGER NOT NULL, -- 记录创建时间，Unix 毫秒
  updated_at INTEGER NOT NULL, -- 记录最后更新时间，Unix 毫秒
  PRIMARY KEY (document_key, record_key)
);
CREATE INDEX IF NOT EXISTS idx_client_radio_station_order ON client_radio_station (document_key, sort_order);

-- 收藏与屏蔽歌手；document_key 隔离用户、收藏类型及目录；record_key 保留原标识。
CREATE TABLE IF NOT EXISTS client_library_artist (
  document_key TEXT NOT NULL, -- 文档作用域键；用户文档包含账号目录，随数据目录迁移保持稳定
  record_key TEXT NOT NULL, -- 文档内记录标识；对象字段名或数组序号
  sort_order INTEGER NOT NULL, -- 文档内显示顺序，从零开始
  value_json TEXT NOT NULL CHECK (json_valid(value_json)), -- 记录 JSON 内容；保留业务字段与扩展元数据
  created_at INTEGER NOT NULL, -- 记录创建时间，Unix 毫秒
  updated_at INTEGER NOT NULL, -- 记录最后更新时间，Unix 毫秒
  PRIMARY KEY (document_key, record_key)
);
CREATE INDEX IF NOT EXISTS idx_client_library_artist_order ON client_library_artist (document_key, sort_order);

-- 收藏与屏蔽专辑；document_key 隔离用户、收藏类型及目录；record_key 保留原标识。
CREATE TABLE IF NOT EXISTS client_library_album (
  document_key TEXT NOT NULL, -- 文档作用域键；用户文档包含账号目录，随数据目录迁移保持稳定
  record_key TEXT NOT NULL, -- 文档内记录标识；对象字段名或数组序号
  sort_order INTEGER NOT NULL, -- 文档内显示顺序，从零开始
  value_json TEXT NOT NULL CHECK (json_valid(value_json)), -- 记录 JSON 内容；保留业务字段与扩展元数据
  created_at INTEGER NOT NULL, -- 记录创建时间，Unix 毫秒
  updated_at INTEGER NOT NULL, -- 记录最后更新时间，Unix 毫秒
  PRIMARY KEY (document_key, record_key)
);
CREATE INDEX IF NOT EXISTS idx_client_library_album_order ON client_library_album (document_key, sort_order);

-- 歌单与屏蔽规则快照索引；document_key 隔离用户、收藏类型及目录；record_key 保留原标识。
CREATE TABLE IF NOT EXISTS client_snapshot_info (
  document_key TEXT NOT NULL, -- 文档作用域键；用户文档包含账号目录，随数据目录迁移保持稳定
  record_key TEXT NOT NULL, -- 文档内记录标识；对象字段名或数组序号
  sort_order INTEGER NOT NULL, -- 文档内显示顺序，从零开始
  value_json TEXT NOT NULL CHECK (json_valid(value_json)), -- 记录 JSON 内容；保留业务字段与扩展元数据
  created_at INTEGER NOT NULL, -- 记录创建时间，Unix 毫秒
  updated_at INTEGER NOT NULL, -- 记录最后更新时间，Unix 毫秒
  PRIMARY KEY (document_key, record_key)
);
CREATE INDEX IF NOT EXISTS idx_client_snapshot_info_order ON client_snapshot_info (document_key, sort_order);

-- 歌单与屏蔽规则快照；document_key 隔离用户、收藏类型及目录；record_key 保留原标识。
CREATE TABLE IF NOT EXISTS client_snapshot (
  document_key TEXT NOT NULL, -- 文档作用域键；用户文档包含账号目录，随数据目录迁移保持稳定
  record_key TEXT NOT NULL, -- 文档内记录标识；对象字段名或数组序号
  sort_order INTEGER NOT NULL, -- 文档内显示顺序，从零开始
  value_json TEXT NOT NULL CHECK (json_valid(value_json)), -- 记录 JSON 内容；保留业务字段与扩展元数据
  created_at INTEGER NOT NULL, -- 记录创建时间，Unix 毫秒
  updated_at INTEGER NOT NULL, -- 记录最后更新时间，Unix 毫秒
  PRIMARY KEY (document_key, record_key)
);
CREATE INDEX IF NOT EXISTS idx_client_snapshot_order ON client_snapshot (document_key, sort_order);

-- 用户同步下载配置及进度；document_key 隔离用户、收藏类型及目录；record_key 保留原标识。
CREATE TABLE IF NOT EXISTS client_sync_download (
  document_key TEXT NOT NULL, -- 文档作用域键；用户文档包含账号目录，随数据目录迁移保持稳定
  record_key TEXT NOT NULL, -- 文档内记录标识；对象字段名或数组序号
  sort_order INTEGER NOT NULL, -- 文档内显示顺序，从零开始
  value_json TEXT NOT NULL CHECK (json_valid(value_json)), -- 记录 JSON 内容；保留业务字段与扩展元数据
  created_at INTEGER NOT NULL, -- 记录创建时间，Unix 毫秒
  updated_at INTEGER NOT NULL, -- 记录最后更新时间，Unix 毫秒
  PRIMARY KEY (document_key, record_key)
);
CREATE INDEX IF NOT EXISTS idx_client_sync_download_order ON client_sync_download (document_key, sort_order);

-- 音频缓存索引；document_key 隔离用户、收藏类型及目录；record_key 保留原标识。
CREATE TABLE IF NOT EXISTS client_cache_index (
  document_key TEXT NOT NULL, -- 文档作用域键；用户文档包含账号目录，随数据目录迁移保持稳定
  record_key TEXT NOT NULL, -- 文档内记录标识；对象字段名或数组序号
  sort_order INTEGER NOT NULL, -- 文档内显示顺序，从零开始
  value_json TEXT NOT NULL CHECK (json_valid(value_json)), -- 记录 JSON 内容；保留业务字段与扩展元数据
  created_at INTEGER NOT NULL, -- 记录创建时间，Unix 毫秒
  updated_at INTEGER NOT NULL, -- 记录最后更新时间，Unix 毫秒
  PRIMARY KEY (document_key, record_key)
);
CREATE INDEX IF NOT EXISTS idx_client_cache_index_order ON client_cache_index (document_key, sort_order);

-- 音乐目录索引；document_key 隔离用户、收藏类型及目录；record_key 保留原标识。
CREATE TABLE IF NOT EXISTS client_music_index (
  document_key TEXT NOT NULL, -- 文档作用域键；用户文档包含账号目录，随数据目录迁移保持稳定
  record_key TEXT NOT NULL, -- 文档内记录标识；对象字段名或数组序号
  sort_order INTEGER NOT NULL, -- 文档内显示顺序，从零开始
  value_json TEXT NOT NULL CHECK (json_valid(value_json)), -- 记录 JSON 内容；保留业务字段与扩展元数据
  created_at INTEGER NOT NULL, -- 记录创建时间，Unix 毫秒
  updated_at INTEGER NOT NULL, -- 记录最后更新时间，Unix 毫秒
  PRIMARY KEY (document_key, record_key)
);
CREATE INDEX IF NOT EXISTS idx_client_music_index_order ON client_music_index (document_key, sort_order);

-- 用户自定义歌曲目录索引；document_key 隔离用户、收藏类型及目录；record_key 保留原标识。
CREATE TABLE IF NOT EXISTS client_custom_index (
  document_key TEXT NOT NULL, -- 文档作用域键；用户文档包含账号目录，随数据目录迁移保持稳定
  record_key TEXT NOT NULL, -- 文档内记录标识；对象字段名或数组序号
  sort_order INTEGER NOT NULL, -- 文档内显示顺序，从零开始
  value_json TEXT NOT NULL CHECK (json_valid(value_json)), -- 记录 JSON 内容；保留业务字段与扩展元数据
  created_at INTEGER NOT NULL, -- 记录创建时间，Unix 毫秒
  updated_at INTEGER NOT NULL, -- 记录最后更新时间，Unix 毫秒
  PRIMARY KEY (document_key, record_key)
);
CREATE INDEX IF NOT EXISTS idx_client_custom_index_order ON client_custom_index (document_key, sort_order);

-- 服务器已下载歌曲；document_key 隔离用户、收藏类型及目录；record_key 保留原标识。
CREATE TABLE IF NOT EXISTS client_download_record (
  document_key TEXT NOT NULL, -- 文档作用域键；用户文档包含账号目录，随数据目录迁移保持稳定
  record_key TEXT NOT NULL, -- 文档内记录标识；对象字段名或数组序号
  sort_order INTEGER NOT NULL, -- 文档内显示顺序，从零开始
  value_json TEXT NOT NULL CHECK (json_valid(value_json)), -- 记录 JSON 内容；保留业务字段与扩展元数据
  created_at INTEGER NOT NULL, -- 记录创建时间，Unix 毫秒
  updated_at INTEGER NOT NULL, -- 记录最后更新时间，Unix 毫秒
  PRIMARY KEY (document_key, record_key)
);
CREATE INDEX IF NOT EXISTS idx_client_download_record_order ON client_download_record (document_key, sort_order);

-- 服务器下载队列；document_key 隔离用户、收藏类型及目录；record_key 保留原标识。
CREATE TABLE IF NOT EXISTS client_download_queue (
  document_key TEXT NOT NULL, -- 文档作用域键；用户文档包含账号目录，随数据目录迁移保持稳定
  record_key TEXT NOT NULL, -- 文档内记录标识；对象字段名或数组序号
  sort_order INTEGER NOT NULL, -- 文档内显示顺序，从零开始
  value_json TEXT NOT NULL CHECK (json_valid(value_json)), -- 记录 JSON 内容；保留业务字段与扩展元数据
  created_at INTEGER NOT NULL, -- 记录创建时间，Unix 毫秒
  updated_at INTEGER NOT NULL, -- 记录最后更新时间，Unix 毫秒
  PRIMARY KEY (document_key, record_key)
);
CREATE INDEX IF NOT EXISTS idx_client_download_queue_order ON client_download_queue (document_key, sort_order);

-- Subsonic 评分与收藏元数据；document_key 隔离用户、收藏类型及目录；record_key 保留原标识。
CREATE TABLE IF NOT EXISTS client_subsonic_meta (
  document_key TEXT NOT NULL, -- 文档作用域键；用户文档包含账号目录，随数据目录迁移保持稳定
  record_key TEXT NOT NULL, -- 文档内记录标识；对象字段名或数组序号
  sort_order INTEGER NOT NULL, -- 文档内显示顺序，从零开始
  value_json TEXT NOT NULL CHECK (json_valid(value_json)), -- 记录 JSON 内容；保留业务字段与扩展元数据
  created_at INTEGER NOT NULL, -- 记录创建时间，Unix 毫秒
  updated_at INTEGER NOT NULL, -- 记录最后更新时间，Unix 毫秒
  PRIMARY KEY (document_key, record_key)
);
CREATE INDEX IF NOT EXISTS idx_client_subsonic_meta_order ON client_subsonic_meta (document_key, sort_order);

-- Subsonic 播放记录；document_key 隔离用户、收藏类型及目录；record_key 保留原标识。
CREATE TABLE IF NOT EXISTS client_subsonic_scrobble (
  document_key TEXT NOT NULL, -- 文档作用域键；用户文档包含账号目录，随数据目录迁移保持稳定
  record_key TEXT NOT NULL, -- 文档内记录标识；对象字段名或数组序号
  sort_order INTEGER NOT NULL, -- 文档内显示顺序，从零开始
  value_json TEXT NOT NULL CHECK (json_valid(value_json)), -- 记录 JSON 内容；保留业务字段与扩展元数据
  created_at INTEGER NOT NULL, -- 记录创建时间，Unix 毫秒
  updated_at INTEGER NOT NULL, -- 记录最后更新时间，Unix 毫秒
  PRIMARY KEY (document_key, record_key)
);
CREATE INDEX IF NOT EXISTS idx_client_subsonic_scrobble_order ON client_subsonic_scrobble (document_key, sort_order);

-- Subsonic 播放队列；document_key 隔离用户、收藏类型及目录；record_key 保留原标识。
CREATE TABLE IF NOT EXISTS client_subsonic_play_queue (
  document_key TEXT NOT NULL, -- 文档作用域键；用户文档包含账号目录，随数据目录迁移保持稳定
  record_key TEXT NOT NULL, -- 文档内记录标识；对象字段名或数组序号
  sort_order INTEGER NOT NULL, -- 文档内显示顺序，从零开始
  value_json TEXT NOT NULL CHECK (json_valid(value_json)), -- 记录 JSON 内容；保留业务字段与扩展元数据
  created_at INTEGER NOT NULL, -- 记录创建时间，Unix 毫秒
  updated_at INTEGER NOT NULL, -- 记录最后更新时间，Unix 毫秒
  PRIMARY KEY (document_key, record_key)
);
CREATE INDEX IF NOT EXISTS idx_client_subsonic_play_queue_order ON client_subsonic_play_queue (document_key, sort_order);

-- Subsonic 播放书签；document_key 隔离用户、收藏类型及目录；record_key 保留原标识。
CREATE TABLE IF NOT EXISTS client_subsonic_bookmark (
  document_key TEXT NOT NULL, -- 文档作用域键；用户文档包含账号目录，随数据目录迁移保持稳定
  record_key TEXT NOT NULL, -- 文档内记录标识；对象字段名或数组序号
  sort_order INTEGER NOT NULL, -- 文档内显示顺序，从零开始
  value_json TEXT NOT NULL CHECK (json_valid(value_json)), -- 记录 JSON 内容；保留业务字段与扩展元数据
  created_at INTEGER NOT NULL, -- 记录创建时间，Unix 毫秒
  updated_at INTEGER NOT NULL, -- 记录最后更新时间，Unix 毫秒
  PRIMARY KEY (document_key, record_key)
);
CREATE INDEX IF NOT EXISTS idx_client_subsonic_bookmark_order ON client_subsonic_bookmark (document_key, sort_order);

-- Subsonic 在线歌曲缓存；document_key 隔离用户、收藏类型及目录；record_key 保留原标识。
CREATE TABLE IF NOT EXISTS client_online_song (
  document_key TEXT NOT NULL, -- 文档作用域键；用户文档包含账号目录，随数据目录迁移保持稳定
  record_key TEXT NOT NULL, -- 文档内记录标识；对象字段名或数组序号
  sort_order INTEGER NOT NULL, -- 文档内显示顺序，从零开始
  value_json TEXT NOT NULL CHECK (json_valid(value_json)), -- 记录 JSON 内容；保留业务字段与扩展元数据
  created_at INTEGER NOT NULL, -- 记录创建时间，Unix 毫秒
  updated_at INTEGER NOT NULL, -- 记录最后更新时间，Unix 毫秒
  PRIMARY KEY (document_key, record_key)
);
CREATE INDEX IF NOT EXISTS idx_client_online_song_order ON client_online_song (document_key, sort_order);

-- 浏览器设备歌单状态；document_key 隔离用户、收藏类型及目录；record_key 保留原标识。
CREATE TABLE IF NOT EXISTS client_browser_state (
  document_key TEXT NOT NULL, -- 文档作用域键；用户文档包含账号目录，随数据目录迁移保持稳定
  record_key TEXT NOT NULL, -- 文档内记录标识；对象字段名或数组序号
  sort_order INTEGER NOT NULL, -- 文档内显示顺序，从零开始
  value_json TEXT NOT NULL CHECK (json_valid(value_json)), -- 记录 JSON 内容；保留业务字段与扩展元数据
  created_at INTEGER NOT NULL, -- 记录创建时间，Unix 毫秒
  updated_at INTEGER NOT NULL, -- 记录最后更新时间，Unix 毫秒
  PRIMARY KEY (document_key, record_key)
);
CREATE INDEX IF NOT EXISTS idx_client_browser_state_order ON client_browser_state (document_key, sort_order);

-- 账号主题配置，沿用文档仓储的账号作用域及迁库协议。
CREATE TABLE IF NOT EXISTS client_appearance (
  document_key TEXT NOT NULL, -- 文档作用域键；用户文档包含账号目录，随数据目录迁移保持稳定
  record_key TEXT NOT NULL, -- 文档内记录标识；对象字段名或数组序号
  sort_order INTEGER NOT NULL, -- 文档内显示顺序，从零开始
  value_json TEXT NOT NULL CHECK (json_valid(value_json)), -- 记录 JSON 内容；保留业务字段与扩展元数据
  created_at INTEGER NOT NULL, -- 记录创建时间，Unix 毫秒
  updated_at INTEGER NOT NULL, -- 记录最后更新时间，Unix 毫秒
  PRIMARY KEY (document_key, record_key)
);
CREATE INDEX IF NOT EXISTS idx_client_appearance_order ON client_appearance (document_key, sort_order);

-- 独立最近播放保存偏好，document_key 对应账号目录；默认保留最近一百首。
CREATE TABLE IF NOT EXISTS client_recent_setting (
  document_key TEXT NOT NULL, -- 账号偏好作用域，包含认证用户目录
  record_key TEXT NOT NULL, -- 偏好字段名，maxRecords 表示最近播放保存上限
  sort_order INTEGER NOT NULL, -- 文档内字段顺序，从零开始
  value_json TEXT NOT NULL CHECK (json_valid(value_json)), -- 保存上限 JSON 值，默认一百条
  created_at INTEGER NOT NULL, -- 记录创建时间，Unix 毫秒
  updated_at INTEGER NOT NULL, -- 记录最后更新时间，Unix 毫秒
  PRIMARY KEY (document_key, record_key)
);
CREATE INDEX IF NOT EXISTS idx_client_recent_setting_order ON client_recent_setting (document_key, sort_order);

-- 最近播放歌曲，独立于主题配置和最近播放保存偏好。
CREATE TABLE IF NOT EXISTS client_recent_play (
  document_key TEXT NOT NULL, -- 文档作用域键；用户文档包含账号目录，随数据目录迁移保持稳定
  record_key TEXT NOT NULL, -- 文档内记录标识；对象字段名或数组序号
  sort_order INTEGER NOT NULL, -- 文档内显示顺序，从零开始
  value_json TEXT NOT NULL CHECK (json_valid(value_json)), -- 记录 JSON 内容；保留业务字段与扩展元数据
  created_at INTEGER NOT NULL, -- 记录创建时间，Unix 毫秒
  updated_at INTEGER NOT NULL, -- 记录最后更新时间，Unix 毫秒
  PRIMARY KEY (document_key, record_key)
);
CREATE INDEX IF NOT EXISTS idx_client_recent_play_order ON client_recent_play (document_key, sort_order);

-- 本地歌手分组缓存，保存内容签名与头像元数据。
CREATE TABLE IF NOT EXISTS client_artist_group (
  document_key TEXT NOT NULL, -- 文档作用域键；用户文档包含账号目录，随数据目录迁移保持稳定
  record_key TEXT NOT NULL, -- 文档内记录标识；对象字段名或数组序号
  sort_order INTEGER NOT NULL, -- 文档内显示顺序，从零开始
  value_json TEXT NOT NULL CHECK (json_valid(value_json)), -- 记录 JSON 内容；保留业务字段与扩展元数据
  created_at INTEGER NOT NULL, -- 记录创建时间，Unix 毫秒
  updated_at INTEGER NOT NULL, -- 记录最后更新时间，Unix 毫秒
  PRIMARY KEY (document_key, record_key)
);
CREATE INDEX IF NOT EXISTS idx_client_artist_group_order ON client_artist_group (document_key, sort_order);

-- 本地专辑分组缓存，按账号、原始专辑名及歌手区分。
CREATE TABLE IF NOT EXISTS client_album_group (
  document_key TEXT NOT NULL, -- 文档作用域键；用户文档包含账号目录，随数据目录迁移保持稳定
  record_key TEXT NOT NULL, -- 文档内记录标识；对象字段名或数组序号
  sort_order INTEGER NOT NULL, -- 文档内显示顺序，从零开始
  value_json TEXT NOT NULL CHECK (json_valid(value_json)), -- 记录 JSON 内容；保留业务字段与扩展元数据
  created_at INTEGER NOT NULL, -- 记录创建时间，Unix 毫秒
  updated_at INTEGER NOT NULL, -- 记录最后更新时间，Unix 毫秒
  PRIMARY KEY (document_key, record_key)
);
CREATE INDEX IF NOT EXISTS idx_client_album_group_order ON client_album_group (document_key, sort_order);

-- 播放器扩展文档，保存未单独归类的兼容业务数据。
CREATE TABLE IF NOT EXISTS client_legacy_document (
  document_key TEXT NOT NULL, -- 文档作用域键；用户文档包含账号目录，随数据目录迁移保持稳定
  record_key TEXT NOT NULL, -- 文档内记录标识；对象字段名或数组序号
  sort_order INTEGER NOT NULL, -- 文档内显示顺序，从零开始
  value_json TEXT NOT NULL CHECK (json_valid(value_json)), -- 记录 JSON 内容；保留业务字段与扩展元数据
  created_at INTEGER NOT NULL, -- 记录创建时间，Unix 毫秒
  updated_at INTEGER NOT NULL, -- 记录最后更新时间，Unix 毫秒
  PRIMARY KEY (document_key, record_key)
);
CREATE INDEX IF NOT EXISTS idx_client_legacy_document_order ON client_legacy_document (document_key, sort_order);

