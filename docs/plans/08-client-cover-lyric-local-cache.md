# 任务 08：歌曲封面与歌词的客户端本地持久缓存

> 用户新增要求：歌曲封面、歌词在客户端运行时缓存到本地，之后优先复用，减少等待。先读 [00 总览](00-overview.md)、[02 列表/图片](02-client-lazy-list-and-images.md)、[07 测量](07-client-perf-storage-render.md)、[07b 存储](07b-client-storage-layer.md)、[05 后端预取](05-server-artwork-lyric-prefetch.md)。
> 本期指浏览器/PWA/Electron网页层的本地持久存储；浏览器缓存可能被系统淘汰，不能承诺永久保存。音频下载、磁盘导出和自动写音频tag分别沿用已有功能/06，不并入本任务。

> 调研已完成：[证据与确定选择](research-evidence.md)。确定原生独立IDB存Blob/完整歌词，有效hit零网络；不照搬YesPlayMusic无条件fetch。真实视口才读媒体，共享consumer取消；独立库不隔离origin配额。见附件第4/7节。

## 1. 已有行为与真正需要补的部分

- app.js 的loadLyricData已有localStorage歌词缓存，key为lx_lyric_<source>_<songmid>，基线模板末尾还有空格，兼容扫描需要同时识别精确旧键，不能只trim新键后丢数据。
- 现有enableLyricCache控制浏览器缓存，enableServerLyricCache控制后端缓存；这两个选项不是一回事，必须保留各自语义。
- 现有歌词字段经过PlaybackLyrics.normalize整理为lrc/tlyric/rlyric/klyric，PlaybackLyrics.load有同曲请求去重和旧会话保护；保留并扩展，不新建第二个歌词播放器。
- 未关联本地文件通过fetchEmbedLyricForLocalSong读取内嵌歌词；当前有些本地分支在浏览器缓存前返回，新缓存必须覆盖文件身份路径。
- components/library-artwork/index.js的LibraryArtwork主要使用img.src/候选回退，已有generation保护；无统一持久化容量/失效管理。浏览器HTTP/SW缓存不等价于用户可管理的封面持久缓存。
- sw.js当前跳过API/音频，静态activate清理范围较宽；07a负责收窄。不能为媒体缓存把所有鉴权API都交SW缓存。

## 2. 目标、优先级与文件边界

目标：
1. 可见封面首次获取后写本地，重新打开列表/刷新/同曲再播，版本有效时优先本地展示，不重新请求后端/源站。
2. 当前歌曲歌词首次获取后写本地，完整保留普通、翻译、罗马音、逐字字段；热命中与离线时无需等后端。
3. Blob/歌词正文用异步IDB，不能封面base64或大歌词同步塞localStorage。
4. 容量、TTL/LRU、账号/服务器隔离、版本失效、清理、禁用与配额降级可用；缓存失败不影响播放。
5. 不扩大请求范围：缓存只保存实际使用资源，未滚到的图片不会因缓存机制开始请求；当前歌词可独立于列表视口获取。

独占新增client/music/js/media_cache.js、media_cache_settings.js、相关测试；独立数据库lx_music_media_cache。只有测量证实有必要才新增media-cache-worker.js，不默认上Worker。

app.js中loadLyricData、内嵌歌词获取适配、本地歌词统计/清理、播放器封面接入的小调用点归08；歌词显示/行号/rAF归07c，savePlaybackState归07b。playback-lyrics.js保持identify/normalize/load兼容；若需调整会话/数据去重，由08提供补丁，07c负责显示生命周期。

02拥有ImageLoader/LibraryArtwork的列表接入和请求排队；08提供缓存模块与适配约定，不直接大改02文件。index.html加载顺序、SW与CSS静态清理由07a统一。05负责API媒体版本/ETag/响应头；08不悄悄改后端接口。

范围外：离线音频包、自动缓存全库、源站模糊匹配、同步媒体缓存到服务器/其他设备、写音频tag、认证体系改造、通用下载管理器、前端框架迁移。

## 3. 选型：独立IndexedDB，二进制与元信息明确

首选独立IDB保存封面Blob和歌词对象，减少与07b歌单schema升级冲突，普通HTTP下也应能力检测并可工作。不要求SW/CacheStorage/crypto.subtle才能缓存，不要求Electron文件系统权限。

