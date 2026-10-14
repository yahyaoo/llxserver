# 性能改造调研：已核实证据与实施决策

> 核查日期：2026-10-13。本文是研究附件，不是第14个可委派任务；00～09（含07a/b/c）仍共13份任务规范。
> 结论级别：已读取固定提交源码/官方页面；未运行这些外部项目，未实测本项目优化后的耗时、fnOS监听可靠性或硬盘寿命。
> 执行者先按本文的确定选择实施，再按07记录真实收益；平台验收失败按任务书降级，不自行扩大范围。

## 1. 最终决定，不再交给执行者重新选型

| 问题 | 本期确定方案 | 所有权/边界 |
|---|---|---|
| 5000首播放队列卡顿 | 原生固定行高虚拟窗口，默认每侧overscan=4；不能固定行高的布局走受控分页，保持原视觉 | 02；完整候选数据与渲染窗口分离 |
| 音乐库、最近播放 | 服务端分页，当前页请求；查询、页号、scope、版本组成缓存身份；切页取消旧请求 | 01/02；旧服务端才走能力回退 |
| 未滚到的封面 | 默认真实视口才开始候选计算、IDB读取、补全、下载和解码；rootMargin=0，不因overscan挂载触发 | 02/08；播放器当前封面不受列表视口限制 |
| 封面网络拥塞 | 单一6路调度；播放器优先、当前可见行次之、到期重验证最低；共享消费者，全部离开才取消fetch | 02调度/08持久缓存；原img跨域降级无法承诺物理取消 |
| 封面/歌词本地缓存 | 原生独立IndexedDB，封面Blob、完整歌词对象，scope/版本/TTL/LRU；有效命中不发网络 | 08；不增加Dexie、不缓存音频全库、不存token |
| 冷启动样式成本 | 本项目已确认Tailwind运行时代码为3.4.17；固定3.4.17构建期生成CSS，不迁移4.x | 07a；保主题、断点、动态完整类审计 |
| 静态重复读取/压缩 | 本期有界内存body/编码表示缓存，16MiB总预算、单文件2MiB、压缩并发1，版本/stat失效 | 07a；这是本项目起始预算，不新增预压缩发布链 |
| 歌单持久化成本 | 按歌单拆IDB并建小meta，改一个只写该歌单；热点小设置内存镜像+合并写 | 07b；保SQLite在线协议、dirty与可靠outbox |
| 主线程长任务 | 先减少工作量与DOM，再按时间预算分块；scheduler.yield能力检测，setTimeout降级 | 07c；不以Promise微任务/Worker数量冒充优化 |
| 扫描与监听 | 原生fs.watch + dirty路径合并 + quick目录剪枝 + 默认24小时full兜底 | 04；本期不装chokidar，失败走低频扫描 |
| 后台媒体预取 | 扫描变更事件进入有界后台队列，本地读取与网络通道独立预算；前台请求共享同资源任务 | 05；这是本项目设计，不宣称四个参考项目均已这样做 |
| 自动内嵌/补tag | 原维护管道内加可选安全模式，默认关闭自动动作，仅填空；暂存、验证、替换失败保原文件 | 06；借鉴字段映射，不复制桌面写文件流程 |
| 随机/漫游 | 从本地完整缓存歌单抽样；本地编辑与有效播放立即生效；纯规则两端共享，权重后台刷新 | 09/07b/03；不从当前页抽、不等服务端、不改变现有权重方向 |
| WS现状 | 保已实现长连接；内部进度采样、速度计算、同步flush不能统称HTTP轮询 | 03；无外部调研推翻现有基线结论 |

以上默认值是本项目的实施选择，不是外部项目的性能保证。参数变更必须同时更新00、责任任务正文与GPT提示词。

## 2. 源码快照及复查方式

四个仓库以浅克隆下载到本会话临时目录，执行git log获取以下提交，直接读取源文件，不以README截图或星数代替实现证据。

