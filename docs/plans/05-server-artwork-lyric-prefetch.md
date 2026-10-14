# 任务 05：扫描后异步预取封面与歌词到后端缓存

> 先读 `docs/plans/00-overview.md`。本任务依赖 04 号任务发出的 `library:scan-finished` 事件；04 未合并前，可以在开发和测试中手动 `emitEvent` 来驱动。

> 调研已完成：[证据与确定选择](research-evidence.md)。后台预取沿用本项目有界队列/共享任务设计；洛雪歌词字段只作语义对照，不照搬桌面SQLite/IPC，已有.lrc/内嵌也提取缓存。见附件第6节。

## 1. 现状

- **自定义目录封面**：`CustomMusicService.getCustomCover(filename, username)`（约 398 行）在**客户端请求** `/api/music/custom/cover` 时才执行：
  1. `fileCache.readCoverCache('custom/' + filename, username, stats)` 命中则直接返回；
  2. 否则在主线程调用 `readMusicMetadata(filePath, ..., 'cover')` 提取内嵌封面，写入 `writeCoverCache`；
  3. 否则若 `item.img` 是 http 地址，通过 `fileCache.downloadCoverImage` 下载后写入缓存；
  4. 每次回写 `hasCover` 时调用 `customIndexManager.save(username)`，**整体重写索引文件**。
- **平台歌曲封面**：`SongArtworkService.ts`，对应 `/api/music/artwork`，同样在请求时获取。
- **歌词**：`FileCacheService.ts` 中的 `setLyricFetcher`（约 88 行，由 `HttpServer.ts` 约 2877 行在启动时注入，内部走 `/api/music/lyric` 的逻辑：先查本地 `.lrc`，再去源站）、`saveLyricCache`（约 1984 行）、`ensureCachedLyrics`（约 2057 行，参数含 `shouldCacheLyric`、`shouldEmbedLyric`）；自定义目录的歌词缓存为 `CustomMusicService.saveCustomLyricCache`（约 801 行）。
- 客户端打开一个有 500 首歌、全部未缓存封面的目录时，会同时触发大量 `/api/music/custom/cover` 请求，每个请求都在主线程读取标签，导致首屏等待时间长、服务端卡顿。

## 2. 目标

1. 扫描完成后，后端**低优先级**地为新增和变化的歌曲预取：
   - 封面：内嵌封面 → 提取到封面缓存；没有内嵌封面但有 `img` 地址 → 下载到封面缓存；
   - 歌词：同目录已有.lrc/内嵌歌词时也异步提取到可直接读取的后端缓存，不能写“无需处理”然后每次客户端再读tag。没有本地来源且具稳定平台标识才调用已注入lyric fetcher；未关联本地文件不在线模糊匹配。完整普通/翻译/罗马音/逐字字段按已有格式保存，不写音频文件（写入归06）。
2. 首次启用时，对已有的库做一次**补齐**（backfill）：找出没有缓存封面的条目，按队列慢慢处理。
3. 预取过程不影响播放和前台请求：独立的并发上限、速率限制，前台请求优先。
4. 失败退避，避免反复请求同一个失败的资源。
5. 客户端请求封面时，如果预取已完成，直接命中缓存，并带上强缓存响应头。

## 3. 范围

**范围内**

- 新建 `server/music/service/library/ArtworkLyricPrefetcher.ts`（队列、调度、状态持久化）。
- 新建 `server/music/service/library/PrefetchStateStore.ts`（每个用户一个 `prefetch_state.json`，原子写入）。
- CustomMusicService只改封面ensure/请求兼容封装及已有歌词缓存适配。remember中的状态更新交04串行/原子索引保存接口，合并约2秒，不另建全索引写入器；扫描相关不改。纯提取/网络调度从原请求复用，避免前台/后台两套同资源逻辑。
- 封面提取放到 worker 中执行：复用现有的 `MusicMetadataWorker.ts`（读标签工作线程）；如果它不支持只读封面，就为它增加一个 `cover` 操作。
- `HttpServer.ts`：
  - 新增 `GET /api/admin/library/prefetch/status`（管理员查看各用户的队列、完成数、失败数）和 `POST /api/admin/library/prefetch/run?user=&mode=backfill|retry-failed`。
  - 媒体头：custom/cover命中后ETag与资源内容/版本对应，If-None-Match→304（认证后判断）。带正确coverVersion的版本URL可private max-age=604800；无版本/可变URL用private no-cache重新验证，不把所有同URL封面缓存一周。其他媒体路由仅最小可选version/ETag适配，不改既有响应正文。
