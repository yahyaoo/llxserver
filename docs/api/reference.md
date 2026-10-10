# 服务端 API 参考

LX Sync Server 提供了多种 RESTful 风格的 API 接口，用于自动化获取和操控同步服务器数据以及状态。

## 概述

除 POST /api/login、/api/user/login、/api/user/verify 登录入口外，所有 /api/ 业务请求必须有有效会话或 Token，匿名请求返回 401。OPTIONS 跨域预检只返回空响应。

1. **后台会话**：POST /api/login，正文包含管理员 password。成功签发 HttpOnly lx_admin_session Cookie，返回的令牌也可作为 x-admin-token。退出使用 POST /api/admin/logout。x-frontend-auth 仅作额外管理员权限校验，不能单独绕过身份认证；有效后台会话自动提供管理员权限。
2. **用户认证**：登录会话 Cookie、x-user-token 或 Authorization: Bearer。支持登录生成的会话令牌和用户 API Token。普通用户身份与 Token 不自动获得管理员权限。
所有接口如无特殊说明均**使用 JSON 作为请求体及响应体**类型 (`Content-Type: application/json`)。

---

## 1. 认证与账户管理 API

### 1.1 管理员：服务状态 (`GET /api/status`)

获取同步服务器整体内存消耗、设备在线情况、运行时间汇总状态。

- **Header Auth**: `x-frontend-auth: <Admin Password>`

### 1.2 管理员：用户管理 (`/api/users`)

- **Header Auth**: `x-frontend-auth: <Admin Password>`
- `GET /api/users`: 获取所有用户列表及密码、权限配置。
- `POST /api/users`: 创建新用户 (`{"name": "...", "password": "..."}`)。
- `PUT /api/users`: 修改用户信息 (重命名、修改密码或权限) (`{"name": "...", "newName": "...", "password": "...", "enableCustomMusicDir": false, "customMusicDir": "...", "allowOperateCustomMusicDir": false, "allowWriteCustomMusicDir": false}`)。
- `DELETE /api/users`: 删除用户 (`{"names": ["..."], "deleteData": true}`)。

### 1.3 用户：登录获取 Token (`POST /api/user/login`)

使用用户名密码登录并颁发 Token。

- **Body**: `{"username":"...","password":"...","rememberMe":true}`。远程模式增加 `serverUrl`，例如 `https://music.example.com:9527`，不带路径或 URL 凭据。
- **响应**: `{"success":true,"token":"随机会话令牌","username":"...","expiresAt":1790000000000,"rememberMe":true}`，同时签发 HttpOnly、SameSite=Strict Cookie。
- 普通登录有效期由 `auth.sessionDays` 控制，记住我由 `auth.rememberMeDays` 控制。记住登录在管理 SQLite 中保存令牌摘要及到期时间，可跨服务重启。
- 远程模式通过当前入口代理该服务器的用户、音乐和个人音源接口；不保存远程密码，远程令牌加密保存。

### 1.4 用户：登出 (`POST /api/user/logout`)

注销当前的 Session Token 并清除 Cookie；远程模式同时请求远端撤销会话。

- **Header Auth**: `x-user-token: <Token>`

### 1.5 用户：认证有效性检查 (`GET /api/user/auth/verify`)

检查当前 Token 或 Cookie 是否还有效；账号密码改变、账号删除或会话到期后返回 HTTP 401；远程上游校验失败返回 `valid: false`。

- **Header Auth**: `x-user-token: <Token>`

---

### 1.6 用户：账号设置

这些接口必须通过用户会话或 API Token 认证，账号归属取自认证结果。

- `GET /api/user/account`：返回 `username`、`nickname` 和头像链接 `avatar`，不返回密码。
- `PUT /api/user/account`：正文 `{"nickname":"昵称"}`；最多 40 字，展示用户名默认使用登录名，登录名不可修改。
- `POST /api/user/account/avatar`：直接上传图片字节；最大 2 MB，接受 PNG、JPEG、WebP、GIF，服务端解码并保存 256×256 PNG。
- `GET /api/user/account/avatar`：读取当前账号头像，未设置时返回 404。
- `POST /api/user/account/password`：正文 `{"currentPassword":"原密码","newPassword":"新密码"}`；新密码为 6–128 位，成功后需重新登录，其他旧会话及旧 API Token 也失效。

## 2. Token 安全管理 API

在「账号设置 → Token 配置」管理当前账号的 API Token。总开关和令牌记录分别存入 server_api_token_account、server_api_token，按登录名关联账号，保存摘要和加密原值。禁用、删除、到期即时生效，重启后立即可用。旧 JSON 首次读取自动迁移。Token 名称最多 100 字，expiresAt 为 Unix 毫秒或 null（永久）。

用于在管理面板或客户端管理持久化的 API Token。要求使用 `x-user-token` 进行鉴权。