数据库schema示意：

| store | key/索引 | 内容 |
|---|---|---|
| media | [scope,kind,resourceKey,variant] | cover Blob 或 normalize后的歌词对象；资源version/ETag、有效时间、大小、来源 |
| meta（可合入media的轻量投影） | scope/kind/lastAccess/expires索引 | 创建/访问时间、计数字节、schema/parser版本、验证状态 |
| state | scope | 预算、统计checkpoint、清理游标/版本 |

尽量一个记录/事务同时写payload与meta；若分store，同事务提交，不能留下统计有记录但Blob缺失。读取size/设置页不扫描所有Blob；每账号轻量统计可校验修复，但不启动就全库遍历。

不存在/事务异常/QuotaExceeded返回可解释miss/error，caller继续原流程；不能缓存异常Promise成永久错误。缓存是可重建数据，不参与07b dirty/outbox和03状态上报。

本期只用原生IDB，不增加Dexie，不建设CacheStorage+IDB双介质缓存。若后续测量证明需换介质，单独变更提案并同步00/07a/08，处理安全上下文、敏感key、跨介质一致性与清理命名空间。独立数据库仅隔离schema/本程序清理，不能隔离origin配额或浏览器整origin淘汰。

## 4. 资源身份、版本与账号隔离

### 4.1 scope

使用稳定服务器身份/baseURL规范化 + 登录账号/公开权限上下文。认证token只在网络请求时取，不入key/meta/日志；token轮换不导致全部缓存重复。默认/open/_open别名沿用现有语义，公共资源不能因为相同歌曲ID就泄露私有目录资源。

调用时捕获scope/auth上下文/generation，写入前与展示前分别确认；旧账号请求可以在原scope安全收尾或取消，但不能用新账号凭据重试、写新账号记录或显示到新UI。

账号切换清理内存/对象URL/进行中consumer，持久数据按scope可保留供再次登录。退出登录清内存和访问上下文，私有缓存只在匹配的账号会话中读取；设置“退出时清理本账号媒体缓存”可选。不能让离线媒体机制绕过应用登录页/导航认证；认证失败不当作普通离线miss自动展示其他账号内容。
09本地随机/漫游仅对选中曲目复用本媒体缓存；漫游完整候选池不能触发封面/歌词全池预取，也不能为展示cache stats读取每首Blob。

### 4.2 resourceKey

线上歌曲：source + 稳定songId/songmid + 影响歌词查询的hash/copyrightId/lrcUrl等查询指纹 + 资源类别/变体。不要只用标题或“歌手-歌名”匹配。

本地/自定义文件：目录id/所属用户 + 相对filename/稳定文件id + folder/custom标记 + 文件fingerprint。重名文件、同歌曲多文件、多用户目录必须分开；不把实际绝对个人路径记录在可导出报告中。

封面还区分尺寸档（例如列表小图、播放器中图、详情大图），但尺寸变体只在真实源支持/后端提供时使用；不能给任意远程URL乱加width参数。优先存已有合适尺寸，避免一张5MiB图在50行同时decode。

key用稳定序列化的字段元组或已有身份工具；不每访问做大对象JSON stringify，不靠安全上下文的crypto.subtle。签名URL有临时参数时用独立歌曲/资产身份与版本，不粗暴删所有query造成不同内容撞key。

### 4.3 version与失效

01/05提供coverVersion，歌词可新增lyricVersion（可选，旧服务端不强求）；后端文件fingerprint/ETag可辅助。封面修改、重写tag、手动封面、歌词修正、源查询参数补全导致的版本变都使对应缓存失效，不能只看songId。

未提供稳定version：按TTL到期重验证；文件mtime只能作为该文件候选fingerprint，不保证外部.lrc/封面更改同步，05应提供媒体各自版本或dirty事件。全局libraryVersion变化不等于每首都变，不能每次扫描清空全部媒体。

03的library/metadata事件只标记受影响key dirty，下一次实际访问再重验证，不遍历全歌单发请求。没有精确条目事件时使用scope版本标记延迟校验，不自动全库补缓存。

## 5. 冻结最小接口与两个负责人接入

