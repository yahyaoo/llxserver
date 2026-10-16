# 任务 03：WS 长连接——30 分钟状态上报、服务端通知、事件驱动的进度推送

> 先读 `docs/plans/00-overview.md`，特别是第 3.2 节（消息分级）和第 4 节（`ServerEvents` 契约）。本任务**独占** `ClientChannel.ts`、`client-channel.js`、`client-channel-worker.js`、`download_manager.js`、`user_sync.js`、`client_performance.js` 中的 `ClientSync` 部分，以及 `docs/client-channel.md`。

## 1. 现状

以下是基线 `7fd44a1` 的逐项审核，不表示项目尚未使用 WS：已有缓存推送和批量同步应保留。`progress()` 是服务端进程内采样，`speedInterval` 是客户端本地速度计算，`ClientSync flush` 是批量提交；不能写成三种客户端 HTTP 轮询。`pollServerProgress` 的方法定义也不证明仍被调用，开工时追踪调用方，只删除确实残留的活动轮询或孤立旧代码。若新分支已完成某项，只做定向回归并记录“已满足”。

**服务端 `server/application/http/ClientChannel.ts`**

- 构造函数中 `this.progressTimer = setInterval(() => this.progress(), 1000)`（约 68 行）。
- `progress()`（约 264 行）**每秒**遍历所有连接的所有订阅主题，通过 `invoke` 在进程内调用 `/api/music/cache/queue`、`/api/user/sync-download/progress`、`/api/music/remaster/status`、`/api/music/maintenance`、`/api/music/library/scan`，再 `JSON.stringify` 整个结果，与上一次的签名比较。本质上是服务端轮询：即使没有任何下载，每秒也要执行 N 次路由调用和 JSON 序列化。
- `subscribe` 只接受 `downloads`、`sync-download`、`maintenance`、`remaster` 四个主题（约 190 行）。
- `notify(value)` 和 `pushSnapshot` 负责在数据变化时推送 `cache` 消息（500ms 合并），这部分已经是事件驱动，**保留**。
- 没有通用的“服务端通知”消息类型。

**客户端**

- `client/music/js/client_performance.js` 中的 `ClientSync`：`setInterval(flush, 30000)`（约 286 行），另有 `pagehide` 处理。ClientSync 管理的频道：`lists`、`settings`、`appearance`、`sound-effects`、`account-profile`、`cache-config`、`sync-download`，**全部属于用户数据**。
- `client/music/js/deferred_writes.js`：用于最近播放、缓存下载与歌词缓存写入等；以实际 URL 分类，禁止仅凭调用位置分类。**07b 独占存储实现**，03 只调整调度/flush 时机并按冻结接口调用；命令不能等待 30 分钟，歌词缓存不能通过合并误删正文。
- `client/music/js/download_manager.js`：`speedInterval = setInterval(updateGlobalSpeed, 1000)`（约 29 行）、`pollServerProgress()`（约 370 行，遗留轮询）、`waitForDownloadResolver` 中 50ms 的轮询。
- `client/music/js/user_sync.js` 约 726 行：`startHeartbeat` 每 30 秒执行一个**空函数**。
- `client/music/js/client-channel-worker.js`：负责连接、重连（指数退避）、HTTP 回退。

## 2. 目标

1. **状态类**写入（播放记录、播放进度、播放次数、漫游权重）在客户端合并，默认**每 30 分钟**上报一次；在页面隐藏或关闭、退出登录、切换账号、断线重连成功、队列条数 ≥ 200 或体积 ≥ 256KB 时立即上报。周期可由服务端配置、客户端设置覆盖。
2. **用户数据**写入（歌单、收藏、设置等）保持 2 秒内防抖提交，不受 30 分钟周期影响。
3. **命令类**写入（`/api/music/cache/download` 等触发服务端动作的请求）立即发送。
4. 服务端新增通用 `notify` 消息，可以向指定用户或全部用户推送；离线期间的通知在重连后补发。
5. 下载进度、同步下载进度、维护任务、扫描状态、预取进度改为**事件驱动推送**：删除 1 秒的 `progress()` 轮询。
6. 客户端删除 `pollServerProgress`、每秒的 `speedInterval`、空心跳；下载速度在收到推送时计算。

## 3. 范围

