# 性能与后台化改造：总览（00）

> 本文是 01～09（含 07a、07b、07c）共 13 份规范文本的总纲。**每个执行者开工前必须先读完本文**，再读自己的任务书。文中方案与预算是待实施目标，不表示已经实现或通过验证。
> 新增 [已核实研究附件](research-evidence.md)（2026-10-13）：四个GitHub固定提交与浏览器官方依据，记录确定选择、差异及反例验收。附件不增加可委派任务，规范仍13份。
> 仓库：`D:\opensource\fn-lxserver`，基线提交 `7fd44a1 feat(client): use push cache and batched state sync`。

## 1. 背景：用户反馈的问题

1. 打开播放列表、歌单、音乐库、最近播放时很卡，尤其是播放列表。基线有全量行渲染/封面补全热点，实际占比由07测量；不能把单一原因当成全部卡顿结论。
2. 客户端与后端已使用 WS 推送缓存和批量同步。基线仍保留服务端内部进度采样、客户端本地速度计算、定时批量提交，三者不能统称“客户端与后端大量网络轮询”。任务 03 只核查并处理实际残留项；新分支若已完成相应改造，保留现有实现并补验收，禁止重复重写。
3. 音乐库扫描依赖“到期就全量递归 + 逐文件 stat”，没有目录级剪枝，也没有监听目录变化，对 NAS 硬盘不友好。
4. 封面和歌词在客户端请求时才去提取或下载，首屏等待时间长。
5. 自动补全内嵌歌词、重新打 tag 缺少统一的配置开关。
6. 客户端整体卡顿。待测量的热点包括：**Tailwind Play CDN** 在浏览器内编译样式与监听 DOM、体积较大的 `app.js` 与大量同步脚本、静态资源重复读取、多处大范围 `MutationObserver`、IndexedDB 全歌单单键读写、localStorage 高频同步读写。代码定位见 07 系列，开工时重核位置，不用文件体积直接推断性能收益。
7. 封面与歌词需要持久化到客户端本地。现有歌词已有 `lx_lyric_*` localStorage 缓存和开关，封面组件尚无统一持久化管理；任务 08 将二者纳入按账号、服务器和歌曲身份隔离的异步缓存，支持命中复用、容量淘汰、清理与降级。
8. 随机/漫游从本地已缓存完整歌单选曲；漫游按播放量和额外优先级加权，列表先本地操作再上报。09复用现有客户端choose，去掉点击必等服务端权重的阻塞，将纯规则抽公共组件；权重后台同步，本地未上报播放立即影响选择。

## 2. 任务拆分

| 编号 | 文档 | 范围 | 端 | 可并行 |
|---|---|---|---|---|
| 01 | `01-server-paged-list-api.md` | 音乐库、缓存库、最近播放、歌单的服务端分页只读接口 | 后端 | 是 |
| 02 | `02-client-lazy-list-and-images.md` | 列表按页或虚拟化渲染、图片按视口懒加载、封面候选去 O(N×M) | 前端 | 是（音乐库和最近播放部分依赖 01，可先 mock） |
| 03 | `03-ws-channel-events.md` | 保留已实现WS；审核残留采样/调度，状态默认30分钟、通知与下载事件推送 | 跨端 | 是；已满足项只回归 |
| 04 | `04-server-incremental-scan-watch.md` | 后端定时增量扫描、目录监听、后台配置 | 后端 + 管理端 | 是 |
| 05 | `05-server-artwork-lyric-prefetch.md` | 扫描后异步预取封面和歌词到后端缓存 | 后端 | 依赖 04 的事件，可先自行触发 |
| 06 | `06-lyric-embed-retag-policy.md` | 自动内嵌歌词、重打 tag 的策略与开关 | 后端 + 管理端 | 依赖 05 的歌词结果，可独立开发 |
| 07 | `07-client-perf-storage-render.md` | **总纲**：根因排序、测量方法、场景与预算、共用规则、07a/b/c 的边界 | 前端 | 先读，07a/b/c 开工前完成测量部分 |
| 07a | `07a-client-startup-and-delivery.md` | 启动与交付：移除 Tailwind Play CDN、脚本加载、静态资源缓存与压缩、Service Worker、外部脚本 | 前端 + 少量服务端静态资源处理 | 是 |
| 07b | `07b-client-storage-layer.md` | 存储层：IndexedDB 拆分、localStorage 访问层、延迟写队列、播放状态保存 | 前端 | 是 |
| 07c | `07c-client-runtime-hotpaths.md` | 运行期热点：全文档 MutationObserver、`renderMyLists`、`timeupdate`、跑马灯、滚动与缩放监听、rAF 循环、隐藏页面节流、CSS 绘制成本 | 前端 | 是（与 02 同改 `app.js`，按函数划分） |
| 08 | `08-client-cover-lyric-local-cache.md` | 封面与歌词客户端本地持久缓存：独立异步IDB、命中复用、LRU/TTL、账号隔离、旧歌词迁移、可清理和禁用 | 前端 | 独立模块可并行；接入02，复用scope约定但不依赖07b升级；可选版本由01/05提供 |
| 09 | `09-local-random-roaming.md` | 本地缓存歌单随机/加权漫游、纯公共算法、播放量本地增量、预选一致性 | 前端+少量后端规则适配 | 公共核心/mock并行；本地持久化接口依07b，上报ack与03联测 |

