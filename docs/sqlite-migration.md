# SQLite 迁移与洛雪配置导入

作者：yahyaoo

## 原存储确认

管理用户、设备、音源元信息和任务记录原先使用 JSON；全局配置使用 `config.js`。播放器设置、音效、令牌、电台、媒体库、下载索引及快照原先也使用文件，浏览器歌单使用 IndexedDB。现在业务文档正常读取和写入 SQLite。`config.js` 仅保存独立数据库路径；系统业务配置只读写管理库。旧配置需在后台显式上传导入，具体步骤见 [系统配置说明](./system-configuration.md)。

## 首次启动

首次访问一个旧文档时，按原路径和时间导入相应库，不删除原文件。之后读取 SQL，不继续回读旧内容。删除文档时留下迁移墓碑，避免重启复活旧 JSON。原 JSON 仅作迁移来源，不应继续作为当前数据修改入口。

开始升级前可保留完整原数据目录副本。正常运行的备份功能导出当前 SQL 数据为旧路径 JSON；跳过数据库与 WAL，恢复自动写回相应库。整体复制数据库目录应在服务停止后进行；ZIP 备份可跨数据根目录恢复。

## 表与原文档

| 管理表 | 原文档/用途 |
| --- | --- |
| `admin_server_info` | serverInfo.json |
| `admin_user` | users.json |
| `admin_device` | devices.json |
| `admin_source` | sources.json，音源注册信息 |
| `admin_source_state` | states.json，音源启用状态 |
| `admin_source_order` | order.json，音源优先级 |
| `admin_config` | system-configuration.json 作用域的 SQL 业务配置 |
| `admin_task_record` | network-list-autoupdate-records.json |
| `admin_legacy_document` | 未专门登记的管理扩展 JSON |

| 播放器表 | 原文档/用途 |
| --- | --- |
| `music_settings` | settings.json |
| `music_sound_effect` | soundEffects.json |
| `music_token` | token.json |
| `music_radio_station` | radioStations.json |
| `music_library_artist`、`music_library_album` | artists.json、albums.json；路径区分收藏和屏蔽 |
| `music_snapshot_info`、`music_snapshot` | snapshotInfo.json、snapshot_*；路径区分歌单和屏蔽规则 |
| `music_sync_download` | 同步下载 data.json |
| `music_cache_index`、`music_music_index`、`music_custom_index` | cache_index.json、music_index.json、custom_index.json |
| `music_download_record`、`music_download_queue` | server-downloads.json、server-download-queue.json |
| `music_subsonic_meta` | subsonic-meta.json |
| `music_subsonic_scrobble` | subsonic-scrobbles.json |
| `music_subsonic_play_queue` | subsonic-playqueue.json |
| `music_subsonic_bookmark` | subsonic-bookmarks.json |
| `music_online_song` | subsonic-online-cache.json |
| `music_browser_state` | 账号与浏览器随机设备标识对应的歌单状态 |
| `music_legacy_document` | 播放器扩展 JSON |

每张表都有 Entity/DTO/VO，公共字段说明见 `server/common/model/entity/BaseEntity.ts`。两库均含独立 `storage_document` 表及对应模型；DDL 位于 `sql/admin/001_initial.sql` 和 `sql/music/001_initial.sql`。

## 在页面导入

进入播放器「设置 → 数据同步 → 迁移洛雪配置」，点击「上传 JSON 并迁移」。文件最大 20 MB。登录用户覆盖自己的播放器空间；公开空间在受限模式下需要原管理员身份。不能通过用户名请求头覆盖其他用户，也不会导入管理用户、密码或音源脚本。

接口为 `POST /api/music/configuration/import`，支持 multipart `file`/`config` 或原 JSON 请求体。成功返回 `success`、`sections`、`playlists`、`songs`。格式错误返回 400，未授权请求按 401/403 拒绝。全部校验后在一个播放器库事务内替换提供的部分，写库成功后才更新内存歌单及同步快照状态。页面成功后清理当前账号歌单缓存并刷新；失败保留缓存和当前页面。

## 支持的文件格式

1. 原服务器歌单对象：`defaultList`、`loveList`、`userList`。
2. 洛雪 `playList_v2`：`{ "type": "playList_v2", "data": [歌单对象] }`，每个歌单含 `id`、`list`，自定义歌单还需 `name`。
3. 设置导出：`type` 为 `setting`/`settings`/`config` 且 `data` 为设置对象；原 settings.json 可直接上传。
4. 组合配置：`settings`（或 `setting`）、`lists`（或 `list`/`playList`）、`soundEffects`、`library`。也支持 `type: lxserver-configuration` 包装组合数据。

示例：

```json
{
  "settings": { "preferredQuality": "flac", "volume": 0.6 },
  "lists": {
    "defaultList": [],
    "loveList": [],
    "userList": [{ "id": "my_list", "name": "我的歌单", "list": [] }]
  },
  "soundEffects": { "equalizer": [] },
  "library": { "artists": [], "albums": [], "dislikedArtists": [], "dislikedAlbums": [] }
}
```

仅覆盖文件中提供的部分，未提供的部分保持原值。歌曲重复项、顺序和扩展字段保持不变。歌曲需要非空字符串 `id`；自定义歌单标识不得重复或使用 default/love。未知格式不会被当成空配置清空数据。

## 浏览器离线行为

在线歌单通过 `/api/music/storage/list` 保存到播放器库，按账号和随机设备标识隔离。IndexedDB 保留离线缓存及一次性旧数据迁移来源；未提交的编辑/删除在重连读取时重试，连续写入按调用顺序执行。已有 localStorage 中的凭据、主题等界面偏好保持原使用方式。浏览器随机设备标识只是作用域标识，不能代替用户认证。

浏览器数据不会同步到管理库。服务器未连接时仍可读取本地缓存；服务器库尚无当前设备的数据时才使用所属账号旧缓存补齐。
