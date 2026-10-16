# 任务 07b：IndexedDB、localStorage 与可靠写入队列

> 先读 [00 总览](00-overview.md)、[07 测量标准](07-client-perf-storage-render.md)，协作对象为 [03 WS](03-ws-channel-events.md)、[02 列表](02-client-lazy-list-and-images.md)、[08 媒体缓存](08-client-cover-lyric-local-cache.md)。本任务的首要约束是用户数据不丢失，不能只追求写入次数少。
> [09本地随机/漫游](09-local-random-roaming.md)新增要求：列表先本地变更与可靠落盘，再上报；提供完整本地候选读取和权重projection持久helper。

> 调研已完成：[证据与确定选择](research-evidence.md)。Web Storage确为同步API；延后调用不等于异步介质。IDB事务不能跨网络/定时器/yield；complete确认提交不代表断电绝不丢失。见附件第7节。

## 1. 现状与必须先追踪的行为

- `client/music/js/idb_store.js` 使用 `lx_music_store`，当前 version=1、kv store。`lx_list_data:<scope>` 保存整个账号歌单及 dirty；旧无作用域键有迁移路径。在线路径还有 `/api/music/storage/list` 的 SQLite 存储，不能把它说成“只在本地”。
- ListStore 与 ClientSync 已有离线/待同步语义；列表 get/set/cache/getLocal/remove、readPending/writePending 等实际接口先列清，不能把“set成功”等同于“服务端已确认”。
- 现有 enqueue 捕获鉴权与账号，顺序提交避免旧请求覆盖；这是正确性机制，必须保留。不能因为串行有延迟就把相互覆盖的全量 PUT 并发发送。
- `client/music/app.js` 的 savePlaybackState 保存队列快照与小型进度；全队列可能被截断到300首。先核对恢复语义与设置，不悄悄改变持久化上限或当前索引映射。
- localStorage 调用分布在启动、切歌、渲染、事件、设置和凭据中；只迁测量确认的热点。歌词 `lx_lyric_*` 的迁移归08，ClientSync exit journal 的协议和flush时机归03。
- `deferred_writes.js` 与 ClientTransport 的持久请求正文可能已经重叠；先画 enqueue→persist→send→ack→remove 的真实链路，复用已有持久存储，避免新建第二套outbox导致重复发送。

## 2. 文件范围与不能改的协议

独占：idb_store.js、deferred_writes.js、新 local_store.js；app.js 中 savePlaybackState、恢复读取和明确列出的高频存储调用。07c 的 timeupdate 只接调用补丁，不由本任务重写其播放逻辑。

范围外：音乐列表虚拟化/图片视口队列归02；ClientSync分级/周期/生命周期上报归03；歌词获取与媒体独立库归08；HTTP歌单结构、SQLite接口、Subsonic不改；认证凭据不迁到防抖缓存；不做全应用状态管理框架。

新增接口先冻结：
- `ListStore.getListMeta()`：返回当前scope歌单order与元信息，不能加载全部songs再提取；字段包含id/name/count/revision及可用封面引用。
- `ListStore.getList(listId)`：返回该歌单完整结构，兼容原字段，必要时执行已有同步步骤；不存在返回约定null，不能偷偷触发全库扫描。
- `ListStore.subscribe(listener)` 或现有事件：事务完成后通知 `{scope, revision, changedListIds, removedListIds, orderChanged}`，listener拿到的是失效信息，不广播整份歌单。若仓库已有等价事件，复用并写入契约。
- 不改变原public方法同步/异步返回类型；调用方若原来拿Promise，本期保持。默认参数、_open alias、字段缺失兼容与已有协议一致。
- 09需要localOnly完整歌单读取，优先复用getLocal或给getList加明确本地选项，返回scope/revision/complete，不内部fetch；首次缺缓存返回明确缺失，不用服务端页当完整候选。权重snapshot/pending helper接口与09/03冻结，schema仍由07b集中升级。

### 2.1 本地优先编辑的业务约束

添加/删除/拖拽/收藏等先更新本地内存与revision，使UI和09候选立即生效；随后可靠落盘、排队同步。Promise可区分已本地持久和服务器确认，不把服务器ack作为本地可操作前提。远程get()快照必须先判断dirty/baseRevision，不能无条件赋值回滚未提交编辑；错误提示未同步/未保存，保留本地数据可重试。

09的本地累计权重与未确认playbackId增量是重要用户状态，不归08可淘汰缓存；07b提供有界持久helper、多tab事务一致性，03提供ack/水位，09负责projection计算。清recent不清累计漫游计数。

## 3. IndexedDB：按歌单拆分与元信息索引