**建议的人员分组（6组；D组可再分3人）**

- A 组：01 → 02（列表分页端到端，先写接口再写前端；也可两人分别开发）
- B 组：04 → 05 → 06（音乐库后台化）
- C 组：03（WS 通道）
- D 组（前端性能，可 3 人并行）：07a 启动与交付、07b 存储层、07c 运行期热点；三人开工前先由其中一人完成 07 总纲第 3 节的测量工具与基线
- E 组：08（封面与歌词本地缓存），先完成独立模块与 mock；图片接入点由 02、歌词获取接入点由 08，Service Worker 缓存清理边界由 07a 负责。
- F组：09（本地随机/漫游），先抽纯规则并mock；07b提供完整本地候选/权重持久helper，03对齐有效播放ack，07a登记公共脚本与部署资源。

**依赖顺序**：先冻结ServerEvents、分页/媒体版本、图片缓存适配器、存储revision、本地pool和播放计数ack；推进01→02、04→05→06、07→07a/b/c、08独立模块→02/08接入、09公共核心→07b/03接入。03并行，移除全量bootstrap等01/02。各组独立工作树，共享文件按函数合并。
每位执行者使用独立工作树/分支（由实施负责人创建），合并前更新至集成分支并做风险对应的定向测试。由集成负责人跑端到端回归和统一性能测量。文档编写阶段不运行业务测试或构建。

### 2.1 子任务变更必须同步总览

修改任何任务的范围、接口、依赖、默认行为、回退方式或验收口径时，同一份补丁同步更新本总览的任务表/依赖/归属/契约，及受影响任务的对应段落。正文和末尾GPT提示词同时更新，不能只改其中一个。

提出变更的执行者列出“变了什么、影响哪些编号、谁负责接入、何时可合并”，集成负责人解决归属冲突后再接入。阶段状态写明“待实施/已实现待验证/已验证”；各组进度以各自计划为准。2026-10-13 C/03 已实现并通过定向验证，完整集成/真实浏览器验收未完成，详见03第12节，不代替其他组状态。

## 3. 关键设计决策（所有任务必须遵守）

### 3.1 “懒加载”的含义按数据归属区分

- **服务端拥有的数据**（自定义音乐目录 `custom/list`、缓存库 `cache/list`、最近播放 `recent`）：按需请求当前页，使用 01 新增的分页接口。
- **客户端可编辑的数据**（用户歌单、我喜欢、默认列表、播放队列）：现有在线 SQLite 存储、ClientSync 与 IDB 离线镜像共同维护完整数据；增删、排序、导出依赖完整视图。本期保留完整编辑协议，把**渲染**改为按页或虚拟列表，把**封面**改为按视口加载。07b 优化本地读写与按歌单读取；全量读取本身也必须测量，不能提前断言无成本。若后续做真正服务端分页编辑，应另立同步协议迁移任务。
- 01 提供的歌单分页只读接口，只用于本地没有歌单数据的场景（新设备首次打开、移动端轻量模式）。**禁止**把歌单编辑改为基于分页的局部提交，这超出本期范围。

### 3.2 WS 消息分级