- 01 号任务中的 `coverCached` 和 `coverVersion` 字段：改为读取预取器维护的内存集合（`hasCachedCover(username, filename)`），避免每条都 `existsSync`。
- 给01/08提供可选lyricVersion、coverVersion：反映资源自身变化，不随整个库扫描变。外部.lrc版本与内嵌音频版本区分，缓存清理/手动修正/06写tag触发失效；08没有元信息时TTL兼容。本任务不实现前端本地缓存。
- `server/defaultConfig.ts` 中的 `library.prefetch.*` 配置块；管理端系统配置页的“封面与歌词预取”区块。
- `docs/system-configuration.md`、`docs/backend-architecture.md`。

**范围外（禁止）**

- 不把歌词写入音频文件，不修改任何音频文件（06 号任务）。
- 不根据歌名和歌手**模糊搜索**匹配在线歌词或封面（误匹配风险高）。只对已有平台标识的条目做在线获取；未关联的本地歌曲只处理内嵌封面。模糊匹配可以作为后续独立任务。
- 不改 `ClientChannel.ts`（进度通过 `library:prefetch-progress` 事件发出，由 03 推送）。
- 不改扫描逻辑，不改前端列表。
- 不改 `SongArtworkService` 的对外接口；如需复用其下载逻辑，只调用其已导出的函数。

## 4. 配置项

```ts
'library.prefetch.enabled': true,           // 是否启用扫描后预取
'library.prefetch.cover': true,             // 预取封面（内嵌提取 + 远程下载）
'library.prefetch.lyric': true,             // 提取本地.lrc/内嵌，关联歌曲可联网
'library.prefetch.network': true,           // false仍提取本地封面和歌词
'library.prefetch.concurrency': 2,          // 本地提取并发，1～4
'library.prefetch.networkPerMinute': 30,    // 网络请求速率上限（次/分钟），1～300
'library.prefetch.backfillOnStartup': true  // 启动后（扫描完成后）补齐历史缺失项
```

配置类型/导入校验与默认/管理UI同步；新增预算可包含maxQueued和缓存磁盘配额，先复用已有清理配置。播放状态暂停没有可靠来源，本期不注册该可选项，避免出现无作用开关。

## 5. 设计

### 5.1 队列

- 任务结构：`{ username, filename, kinds: Set<'cover'|'lyric'>, priority: 0|1, attempts, notBefore }`。priority 0 为扫描新增或变化的条目，1 为补齐。
- 按username+稳定文件key+资源kind+fingerprint去重，同资源前台/后台共用进行中Promise；新fingerprint取消/忽略旧任务，不能旧提取完成写回新文件状态。
- 两个执行通道：
  - 本地通道提取内嵌封面/歌词与sidecar读取，昂贵metadata在worker，复用线程而非每文件新建。并发是全服务上限，不能每用户2路堆成40路抢盘。
  - **网络通道**（下载封面、获取歌词）：令牌桶限速 `networkPerMinute`，并发 1～2。
- **前台优先**：客户端请求 `/api/music/custom/cover` 时，如果该文件正在队列中排队，就把它移到队首并直接在请求中完成（复用 `ensureCustomCover`，与队列共享同一个 Promise，避免重复提取）。
- 扫描正在进行时，暂停本地通道（避免与扫描抢磁盘），扫描结束后继续。
- 被删除的文件（`removed` 列表）从队列中移除，并清理其失败记录。
- backfill使用有界队列/游标，初始maxQueued可设5000，队列有空位再补；每批500只是遍历批次，不意味着最终不会一次堆满2万任务。暂停/重启恢复cursor，用户公平轮转，前台优先不使后台永久饥饿。
- 保留读前/读后fingerprint，文件复制/写tag中延后；下载资源校验类型/体积/超时，沿用原代理与URL权限，不扩成任意URL抓取服务。

### 5.2 状态持久化（`prefetch_state.json`）

```json
{
  "version": 1,
  "items": {
    "@<dirId>/周杰伦/晴天.flac": { "cover": "done|none|failed", "lyric": "done|none|failed|skip", "attempts": 1, "nextRetryAt": 0, "fileSig": "size:mtime" }
  }
}
```