**范围内**：文档开头引用块中列出的独占文件；`server/defaultConfig.ts` 中新增 `clientChannel.*`；下载队列服务中**新增事件发送**（`server/music/service/download/ServerDownloadQueueService.ts`、`server/music/service/DownloadService.ts`，以及同步下载、remaster、maintenance 的进度更新点，只允许新增 `serverEvents.emitEvent(...)` 调用，不改业务逻辑）；如 00 号文档第 4 节的 `server/application/events/ServerEvents.ts` 尚不存在，由本任务创建；管理端系统配置页新增上报周期配置；`docs/client-channel.md`。

**范围外（禁止）**

- 不改 `cache` 推送和 `report` 批量提交的协议格式（只允许新增消息类型和字段）。
- 不改 HTTP 回退的语义：`clientSyncTransport = 'http'` 时只将上报改为HTTP，仍保留WS接收服务端推送；仅WS实际不可用且下载页可见时保留 5 秒 HTTP 兜底。
- 不改07b负责的存储实现；不改02负责的列表渲染。
- 存储归07b；09本地随机/漫游读取本地完整歌单和权重，03不让点击选曲等网络。列表编辑先本地生效再2秒内提交；有效播放立即更新09 projection，但其上报仍state周期。
- 不实现通知的持久化数据库表（使用内存环形缓冲即可）。
- 不改 Subsonic。

## 4. 协议契约（写入 `docs/client-channel.md`）

### 4.1 握手

客户端 → 服务端（已存在，新增字段）：

```json
{ "type": "hello", "token": "...", "device": "...", "versions": {}, "lastNotifySeq": 120, "serverEpoch": "instance-id" }
```

服务端 → 客户端 `ready`（新增字段）：

```json
{ "type": "ready", "config": { "reportIntervalMs": 1800000, "progressThrottleMs": 500, "maxBatchOps": 200, "maxBatchBytes": 262144 }, "serverEpoch": "instance-id", "notifySeq": 125, "notifyRange": { "first": 26, "last": 125 }, "resumeUnavailable": false }
```

### 4.2 订阅主题

`subscribe`允许downloads、downloads:summary、sync-download、maintenance、remaster、library、notify（默认订阅）。新增主题兼容旧客户端，权限沿用原主题，不默认给普通用户管理员范围。

- `downloads` 拆为两级：`downloads:summary`（任务数、活动数、总速度，体积很小，**全局订阅**，用于侧边栏角标）和 `downloads`（完整队列，**仅下载页可见时订阅**）。旧主题名 `downloads` 保持原有含义。

### 4.3 推送消息

```json
{ "type": "downloads", "seq": 31, "data": { ...与 GET /api/music/cache/queue 相同... } }
{ "type": "downloads:summary", "seq": 32, "data": { "active": 2, "queued": 5, "speed": 1234567 } }
{ "type": "library", "seq": 33, "data": { "scan": { ...ScanStatus... }, "prefetch": { "queued": 10, "done": 5, "failed": 0, "running": true } } }
{ "type": "notify", "seq": 126, "data": { "id": "...", "level": "info", "title": "音乐库扫描完成", "message": "新增 12 首", "createdAt": 1739245123000, "link": "#/local" } }
```

- `seq` 为每个连接单调递增的序号，客户端用于检测乱序（可选）。`notify` 的 `seq` 是**服务端全局**的通知序号，用于断线补发。
- 通知序号配合serverEpoch使用，cursor按服务器+账号+epoch持久化；进程重启内存环丢失时ready告知新epoch与可补发范围，不拿旧seq永久过滤新通知。只保证有界缓冲内断线补发，不承诺所有离线通知永久保存。
- library推送轻量摘要/version，不把进程内scan-finished的2万条文件id完整广播；08精确失效可用有界分片/按需查询。订阅时snapshot要防止异步旧revision覆盖较新事件。
- downloads原结构只追加proxyProgress；进程内任务使用追加的task:changed/proxy-progress事件。recent成功ack和weights响应追加可选confirmedPlaybackIds，counts/extraWeights不变；按账号30天/10000ID持久ledger。F只用新snapshot确认ID排除pending，不能收到ack就假定旧snapshot覆盖。

### 4.4 推送节流