- “状态”类数据（播放进度、当前曲目、播放次数、最近播放）：合并后**默认每 30 分钟上报一次**；隐藏、退出登录、重连成功、队列阈值触发补发尝试。关闭页时不能保证异步网络和 IDB 完成，重要状态提前持久化、未确认记录下次补发。音量若属于已同步的用户设置，沿用 data 类；仅暂态播放快照才属于 state 类。
- “用户数据变更”类（歌单、收藏、设置、目录配置）：**仍然 2 秒内防抖提交**，否则多端同步会延迟 30 分钟，属于功能退化。
- 正常WS推送采用事件驱动，禁止新增无条件空闲轮询。03可保留有明确开关、仅活动任务/订阅期间的临时降级，及HTTP模式可见下载页兜底，报告中列出；协议ping/pong与业务轮询区别记录。

### 3.3 不引入前端运行时框架；构建期工具仅限 07a

客户端是原生 JS 加 `<script>` 加载，现有 `build:client` 主要是复制文件。优先复用现有工具和浏览器原生 API，允许小模块，但不为行数上限牺牲正确性。**禁止**引入 React、Vue、TanStack 等前端运行时框架。07a 允许固定兼容版本的 Tailwind 构建期预编译，提交静态 CSS 并保留诊断回退；08 允许浏览器原生 IndexedDB/Blob，不需要新运行时依赖。

### 3.4 监听后端已确定：原生 fs.watch，失败降级扫描

04本期使用Node原生 `fs.watch`，不新增chokidar、不用逐文件 `fs.watchFile` 高频轮询。本地盘运行期捕获不支持/资源上限/权限错误，明确降级到quick+full；网络盘auto关闭监听。filename缺失、根目录删除重建等不确定事件重核受影响子树full，必要重新注册watcher，不能当作已完整捕获。目标fnOS/Windows仍须实测，不以官方API存在代替平台可靠性验收。以后确需换依赖须单独变更提案，核固定版本/engines/模块制式/许可证并同步04和lockfile。依据见研究附件第5节。

### 3.5 三层媒体缓存和统一身份

后端预取缓存归05、客户端持久媒体缓存归08、图片视口/并发归02。打开列表不会触发全库封面/歌词预热；后端后台预取和前端使用时缓存是两条不同触发链。

08使用独立IDB库，封面Blob/完整歌词异步落盘，scope区分服务器+账号；沿用enableLyricCache旧开关并新增封面开关，容量/LRU/TTL/清理与退出隔离详见08。01/05提供可选coverVersion/lyricVersion及资源ETag，旧服务端走TTL兼容；分页ETag必须区分scope、查询和页号。

02提供统一封面网络调度入口，列表/播放器/到期重验证共享并发≤6；08不能另起一套后台并发。列表默认rootMargin=0，真实视口才计算候选、读IDB、补全、fetch和解码，overscan挂载不触发资源工作。每scroll root共用一个observer；取消共享fetch须等最后consumer离开，跨域img降级不承诺物理取消。当前曲歌词独立小并发，默认不预热队列。07a只管静态缓存且不清其他缓存；07b用户数据不可被08主动淘汰，但独立IDB不隔离浏览器origin配额/系统淘汰。

### 3.6 本地优先列表与随机/漫游（用户明确要求）

列表编辑先更新本地内存/revision，按07b可靠落盘并交03排队上报；网络/服务器ack不作为本地生效条件，未确认dirty不能被旧远程快照覆盖。服务端完整同步协议保留，不代表每次操作必须先fetch。

09从当前scope本地完整歌单/队列抽样，不只从渲染页或DOM，也不在随机/漫游点击时请求服务端候选/权重。权重本地snapshot+未确认有效播放增量，缺权重默认1/song.playCount；后台WS/HTTP同步不阻塞选择。保留既有权重公式和有效播放阈值，纯规则公共复用，存储/网络由各端adapter负责。

基线09客户端公式min(1e9,1+count+extra)保留；server RoamingService主要提供counts/extras，先识别可共享纯规则，不盲目拷整个服务。03/09共同冻结playbackId确认水位，防服务器新snapshot已包含pending却再次相加。

预选保entryId+queueRevision+mode，预读与实际next一次抽样；增删/重排/账号/模式变时失效。本地选曲不意味着音频已离线，选中资源仍走原播放/08缓存；不预热全池、不修改Subsonic/推荐算法。