- fileSig变化重新处理，外部.lrc/手动封面/来源查询字段也各有资源fingerprint；仅size:mtime不足覆盖独立歌词变化。清缓存事件使done失效，不能永久认为文件已有缓存。
- 失败退避1小时→6小时→24小时→7天（可调）。none只用于可靠检查后确无资源，有限负TTL后可低优先重查；超时/401/复制中/限流不写永久none。新资源version/来源查询字段或管理员retry能恢复。
- 写入节流：最多每 10 秒写一次，服务关闭时立即写入。
- 内存状态key包含username+filename+资源version；状态文件done只是提示，缓存文件可能被清理/丢失，启动受控校验/读miss/清理hook修正，不能宣称读过done就缓存一定存在。查当前页不提取媒体/全库扫描。

### 5.3 补齐

- 触发条件：`backfillOnStartup = true` 时，在首次 `scan-finished` 之后执行；或者管理员手动触发。
- 遍历索引，找出 `prefetch_state` 中没有记录或状态为可重试的条目，以 priority 1 入队。每批 500 条，避免一次性占用大量内存。

### 5.4 进度事件

- 在真实进度事件中每50条/距离上次5秒合并推送，终态立即，空闲不启永久5秒timer；游标仍有backfill时不虚报全部完成。06读取可用资源结果，不以进度摘要代替具体输入状态。
- 补齐完成且处理了大于 0 条时，发出一次 `notify` 事件（例如“已为 320 首歌曲准备好封面”）。

## 6. 实施顺序

1. 拆出 `ensureCustomCover`，节流 `customIndexManager.save`，补充测试确认 `getCustomCover` 行为不变。
2. 编写 `PrefetchStateStore` 和队列（先只做本地通道）。
3. 接入 `library:scan-finished` 事件和补齐逻辑。
4. 本地歌词也提取后缓存，联网仅已关联歌曲；完整字段/资源版本一致，复用已注入fetcher，不写音频。
5. 媒体ETag与版本URL缓存头，hasCachedCover/coverVersion/lyricVersion供01/08，无版本URL可重新验证。
6. 配置、管理接口、管理端 UI、文档。

## 7. 风险与回滚

- 音源接口限流或封禁：默认速率 30 次/分钟，可配置；网络错误触发全局冷却（连续 5 次网络失败后暂停网络通道 10 分钟）。
- 磁盘空间：封面缓存受现有缓存清理逻辑（`checkAndCleanupCache`）约束，确认封面缓存是否在清理范围内，并在 PR 中说明。
- 回滚：`library.prefetch.enabled = false` 即恢复为仅请求时获取。
- 关闭停止调度/释放worker/取消可中断网络，不删已有效后端缓存；恢复原请求路径也复用正确身份/权限。05不修改用户音频、不操作08客户端库。

## 8. 测试

- 新增 `test/libraryPrefetch.test.cjs`：
  - 去重合并、优先级、前台请求提升与 Promise 共享。
  - 退避时间表；`fileSig` 变化后重新处理。
  - 限速（使用假时钟）。
  - 扫描中暂停本地通道。
  - `removed` 清理队列。
  - `getCustomCover` 在拆分前后结果一致（准备带内嵌封面的样本文件：查找现有测试中是否有样本，例如 `rg -l "\.flac|\.mp3" test`）。
- 更新 `test/songArtwork*.cjs`、`test/musicLibrary*.cjs`。
- 补.lrc/内嵌歌词预缓存、完整字段、sidecar独立变化、缓存被清理的done修正、账号隔离、旧fingerprint迟到、与04索引保存竞争、预算/游标重启、版本URL/无版本URL/304鉴权测试；新测试直接node --test指定。
- 命令：`npm run test:unit`、`npm run test:system`。

## 9. 验收标准

- [ ] 新增 500 首带内嵌封面的歌曲，扫描完成后数分钟内全部封面进入缓存；之后客户端打开该目录时，封面请求全部命中缓存（服务端日志或计数可验证），响应 < 20ms。
- [ ] 预取期间播放不卡顿，前台封面请求的 P95 延迟 < 200ms。
- [ ] 网络请求速率不超过配置值。
- [ ] 关闭开关后行为与改造前一致。
- [ ] 报告写入 `docs/library-prefetch-test-report.md`。

## 10. 给 GPT 的提示词

