# 系统配置与数据库位置管理

作者：yahyaoo

## 配置来源

业务配置读写管理库 `server_config`，不再加载或监听旧 `config.js` 的业务字段。原数据库中以引导文件路径保存的配置会在库内转换为固定作用域 `system-configuration.json`，不重新读取文件。

首次运行使用 `server/defaultConfig.ts` 初始化 SQL 配置；启动时仍按既有规则应用环境变量并保存生效配置。本地 ZIP 恢复业务文档后，从 SQL 刷新配置。修改旧文件不会改变运行配置，需要在页面显式导入。

`config.js` 使用 `server.xxx` 保存数据库引导、`client.xxx` 保存独立客户端连接配置，环境变量优先：

```js
module.exports = {
  'server.database.adminPath': 'database/admin.sqlite',
  'server.database.musicPath': 'database/music.sqlite',
  'client.serverUrl': 'http://127.0.0.1:9527',
  'client.port': 9528,
  'client.bindIP': '0.0.0.0'
}
```

独立客户端读取同一格式的配置；`SERVER_URL`、`CLIENT_PORT`、`CLIENT_BIND_IP` 和服务端 `SERVER_DATABASE_ADMIN_PATH`、`SERVER_DATABASE_MUSIC_PATH` 优先。后台迁库保存引导时只保留上述三个客户端连接字段与两库路径，其他字段清除。旧的 `database.*` 引导键不自动读取。详细说明见 [部署文档](../deploy/README.md)。

相对数据库路径基于 `DATA_PATH`。引导文件默认位于 `DATA_PATH/config.js`，可由 `CONFIG_PATH` 指定；该文件不存在时读取项目根目录的路径配置，首次启动后写出实际位置。精简已有旧文件前保留原文为 `config.js.legacy.js`，供管理员手动导入。配置导出备份和 本地 ZIP 备份不会包含引导文件、旧配置副本或实际数据库文件。

## 后台设置目录

后台「系统配置」按「服务与访问」「音乐与缓存」「同步与数据」分组；点击目录只切换显示，未保存的表单内容保留。

新增可配置项包括服务端口、绑定 IP 配置值、匿名统计开关、缓存位置与命名模式、Subsonic 推荐池及转码开关、格式、并发数。其他既有配置继续使用原有控件和保存规则。主 HTTP 服务仍固定监听 `0.0.0.0`；绑定 IP 配置值保留，但不改变当前监听实现。缓存命名模式在启动时应用，播放器已保存的命名设置优先。

启动期参数需要重启，包括主端口、匿名统计、缓存基础位置、Subsonic 服务启用状态及独立端口。数据库位置切换成功后立即使用新连接。

## 账号登录与有效期

播放器必须先登录账号才能进入，与旧 `player.enableAuth` 访问密码开关无关。本地服务器指当前部署绑定的后端；拆分客户端通过 `client.serverUrl` / `SERVER_URL` 绑定后端，不按地址是否为 127.0.0.1 判断。

登录页选择「远程同步」后输入远程 HTTP/HTTPS 服务器地址及账号密码，直接使用远端账号、歌单、音乐库和设置。当前入口代理远端接口，不要求该账号同时存在于绑定服务器。远端必须支持本项目的账号登录接口，推荐使用 HTTPS；无需 LX WebSocket 连接码。

后台系统配置可设置：

| 配置 | 默认 | 范围 | 生效方式 |
| --- | --- | --- | --- |
| `auth.sessionDays` | 1 天 | 1–365 天 | 普通登录最长有效期，关闭浏览器后需重新登录 |
| `auth.rememberMeDays` | 30 天 | 1–365 天 | 记住我有效期；缩短配置后已有会话按较短期限校验 |

值保存到管理库 `server_config`，记住登录存入 `server_login_session`，包含 `expires_at`；启动时自动补建表，无需手工迁移。普通会话不持久化，记住登录可跨服务重启。浏览器不保存账号密码。退出撤销会话并返回登录页，过期也需重新登录。

设置目录提供独立的「账号设置」分组，下含「账号资料」「迁移洛雪配置」「Token 配置」。账号资料显示只读登录名，可编辑的展示用户名默认使用登录名，最多 40 字。头像支持拖动、缩放及方向键定位，确认裁剪后上传。「修改密码」定位密码表单，需输入原密码，成功后所有旧会话和 API Token 失效。

API Token 保存到管理库的 server_api_token_account 与 server_api_token，按登录名关联用户。总开关、单个禁用、删除与有效期即时生效；启动后无需等待，首次使用自动迁移旧 JSON 配置。数据库保存摘要和加密原值。

所有 /api/ 业务接口统一要求登录会话或 API Token，支持 Cookie、x-user-token 和 Authorization: Bearer。匿名只允许 POST 登录及凭据验证入口；OPTIONS 仅用于跨域预检。管理员口令头不能单独绕过登录：后台登录 /api/login 签发独立 HttpOnly 会话 Cookie，或使用返回令牌作为 x-admin-token。普通用户与 API Token 仍需通过各业务接口的权限检查。