- 每个（连接 × 主题）最多每 **500ms** 推送一次（下载进度可配置 `clientChannel.progressThrottleMs`，默认 500，范围 200～5000）；任务完成、失败、取消、队列增删这类**状态变化**立即推送，不受节流限制。
- 推送前仍然做签名比较，相同则不发送。
- 签名不要对大对象做 `JSON.stringify`：使用服务端维护的 `revision` 数字（每次数据变化时递增），比较 revision 即可。
- 同用户/主题读取与snapshot尽量合并，权限不同不能共用结果；每连接缓冲有上限，slow socket只保最新progress/有序状态，必要时断开后重取snapshot，不无限排队。节流是dirty时一次timeout，空闲不循环唤醒。

## 5. 服务端实施

1. **事件源**：在下载队列服务中，任务进度更新时 `serverEvents.emitEvent('download:changed', { username, reason: 'progress' })`，状态变化时 `reason: 'state'`，队列增删时 `reason: 'queue'`。同步下载、remaster、maintenance 用同一个事件或各自追加事件（追加到 `ServerEventMap`，不改已有字段）。扫描与预取监听 04 和 05 号任务发出的 `library:*` 事件。
   - 只有确认暂时无法完整埋点才允许显式开关的临时降级：仅订阅者+活动任务存在时采样，报告模块/理由/清退条件。默认事件路径不能保无条件progress轮询。chunk过频可在事件源合并，但完成/失败不丢。
2. **ClientChannel 改造**：
   - 删除构造函数中的 `setInterval(progress, 1000)`。
   - 新增 `onEvent` 监听：收到事件后，找出订阅了对应主题、并且属于该用户（或管理员可见范围）的连接，标记 `dirtyTopics`，按 4.4 的节流规则调用原 `invoke` 获取数据并推送。数据获取逻辑复用 `progress()` 中现有的路由映射，抽成 `fetchTopic(client, topic)`。
   - 订阅时立即推送一次当前状态（新连接需要初始数据）。
   - `close()` 中注销全部事件监听。
3. **通知**：
   - 新增 `ClientChannel.publishNotice(notice)`，监听 `serverEvents` 的 `notify` 事件；内存环形缓冲保留每个用户最近 100 条和全局（`username: '*'`）最近 50 条。
   - hello带lastNotifySeq+epoch时按当前用户权限补发，最多50条，超出缓冲给resumeUnavailable/gap提示；未认证不发送。不同用户不能看到他人通知，公告只能可信服务/管理员发。
   - 第一批接入的通知来源：扫描完成且有变化（04）、预取完成（05）、下载任务失败、管理员公告（可选：管理端新增“发送公告”按钮，本期可不做）。
4. 复用已有WS ping/pong（有则不重复造心跳），必要时单服务timer每30秒检查活连接，两次无pong terminate；0连接停检查。浏览器自动pong，此协议维护不能归业务轮询删除。
5. 配置reportIntervalMinutes默认30，范围0～1440；0仅显式回退立即上报。ready转换为reportIntervalMs，追加progressThrottleMs、maxBatchOps/maxBatchBytes、serverEpoch与通知补发范围。配置/导入/类型校验同时补，不只加defaultConfig。
6. **bootstrap 精简**（01 号任务合并之后再做）：把 `/api/music/custom/list`、`/api/music/cache/list`、`/api/music/cache/list?user=_open` 从 `bootstrapRoutes` 中移除，改为前端按需调用分页接口。对应的 `notify()` 分组（约 215 行）在音乐库变化时改为推送一个轻量的 `library` 消息（`{ changed: true, version }`），由前端决定是否刷新当前页。**这一步必须与 02 号任务确认前端已不依赖 bootstrap 中的全量音乐库后才能合并。**

## 6. 客户端实施

1. **写入分级调度**：在 `client-channel.js` 的 `ClientData` 层（或 ClientTransport 的 report 组装处）增加分类表：

   | 类别 | URL | 发送策略 |
   |---|---|---|
   | state | 实际播放记录/播放状态写URL（基线含/api/user/recent与/api/music/storage/playback） | 默认30分钟；日志按operation id累计，快照按scope/key合并，不能把读取weights的GET列入上报 |
   | data | ClientSync 的全部频道，`/api/user/list`、`/api/user/favorites`、`/api/user/settings`、`/api/user/dislike` 等 | 2 秒防抖 |
   | command | `/api/music/cache/download`、`/api/music/cache/queue*` 等触发动作的请求 | 立即 |

   执行者需要用 `rg "ClientData\.|ClientSync\.update|DeferredWrites\.enqueue|ClientTransport" client/music` 列出全部写入点，把分类表补全并写入 `docs/client-channel.md`。未知 URL 默认按 **data** 处理（安全优先）。
   分类同时检查HTTP method/用途，不能cache/queue*的GET也当命令上报。保存歌单/队列等用户结构是data，当前播放位置是state；09选择不会主动远程获取列表/weights。data防抖有maxWait保证持续编辑不会无限推迟，提交目标不等于网络ack保证。