```
你在仓库 D:\opensource\fn-lxserver（Node.js >= 20，TypeScript 后端）工作。请先阅读 docs/plans/00-overview.md 和 docs/plans/05-server-artwork-lyric-prefetch.md，严格执行任务 05：扫描后异步预取封面与歌词到后端缓存。
开工同时读 docs/plans/research-evidence.md；已确定选择不重新泛化选型，执行本任务对应边界及反例验收，未实测指标不得写成结果。后台预取沿用本项目有界队列/共享任务设计；洛雪歌词字段只作语义对照，不照搬桌面SQLite/IPC，已有.lrc/内嵌也提取缓存。见附件第6节。

要求：
1. 引用03/集成负责人创建冻结的ServerEvents，未合并测试mock；监听library:scan-finished，04未合并用测试事件驱动，不并行覆盖共享模块。
2. CustomMusicService只改封面ensure/兼容封装与已有歌词缓存适配；remember合并状态通过04串行原子保存接口，不另写旧索引快照。其他扫描代码不改。
3. 新建 ArtworkLyricPrefetcher.ts 和 PrefetchStateStore.ts：去重队列、优先级、本地通道（worker 中提取内嵌封面，并发可配置）与网络通道（令牌桶限速）、前台请求提升并共享 Promise、扫描中暂停本地通道、失败退避、fileSig 变化重新处理、状态文件节流原子写入、启动补齐。
4. 本地.lrc/内嵌歌词也异步提取到现有后端缓存，完整字段；联网只已关联，禁止模糊匹配/写音频。全服务并发、backfill队列预算/游标、新fingerprint旧结果保护、清理done失效测试。
5. 媒体ETag认证后304，带真实version URL可private长缓存，无版本可变URLno-cache；hasCachedCover/coverVersion/lyricVersion给01/08，不在分页提取资源。
6. 发出 library:prefetch-progress 和 notify 事件；不改 ClientChannel.ts。
7. 新增 library.prefetch.* 配置（见文档第 4 节）、管理接口 GET /api/admin/library/prefetch/status 和 POST /api/admin/library/prefetch/run，以及管理端系统配置页的“封面与歌词预取”区块。
8. 新增 test/libraryPrefetch.test.cjs，更新相关测试；运行 npm run test:unit 和 npm run test:system 全部通过。
9. 更新 docs/system-configuration.md、docs/backend-architecture.md，写 docs/library-prefetch-test-report.md。
10. 不要 git commit。完成后列出改动文件、配置说明、测试结果和遗留问题。
11. 08独立实现客户端本地缓存，05只提供资源/可选版本；配置校验/类型同步，新增测试直接指定运行。范围/契约变化更新00及01/04/06/08，不编造已验证结果。
```

## B 组实现与合并记录（2026-10-13）

已实现：`ArtworkLyricPrefetcher` 全服务并发 1–4（默认 2）、5000 有界队列、扫描期间暂停、fresh 优先、用户轮转、网络串行滑动限速（默认 30/min）、连续失败冷却、资源指纹/迟到保护、1h/6h/24h/7d 退避、单 retry timer、终态事件；`PrefetchStateStore` 用户隔离、10 秒合并保存和停止 flush；`CustomLyricCache` 本地/内嵌优先、完整歌词字段、sidecar 版本、哈希媒体缓存；配额仅清理哈希 `.bin/.mime/.lyrics`。封面 ETag/304 和版本 URL 已接入 HTTP。

已验证：`test/libraryPrefetch.test.cjs`、`test/libraryMediaCache.test.cjs`、真实 HTTP/SQLite 联测及 B 组 41 项定向回归通过，详见 `docs/library-prefetch-test-report.md`。未测真实源站 P95、fnOS/NAS、长时网络恢复和 08 客户端缓存联测。`pauseWhilePlaying` 没有可靠播放状态来源，按计划作为未实现可选项移除默认/类型/管理入口，不能恢复为无作用开关。

合并顺序：先合并 04 的 `library:scan-finished`、`customIndexManager.merge` 和索引保存序列，再合并 `PrefetchStateStore`/媒体缓存/预取器，最后合并 Discovery 的 ETag/304 分支和管理员接口。保留 03 对 `ServerEvents` 的创建权；B 不改 `ClientChannel.ts`，只发事件。与 06 合并时通过 resource-ready 回调提供可信缓存，不直接修改音频。