- `GET /api/user/token/config`: 获取当前用户的 Token 认证配置（是否开启及列表）。
- `POST /api/user/token/config`: 开启或关闭 Token 认证功能 (`{"enabled": true/false}`)。
- `POST /api/user/token/add`: 生成新的持久化 API Token (`{"name": "名称", "expireDays": 7}`)。
- `POST /api/user/token/remove`: 删除指定 Token (`{"token": "..."}`)。
- `POST /api/user/token/update`: 更新 Token 信息（名称、有效期）。
- `POST /api/user/token/toggle`: 禁用或启用某个已生成的 Token。
- `GET /api/user/token/logs`: 获取特定 Token 的审计/访问日志（需传入 `tokenMasked` 参数）。

---

## 3. 数据与同步 API

此类接口用于管理用户的核心同步数据。

### 3.1 歌单管理

- `GET /api/user/list`: 获取用户当前完整歌单数据。
- `POST /api/music/playlists/import?user=<用户名>`: 追加导入歌单。接受 JSON 正文或 `file` 单文件表单（最多 20 MB），支持洛雪 `playList_v2`、本站 `lxserver-playlist` v1 和服务器列表备份。复用洛雪解析与 SQLite 快照事务，生成新歌单 ID，保留歌曲顺序、重复项和扩展字段；不会覆盖原有歌单或播放器设置。当前账号只能导入自己的歌单，`user=_open` 必须具备管理员身份。返回 `{ success, username, playlists, songs, lists }`，其中数量只统计本次导入，`lists` 为保存后的完整列表。
- `POST /api/user/list`: 全量覆盖更新用户歌单数据（会触发同步广播）。
- `POST /api/music/user/list/remove`: 批量删除指定歌单中的歌曲 (`{"listId": "...", "songIds": [...]}`)。

### 3.2 历史快照 (Snapshot)

- `GET /api/data/snapshots`: 获取快照列表。
- `GET /api/data/snapshot`: 获取特定快照的数据。
- `POST /api/data/restore-snapshot`: 恢复到指定快照。
- `POST /api/data/delete-snapshot`: 删除特定快照。
- `POST /api/data/upload-snapshot`: 手动上传备份快照。

### 3.3 用户设置与音效

- `GET /api/user/settings`: 获取用户应用设置。
- `POST /api/user/settings`: 更新用户应用设置。
- `GET /api/user/sound-effects`: 获取用户均衡器/音效设置。
- `POST /api/user/sound-effects`: 更新用户音效设置。

---

## 4. 多媒体核心 API (Web Player 支持)

### 4.1 搜索与提示

- `GET /api/music/search`: 音乐搜索（支持 `kw`, `kg`, `tx`, `wy`, `mg`）。
- `GET /api/music/tipSearch`: 搜索关键词联想提示。
- `GET /api/music/hotSearch`: 各平台实时热搜榜单。

### 4.2 广场与榜单

- `GET /api/music/songList/tags`: 获取歌单分类标签。
- `GET /api/music/songList/list`: 获取指定标签的精选歌单列表。
- `GET /api/music/songList/detail`: 获取歌单详情（完整歌曲列表）。
- `GET /api/music/leaderboard/boards`: 获取排行榜分类。
- `GET /api/music/leaderboard/list`: 获取排行榜内的歌曲。

### 4.3 播放与歌词

- `POST /api/music/url`: 获取音乐播放直链。
  - **Header Support**: 可选 `x-req-id` 用于 SSE 进度追踪。
  - **Progress**: 可通过 `GET /api/music/progress?reqId=xxx` 订阅 SSE 获取自定义源解析进度。
- `POST /api/music/lyric`: 获取歌词。
- `POST /api/music/comment`: 获取歌曲评论（支持 hot/new 类型）。

### 4.4 下载与转发 (`GET /api/music/download`)

代理下载音乐文件，支持自动注入 ID3 标签。

- **Params**: `url`, `filename`, `tag=1` (注入标签), `name`, `singer`, `album`, `pic`。

---

## 5. 服务端文件缓存 API

用户可以通过接口管理缓存在服务器上的音乐文件和歌词。

- `GET /api/music/cache/stats`: 获取当前用户的缓存统计（文件数、占用空间）。
- `GET /api/music/cache/list`: 获取详细的缓存文件列表。
- `POST /api/music/cache/download`: 触发服务器后台下载歌曲并缓存。
- `POST /api/music/cache/remove`: 删除指定的缓存文件。
- `POST /api/music/cache/clear`: 清理所有音乐缓存。
- `POST /api/music/cache/lyric`: 保存或读取歌词缓存。

### 5.1 自定义音乐目录与洗版 (`/api/music/custom/*`)

允许配置了 `enableCustomMusicDir` 的用户挂载并管理服务器上的本地音乐文件。