2. **ClientSync 定时器**：`setInterval(flush, 30000)` 改为由 data 类的防抖驱动，删除这个固定 30 秒的定时器；保留 `pagehide` 逻辑。新增 `visibilitychange` 中 `document.visibilityState === 'hidden'` 时立即 flush（移动端 Safari 上 `pagehide` 不一定触发）。
3. **state 队列**：
   - 仅pending时安排一个deadline timeout，默认首个待上报起30分钟；新事件不能持续重置deadline导致永不上报。空队列停止；后台仍有有效播放时按可靠策略保存/到期尝试，不暂停业务。
   - 立即上报的触发条件：`visibilitychange → hidden`、`pagehide`、退出登录、切换账号（`music-account-changed` 之前）、WS 重连成功、队列条数 ≥ `maxBatchOps` 或体积 ≥ `maxBatchBytes`。
   - 关闭页仅best-effort：复用已认证keepalive路径，小payload受浏览器限额（按目标环境验证，不能把256KB整批塞keepalive）；sendBeacon不能设置自定义auth头，只有现有接口允许才用。重要pending提前07b持久，网络发出/keepalive接受不当ack，不删除未确认记录。
   - **注意**：最近播放页面需要显示本地尚未上报的播放记录。`client-channel.js` 约 58～66 行已有 `recentPreview` 合并逻辑，确认它会读取 state 队列中未上报的条目；如没有，需补上，否则用户播放后 30 分钟内看不到自己的播放记录。
   - 设置页（用户侧）新增“状态同步间隔”选项：跟随服务端（默认）/ 5 分钟 / 30 分钟 / 60 分钟。
4. **下载管理器**：
   - 基线rg只找到pollServerProgress方法定义，另有过时注释；先确认无活动调用再清理，不以注释证明仍在轮询。WS正常时syncServerQueue按推送，HTTP回退页可见时有界轮询，保持非WS客户端可用。
   - 删除 `speedInterval`：速度在收到 `downloads` 推送时根据前后两次的字节数和时间差计算；下载页不可见时不计算。
   - 侧边栏角标改为订阅 `downloads:summary`。
   - `waitForDownloadResolver` 中 50ms 的 `setInterval` 改为事件或 Promise 通知（在 resolver 注册处 resolve），超时逻辑保留。
5. 通知使用现有toast，正文当文本、link校验同源/允许路由，不作为任意HTML执行。内存50条，cursor小对象含scope+epoch+seq，最多5秒合并保存；账号切换与重启epoch正确，无永久通知中心承诺。
6. **`user_sync.js`** 的空心跳定时器：删除。删除前用 `rg "heartbeatTimer|startHeartbeat"` 确认没有其他依赖。

## 7. 配置项

`server/defaultConfig.ts` 新增（放在独立的配置块中，附注释）：

```ts
'clientChannel.reportIntervalMinutes': 30,   // 1～1440；0仅回退立即上报
'clientChannel.progressThrottleMs': 500,     // 进度推送最小间隔（毫秒），200～5000
'clientChannel.maxBatchOps': 200,            // 客户端状态队列达到此条数时立即上报
'clientChannel.maxBatchBytes': 262144,      // 达到阈值安排分批发送，不保证退出keepalive能发整批
```

管理端系统配置页新增对应输入项，保存后对**新建立的连接**生效（已连接的客户端在下次 `ready` 时获取，不强制断开）。同时更新 `docs/system-configuration.md`。
reportIntervalMinutes=0仅意味着新状态按现有即时调度发送，不创建setTimeout(0)永续循环。ready仍对外发送reportIntervalMs，不把分钟数误当毫秒。

## 8. 风险与回滚