接口示意（参数字段以实际已有工具调整，冻结后02/08共同遵守）：

~~~js
window.MediaCache = {
  getCover(descriptor, loadResource, options),
  getLyrics(descriptor, loadResource, options),
  invalidate(scope, resourceKeys, kind),
  stats(scope),
  clear(scope, kind),
  trim(scope),
  disposeScope(scope)
}
~~~

descriptor含scope、resourceKey、variant、version、查询身份，不含持久token。loadResource是复用现有鉴权/候选回退的网络函数；接收AbortSignal与validators，返回经过验证的响应/原始资源。options含priority/signal/forceRefresh/cacheEnabled。

getCover返回可展示URL/Blob及cache状态；若用对象URL提供release或handle.dispose，明确行复用/销毁时调用。getLyrics返回normalize对象与状态，最终仍交PlaybackLyrics/LinePlayer，不替换显示会话。具体Promise/失败/304含义写测试，禁止caller猜测。

进行中相同scope/key/version/variant共用Promise；每consumer独立取消，一个行离屏不取消仍被播放器使用的请求；所有consumer离开才abort底层可取消请求。失败移除inFlight，迟到旧version不覆盖新version。

### 5.1 与02的接点

只在ImageLoader判断进入视口后调用getCover，甚至本地IDB读/Blob解码也不要全列表初始化时做。列表候选仍由02懒计算。

封面网络请求统一使用02同一个调度入口/并发预算≤6（包括播放器/背景重验证）。可在ImageLoader增加最小runResourceTask(priority,signal,loader)适配，由02实现；本地hit不占网络slot。08不另起6路后台队列，造成总并发12。

当前播放器封面高优先，可见行其次；已离屏排队出队。刷新/到期重验证也进同一队列，不绕限制。候选顺序/占位与原来一致。

### 5.2 与歌词会话的接点

PlaybackLyrics.load→loadLyricData的缓存入口先查内存/IDB，miss才走已有服务器缓存→源接口→内嵌兜底顺序；本地文件分支也先查它的独立key。成功结果写本地，后端缓存上传沿用enableServerLyricCache/DeferredWrites原逻辑，不把本地hit反复上传。

当前曲歌词高优先，不因列表排队长时间等；独立歌词网络小并发（初始≤2），在跨任务报告说明不计封面6路。快速切歌时旧consumer取消/结果护栏，热parse结果有限内存缓存，持久存原歌词而非DOM对象。

默认不预取下一首；如之后实测需要，只允许当前请求完成后、网络合适、非Save-Data、最多下一首，用户可关闭；禁止缓存全队列歌词。

## 6. 命中、重验证与网络/数据失败

| 状态 | 展示/请求行为 | 持久化 |
|---|---|---|
| 本地有效且version匹配 | 立即展示，无网络 | 合并访问时间更新 |
| 过期但身份可信 | 先旧内容后受控重验证，或用户刷新强制获取 | 成功更新；旧内容可标陈旧 |
| 明确version变化 | 不当作有效hit；新资源/占位按场景 | 新version成功后替换 |
| 暂时断网/超时 | 本scope可信旧资源可离线展示 | 不覆盖成空/永久失败 |
| 401/403 | 按认证错误处理，不吞成离线 | 不持久token，不跨scope回退 |
| 404/明确无歌词 | 短负缓存（初始10分钟） | 不覆盖已有成功结果为网络错误 |
| 5xx/解析/非图片/损坏Blob | 候选/原流程兜底、有限退避 | 不存错误页面、空响应 |
| 304 | 复用已有payload并更新验证信息 | 本地body缺失则重请求 |

严格检查response.ok、Content-Type、合理体积；不缓存HTML登录页、验证码、默认logo、blob临时URL字符串。封面接受允许的位图类型；SVG只对已受信的同源静态资源沿用展示，不把任意外部SVG当通用缓存载荷。

跨域远程img可以显示但fetch未必CORS可读：先可缓存的同源后端封面/允许CORS地址；不支持就回原img候选展示，记短期“不可持久化”能力结果，避免每次都先失败fetch。不能用no-cors opaque响应假装验证了类型/大小，也不为绕CORS禁用浏览器安全。已有代理能复用时需05/接口负责人确认，不默认新建任意URL代理。