### 3.7 后台扫描、预取与自动写文件的协作

04不能把网络挂载断连/权限错误当文件删除；目录mtime只用于枚举剪枝，原地change/.lrc dirty不得超阈值转quick后丢失。任务合并只允许成功full覆盖对应dirty范围，quick不能覆盖paths。原生watch与默认24小时full兜底互补，目录mtime剪枝是本项目设计，不是Navidrome所读源码的零文件stat方案。04拥有串行原子索引保存，05合并状态复用它；自写抑制结束显式paths重核。

05本地.lrc/内嵌歌词也预提取到后端缓存，资源各自版本供08；全服务并发与有界backfill队列，媒体无版本URL不设一周不可验证缓存。

06自动动作默认off，safeWrite保护默认true；在原维护管道安全暂存/验证后替换，不支持格式跳过，手动旧行为保留。06状态文件独立于05，关闭只停止后续操作、不撤销已写文件，备份/恢复限制明示。

## 4. 共享模块契约（03/集成负责人先创建冻结，其他任务mock或只引用）

新增文件 `server/application/events/ServerEvents.ts`，内容必须与下面完全一致（允许补充注释）。后续如需新增事件，只能**追加**到 `ServerEventMap`，不得修改已有字段。
03/集成负责人拥有创建权，其他任务遇文件不存在先用测试mock并提交创建请求，不多人同时创建/覆盖。旧分支已有等价模块时优先适配，契约变更必须同步本总览。

```ts
import { EventEmitter } from 'node:events'

export type ScanReason = 'startup' | 'schedule' | 'watch' | 'manual'

export interface ServerEventMap {
  'library:scan-started': { username: string; directoryIds: string[]; reason: ScanReason; startedAt: number }
  'library:scan-finished': {
    username: string; directoryIds: string[]; reason: ScanReason
    added: string[]; changed: string[]; removed: string[]
    total: number; durationMs: number; error?: string
  }
  'library:prefetch-progress': { username: string; queued: number; done: number; failed: number; running: boolean }
  'download:changed': { username: string; reason: 'progress' | 'state' | 'queue' }
  'task:changed': { username: string; topic: 'sync-download' | 'maintenance' | 'remaster'; reason: 'progress' | 'state' }
  'download:proxy-progress': {
    username: string; taskId: string
    data: { progress: number; status: string; total?: number; received?: number; speed?: number; updatedAt?: number }
  }
  'notify': {
    username: string | '*'; id: string; level: 'info' | 'success' | 'warn' | 'error'
    title: string; message?: string; createdAt: number; link?: string
  }
}

class TypedEmitter extends EventEmitter {
  emitEvent<K extends keyof ServerEventMap>(name: K, payload: ServerEventMap[K]) { return this.emit(name, payload) }
  onEvent<K extends keyof ServerEventMap>(name: K, listener: (payload: ServerEventMap[K]) => void) { this.on(name, listener); return () => this.off(name, listener) }
}

export const serverEvents = new TypedEmitter()
serverEvents.setMaxListeners(50)
```

- `added`、`changed`、`removed` 里存放的是 `custom_index.json` 中条目的唯一键（与现有 `CustomCacheItem.filename` 一致，执行者需确认字段名）。
- 监听器内**禁止**执行同步重活；需要做事时请 `setImmediate` 或放进自己的队列。
- 此契约用于进程内服务协作，不能将2万条added/changed直接广播到WS。03转换轻量摘要/version，必要精确失效使用有界分片或按需查询。
- 全局模块监听由服务实例统一注册/停止时注销，不为每个连接重复注册所有后端事件；通知缓冲、scope权限与断线epoch由03负责。
- C 追加 task:changed 与 download:proxy-progress，用于真实任务状态与原生代理下载字节更新；已有事件字段不变。04/05/06继续只引用，不重复创建文件。
- 03/09确认契约：recent成功 ack 与 GET `/api/user/roaming/weights` 可选追加 `confirmedPlaybackIds: string[]`，counts/extraWeights原字段不变。03的 PlayCountService 同事务持久去重，按账号最近30天最多10000 ID；09拿新snapshot的确认ID排除已含pending，仅ack不能证明旧快照覆盖。影响03/09和07b事件适配，C实现服务端/transport，F接projection，D提供prepareBatch/异步ack/release；联测后合并，不承诺永久exactly-once。