- 30 分钟上报意味着服务端的“最近播放”和多端漫游权重会有最长 30 分钟的延迟，这符合需求预期，需要在设置说明中写清楚。
- 30分钟是网络上报间隔，不是本地允许丢失窗口。重要有效播放发生时07b持久化；崩溃损失只按尚未事务提交的实际窗口说明，重启补未确认操作。不能退出才首次保存队列，也不能把无ack发送当确认。
- 事件埋点遗漏会导致进度不更新：保留第 5 节第 1 条描述的“有活动任务才轮询”的降级方案。
- 回滚：配置 `clientChannel.reportIntervalMinutes = 0` 表示“立即上报”（恢复旧行为）；服务端保留 `clientChannel.legacyProgressPolling: false` 隐藏开关，为 `true` 时恢复 1 秒轮询。

## 9. 测试

- 更新 `test/clientChannel.test.cjs`、`test/clientTransport.test.cjs`：
  - 状态类写入在周期内不会发送，触发 hidden、logout、重连、阈值时立即发送；data 类 2 秒内发送；command 类立即发送。
  - 未知 URL 按 data 处理。
  - 收到 `ready.config` 后周期更新。
- 更新 `test/clientChannel.system.test.cjs`：
  - 启动服务并建立 WS，订阅 `downloads`，模拟下载进度事件，断言 600ms 内收到推送，且没有事件时 3 秒内**不**收到任何推送。
  - 无订阅/任务时progress invoke=0，保留必要WS心跳；server.close后topic timer/listener全释放。测slow socket、订阅snapshot竞争、最终状态及时发送。
  - `notify` 补发：断开，发布 3 条通知，带 `lastNotifySeq` 重连后收到这 3 条。
  - server重启epoch变化、缓冲过期、跨账号权限、恶意消息、cursor去重；09本地播放pending+ack+新snapshot不双计、A→B→A迟到playbackId测试，必要新增持久幂等水位，与09/07b冻结。
- 更新 `test/downloadsFrontend.test.cjs`、`test/serverDownloads*.test.cjs`：不再调用 `pollServerProgress`，速度计算正确。
- 命令：`npm run test:unit`、`npm run test:system`。

## 10. 验收标准

- [ ] 服务端代码中不再存在无条件的 1 秒 `setInterval`；空闲时（无活动任务）WS 连接上 1 分钟内没有任何推送流量（ping/pong 除外）。
- [ ] 客户端播放 10 首歌，30 分钟内只有 data 类请求，没有 recent 上报；切到后台后立即上报一次。
- [ ] 有真实字节变化按节流及时推送，完成/失败立即可见；没有事件不伪造每秒进度，速度采样/归零可解释。
- [ ] 扫描完成后客户端收到通知 toast。
- [ ] HTTP 回退模式下所有功能正常。
- [ ] 报告写入 `docs/ws-events-test-report.md`，包含改造前后服务端空闲 CPU 和每分钟 `invoke` 调用次数的对比。

## 11. 给 GPT 的提示词