资源最大体积初始限制：单封面8MiB、单歌词1MiB（可配置并实测），超限正常显示/请求但不持久；不为了缓存主线程做大base64/图像压缩。缩略图需后端已有变体或有证据后再评估createImageBitmap/Worker，并测转码时间/画质。

强制刷新只针对用户选择的歌曲/资源，不能清整库再发全量请求。手动修正歌词/封面更新后立即invalidate相关key。

## 7. 容量、LRU/TTL、内存与对象URL

建议起始默认：封面128MiB、歌词16MiB，条数上限封面5000/歌词10000；合计与实际可用quota取更小预算。设定只是初始配置，报告测试设备和调参依据，不假设浏览器一定给足空间。

缓存有效期初始封面30天、歌词7天；有稳定version可延长有效期但仍受容量/LRU限制。TTL表示重验证时机，不必到期全部物理删除；旧内容可用于明确离线兜底。负缓存10分钟与网络退避区分。

- navigator.storage.estimate能力检测，quota缺失时用静态小预算；不要预先申请很大空间或频繁全库estimate。
- 统计sizeBytes，写入前/超预算触发增量trim，先过期/负项、再按lastAccess LRU；当前播放/可见引用可短暂pin，但必须有上限，不能全部永远pin。
- lastAccess批量合并（例如30秒或一定次数），只是可丢的缓存元信息；不每图片显示都事务写一次。
- 淘汰按索引分批，每次少量记录，yield后继续；进入播放器首屏不执行整库readAll/删除几千Blob。多个tab清理事务一致，size估计偏差定期受控修复，不每次启动扫描全库。
- QuotaExceeded先停止预取/缓存写，trim当前媒体一次后有限重试；仍失败降级内存/原请求，用户播放/歌词正常，不能删07b歌单/未同步队列。
- 内存LRU初始封面最多32个handle且有字节上限、歌词parse结果少量曲目；长期运行不能保存每首歌词/Blob解码对象。
- createObjectURL只在消费时创建，引用计数/handle所有者明确；行移除/复用、播放器换图、账号切换、destroy/clear释放。不能img加载前就revoke，也不能同一handle还被背景/播放器使用就释放。
- ImageBitmap/解码缓冲使用后close/release，图片decode并发也有小上限（初始≤2），磁盘hit不代表50张大图同时decode没有卡顿。

浏览器可整origin清理存储，连同07b用户库；08自己的LRU绝不能删它。private模式/普通HTTP不同能力要测试，navigator.storage.persist仅可选且不保证获批，不作为缓存前提。cacheEnabled开启不意味着持久成功，stats显示可用性/降级；缓存丢失回miss/原请求，用户dirty不可恢复风险由07b可靠同步/导出说明承担。

反例测试必须覆盖：歌词有效hit零fetch、冷miss一次fetch、过期多人一次重验证（不复制YesPlayMusic无条件fetch）；图片真实视口才读IDB/解码；同图行与播放器共享时最后consumer才abort；分批trim不持事务跨yield。

## 8. 设置、清理与旧缓存迁移

### 8.1 用户可理解的设置

复用enableLyricCache作为本地歌词总开关，新增enableCoverLocalCache；默认开启，但旧用户明确关闭歌词缓存必须保留false。enableServerLyricCache不被连带改变。

设置提供本账号封面/歌词容量与数量（异步读小meta）、分别清理/全部媒体清理、预算/自动淘汰说明、是否退出清理。按钮禁止重入，清理结果真实，正在显示图片可继续用已持有资源到替换时释放；不操作其他账号缓存。

关闭缓存：停止持久读写/预取，回原加载流程；已写数据是否删除由独立清理按钮，不能关开关就删用户其他数据。开发调试force miss与用户设置分离。

页面设置区插入由media_cache_settings小模块负责，index.html位置交07a；app.js大配置映射只做必要几行补丁并登记归属。存储统计不要扫描全部localStorage/Blob在每次获取歌词成功时调用。

### 8.2 旧lx_lyric键