### 3.1 数据布局（示意，实施时核最新schema）

在原库新增 `lists` 和 `list_meta`（或等价布局）与account索引，保留kv。DB_VERSION只从当前最新值递增一次，所有schema升级由本任务集中维护，08使用独立库不参与升级。

| store/key | 内容 | 热路径 |
|---|---|---|
| lists，复合键[scope,listId] | 原歌单字段+完整songs+revision | 编辑/打开当前歌单 |
| list_meta，复合键[scope,listId] | name/count/cover等小字段+revision | 侧边栏/歌单概览 |
| kv，账户manifest | order、accountRevision、dirty/tombstone、migration状态 | 装配原接口和同步 |
| kv，playback-queue账户键 | 队列快照、保存版本、currentIndex映射 | 启动恢复一次 |
| 已有pending位置 | 持久化未确认操作/快照 | 由03调度，07b保障可靠 |

scope至少区分服务器身份与账号；若现有list库只用账号，先明确单服务端部署限制，跨服务器客户端需要命名空间兼容迁移，不能直接改变用户所有旧key。服务器baseURL规范化/权限上下文与08协商，但不凭token生成稳定scope。

元信息 count 的含义与UI一致（原始数/去重数分别列，不混用）。去重/文件聚合若昂贵，在相应歌单revision变更时计算一次并缓存；不能为了读meta每次读songs/全量SongIdentity.aggregate。

### 3.2 变更检测不能用不可靠启发式

优先mutation入口生成歌单revision与changedListIds。必须覆盖添加/删除、数组中间替换、拖拽重排、歌曲metadata变化、歌单改名、导入、远程同步、账号切换。

禁止用“长度相同+首尾ID相同”或“数组引用相同”证明内容未变：中间歌曲会漏存、原地修改也会漏存。全量远程替换无法拿到变化范围时，允许一次分块比较/构造索引后标记实际变化；不得在每次渲染/切歌里重新比较全部歌曲。没有可靠revision的旧调用走保守兼容写，不冒险跳过。

冻结revision与数据快照的一致性：异步排队到执行时对象可能已被原地改，必须在安全变更边界取得稳定快照或可重放patch；不能给rev1存入rev2的对象。structuredClone本身仍会消耗主线程，优先按变化歌单快照，不每次克隆全账号。

### 3.3 事务与写入合并

- 元信息、歌单、order、删除tombstone在同一readwrite事务提交，oncomplete才认为已本地持久。单个request成功不代表事务最终提交。
- 事务中不await网络、定时器、scheduler.yield或不相关Promise，避免IDB事务失活/提前提交；先在事务外准备/分块，再短事务集中排队请求。request成功后事务abort必须仍报告失败/保dirty；oncomplete是事务完成语义，不承诺OS断电后绝无丢失，03可靠确认/重放不可删。
- 普通UI连改可合并约200ms，但`cache/set`返回的Promise必须在对应revision真正落盘后resolve，不能入内存就宣称成功。导入/退出前的关键操作立即提交。
- 写入进行中出现新rev：新rev进入下一批；完成旧批不能清除新dirty。返回ack对应snapshot revision，只清到该revision，不把账户后来改动清掉。
- 改一个歌单只写它与meta/manifest；改order只写order；删除按现有云端DELETE/tombstone语义，不通过物理删掉就失去离线删除意图。
- 一个5000首歌单仍作为songs数组存时，改一首会克隆/写整个该歌单。这是本期已知上限，必须量化；只有测量证明仍阻塞时才提出按歌曲记录/Worker后续任务，不本期擅改完整编辑协议。

### 3.4 读取与缓存

- getListMeta读小记录，getList只读一份；getLocal兼容装配整个对象但只在确有调用需要时运行，不能侧栏每渲染就调用。
- 当前歌单与元信息可在内存缓存，key包含scope+revision；限制缓存数量/字节，账号切换清引用。重复进行中读取共用Promise，错误移除进行中标记允许重试。
- scope在调用时捕获，返回前检查generation；旧账号响应不能写新账号UI。落盘若继续旧账号scope，必须使用旧凭据并遵守退出策略，不重新读取当前token错发。
- 跨标签用BroadcastChannel（能力检测）或仓库已有storage事件提示revision失效；不发送大对象。接收方按rev读取IDB；不能假设IDB会自动触发storage事件。
- 单纯last-writer-wins可能丢并发编辑；复用现有同步冲突规则，至少检查baseRevision，在一个事务内做比对，不匹配时重新读并重放受支持的操作/提示冲突。不能假装BroadcastChannel解决原子并发。

## 4. 迁移、版本阻塞与安全回退