```
你在仓库 D:\opensource\fn-lxserver（Node.js/TypeScript 后端 + 原生 JS 前端）工作。请先阅读 docs/plans/00-overview.md 和 docs/plans/03-ws-channel-events.md，严格执行任务 03：WS 长连接改造。

要求：
1. 如 server/application/events/ServerEvents.ts 不存在，按 00 号文档第 4 节原样创建。
2. ClientChannel.ts：删除 1 秒 progress 轮询，改为监听 serverEvents，按（连接 × 主题）500ms 节流推送，状态变化立即推送；新增 downloads:summary、library、notify 主题；实现通知环形缓冲与 lastNotifySeq 补发；增加 30 秒 ping/pong 清理僵尸连接；ready 消息下发 reportIntervalMs 等配置。
3. 进度真实更新点emitEvent，不改业务；仅确实无法埋点才用显式开关且订阅者+活动任务限定的临时降级，报告清退条件。无条件采样删除，已有推送保留。
4. 客户端：写入按 state / data / command 三类调度（state 默认 30 分钟，data 2 秒防抖，command 立即；未知 URL 视为 data），在 hidden、pagehide、logout、切换账号、重连成功、超过阈值时立即上报；state 队列必须持久化；最近播放页要能显示尚未上报的本地记录。
5. 删除 ClientSync 的 30 秒 setInterval、download_manager 的 speedInterval 和 pollServerProgress、waitForDownloadResolver 的 50ms 轮询、user_sync.js 的空心跳。
6. 配置新增reportIntervalMinutes/progressThrottleMs/maxBatchOps/maxBatchBytes，默认周期30，0只回退立即；类型/导入/UI同步，ready用reportIntervalMs，文档同步。
7. 01 号任务合并后，再把 custom/list、cache/list 从 bootstrapRoutes 中移除（必须先确认 02 号任务的前端已改用分页接口）。
8. 不改 idb_store.js、deferred_writes.js 的存储实现，不改列表渲染，不改 Subsonic。
9. 更新并运行 test/clientChannel*.cjs、test/clientTransport.test.cjs、test/downloadsFrontend.test.cjs、test/serverDownloads*.cjs，执行 npm run test:unit 和 npm run test:system 全部通过。
10. 写 docs/ws-events-test-report.md。不要 git commit。完成后列出改动文件、协议变更和测试结果。
11. 已有WS实现保留，只处理证实残留，不将内部采样/本地速度/批量提交统称HTTP轮询。心跳不重复，epoch/权限/补发范围/背压明确；pending提前持久、退出best-effort不当ack，新增测试直接指定运行。
12. 09本地随机/漫游不等网络权重，列表先本地生效、data上报；有效播放立即本地projection、30分钟state上报。与09/07b冻结confirmed id/watermark，避免snapshot+pending双计。配置校验/类型补齐，协议/范围变化同步00及关联文本。
13. 已实现的追加契约：task:changed、download:proxy-progress；recent成功ack与weights的新confirmedPlaybackIds。按账号ledger最近30天最多10000ID，F新snapshot排除已含pending，仅ack不能删旧快照投影。07b prepareBatch/ack/release要等待异步落盘，不改其存储文件；HTTP上报仍WS接收，兜底仅断线可见页。先读第12节交付，不覆盖并行组代码或重复重写已满足项。
```

## 12. C 组实际交付、合并与待验证事项（2026-10-13）

**状态：已实现，C定向回归已验证；完整集成验收未通过。** 原规划与验收目标保留，未勾选的真实浏览器/跨组目标不能当作完成。证据见 [ws-events-test-report.md](../ws-events-test-report.md)。

### 已完成内容

- 创建冻结 ServerEvents，保持已有字段，追加 task:changed 与 download:proxy-progress。ClientChannel 删除无条件1秒progress采样；每连接/主题revision、单次dirty timeout、500ms默认进度节流、状态立即、旧异步快照保护，实例统一监听/close注销。
- 新增 downloads:summary、library、notify；扫描2万ID仅数字摘要，通知每用户100/公告50、最多补50、epoch/gap/账号权限；30秒协议心跳、入站64条/24MB及发送1MB背压。配置按新连接冻结/下发。
- ClientSync state 首pending起默认30分钟，data 300ms debounce/maxWait2秒，command立即；hidden/退出/重连/阈值补发，失败pending继续重试且至少5秒避免0周期紧循环，成功清空停timer。07b prepareBatch/异步ack/release已适配；存储实现文件由D组独占。
- 下载页按推送字节差计算速度/完成归零/隐藏不采样，清理孤立pollServerProgress、speedInterval与resolver50ms轮询、user_sync空heartbeat。全局摘要角标；断线且可见下载页才5秒HTTP兜底；代理旧/重复/暂停快照保护。
- 最近播放预览排除快照已确认ID；服务端playbackId独立持久ledger覆盖A→B→A、clear、restart，recent ack/weights追加confirmedPlaybackIds。F接snapshot+pending，不修改RoamingService或F算法。
- 权重响应确认ID在同步读counts前捕获，不在等待extras后读新ledger；已测等待期间新增播放不被旧counts错误确认。F若改counts读取时序需同步此边界。远程模式保留原sender，持久事件走批次分类提交；07b租约广播不会在提交中重复排flush。
- 后台clientChannel字段通过既有补充元数据自动生成/保存/导入校验；用户高级同步间隔server/5/30/60，前后端默认一致。未改管理端client/app.js中的其他组业务。

### C 补丁清单（混合工作区须按片段合并）