## 导入旧 config.js

在「数据库与迁移」选择 `.js` 或 `.json` 文件，点击「导入旧配置」。最大 2 MB。接受 `module.exports = { ... }` 和 JSON 对象，可包含注释、尾逗号及代理继承开关 `undefined`；文件不能包含函数调用、环境表达式或其他可执行代码。需要先将动态表达式转换为静态值。

只覆盖文件中提供的已知业务字段；未提供字段保留，未知字段及数据库路径忽略。存在 `users` 时一并覆盖管理用户文档。解析、类型或选项校验、数据库事务失败不会部分覆盖配置和用户。导入结果不返回密码或令牌；管理员密码变化时退出旧会话，使用新密码登录。

升级前保留旧配置及数据目录副本。启动不自动导入旧业务配置；已有 SQL 配置继续使用，首次 SQL 初始化的管理员密码来自默认值或 `FRONTEND_PASSWORD`。飞牛首次安装由向导直接初始化 SQL 密码和播放器访问参数，重复安装不覆盖已保存配置。

播放器的「迁移洛雪配置」使用独立接口和播放库，说明见 [SQLite 迁移](./sqlite-migration.md)。系统配置导入不会修改播放库设置或歌单。

## 修改数据库位置

填写两个独立数据库文件路径后保存。目标目录不存在时自动创建。目标文件不存在时复制当前库并初始化；已有同类 SQLite 库通过完整性及表类型检查后直接打开，保留其数据，不覆盖。损坏或其他类型数据库会提示异常。

1. 目标不存在时，对当前库执行 `VACUUM INTO`，复制包含 WAL 已提交记录的一致快照；目标已存在时只检查并使用该库。
2. 打开目标库，执行所属域建表脚本，并进行完整性检查。
3. 两个待迁移库全部准备成功后，交换连接并原子保存引导路径。
4. 关闭旧连接，删除原数据库及 WAL/SHM。文件仍被占用时返回清理警告，新库已经生效。

复制、初始化、完整性检查或引导保存失败时，关闭候选连接并仅清理本次创建的新库，保留用户已有目标文件，继续使用旧连接和旧引导路径。本次迁库请求修改的内存配置也恢复；用户目录迁移在迁库成功后执行。仓储对象引用和业务数据作用域保持稳定，外部引用无需重新获取。

避免多个服务进程同时写同一数据库并执行迁库；本服务切换连接不会切换外部进程的连接。手工整体迁移数据目录时先停止使用该目录的服务。

## 接口

接口使用既有 `x-frontend-auth` 管理员认证：

| 接口 | 请求/结果 |
| --- | --- |
| `GET /api/config` | 返回业务设置、实际两库路径、补充字段元数据；不返回用户列表及更新令牌 |
| `POST /api/config` | 原配置正文，可增加 `database.adminPath`、`database.musicPath`；成功返回 `success`、`warning` |
| `POST /api/config/import` | JSON 正文 `{ "content": "module.exports={...}" }`；返回 `imported`、`ignored`、`restartRequired`、`authenticationChanged` |

未认证返回 401；旧配置解析或迁库失败返回 400 及 `message`。原配置目录校验等错误继续使用既有状态码。配置备份导出为可静态导入的业务配置文本，恢复不会改变引导路径。

## 开发验证

### C 组：WS 通道配置（2026-10-13）

以下字段通过 `SystemConfigurationFields.ts` 的补充字段元数据生成后台输入，并复用保存/旧配置导入校验，不需要再次在管理端手写一套表单。保存后新 WS 连接取得 ready.config；已有连接通过重连取得更新。

| 配置 | 默认 | 整数范围 / 用途 |
| --- | --- | --- |
| `clientChannel.reportIntervalMinutes` | 30 | 0–1440；0 显式恢复立即状态上报，ready 转为 reportIntervalMs |
| `clientChannel.progressThrottleMs` | 500 | 200–5000；进度节流，完成/失败等状态立即推送 |
| `clientChannel.maxBatchOps` | 200 | 1–512；客户端分批及状态队列补发阈值 |
| `clientChannel.maxBatchBytes` | 262144 | 1024–1048576；客户端 UTF-8 批次/状态阈值，退出 keepalive 使用更小子批次 |
| `clientChannel.legacyProgressPolling` | false | 隐藏降级开关；仅订阅且存在活动任务每秒读取，正常路径关闭 |

用户高级设置 `clientStateIntervalMinutes` 默认 `server`，可选 5、30、60 分钟；只覆盖播放状态周期。歌单、收藏、设置仍在 2 秒内安排发送；关闭页面只是尽力补发，未确认记录提前持久化并留待重试。配置保存并不代表真实浏览器行为已验收，见 [C 组报告](ws-events-test-report.md)。