| 项目 | 固定commit | 该提交时间 | 已读取许可证 |
|---|---|---|---|
| [Feishin](https://github.com/jeffvli/feishin/tree/c91cc2a940654dc895cb700debb70e21b95984e0) | c91cc2a940654dc895cb700debb70e21b95984e0 | 2026-10-11T19:51:25Z | [GPL v3](https://github.com/jeffvli/feishin/blob/c91cc2a940654dc895cb700debb70e21b95984e0/LICENSE) |
| [Navidrome](https://github.com/navidrome/navidrome/tree/30663f7d4f2f69d356dd54b7fdeb0710b10f0f8c) | 30663f7d4f2f69d356dd54b7fdeb0710b10f0f8c | 2026-10-12T11:49:07-07:00 | [GPL v3](https://github.com/navidrome/navidrome/blob/30663f7d4f2f69d356dd54b7fdeb0710b10f0f8c/LICENSE) |
| [YesPlayMusic](https://github.com/qier222/YesPlayMusic/tree/5d5fa23b7429c82a9932bbc2c9f6036403c5757b) | 5d5fa23b7429c82a9932bbc2c9f6036403c5757b | 2026-10-10T19:05:17+08:00 | [MIT](https://github.com/qier222/YesPlayMusic/blob/5d5fa23b7429c82a9932bbc2c9f6036403c5757b/LICENSE) |
| [LX Music Desktop](https://github.com/lyswhut/lx-music-desktop/tree/ad95d5091c9ed689fa72b5e5c849df65f5a679ce) | ad95d5091c9ed689fa72b5e5c849df65f5a679ce | 2026-09-19T09:57:31+08:00 | [Apache 2.0](https://github.com/lyswhut/lx-music-desktop/blob/ad95d5091c9ed689fa72b5e5c849df65f5a679ce/LICENSE) |

本项目package.json标注Apache-2.0。本期对GPL项目仅借鉴设计并自行实现，不复制源码；MIT/Apache项目也不直接粘贴，若后续确需复制须单独审查许可、保留适用声明和来源。本记录不是对发行许可兼容性的法律结论。

通用搜索/open工具仍返回404；实际证据通过GitHub git克隆与隔离浏览器读取取得。因此旧总览“完全未取得源码/页面”的结论不再成立，但搜索失败记录本身未被改写成成功。

## 3. Feishin：确认虚拟列表和图片请求必须分两道门

### 3.1 已核实

- remote组件的VirtualRowList默认行高60、overscan=4，依赖react-window-v2；resetKey变化才复位滚动，不随页数追加复位。[虚拟行实现](https://github.com/jeffvli/feishin/blob/c91cc2a940654dc895cb700debb70e21b95984e0/src/remote/components/virtual-row-list.tsx#L12)
- Thumbnail使用inViewport作为useNativeImage的enabled条件，注释明确指出overscan挂载行仍可能从未被看到。[封面接入](https://github.com/jeffvli/feishin/blob/c91cc2a940654dc895cb700debb70e21b95984e0/src/remote/components/thumbnail.tsx#L15)
- useNativeImage通过fetch/AbortController读取Blob，创建object URL；禁用/清理会abort，换资源和卸载释放URL。[图片生命周期](https://github.com/jeffvli/feishin/blob/c91cc2a940654dc895cb700debb70e21b95984e0/src/shared/components/image/use-native-image.ts#L46)
- 桌面分页loader将currentPage转换成startIndex/limit，query key包含serverId与queryParams，并将查询signal传给API。[分页loader](https://github.com/jeffvli/feishin/blob/c91cc2a940654dc895cb700debb70e21b95984e0/src/renderer/components/item-list/helpers/item-list-paginated-loader.ts#L76)
- remote的无限滚动hook用hasMore/isLoading防止重复loadMore，接近末尾8行即请求下一页。[页尾触发](https://github.com/jeffvli/feishin/blob/c91cc2a940654dc895cb700debb70e21b95984e0/src/remote/hooks/use-infinite-scroll.ts#L28)

核查范围是这些具体组件，不代表Feishin所有页面/版本都使用同一策略。没有测得其全局网络并发上限或IndexedDB封面持久缓存，不能归因给它。

### 3.2 对本项目的确定落地

1. 行生命周期负责挂载/复用；图片生命周期负责真实视口进入。两者独立，overscan只为滚动平滑，不能顺带预热图片。
2. rootMargin从原计划300px改成默认0；支持未来显式可关闭预读不在本期默认行为中。滚动容器/隐藏抽屉需正确判断，不能仅元素被挂在DOM就算可见。
3. 每个实际scroll root共用一个IntersectionObserver，根切换时释放；不每图片建observer，不用全树getBoundingClientRect滚动循环。
4. 网络调度不是照抄hook：本项目另有持久缓存与播放器共享，底层fetch仅在最后consumer释放时abort；一个行离屏不能取消播放器正在使用的同图。
5. 无CORS可读能力的图片回原img展示，离屏移除待执行任务并忽略迟到结果；不承诺已经发送的img请求一定被中止。
6. 服务端库当前页才fetch；本地可编辑歌单完整读取与DOM窗口分开。显式“播放全部”才准备全量候选，不在页面打开时顺便预取全部页。

不采用React、react-window、TanStack Query，也不照搬其60px行高或缓存时长。overscan=4是本项目起始预算，实际行高沿用现有桌面/手机CSS。

## 4. YesPlayMusic：确认歌词异步落盘，但不照抄获取策略

### 4.1 已核实

db.js使用Dexie；歌词表按id、updateTime存储，cacheLyric写完整lyrics对象，getLyricFromCache按id读取。[歌词存储](https://github.com/qier222/YesPlayMusic/blob/5d5fa23b7429c82a9932bbc2c9f6036403c5757b/src/utils/db.js#L167)

getLyric在读取缓存之前无条件调用fetchLatest；miss时又调用fetchLatest。因此这段代码不能作为“命中零网络”的证据，冷miss存在重复发起的代码路径。[获取策略](https://github.com/qier222/YesPlayMusic/blob/5d5fa23b7429c82a9932bbc2c9f6036403c5757b/src/api/track.js#L76)

cacheTrackSource在Electron条件下缓存音频，并向三种尺寸的封面URL发axios请求；所读函数未将封面Blob写入歌词/媒体表。不能声称它给浏览器实现了本计划所需的持久封面管理。[音频缓存函数](https://github.com/qier222/YesPlayMusic/blob/5d5fa23b7429c82a9932bbc2c9f6036403c5757b/src/utils/db.js#L93)

### 4.2 对本项目的确定落地

- 只采纳异步按歌曲记录持久歌词的方向；用原生IDB，不装Dexie、不移植Vue状态轮询或Electron条件。
- 有效缓存先return，只有miss/明确版本变化/过期受控重验证才请求；inFlight同scope/key/version去重。
- 冷miss一次fetch，热有效hit零fetch；过期多人请求同一首只产生一次重验证。测试检查调用次数，不只检查结果一致。
- 封面持久化独立设计为Blob+版本/容量，并由02按视口触发；禁止为“缓存命中率”每次启动扫描全表或批量下载多个尺寸。

## 5. Navidrome：借鉴调度与防抖，不误认“零文件stat”

### 5.1 已核实

- watcher.Run用targets集合去重、定时器防抖；扫描忙时延后重试。所读提交中只有DevSelectiveWatcher开启才调用ScanFolders，否则调用ScanAll(false)。不能写成它默认总是只扫变化目录。[watch调度](https://github.com/navidrome/navidrome/blob/30663f7d4f2f69d356dd54b7fdeb0710b10f0f8c/scanner/watcher.go#L74)
- loadDir先stat目录，随后fullReadDir并对文件entry.Info；目录mtime取目录与文件mtime中较新值。[目录读取](https://github.com/navidrome/navidrome/blob/30663f7d4f2f69d356dd54b7fdeb0710b10f0f8c/scanner/walk_dir_tree.go#L108)
- folderEntry.hash包含音频、图片、播放列表的名称、size、mtime。它不是只读目录mtime就跳过文件的实现。[hash依据](https://github.com/navidrome/navidrome/blob/30663f7d4f2f69d356dd54b7fdeb0710b10f0f8c/scanner/folder_entry.go#L106)
- scanner README分别列自动扫描开关、schedule、startup、WatcherWait；其中Schedule默认0禁用，WatcherWait默认5秒。[配置表](https://github.com/navidrome/navidrome/blob/30663f7d4f2f69d356dd54b7fdeb0710b10f0f8c/scanner/README.md#L427)

### 5.2 对本项目的确定落地

本项目NAS减少IO的quick目录mtime剪枝是自己的设计，不能冠名“Navidrome扫描算法”。保留三条互补路径：事件paths刷新原地变化；quick探测目录结构变化；full检查漏事件/原地变更。

- 借鉴事件防抖、目标去重、忙时保留下一批和可配置后台调度，不移植Go扫描管道。
- Node原生watch为本期唯一监听后端；不安装未核查的chokidar版本，不用fs.watchFile逐文件高频轮询。[Node 20官方限制](https://nodejs.org/docs/latest-v20.x/api/fs.html#caveats)
- 网络盘auto关闭监听；native强制开启也保full兜底。filename缺失、监听错误/根目录重建标为“不确定变更”，请求受影响子树full，不能只做quick。
- dirty文件不能被“quick覆盖paths”的合并规则丢掉；只有真正full成功覆盖相应范围时才清除。网络失联/权限错误保旧索引。
- 目录mtime不可靠时polling模式本身不能补救；缩短full周期或手动full，明确可能漏检。用户关闭full=0时必须显示风险。
- 未变化时约2000目录stat/零文件stat是04的目标与模型估计，不是本次实际测量；也不等于硬盘零唤醒或寿命增加。

## 6. 洛雪：缓存字段和本地随机可以借鉴，文件写入不能照搬

### 6.1 已核实

- desktop worker歌词模块保存lyric/tlyric/rlyric/lxlyric，区分raw与edited；getPlayerLyric优先返回编辑歌词并附原始内容。[歌词结构](https://github.com/lyswhut/lx-music-desktop/blob/ad95d5091c9ed689fa72b5e5c849df65f5a679ce/src/main/worker/dbService/modules/lyric/index.ts#L17)
- getNextPlayMusicInfo从getList(currentListId)取得列表，过滤后在random分支选index；保存randomNextMusicInfo，实际next优先消费预选。[本地选择与预选](https://github.com/lyswhut/lx-music-desktop/blob/ad95d5091c9ed689fa72b5e5c849df65f5a679ce/src/renderer/core/player/action.ts#L285)、[消费预选](https://github.com/lyswhut/lx-music-desktop/blob/ad95d5091c9ed689fa72b5e5c849df65f5a679ce/src/renderer/core/player/action.ts#L428)
- musicMeta.setMeta按.mp3/.flac分派；MP3将lyrics映射unsynchronisedLyrics后NodeID3.write。[格式分派](https://github.com/lyswhut/lx-music-desktop/blob/ad95d5091c9ed689fa72b5e5c849df65f5a679ce/src/common/utils/musicMeta/index.js#L5)、[MP3写入](https://github.com/lyswhut/lx-music-desktop/blob/ad95d5091c9ed689fa72b5e5c849df65f5a679ce/src/common/utils/musicMeta/mp3Meta.js#L7)
- 所读FLAC流程先写.lxmtemp，但finish后先unlink原文件再rename；因此不能称其为满足本计划“失败保原文件”的安全原子替换。[FLAC替换](https://github.com/lyswhut/lx-music-desktop/blob/ad95d5091c9ed689fa72b5e5c849df65f5a679ce/src/common/utils/musicMeta/flacMeta.js#L44)

### 6.2 对本项目的确定落地

- 05/08沿用本仓库PlaybackLyrics.normalize的lrc/tlyric/rlyric/klyric契约；外部字段lxlyric不直接改名覆盖逐字字段，转换须语义匹配。只有已有编辑来源时保留优先级，不借调研新增歌词编辑器。
- 09保本地完整候选与一次预选原则；本项目加entryId+queueRevision+mode防重排误播。不复制洛雪过滤循环，也不把它的均匀随机当作本项目漫游权重。
- 漫游仍用本仓库min(1e9,1+count+extra)，不擅改成“播放越多概率越小”。counts/extras后台同步，点击不等待；有效播放立即进入本地projection。
- 06复用本仓库music-tag-native维护管道，不换NodeID3，不搬Electron fs/IPC到浏览器；自动修改默认off、安全保护默认true，不支持安全替换的格式跳过。
- 原文件必须在暂存结果读回校验成功后才进入平台支持的替换步骤；失败可恢复、备份受控；绝不以外部已有临时文件名推断安全保证。

## 7. 浏览器官方依据与前端工程约束

| 已读取资料 | 确定事实 | 对任务的约束 |
|---|---|---|
| [Tailwind Play CDN](https://tailwindcss.com/docs/installation/play-cdn) | 定位开发用途，不用于生产 | 07a移除生产运行时编译；该页是4.x，配置以v3页为准 |
| [Tailwind v3 Content](https://v3.tailwindcss.com/docs/content-configuration#dynamic-class-names) | 提取完整类名，拼接片段不能可靠生成；支持有限safelist | 固定3.4.17，动态类映射完整字符串，保现有主题 |
| [IntersectionObserver](https://developer.mozilla.org/en-US/docs/Web/API/IntersectionObserver) | 异步观察相交，rootMargin扩展根范围，同observer可观察多目标 | 默认0，按scroll root共用，隐藏视图释放 |
| [Web Storage](https://developer.mozilla.org/en-US/docs/Web/API/Web_Storage_API) | localStorage/sessionStorage同步执行 | 07b只保小热点，歌词/Blob不入同步大键；延后写仍是同步，不叫异步存储 |
| [IDBTransaction](https://developer.mozilla.org/en-US/docs/Web/API/IDBTransaction) | 跨任务有active/inactive，可能自动提交；complete才表示事务完成 | 准备数据后开事务，不在其间await网络/yield；事务外分块 |
| [Storage配额与淘汰](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria) | 配额按origin共享，浏览器可整origin淘汰；persist不保证获批 | 08独立库不等于独立quota；不可用/被淘汰恢复，不能删07b用户数据 |
| [scheduler.yield](https://developer.mozilla.org/en-US/docs/Web/API/Scheduler/yield) | 延续到新任务，尚非所有主流浏览器可用 | 能力检测+setTimeout降级；不承诺每次yield都一定绘制 |

官方规则确认API语义，不证明本项目的耗时/内存指标。IDB事务complete也不能被写成断电永不丢数据；可靠同步仍需03的确认与重放。

### 7.1 前端必须记录的完整链路

07基线负责人把每次“打开队列”分成：本地数据读取→必要聚合/索引→可见行DOM→布局→可见封面候选→IDB命中或网络→Blob解码→绘制。分别打点，不能只记录render函数返回。

- 冷数据：记录IDB读取/结构化克隆与首次索引成本，不能排除它们后宣称总首屏达标。
- 热数据：相同revision复用准备结果；切歌仅更新新旧行与播放器，不能再聚合全部5000首。
- 封面慢允许占位，播放/点击必须先响应；图像解码同样有界（初始2路），命中不等于零主线程成本。
- 07c把timeupdate业务计数与视觉更新分开；隐藏停止装饰/绘制循环，保播放计数、必要可靠保存和协议心跳。
- Promise.resolve/queueMicrotask不作为长任务让出；rAF只合并短DOM工作，不能把全部重活搬进下一帧；setTimeout降级被后台节流属于预期。
- 确有残留重计算才评估Worker；postMessage结构化克隆计入总成本，不每张图片/每次render新建Worker。

### 7.2 必须增加的反例验收

| 场景 | 验证点 | 负责 |
|---|---|---|
| 首次打开5000首队列，不滚动5秒 | 非可见行候选计算/IDB媒体读/补全/fetch/decode都为0（排除当前播放封面）；DOM有界 | 02/08 |
| 快速滚动后停住 | 待执行离屏任务移除；新窗口优先；网络≤6；迟到图片不挂到复用行 | 02/08 |
| 同图同时在列表/播放器 | 行离屏不取消播放器；最终释放后底层fetch取消；object URL最终归零 | 02/08 |
| 缓存有效/冷miss/过期 | 歌词有效hit零网络、冷miss一次、过期多人一次重验证；封面同规则 | 08 |
| IDB写一条成功后事务abort | 不报告保存成功，不清dirty；cache失败不阻塞播放 | 07b/08 |
| 几千条缓存需淘汰 | 不读所有Blob，不持有IDB事务跨yield；清理分批，不能卡首屏 | 08 |
| 原地改tag但目录mtime未变 | paths/full发现；quick不伪称发现，quick任务不吞dirty | 04 |
| 空filename、root删除重建、挂载失联 | 有重核/监听重建或明确降级；不整库误删 | 04 |
| 预读下一首后重排/删歌 | 预选失效，不播旧index；跨页本地候选、未上报编辑有效 | 09 |
| 自动写入/替换阶段失败 | 原文件保留或可恢复，失败不记成功，不触发无限自写扫描 | 06 |

验收数字沿用07及各任务书；这里是新增用例，不代表已经执行。

## 8. 明确未采用与仍需实施验证

不引入React/Vue/TanStack/Dexie，不迁移Tailwind4，不下载未经核查的chokidar latest，不为本地缓存搭两套IDB+CacheStorage，不自动全库前端预热，不重做WS，不改Subsonic、不改变漫游算法方向。

已确定架构/默认路径；实施阶段仍必须测：fnOS/Windows实际文件系统watch事件、目录mtime准确性、不同手机行高、浏览器存储能力/CORS、同设备前后trace与5000/20000数据集。平台失败按上述降级处理，不能填“待研究”绕过边界，也不能把目标FPS或stat数量写成已测结果。

范围、接口、默认值、回退或验收变化，同一补丁更新00、关联任务正文/GPT提示词及本文对应结论；研究附件不拥有业务文件，不能新增一个与02/07/08并行重写前端的组。