## 5. 共享文件归属表（冲突热点）

| 文件 | 归属任务 | 其他任务允许的改动 |
|---|---|---|
| `server/application/http/HttpServer.ts` | 01分页、04扫描、05预取/媒体头、06审计；07a仅静态分支 | 按路由/分支分工；已有recent路由需参数分支、媒体头需在原路由调整，不以“只能新增if”禁止必要改动；不得互改认证 |
| `server/application/http/ClientChannel.ts` | **03 独占** | 01、04、05 如需推送，只能通过 `serverEvents` 发事件，由 03 负责转成 WS 消息 |
| `server/application/events/ServerEvents.ts` | **03/集成负责人创建并冻结** | 04/05/06仅引用，新增事件先协商，不重复创建/覆盖 |
| `server/defaultConfig.ts` | 03：`clientChannel.*`；04：`library.scan.*`；05：`library.prefetch.*`；06：`library.autoFix.*` | 各自追加配置块，不修改别人的 key |
| `server/music/service/library/CustomMusicService.ts` | 04扫描/索引保存；01分页/列表只读；05封面ensure/歌词缓存适配 | 01移除ensureMusicScan由04集成；05记忆封面状态通过04原子索引保存接口，不另建相竞争的全索引写入器；06不改此文件 |
| `client/music/app.js` | 02列表/图片；07b保存/恢复/本地数据；07c timeupdate/跑马灯/侧栏/生命周期；08歌词获取/媒体设置；09 getNextIndex/playPrev随机漫游分支、setPlayMode、预选接点 | timeupdate存储行由07b提供07c集成，歌词显示07c/获取08，随机索引09/行映射02；不多人覆盖整个函数/文件 |
| `client/music/js/client_performance.js` | 03：`ClientSync`；07c：`ClientPerformance.render` 与新增的布局调度器 | 同上 |
| `client/music/js/music_experience.js` | 02：coverCandidates；09：有效播放本地projection hook | 03负责record上报调度，三者按函数接点分工；07c不删有效播放统计 |
| `client/music/js/idb_store.js`、`deferred_writes.js`、新建 `local_store.js` | **07b 独占** | — |
| `client/music/js/roaming.js`、新增roaming_core.js/后端纯适配、RoamingService纯规则 | **09 独占**本地pool/权重projection/公共规则 | 07b提供localOnly与持久helper；03负责计数上报幂等/ack，与09协商RoamingService写入相关补丁；07a负责公共资源部署 |
| `client/music/js/play_statistics.js` | 现有有效播放规则保留；07c仅生命周期，09只接onQualified | 禁重复listener加count，统计投影立即本地更新；上报周期归03 |
| `server/music/service/PlayCountService.ts`、`server/music/controller/ExperienceController.ts` | 03：playbackId持久去重、weights确认字段 | 09负责RoamingService规则/projection，03不改其文件；按确认字段/事务片段合并 |
| 新建 `client/music/js/media_cache.js`、`media_cache_settings.js`，可选新建 `media-cache-worker.js` | **08 独占**，使用独立 IDB 数据库，不升级 `lx_music_store` | 02 仅调用冻结的 `MediaCache` 接口；图片加载并发、视口判断仍归 02 |
| `client/music/js/playback-lyrics.js` | 08：持久缓存适配与数据请求去重；07c：订阅/动画生命周期 | 保留现有 normalize、identify 与过期响应防护；跨职责修改由集成负责人合并 |
| `client/music/index.html`、`client/music/sw.js`、`client/music/js/tailwind_setup.js`、`deploy/scripts/build-client.cjs`、HttpServer静态分支 | **07a 独占** | 其他任务提供新script前后依赖，由07a统一插入；不能随意追加到app.js之后；必要gateway优化作为07a独立补丁 |
| `client/music/components/music-tools/index.js`、`views/mobile-shell/SongRowMenu.js`、`components/dialog/DialogChrome.js`、`views/player-detail/*`、`components/player-bar/index.js`（仅限观察器与监听器部分） | **07c 独占** | 02 不改这些文件的观察器逻辑 |
| `client/music/js/download_manager.js` | **03 独占** | — |
| `client/music/js/wave.js`、`visualizer.js`、lyrics显示/rAF与相关CSS | **07c**显示循环/可见性 | 不改音频节点/音效；08仅获取歌词数据，02行CSS协作；不改第三方vendor |
| `client/music/components/library-artwork/index.js`、新增virtual_list/image_loader | **02**列表渲染/图片调度 | 08提供缓存接口，02负责LibraryArtwork接入；07c仅通过行挂载/销毁hook |
| `client/music/js/local_music.js`、`songlist_manager.js`、`views/recent/RecentView.js` | **02 独占** | 07 只能提出建议，不直接改 |
| 维护worker/维护服务（实际路径开工重核）、新增auto_fix_state.json | **06 独占**自动写策略 | 05只读/写预取缓存，06不直接改05状态文件；04提供自写后paths重扫接口 |
| `server/types/config.d.ts`、配置服务/导入校验、SQLite迁移、package.json/lock与test脚本 | 按各任务配置/迁移/构建依赖分块 | 同名配置先冻结，集成负责人合并；迁移编号不能冲突，新增测试用定向命令覆盖 |
| `client/app.js`（管理端） | 04：音乐目录行（约 896～930 行）；05、06：系统配置页新增的配置项 | 各自新增独立的 DOM 区块 |
| `client/app.js`（管理端系统配置） | 03：`clientChannel.*` 输入；04/05/06：各自 `library.*` 配置区 | 不共同重写系统配置渲染函数；统一由集成负责人插入各区块 |
| `docs/client-channel.md` | 03 | — |
| `docs/system-configuration.md` | 03、04、05、06各自一节 | — |

