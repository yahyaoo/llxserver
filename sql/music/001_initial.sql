-- 播放器独立数据库；作者 yahyaoo。
-- 记录字段统一使用 snake_case，扩展值保留全部原 JSON 字段与顺序。
-- 普通歌单及有序歌曲；默认列表仅在账号初始化时创建，作者 jingyh。
CREATE TABLE IF NOT EXISTS client_playlist (
  document_key TEXT NOT NULL, -- 账号目录作用域，随数据库迁移保持稳定
  record_key TEXT NOT NULL, -- 普通歌单标识
  sort_order INTEGER NOT NULL, -- 歌单显示顺序
  value_json TEXT NOT NULL CHECK (json_valid(value_json)), -- 完整歌单、封面和歌曲列表
  playlist_name TEXT GENERATED ALWAYS AS (json_extract(value_json, '$.name')) VIRTUAL, -- 可直接查询的歌单名称
  created_at INTEGER NOT NULL, -- 创建时间，Unix 毫秒
  updated_at INTEGER NOT NULL, -- 更新时间，Unix 毫秒
  PRIMARY KEY (document_key, record_key)
);
CREATE INDEX IF NOT EXISTS idx_client_playlist_order ON client_playlist (document_key, sort_order);

-- 独立喜爱歌曲；作者 jingyh。账号作用域与排序沿用文档仓储，不包含喜爱人数字段。
-- 自定义歌单封面；cover 可直接查询，数据地址随数据库迁移。
-- 歌曲展示封面缓存，与音频内嵌标签状态分离。
CREATE TABLE IF NOT EXISTS client_song_artwork (
  document_key TEXT NOT NULL, -- 账号文档作用域
  record_key TEXT NOT NULL, -- 平台及歌曲标识的摘要
  sort_order INTEGER NOT NULL, -- 缓存记录顺序
  value_json TEXT NOT NULL CHECK (json_valid(value_json)), -- 展示封面缓存信息，不包含内嵌标签状态
  has_cover INTEGER GENERATED ALWAYS AS (json_extract(value_json, '$.hasCover')) VIRTUAL, -- 可查询的图片已有状态
  created_at INTEGER NOT NULL, -- 创建时间，毫秒
  updated_at INTEGER NOT NULL, -- 更新时间，毫秒
  PRIMARY KEY (document_key, record_key)
);
CREATE INDEX IF NOT EXISTS idx_client_song_artwork_order ON client_song_artwork (document_key, sort_order);

CREATE TABLE IF NOT EXISTS client_playlist_cover (
  document_key TEXT NOT NULL, -- 账号目录作用域，随数据目录迁移保持稳定
  record_key TEXT NOT NULL, -- 歌单标识
  sort_order INTEGER NOT NULL, -- 封面记录顺序
  value_json TEXT NOT NULL CHECK (json_valid(value_json)), -- 图片内容或兼容旧图片地址
  cover TEXT GENERATED ALWAYS AS (json_extract(value_json, '$')) VIRTUAL, -- 可直接查询的封面字段
  created_at INTEGER NOT NULL, -- 记录创建时间，毫秒
  updated_at INTEGER NOT NULL, -- 记录更新时间，毫秒
  PRIMARY KEY (document_key, record_key)
);
CREATE INDEX IF NOT EXISTS idx_client_playlist_cover_order ON client_playlist_cover (document_key, sort_order);

CREATE TABLE IF NOT EXISTS client_favorite_song (
  document_key TEXT NOT NULL, -- 账号作用域键，随数据目录迁移保持稳定
  record_key TEXT NOT NULL, -- 文档内歌曲记录标识
  sort_order INTEGER NOT NULL, -- 歌曲显示顺序，从零开始
  value_json TEXT NOT NULL CHECK (json_valid(value_json)), -- 完整歌曲及文件大小、音频参数等元数据
  created_at INTEGER NOT NULL, -- 记录创建时间，Unix 毫秒
  updated_at INTEGER NOT NULL, -- 记录更新时间，Unix 毫秒
  PRIMARY KEY (document_key, record_key)
);
CREATE INDEX IF NOT EXISTS idx_client_favorite_song_order ON client_favorite_song (document_key, sort_order);

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

-- 歌曲身份与物理副本独立存储；同一账号、同一歌曲可以有多个音质和位置。作者：yahyaoo
CREATE TABLE IF NOT EXISTS client_library_song (
  username TEXT NOT NULL, -- 所属账号
  song_key TEXT NOT NULL, -- 跨平台歌曲聚合身份
  source TEXT NOT NULL, -- 默认文件的音源平台
  song_id TEXT NOT NULL, -- 默认文件的平台歌曲标识
  name TEXT NOT NULL, -- 歌曲名称，保留版本信息
  singer TEXT NOT NULL, -- 歌手名称
  preferred_file_key TEXT NOT NULL, -- 最高音质文件的身份
  PRIMARY KEY (username, song_key)
);
CREATE TABLE IF NOT EXISTS client_library_song_file (
  username TEXT NOT NULL, -- 所属账号
  song_key TEXT NOT NULL, -- 歌曲主表关联身份
  file_key TEXT NOT NULL, -- 独立文件身份，区分音质和位置
  quality TEXT NOT NULL, -- 文件实际音质
  folder TEXT NOT NULL, -- 缓存、下载或自定义目录类别
  location TEXT NOT NULL, -- 缓存存储位置
  filename TEXT NOT NULL, -- 索引内文件路径
  size INTEGER NOT NULL, -- 文件大小，单位字节
  metadata_json TEXT NOT NULL CHECK (json_valid(metadata_json)), -- 不含认证字段的文件元信息
  PRIMARY KEY (username, file_key),
  FOREIGN KEY (username, song_key) REFERENCES client_library_song (username, song_key) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_client_library_song_file_song ON client_library_song_file (username, song_key);