执行 `npm run build`、`npm run test:unit`、`npm run test:system`、`npm run test:fpk`。自动测试使用临时目录和独立端口，覆盖 SQL 唯一来源、导入事务、鉴权、两库隔离、WAL 复制、双库失败回滚、数据库路径重启持久化和备份恢复。浏览器补充验证分组草稿、真实保存、文件上传和窄屏布局。

### B 组：音乐库后台任务（2026-10-13）

管理端新增“音乐库扫描”“封面与歌词预取”“自动修复”三个配置分组，字段由 `LibraryConfigurationFields.ts` 登记，保存和旧配置导入共用校验。普通保存、导入、备份恢复及热重载通过应用层注入的刷新能力更新后台服务。目录行增加三态监听选择；状态按页面请求读取，不新增网络轮询。

| 配置 | 默认 | 范围与实际行为 |
| --- | --- | --- |
| `library.scan.enabled` | true | 自动扫描、启动扫描与监听总开关；关闭后仍可手动扫描 |
| `library.scan.defaultMinutes` | 60 | 1–1440，仅用于新目录；旧目录保留 30 或已有值 |
| `library.scan.fullScanHours` | 24 | 0–720；0 关闭完整兜底，quick 不能检测所有原地修改 |
| `library.scan.watch` | true | 全局监听开关，目录 `watch` 为空时跟随 |
| `library.scan.watchMode` | auto | auto/native/polling/off；auto 对已识别网络盘禁用监听；polling 仅定时扫描，间隔至少 5 分钟；监听正常时 quick 间隔至少 360 分钟 |
| `library.scan.watchDebounceSeconds` | 10 | 2–300 秒，最长等待为配置值的 5 倍 |
| `library.scan.startupDelaySeconds` | 60 | 0–86400 秒；0 不执行启动扫描，缺少有效状态才转 full |
| `library.scan.ioPauseMs` | 0 | 0–200 毫秒，标签读取间隔 |
| `library.scan.legacy` | false | 隐藏兼容开关：关闭监听、将 quick 转 full，复用同一调度器，不恢复列表请求触发扫描 |
| `library.prefetch.enabled/cover/lyric/network` | true | 后台预取、封面、歌词、联网四个独立开关；关闭联网仍提取本地来源 |
| `library.prefetch.concurrency` | 2 | 1–4，全服务本地任务预算 |
| `library.prefetch.networkPerMinute` | 30 | 1–300，滑动一分钟限速，网络请求串行；连续失败触发冷却 |
| `library.prefetch.maxCacheMB` | 256 | 1–102400，每用户封面与只读歌词预算；每 50 项及终态清理，批次内可能短暂超额 |
| `library.prefetch.backfillOnStartup` | true | 首次成功扫描后补齐；中断后重新遍历，以资源记录和真实缓存去重，不把入队游标当完成水位 |
| `library.autoFix.embedLyric` | off | off/follow-download/on；follow-download 跟随现有下载歌词策略 |
| `library.autoFix.retag` | off | off/fill-missing；自动仅填空缺标签，不替换已有图片 |
| `library.autoFix.scope` | cache | cache/cache+custom；本期 custom 及 location=custom 因外部独占无法证明而跳过，即使有写权限也不自动修改 |
| `library.autoFix.maxPerRun` | 200 | 1–5000，全服务串行，每轮上限 |
| `library.autoFix.quietHours` | 空 | 服务器本地时间 HH:mm-HH:mm，允许跨午夜，空值不限 |
| `library.autoFix.safeWrite` | true | 关闭保护会禁用自动写，不能启用自动原地覆盖 |

可选的 `pauseWhilePlaying` 未实现，未注册默认值或无作用的配置入口。自动写仅允许已验证布局的私有缓存 MP3/FLAC/M4A，跳过正在响应音频、最近 60 秒修改、格式/安全校验失败的文件；启用独立 Subsonic 端口时也保守跳过。自动动作默认关闭，开启前提示备份；**关闭只停止后续任务，不恢复已写文件。本期不提供原件长期备份或恢复入口。**

新增接口均需管理员 `x-frontend-auth`，普通用户令牌不能访问：

| 接口 | 用途 |
| --- | --- |
| `GET /api/admin/library/scan/status?user=` | 目录水位、监听状态与降级原因 |
| `GET /api/admin/library/prefetch/status?user=` | queued/done/failed/running；计数为本次服务运行累计值 |
| `POST /api/admin/library/prefetch/run?user=&mode=backfill\|retry-failed` | 202 排队，禁用预取时 409 |
| `GET /api/admin/library/autofix/log?user=` | 最近 200 条自动维护审计 |

原 `POST /api/music/custom/sync` 增加 `?mode=quick|full`，默认 full；非法模式 400，保留原用户认证。列表读取仅返回现有索引。B 组实测与未验收项见 [扫描报告](library-scan-test-report.md)、[预取报告](library-prefetch-test-report.md)、[自动修复报告](library-autofix-test-report.md)。