- 兼容精确旧末尾空格和历史变体，parse后normalize检查字段/大小/是否有效歌词，不把旧token/额外对象原样复制。
- 首次需要该曲时惰性迁移，不启动遍历并解析所有localStorage歌词；批量整理只在用户缓存设置页主动或受控idle分块运行。
- 旧key没有可靠账号/服务器/查询指纹，本地/私有文件歌词禁止盲目归给当前账号；无法确认身份的记录保留候选，按当前已验证查询成功后写新cache，或安全隔离待清理，不跨账号直接展示。
- 对确定是同来源同id的公共歌词可兼容读取，但还需核查询参数/版本是否匹配；缺指纹则明确旧兼容的陈旧风险并尽快验证，不能将其永久fresh。
- 新记录事务完成/验证后才删除对应旧来源，失败继续保留；只清目标歌词缓存key，不localStorage.clear，也不清其他账号/设置/凭据。
- server-side缓存与本地IDB分别清理，现有“清理服务端歌词”按钮不得变成清本地所有数据。

## 9. 并行顺序与接入清单

1. 00先登记08、scope/key/版本与文件所有权，02/07b/07a冻结接点。
2. 08独立模块+mock loader+配额/过期/取消测试，可与其他任务并行，不等后端。
3. 与05对齐coverVersion/lyricVersion/ETag；旧服务端按TTL兼容，版本meta是可选新增。
4. 歌词接入loadLyricData及本地文件路径，保PlaybackLyrics会话；02合并后由02接列表封面，08接播放器封面小调用点。
5. 设置/统计/清理，07a插script，验证SW更新不碰媒体库。
6. 集成真实浏览器刷新/断网/多tab/换账号，按07冷热数据对比。

如果02先合并，先用无缓存loadResource兼容接口；08先合并，未接视口的列表不能自行预热，只启当前播放/歌词入口。08不依赖07b数据库升级，但可复用已冻结的scope计算，不因跨库共享代码引入升级锁。

## 10. 定向测试与性能验收

新增test/mediaCache.test.cjs、test/mediaCache.system.test.cjs等沿用已有测试框架；显式node --test新文件，并回归songArtworkCache/playbackLyrics/lyricSettings。只有真实浏览器能证明刷新和Blob/配额行为，mock单测不冒称离线系统验证。

| 类别 | 必测 |
|---|---|
| 身份 | 同名不同id/来源、同id不同服务器/账号、同文件名不同目录、token轮换 |
| 生命周期 | 同请求多consumer、一方取消、全部取消、慢旧版本覆盖、新账号切换 |
| 持久命中 | 首次获取后刷新、第二次打开、断网、IDB连接失败降级 |
| 内容 | 普通/翻译/罗马音/逐字/内嵌，超长/损坏/空歌词；封面类型与候选回退 |
| 版本 | coverVersion/lyricVersion变化、tag/外部lrc修改、304 body缺失、旧服务器无meta |
| 异常 | 401/403/404/5xx、CORS不可读、quota、旧localStorage损坏、private模式 |
| 淘汰 | LRU/TTL/容量/数量上限，当前资源短pin，多tab写/清理统计一致 |
| 释放 | 20次列表开关/行复用/切歌/清理后对象URL与引用有界 |
| 设置 | 歌词旧false保留、封面开关、分别清理、服务器缓存开关独立 |
| 协作 | 离屏图片0次请求、全封面网络≤6、SW更新不删媒体、用户库无影响 |

按07环境，缓存固定100张封面与20首完整歌词再测二次/刷新/离线：
- 未过期且version匹配的本地命中不请求后端/源站；到期重验证另计，不把后台网络漏统计。
- 不打开全库索引/Blob；可见范围内磁盘读取/解码有界，首次miss也不挡音频启动。
- M数据首次打开列表，离屏封面不会被写入缓存，因为没有网络/读取触发；列表close后排队/handle释放。
- 初始目标本地封面可展示P95≤100ms、歌词读取到raw ready P95≤50ms；按设备/资源大小/样本数报告，解析/显示另外计时，未达标定位原因。
- localStorage不存新的歌词正文或封面base64；每次获取不全盘统计；30分钟使用内存、IDB容量、对象URL数量有界。

报告docs/client-media-cache-test-report.md：范围、schema/身份、冷/热/离线对比、请求节省、读取/解码/解析耗时、LRU与失败结果、旧缓存处理、支持环境、未验证项。