## 6. 统一禁止事项

1. 不修改与本任务无关的模块，不顺手重构、不改代码风格，不批量格式化文件。
2. 不改变已有接口的返回结构（只允许新增字段或新增接口）。Subsonic 接口（`server/music/service/subsonic/`）一律不动。
3. 修改持久化格式需向后兼容读取旧数据、可恢复迁移及安全回退。回退要先处理新格式下最新修改/dirty，不能读陈旧旧快照或删库降版本。SQLite变更同步更新迁移文档。
4. 不提交密钥、真实账号、个人路径；测试数据放在临时目录。
5. 不 `git push`，不改 CI 配置。
6. 默认行为变更（例如上报周期、扫描策略）必须有配置项可以改回去。
7. 新timer/observer/listener/rAF写明owner与停止条件；隐藏暂停显示/装饰工作，协议心跳与可靠保存保留必要运行，服务停止清理。

## 7. 统一验收方式

- 单元测试：`npm run test:unit`；系统测试：`npm run test:system`；全部：`npm test`。测试文件放在 `test/*.test.cjs`，沿用现有风格（参考 `test/clientChannel.test.cjs`、`test/musicLibrary.test.cjs`、`test/clientPerformance.test.cjs`）。
- 每个任务在 `docs/` 下新增一份 `<主题>-test-report.md`，格式参考 `docs/client-performance-test-report.md`，写明测试环境、数据量、改造前后的数据和结论。
- 性能基准数据集：**1 个 5000 首的歌单 + 2 万首的自定义目录 + 1000 条最近播放**。生成脚本由 07 号任务提供，放在 `scripts/perf/`；其他任务可先用临时脚本。
- 统一性能口径以07第5节为准：M数据本地首屏P50≤300ms/P95≤500ms；典型视口虚拟行≤60（高视口解释可见行+overscan），分页<200；目标滚动≥50fps、封面网络≤6、无>100ms交互长任务，并分析>50ms任务。
- 业务主线程后台目标<200ms/分钟，保留必要协议心跳/保存，不承诺无任何timer；媒体有效命中源站请求0次。设备/4x CPU/缓存层/样本数/功能开启条件必须统一，预算不是已验证成果。
- test:unit/system目前显式枚举文件，新增测试须直接node --test指定或由集成负责人更新清单；文档阶段不跑业务测试/构建。仅实现构建交付变更的07a执行必要构建，其余按风险做定向验证。
- 09新增断网/跨页本地抽样、未上报编辑优先、有效播放立即加权、snapshot+pending确认不双计与预选一致性；目标准备P50≤100ms/P95≤300ms、已准备选择P95≤5ms，按07/09同环境测。