- `GET /api/music/custom/list`: 获取自定义目录歌曲列表。
- `POST /api/music/custom/sync`: 触发服务器重新扫描同步自定义目录数据。
- `GET /api/music/custom/file`: 获取单个音频文件流。
- `GET /api/music/custom/cover`: 获取音频内嵌封面图片流。
- `POST /api/music/custom/remove`: 删除音频文件及数据（要求用户开启 `allowOperateCustomMusicDir` 权限）。
- `POST /api/music/custom/link`: 手动关联并重写音频 ID3 标签信息（要求用户开启 `allowWriteCustomMusicDir` 权限）。
- `POST /api/music/custom/updateMetadata`: 批量抓取网上元数据并覆写本地文件（要求用户开启 `allowWriteCustomMusicDir` 权限）。
- `POST /api/music/custom/embedLyric`: 批量将歌词写入本地文件 USLT 标签中（要求用户开启 `allowWriteCustomMusicDir` 权限）。
- `POST /api/music/remaster/start`: 启动音频洗版与降级转码任务（若作用于自定义目录，要求用户开启 `allowOperateCustomMusicDir` 权限）。

---

## 6. 自定义源管理 API

- `GET /api/custom-source/list`: 获取已导入的自定义源列表。
- `POST /api/custom-source/import`: 在线导入自定义源脚本。
- `POST /api/custom-source/upload`: 上传本地脚本文件。
- `POST /api/custom-source/toggle`: 启用或禁用某个源。
- `POST /api/custom-source/delete`: 删除自定义源。
- `POST /api/custom-source/reorder`: 对自定义源进行排序。

---

## 7. 全局系统配置 API (管理员权限)

用于管理后台对服务器核心行为的实时调整。要求 `x-frontend-auth` 鉴权。

- `GET /api/config`: 获取服务器当前的所有可配置项（含环境变量覆盖后的最终值）。
- `POST /api/config`: 增量更新全局配置。
  - **支持配置项**: 包括 `admin.path`, `player.path`, `subsonic.enableDebug`, `subsonic.onlineSearch`, `subsonic.onlineSearchMode`, `subsonic.onlineSearchSources`, `subsonic.lyricTranslation`, `artist.maxFetchPages`, `cache.namingPattern`, `system.allowUnsafeVM` 等。
  - **参数示例**: `{"admin.path": "/admin", "player.path": "", "subsonic.enableDebug": false}`
  - **路径校验规则**: `admin.path` 与 `player.path` 必须以 `/` 开头或为空字符串，两者不能冲突相同且不能以 `/api` 开头。
- `POST /api/admin/reload`: 从 SQLite 重新加载系统配置、用户数据及用户自定义音源 API。
- `POST /api/admin/restart`: 安全重启服务器进程。

---

## 8. Web 播放器专属 API

专为 Web 播放器前端逻辑设计的接口，支持基于 Session 的访问。

### 8.1 基础配置与认证
- `GET /api/music/config`: **公开接口**，获取 Web 播放器的运行状态及基础路径配置。
  - **响应示例**: `{"admin.path": "/admin", "player.path": "", "player.enableAuth": false, "user.enablePublicRestriction": true}`
- `POST /api/music/auth`: 校验访问密码，成功后下发 `lx_player_session` HttpOnly Cookie。
- `POST /api/music/auth/logout`: 彻底注销当前的 Session 会话。
- `GET /api/music/auth/verify`: 检查当前 Session 是否依然有效。

### 8.2 增强元数据详情
- `GET /api/music/artistDetail`: 获取歌手精美详情。
  - **Params**: `source` (tx/wy), `id` (歌手Mid/ID)。
  - **Return**: 含 `name`, `desc`, `avatar`, `fans` 等。
- `GET /api/music/artistAlbums`: 分页获取歌手的专辑列表。
- `GET /api/music/artistSongs`: 分页获取歌手的全部歌曲。
- `GET /api/music/albumSongs`: 获取指定专辑内的所有音轨详情。

### 8.3 实时进度 (SSE)
- `GET /api/music/progress?reqId=xxx`: 通过 Server-Sent Events (SSE) 实时订阅外链解析、缓存进度等流式信息。

### 8.4 歌曲文件状态

- `POST /api/music/file-status`：批量检查当前认证账号的服务器下载记录、播放缓存、历史音乐目录和已配置的自定义音乐目录。单次最多 500 首，正文最多 1 MB，不接受客户端目录路径。
- 请求：`{"songs":[{"id":"wy_123","source":"wy","songmid":"123","name":"歌名","singer":"歌手"}]}`。兼容洛雪 `meta.songmid`、`meta.songId` 字段。
- 响应：`{"success":true,"statuses":[{"id":"wy_123","identity":"wy:123","state":"downloaded"}]}`，保持输入顺序及重复项。
- `state`：`downloaded` 已下载；`cached` 已缓存；`cloud` 云端、未下载。以实际存在且大小正确的音频文件为准，下载优先于缓存。未关联的自定义文件按歌名、歌手及可用专辑匹配；已关联歌曲只按平台与 ID 匹配。
- 非法输入返回 400，未登录返回 401，用户名与当前身份不一致返回 403，目录读取失败返回 503。响应不包含路径与认证凭据。