### 4.1 迁移规则

1. 升级事务只创建schema/index；大数据迁移在数据库打开后以受控事务完成，状态为pending→copying→verified→active。
2. 从匹配scope的旧记录读取，保留value、dirty、pending/tombstone及原有账号归属；无scope旧数据不能直接归给当前第一个登录账号。
3. 分批复制至新记录，最后核对歌单顺序、每份歌曲身份/顺序/字段、数量、dirty、当前rev；禁止只比较总条数。迁移期间新编辑可先排队/走旧入口，最后切换需统一快照边界，防止最后写覆盖编辑。
4. 完整验证后原子写active标记；未完成重开时可重试/续迁，绝不读取半迁移结果。
5. 旧数据保留作为迁移来源，不定“7天后必删”。清理需满足新格式验证、同步确认、回退兼容与用户允许的策略；没有可靠条件则保留并标注磁盘占用。

### 4.2 回退不是读旧快照

新格式启用后有新编辑，旧key会过时。提供存储优化关闭开关时：先停止写入、等待持久事务、将当前新格式和dirty/tombstone导出成旧结构并原子写入兼容key，再切回旧读路径；失败不得切回陈旧旧key。

可选择保留新数据库、只回退查询/优化入口，避免降DB版本；旧代码若硬编码旧version会VersionError，必须提供兼容读取适配器或从新版读取导出。不能用“删除数据库、降版本重建”回滚。

旧标签升级处理：onversionchange关闭连接；onblocked显示可操作提示，让其他页刷新/关闭，不能静默挂Promise；openDB共用进行中Promise，连接错误后重置、可重试，未完成事务报错。禁止默认删库解决blocked。

### 4.3 配额/损坏

可重建媒体缓存由08清理，用户歌单/待同步记录不能作为LRU对象。配额失败如可清理媒体，发最小清理请求再有限重试；仍失败提示“本地未保存”并保留内存数据/导出方式，不能吞错返回成功。IDB不可用退到现有在线方式并明确离线保护失效；避免再把巨大歌单塞localStorage导致主线程和配额双重失败。

## 5. local_store.js：只优化可接受合并的热点

### 5.1 最小API与一致性

提供get(key,fallback)、set(key,value,{debounce,critical})、remove(key)、flush()和必要的invalidate(key)。确定JSON/string格式由key契约决定，不让同一key有时返回字符串有时返回对象。

读取首次parse后内存缓存；null/损坏值也有清晰缓存状态。缓存对象默认只读约定，修改须走set；如果现有调用会原地改，先迁该调用，不能缓存返回引用导致未经持久化的隐式变更。

同tab写更新缓存后再安排落盘；storage事件只在其他tab触发，读取最新存储/事件版本使缓存失效。清空事件key=null处理全部缓存，但账号敏感key不误共享。迁移key所有活跃调用必须都通过同一层或主动invalidate；保留裸setItem会让内存读到陈旧值，不能“只改一半”还宣称一致性。

按key最后值合并的仅是可合并状态（进度、窗口状态）。remove取消同key待写，避免延迟put复活被删除key。账号切换时pending写携带原scope，不能flush到新账号键。

### 5.2 热点迁移清单

逐项列读/写调用频率、数据大小、是否critical、格式和迁移负责人。优先timeupdate/切歌/保存进度/渲染循环；不强制替换全仓库所有localStorage。

| 类别 | 可选策略 | 边界 |
|---|---|---|
| 小进度/界面状态 | 内存即时、约1秒合并落盘 | 崩溃丢最后片段需说明 |
| 重要设置/账号凭据/删除意图 | 沿用即时可靠保存 | 不放300ms延迟队列 |
| 歌单、队列大快照 | IDB | 不每次JSON stringify同步写 |
| 歌词正文与封面Blob | 08独立IDB | 本任务不另做媒体缓存 |
| 待同步操作 | durable outbox | 不能简单最后值替代所有操作 |

开发模式记录大值（初始警戒64～100KiB，可调）和写频率，但不在每次调用同步打印。pagehide/hidden可flush小localStorage状态；关闭页不保证IDB异步完成，重要动作在发生时持久。requestIdleCallback只作非关键调度，必须有timeout/降级，不能依赖后台idle保证保存。

## 6. savePlaybackState 与恢复