## 11. 回滚和完成条件

禁用enableCoverLocalCache/enableLyricCache回原网络/后端流程；缓存模块可保留不读取，无用户歌单格式变更。旧歌词来源清理后新IDB仍可用，若回旧版本需要安全导出兼容或保留迁移adapter，不声称旧localStorage自动恢复。

缓存可损坏时只清当前scope媒体记录，不删lx_music_store/用户SQLite/待同步。版本发布不强制全库清缓存，按schema兼容与kind隔离处理。

- [ ] 封面与完整歌词实际持久化，刷新/再次访问可复用，离线不跨账号展示。
- [ ] 新缓存异步、视口按需、统一封面并发、没有全列表预热。
- [ ] 旧enableLyricCache语义保留，旧键兼容/迁移/清理边界明确。
- [ ] 身份/版本/TTL/LRU/配额/取消/对象URL都经过定向与浏览器验证。
- [ ] 设置可看容量、分别清理/禁用，故障不影响播放或删用户数据。
- [ ] 00总览及02/05/07b/07a接点同步，性能结果/未验证如实记录。

## 12. 给 GPT 的完整提示词

~~~text
在D:\opensource\fn-lxserver执行任务08：封面、歌词在客户端运行时本地持久缓存。先读00、02、05、07总纲、07b、本文件；确认现有loadLyricData已有localStorage缓存/enableLyricCache、PlaybackLyrics已有normalize和会话去重。
开工同时读 docs/plans/research-evidence.md；已确定选择不重新泛化选型，执行本任务对应边界及反例验收，未实测指标不得写成结果。确定原生独立IDB存Blob/完整歌词，有效hit零网络；不照搬YesPlayMusic无条件fetch。真实视口才读媒体，共享consumer取消；独立库不隔离origin配额。见附件第4/7节。
独占media_cache.js/media_cache_settings.js、独立IDB lx_music_media_cache；不升级07b库。Blob/歌词对象异步存，scope=服务器+账号，key=稳定歌曲/文件身份+查询指纹+variant，version/ETag/TTL失效，token不持久化。媒体不是歌单/outbox，不同步缓存。
实现getCover/getLyrics/invalidate/stats/clear/trim/disposeScope最小接口、inFlight多consumer取消/版本防覆盖、事务payload/meta一致、有界内存/LRU/TTL/负缓存、quota一次trim有限重试后原流程降级。访问时间批量写，不每hit落盘、不首屏全库扫描。对象URL引用/release明确，图片解码有界。本期仅原生IDB，不加Dexie/CacheStorage双份；无证据不加Worker。
02负责视口和并发，列表进入视口才查缓存；全封面网络含播放器/重验证共用≤6的调度。你提供适配，由02改ImageLoader/LibraryArtwork；当前播放封面高优先。歌词只当前曲默认不预热队列，loadLyricData先本地命中，再原服务器/源站/内嵌路径；保lrc/tlyric/rlyric/klyric、PlaybackLyrics与旧响应保护，不反复上传本地hit。
稳定版本来自01/05，旧服务器TTL兼容；明确新版本不当fresh，断网旧可信内容可用，401不吞成离线，304无body重取，不存错误HTML/logo/opaque。跨域fetch不可读回现有img且不重复失败，不绕CORS/新建任意代理。
保enableLyricCache旧false与enableServerLyricCache独立，新增封面开关、容量/分项清理/预算说明。旧lx_lyric键包含末尾空格，按需要惰性迁移，账号身份不明不能盲归私有歌词；事务验证后清精确来源，不localStorage.clear。SW/script由07a集成，不能修改导航认证。
定向测试身份/刷新/离线/多tab/取消/版本/quota/CORS/完整歌词/对象URL释放/清理，真实浏览器验证持久化，按07冷热同环境测量，写docs/client-media-cache-test-report.md。不开列表就预热全库，不缓存音频，不写tag，不重构显示/WS。接口/范围变化立即同步00与关联任务书；不要git commit，交付真实数据和未验证项。
09随机/漫游仍只缓存可见或所选歌曲媒体，不预热完整pool，身份和scope与09/07b约定一致。
~~~