## 8. 已核实调研结论与任务更新

完整证据、固定commit源码链接、官方API章节、采用/不采用理由和反例验收见 [research-evidence.md](research-evidence.md)。2026-10-13已读取Feishin、Navidrome、YesPlayMusic、LX Music Desktop源码和LICENSE，以及Tailwind v3、Node20、MDN官方页面。搜索工具404仍如实记录；GitHub克隆和隔离浏览器取证成功，旧“全部未核实”的描述已替换。

| 确定结论 | 任务 | 本期执行选择 |
|---|---|---|
| Feishin的虚拟行与图片视口分离，fetch/Blob支持取消和释放 | 02/08 | 原生虚拟窗口，overscan每侧4；图片rootMargin=0；共享消费者最后释放才abort；不引React |
| YesPlayMusic歌词按记录异步缓存，但所读获取函数无条件请求 | 08 | 原生IDB完整歌词/Blob；有效hit零网络、冷miss一次、过期去重重验证，不照搬获取策略 |
| Navidrome防抖/目标去重可借鉴，但loadDir仍读文件属性 | 04/05 | 原生watch+dirty paths+quick+24小时full；不冠名其零文件stat算法，不新增chokidar |
| 洛雪本地列表随机并保存预选，tag映射可对照；FLAC先删后改名不满足安全边界 | 06/08/09 | 保现有歌词字段、维护管道和加权公式；安全暂存/校验；entryId+revision预选，不移植桌面fs |
| Tailwind本地版本已确认为3.4.17，v3扫描依赖完整类名 | 07a | 固定3.4.17构建期CSS，有限完整类审计，保主题/断点，不升4.x；静态body/编码表示用有界内存缓存 |
| Web Storage同步、IDB事务跨任务会失活、配额按origin共享 | 07b/08 | 小热点镜像、按歌单IDB；事务外yield，complete确认；媒体淘汰不删用户数据 |
| scheduler.yield并非所有主流浏览器可用 | 07/07c | 能力检测+setTimeout新任务降级，先减少工作再分块，不用微任务冒充让出 |

本次更新同时覆盖01/02/04/05/06/07/07a/07b/07c/08/09正文及GPT提示词；03已有WS判断保持，不重复实现。前端图片默认从300px预读收紧为真实视口；04由二选一改为原生watch，修正quick吞dirty的任务合并规则与mtime不可靠回退说明。

B 组（04→05→06）已实现待集成验证：采用现有 SQLite 文档适配器事务保存 `custom_index`、扫描/预取/自动修复状态，不新增竞争性实体 JSON 写入器；新增每用户媒体预算 `library.prefetch.maxCacheMB`（默认 256），自动写仅可信私有缓存格式，custom 及独立 Subsonic 端口保守跳过。`pauseWhilePlaying` 没有可靠状态来源，本期未实现并从默认/类型/管理入口移除。定向证据见 `docs/library-*-test-report.md`；临时基准不代表 NAS/fnOS 性能结论。合并顺序和文件边界见 04/05/06 计划末尾。

调研不能代替性能验收：研究附件本身没有运行外部播放器、采集本项目前后trace或实测fnOS监听。没有性能倍率、FPS、硬盘寿命保证。C/03实施与受控测量另见本总览2.1和03交付段，其余各组状态由各自计划维护。

GPL参考仅借鉴设计，不复制源码；MIT/Apache参考若确需复制也须另审许可与保留声明。未读项目（例如Jellyfin/Plex/TanStack源码）不列为已核实依据。后续结论/范围变化同补丁更新本总览、关联正文/GPT提示词及研究附件，不能仅往附件追加新要求。

### D 组交付状态（2026-10-13）

D 组 07/07a/07b/07c 已实现并附定向验证报告，状态为“已实现待集成复测”。合并必须保留 `ListStore` scope/revision、`DeferredWrites` Promise 接点、静态资源构建顺序与 HttpServer 鉴权交接；启动 LCP/长任务、真实账户/媒体、iOS 和各部署代理仍由集成负责人统一复测，不能据局部样本宣称全预算达标。


A组（01→02）状态：已实现待验证。分页接口、最近播放分页、客户端分页适配、虚拟列表和视口图片门控已落地；性能指标和完整集成回归仍由集成负责人验收。