- 队列快照转IDB，只有内容revision变才写；文本/进度保留小型localStorage对象，包含queueRevision/currentSongIdentity/currentIndex/position。恢复先读小状态，再读对应队列revision，版本不匹配不能用错误index播放另一首。
- 保留原最多300首规则和索引调整，或另行提出完整队列持久化决策，不能在性能任务里无声改变用户恢复行为。报告写清实际保存条数。
- 新快照落盘成功后才写引用它的小状态；旧rev慢写不能覆盖新rev。切歌过程可以先保存小状态但必须有明确“队列尚未落盘”兜底，不能宣称零丢失。
- 旧localStorage队列兼容读取、迁移到IDB并验证后再清理；账号/服务器归属不明时不跨账号自动迁。
- ClientSync.update('queue',...) 的业务语义/分类保留，由03决定时机；本任务减少不必要快照构造和重复保存，不删掉同步事件。
- 锁屏/后台继续播放：允许可靠保存和MediaSession行为，暂停UI并不等于暂停数据。播放器重开不应该又触发全歌单本地深比较。

## 7. DeferredWrites 与持久outbox

### 7.1 顺序与合并边界

条目在enqueue时获得不可变owner/scope、local sequence、operation id、正文snapshot与状态。去token/补id等原有清洗保留；token不持久化，发送时从匹配scope的当前认证获取，账号退出后不能拿新账号认证替旧操作发。

本地“已接收”和“已持久”区分。关键用户数据与下载命令在确认可重试前须落盘；对于最近播放可合并持久批但需规定最大风险窗口。不能把300ms仅存内存的事件称作durable。

同key可合并快照，累积播放次数/最近播放事件/增删操作不能盲目last-write；命令要立即按03协议发送，不能与state周期绑死。已有ClientTransport持久正文优先复用，DeferredWrites保持兼容adapter。

### 7.2 flush进行中再次入队

flush捕获batch的seq/id，仅清理该batch中已确认id；新入队保留。部分失败只ack成功项，未知结果保留待确认，重启恢复顺序。批量ack后一个事务更新，避免每条重写整份队列。

网络请求发出≠服务端执行确认。keepalive/sendBeacon的true只表示浏览器接受发送，不能删队列；没有幂等支持时重试可能重复，必须使用现有operation id/协议，若服务端尚不支持则请03补契约。文档/报告不能保证exactly-once。

队列大小/字节限制、重试退避、错误态可观察；超过容量暂停新高风险操作并提示，不静默丢旧条目。可以淘汰已被新snapshot覆盖的非关键状态，但要有明确同scope/同key语义。

### 7.3 介质迁移与多tab

优先单一持久介质IDB，不按每次50条/64KiB阈值在LS/IDB来回切换。迁移旧LS队列时记录迁移marker与operation id，去重后验证，成功才清旧来源；不能每次启动把两边简单concat。

多tab共享outbox要复用现有单发送者/锁机制，或用IDB事务领取带超时lease；BroadcastChannel只是通知。刷新/崩溃后lease可恢复，不永久卡住。队列storage实现归07b，重连/周期/主题分类/flush触发归03。

对外size()/byteSize()/persist()/flush结果若新增，需要明确Promise和durability；03读取size不能每秒扫描全部数据库，内存计数与事务提交同步。

## 8. 验证矩阵、指标和回滚

| 风险 | 必测用例 | 通过证据 |
|---|---|---|
| 漏掉中间修改 | 等长、中间替换、原地metadata、重排 | 重开/同步后内容与顺序正确 |
| 迁移数据丢失 | 中途关闭、事务失败、旧dirty、删除标记 | 重启恢复，无半迁移active |
| 旧ack覆盖新编辑 | rev1请求慢、rev2先修改/保存 | rev2仍dirty，新内容未丢 |
| 多tab竞争 | 同歌单编辑、blocked/versionchange | 无静默覆盖，提示/重放明确 |
| quota/IDB失败 | 抛QuotaExceeded、连接丢失、隐私模式 | 不报假保存成功，不删除用户数据 |
| localStorage cache陈旧 | 本tab裸写审计、他tab写/remove/clear | 缓存更新，待写删除不复活 |
| outbox丢/重发 | 部分ack、未知响应、崩溃、入队中flush | 未确认保留，已确认不重复，顺序可解释 |
| 账号切换 | A请求未完成切B、同名不同服务器 | 正文和鉴权不串scope |
| 播放恢复 | 300首规则、慢队列落盘、旧key | 曲目/索引/进度一致 |

定向沿用browserStorage、playlistStorage、deferredWrites、clientTransport等现有测试，新增localStore和migration并直接运行对应node --test文件；集成与03做真实断线/重连/多tab系统回归。不用单纯mock成功Promise证明崩溃可靠性。

性能记录：200/5000首歌单，改一首的IDB store写次数、估算写字节、结构化克隆耗时、事务耗时；未修改歌单写0次；timeupdate同步LS读写/JSON构造频率；getListMeta是否读songs。不要在单元测试用“随机耗时显著下降”作脆弱断言，结构计数与浏览器trace分开验收。