| 文件 / 边界 | C内容 |
| --- | --- |
| server/application/events/ServerEvents.ts、server/application/http/ClientChannel.ts | 共享事件创建、WS通道C主体 |
| client/music/js/client-channel.js、client-channel-worker.js、download_manager.js、user_sync.js | transport/worker、下载事件、删除空心跳 |
| client/music/js/client_performance.js | 仅ClientSync段；保留07c render/yield/layout段 |
| client/music/app.js | 仅clientStateIntervalMinutes默认/控件登记，以及resolver注册后download-resolver-ready事件；其余列表/生命周期归其他组 |
| client/music/views/settings/SettingsView.js、server/music/service/configuration/UserInitializationService.ts | 同步周期控件与默认设置 |
| server/defaultConfig.ts、server/types/config.d.ts、server/admin/service/configuration/SystemConfigurationFields.ts | 仅clientChannel.*；保留B的library.*及LibraryConfigurationFields引用 |
| ServerDownloadQueueService.ts、RemasterQueueService.ts、MusicTaskService.ts、syncDownloadTask.ts、FileCacheService.ts、DownloadService.ts（均server/music/service相应目录） | 仅ServerEvents import及实际进度/状态/失败emit点；不覆盖B维护/扫描/媒体业务 |
| server/music/service/PlayCountService.ts、server/music/controller/ExperienceController.ts | ledger事务和weights确认字段片段；RoamingService仍F独占 |
| test/wsEvents.test.cjs、stateScheduling.test.cjs、downloadEvents.test.cjs、playbackAcknowledgements.test.cjs | C新增定向测试，枚举脚本未改 |
| test/clientTransport.test.cjs、clientPerformance.test.cjs、clientPerformance.system.test.cjs | 分类/通知/keepalive；旧interval断言与Blob VM fixture |
| docs/client-channel.md、system-configuration.md的C节、ws-events-test-report.md、本计划 | 协议/配置/实测/合并说明 |
| 00与09计划 | 只同步追加事件/ack契约与C状态及GPT提示词，不实施其他组业务 |

### 建议合并顺序与接入条件

1. 先合并ServerEvents和clientChannel默认/类型/元数据；B只引用同一事件单例。不要重复创建或改已有事件字段。
2. 合并C通道主体和事件源片段；B共享FileCache/MusicTask/DownloadService不整文件替换。legacyProgressPolling默认false，只在确认漏事件时临时打开，补齐emit后关闭。
3. 合并客户端C脚本；client_performance按ClientSync段、app.js按三个接点合并，保留D/A/E/F并行改动。07a保持现有加载依赖，C没有新浏览器脚本需登记。
4. D/07b应先具备prepareBatch/异步ack/release以及原readPending/writePending/deviceId兼容接口；确认落盘失败保留pending。真实长请求多tab租约续期需D/C联合验证。
5. 合并ledger+weights可选字段；F新snapshot的confirmedPlaybackIds排除pending，单独ack不能导致旧快照少计。30天/10000ID是去重边界，旧服务端缺字段兼容由F负责。
6. **暂不移除**custom/list和cache/list bootstrap/原缓存分组：必须A确认01/02所有消费者已使用分页，统一由集成负责人收尾。新library摘要不代表此依赖已解除。
7. 直接运行新增C测试（详报告），由集成负责人登记package测试清单、修复共享错误后统一跑unit/system/typecheck，再做真实浏览器验收。C未改package/lock、构建/部署文件，也未commit/push。

### 验证结果与未完成目标

- 组合定向66/66通过；WS公告权限、实例epoch和上行积压测试包含其中，WS单独6/6通过。新调度重试/07b确认等待已覆盖；随后远程事件调度补验见报告。
- 完整unit曾351项339通过/12失败，其中C默认值遗漏已修复且定向通过；system曾31项27通过/4失败。共享工作区尚未全绿，不宣称这些已证明是基线错误。
- 最后调度补验35/35、播放确认/真实通道补验17/17通过，与66项有重叠不累加。最新typecheck通过；中途CustomMusicService.ts:337的共享类型错误已由其他组修复，C未修改该文件。完整回归失败位置和日志见报告。
- 受控空下载订阅约60秒：旧invoke59（58.94/分钟）→事件路径0；CPU141ms→31ms，仅mock单次，不是完整服务CPU性能保证。
- 待集成负责人完成真实浏览器10首/30分钟、hidden/logout/reconnect与下载HTTP回退、toast、移动端keepalive、F投影/多tab、M数据完整服务测量；没有真实浏览器证据，不勾选对应验收框。