回退流程见第4节；格式迁移、可靠性和普通优化分阶段交付。最终报告 `docs/client-storage-test-report.md` 必须附新旧布局、dirty状态、故障结果、兼容与安全导出步骤。

## 9. 验收标准

- [ ] 本地写入Promise只在事务提交后成功，重要数据失败不被吞掉。
- [ ] 中间修改/重排/metadata都能保存，未变歌单不重复写，meta读取不载全部songs。
- [ ] 迁移可恢复，旧数据归属不串账号；回退读取的是最新内容而非旧快照。
- [ ] outbox的并发enqueue/ack/未知响应/多tab正确，03触发flush接口清晰。
- [ ] 高频路径不重复parse/stringify大对象，跨tab缓存一致性有测试。
- [ ] 歌词本地缓存归08，IDB版本独占无冲突；性能报告有实际数字和限制。
- [ ] 09完整候选只读本地且含revision/complete，未同步本地编辑不会被旧远程快照覆盖，权重pending可重启恢复。
- [ ] 范围/接口/依赖变化已同步00，未跑项明确标记未验证。

## 10. 给 GPT 的完整提示词

```text
在D:\opensource\fn-lxserver执行07b，先读00、07性能总纲、本文件及03/02/08接点。只负责idb_store、local_store、deferred_writes、savePlaybackState/恢复和指定热点调用，不能重写WS/列表/歌词数据获取。
开工同时读 docs/plans/research-evidence.md；已确定选择不重新泛化选型，执行本任务对应边界及反例验收，未实测指标不得写成结果。Web Storage确为同步API；延后调用不等于异步介质。IDB事务不能跨网络/定时器/yield；complete确认提交不代表断电绝不丢失。见附件第7节。
先追踪在线SQLite、ClientSync、ListStore与ClientTransport现有语义。按歌单拆IDB并建小meta/manifest，保留public API与dirty/tombstone/账号捕获/顺序；只有最新schema集中升级，08独立DB。可靠revision覆盖中间修改/原地变动/重排/同步，禁止用首尾ID/长度/引用判断未变。事务提交后resolve，新编辑不能被旧ack清dirty，读取meta不读全songs，跨tab冲突不能靠广播假装解决。
迁移分批copy/verify/active，保存旧来源，验证账号归属、顺序、字段与pending；不固定7天删旧key。回退先把最新新格式安全导出旧格式或用兼容adapter，不降DB版本/删库/读陈旧快照。处理blocked/versionchange/quota/事务失败，不虚报保存成功。
LocalStore只迁确认热点，按key缓存/合并，所有同key活跃调用一致，storage/clear/remove失效正确；凭据和关键设置不延迟，关闭页IDB不保证完成。大队列存IDB、小进度小对象，保持300首规则与ClientSync.update语义，版本匹配恢复。
DeferredWrites复用已有durable outbox，capture owner/seq/opId/snapshot，flush仅删已确认batch，flush期间新条目保留，未知响应不删，部分成功正确，多tablease/恢复明确；不造重复outbox，不按大小频繁切介质，不把命令或累积事件按最后值合并。存储归你、调度归03，先冻结size/byteSize/persist接口。
执行风险对应定向测试与故障/多tab系统回归，按07记录写放大和LS/IDB耗时，写docs/client-storage-test-report.md。范围变化同步00，不伪造实测/外部引用，不git commit，交付改动、迁移/回退、数据和未验证项。
09接点必须实现：列表先本地内存/revision→可靠落盘→上报；localOnly完整歌单不fetch，scope/revision/complete明确，旧远程快照不覆盖dirty。给09/03提供权重snapshot/pending/ack持久helper，但抽样算法归09，周期归03，schema升级仍由你统一。
```

## D 组实施记录（2026-10-13）

状态：已实现待集成复测。IDB v2 按 scope/歌单拆分并提供 meta、revision、CAS、`putList`、播放队列前一版本；LocalStore 只镜像小状态；DeferredWrites 使用 IDB events、迁移校验、15 秒 lease、`persist/prepareBatch/ack/release`。

验证：browserStorage、deferredWritesIdb、localStore 定向测试通过，覆盖事务 abort、旧来源保留、两页面旧快照冲突、部分 ack 新 revision 保留。合并接点：03 必须 await 新 Promise API；F/09 使用 `getListMeta/getList/putList/getRoamingState/updateRoamingState`，编辑入口先可靠本地保存。IDB 不可用时编辑明确失败，不能假报成功。
