# 任务 07c：运行期渲染、事件、观察器与播放热路径

> 先读 [00 总览](00-overview.md)、[07 测量标准](07-client-perf-storage-render.md)。按用户操作 trace 定位热点、按函数逐个治理。文中措施是待实施方案。

> 调研已完成：[证据与确定选择](research-evidence.md)。scheduler.yield已核官方语义但并非全面可用；能力检测+setTimeout降级，事务外分块，优先去重复工作而非增加Worker。见附件第7节。

## 1. 候选热点与责任边界

| 基线路径/入口 | 潜在成本 | 本任务动作 |
|---|---|---|
| components/music-tools/index.js | music-shell subtree+attributes变化后全局查song-row-actions | 去无关attributes、局部增强/显式挂载 |
| views/mobile-shell/SongRowMenu.js | body subtree观察，与其他组件重复 | 局部容器/一次委托、生命周期释放 |
| components/dialog/DialogChrome.js | body subtree观察、反复包装弹层 | 稳定弹层根、只处理新增节点、幂等 |
| mobile-shell、player-detail、player-bar、client-channel、PlayerFeaturePages | 多个observer/resize/事件 | 核实际触发对象，不盲目全删 |
| app.js renderMyLists | 多调用点全歌单聚合、清空重建 | revision驱动meta、节点差量、合并调用 |
| app.js timeupdate 与play_statistics | 高频查DOM/写文本/布局、多监听 | 缓存节点、变化才写、业务/显示分离 |
| app.js applyMarqueeChecks | 布局读写交错 | 可见候选、批量测量/写入、局部失效 |
| app.js 逐字歌词、js/wave.js、js/visualizer.js | 多rAF、隐藏/暂停仍计算 | 活跃条件、唯一循环、恢复同步 |
| scroll/resize、弹层工具 | 捕获全局监听、重复布局、销毁不全 | 按打开绑定、关闭解绑、按帧合并 |
| client_performance.js render | 20条/6ms分批、取消边界 | 保接口、优化让出前先实测 |
| CSS模糊/阴影/无限动画 | layout/paint/GPU成本 | 有trace再优化，保持视觉 |

以函数名/observer配置定位，不依赖旧行号；07a删除正常启动Tailwind runtime后重新trace，避免优化已消失的observer。

独占 app.js 中 timeupdate、applyMarqueeChecks、renderMyLists、全局事件生命周期；表中组件的observer/事件/动画部分；ClientPerformance.render与必要小布局调度；wave/visualizer显示循环，不改音频路由/音效算法。

禁止：02的renderQueue/renderResults/虚拟列表/行模板/ImageLoader/coverCandidates；07b的持久化实现/savePlaybackState；03的同步周期/download_manager/WS；08的loadLyricData持久缓存。共享调用点由负责人提供小补丁，集成合并，不覆盖整个函数。
09拥有本地随机/漫游核心、getNextIndex/playPrev相关分支、权重projection和预选失效；本任务只优化显示，不能把未同步本地列表改成远程返回或删有效播放计数hook。

## 2. 开工前的热点审计表

限定client/music路径用rg列MutationObserver、ResizeObserver、addEventListener、setInterval、requestAnimationFrame、innerHTML，排除vendor；innerHTML不是全部都要改。

每项写：文件/函数、注册时机、真实频率、对象数、单次/累计耗时、是否布局读写、失效/销毁、归属、拟改法。对比播放60秒、队列/歌词/弹层打开关闭和后台恢复。

先修最高3～5项；低频/未调用旧代码须追调用再删。每项按“定位→改法→状态边界→功能回归→计数/trace→回退”独立交付。

## 3. MutationObserver：全文档扫描改局部更新

### 3.1 music-tools

1. 追踪产生song-row-actions的render/挂载函数，优先已有after-render hook显式增强；02仅提供小行挂载hook，不改observer内部。
2. 仍需observer时只观察稳定宿主，childList为主；确需attributes就attributeFilter。播放进度style、跑马灯class不能触发工具全树增强。
3. 仅从records.addedNodes检查节点自身/子树，不每回调querySelectorAll整个document/music-shell；同容器同帧批一次。
4. 增强幂等，避免重复按钮/监听；虚拟节点换歌曲时更新身份/状态，WeakSet不能作为内容永远不变的依据。
5. 自己新增class/按钮不产生观察循环；disconnect再重连可能漏外部变化，优先只观察真正需要的内容。
6. 稳定容器事件委托，操作时读取当前key/视图映射，不闭包保存旧歌曲。

回归桌面/移动菜单、工具按钮、行复用、再次打开、异步添加；一次timeupdate/歌词高亮不触发全局增强，20次挂载后按钮/observer/监听数不增长。

### 3.2 SongRowMenu、DialogChrome与其他组件

- SongRowMenu只在移动shell真实列表根观察，click委托能覆盖则不用body observer；切桌面停止，保右键/长按/触摸默认取消逻辑。
- DialogChrome接已有open/close或稳定modal root，仅处理新弹层、包装幂等；保focus trap、Esc、背景关闭、滚动锁。
- PlayerDetail/PlayerBar用显式状态更新入口，DOM观察不能成为播放时间同步机制。
- 确需body兼容注入的观察器给明确理由、childList过滤和计数；不为所有不相关组件造一个复杂管理框架。
- 回调重活排入视图作业，关闭视图取消；不为每节点另起setTimeout，不操作detached DOM。

测试mount/change/unmount、disconnect、监听取消、幂等；计数断言无全树查询，最后浏览器trace验证layout，mock成功不代表无布局抖动。

## 4. renderMyLists：元信息与侧栏差量更新

### 4.1 不每次读取/聚合全部歌曲

列全部调用方：启动、收藏、编辑、同步、metadata/文件状态、当前播放、视图切换；注明哪些真的改变侧栏。

用07b元信息/revision事件；首次构建id→meta/节点，后续changedListIds/removed/orderChanged更新。07b未合并可在明确mutation入口生成版本，不每次侧栏渲染比较/聚合所有歌曲。

count/cover/meta以歌单revision缓存；原始数量与去重数量不能混淆。增删/来源metadata变化使聚合失效，不用songs.length冒充去重结果。封面只保有限候选引用，实际请求归02/08视口策略。

song_files.enrich/aggregate如有全量需求，只在内容变化作业执行一次；02队列和侧栏避免重复相同聚合。不能复用时分别记录成本，提出最小共享点。

### 4.2 DOM与调用合并

- id→node复用，改名/数量/封面变化才写，选中只切旧/新节点class，不innerHTML全部清空。
- order变移动节点，保展开/焦点/滚动/拖拽；拖拽中暂不重排，结束后应用或用已有Sortable更新。
- 同一链路多次renderMyLists合并到一次可见帧；先确认调用者同步返回要求，必要时保签名内部计划更新。
- 隐藏只记dirty，出现再刷新；存储按07b继续。账号切换清meta/节点引用，迟到作业核scope+generation。

测试：改一首只改相关meta、改名不重新聚合、切歌不全量统计、远程替换/导入/清空/排序/收藏均正确。相同rev无aggregate，首次聚合成本单列，不能转到延迟任务后仍长期冻结。

## 5. timeupdate：保业务，减少显示工作

### 5.1 三类工作先分清

业务：统计、淡入淡出、结束/续播、进度保存、MediaSession。显示：时间、进度、当前歌词。装饰：波形/背景/旋转。仅显示/装饰可不可见暂停；删“重复监听”不能丢播放统计。

### 5.2 节点与变化检测

挂载缓存time-current/time-total/progress节点，节点重建显式invalidate；没有节点不每timeupdate全document查。桌面/移动共享来源但可见节点都更新。

比较格式化后的文本，秒数不变不写；duration未知/NaN/Infinity用原占位，不写NaN%。进度可测scaleX transform，但transform-origin/seek/buffer/已有transform必须正确；不等价就保width并按变化/帧合并。

平滑进度最多单rAF，仅可见且播放运行，不每timeupdate新无限loop；拖进度即时响应，不能为少写把显示延迟1秒。

### 5.3 seek/切歌/后台

- 拖动时用户预览优先，timeupdate不覆盖；seek后立即同步。
- 切歌/loadedmetadata/durationchange/pause/play/ended/倍速使缓存失效，total不沿用上一首。
- hidden跳过不可见DOM/装饰，保统计/保存/MediaSession/播放/03协议心跳；后台低CPU不等于停止业务。
- visible恢复只刷新当前快照，不补跑遗漏帧。歌词按audio.currentTime定位，不慢慢追旧行。
- play_statistics如重复计算可复用结果，不改计数、有效播放阈值、漫游权重和播放顺序。

测试暂停/倍速/seek/短歌未知时长/淡入淡出/20次切歌/前后台/锁屏/iOS。按07统计脚本成本，加DOM writes/秒、节点查询；恢复只一次同步。

## 6. 跑马灯：可见测量、读写分离

保applyMarqueeChecks(root)；只登记root新/变化元素，不每次全document扫描；02行挂载登记、移除/复用释放并更新。

- 每滚动根少量IntersectionObserver且root正确，可见/可能溢出才测；隐藏容器0宽不能据此永久判断不溢出。
- 一帧先读dirty候选scrollWidth/clientWidth，再统一写class/style；禁止A读写→B读写。
- ResizeObserver只标dirty，避免回调里改尺寸循环；同帧合并，移除元素unobserve。
- 文本/字体ready/字号/宽度变失效，仅刷新受影响可见元素，不interval全扫描。
- 保速度/hover/截断/功能开关，尊重reduced-motion；关闭功能不注册observer。
- WeakMap配合强引用Set时必须释放，不能无限保留离屏/删除节点。

测试长短文本、字体晚到、折叠/展开、横竖屏、字号、行复用。trace测layout，长期observed数量有界。

## 7. scroll、resize与监听生命周期

### 7.1 弹层事件

music-tools/DownloadOptions/PlaylistEditor等捕获scroll仅打开时绑定，close/destroy/account切换移除。需要立即关闭可先改状态，昂贵测量按帧合并，不每scroll计算所有弹层。

不preventDefault才passive；拖拽/触摸需取消默认时不能强设。委托closest后校验属于本容器，嵌套列表不误操作。

用已有dispose或AbortController.signal能力检测，保removeEventListener降级；capture匹配，匿名回调要存引用；mount不能重复全局注册。

### 7.2 布局调度

优先ResizeObserver实际容器；剩余window resize按帧/必要防抖。已有调度器先复用；几处真实共享需求才加最小read/write队列，不造优先级框架。

job可取消、先读后写、只可见视图参与、错误不阻塞其他任务、pending rAF≤1；隐藏暂停视觉job，恢复当前dirty。可靠存储不能塞只靠rAF的队列。

回归resize/手机键盘viewport/横竖屏/弹层焦点和位置；20次往返监听数不涨。

## 8. 歌词、Canvas与装饰动画

为每循环列owner/start/stop/rAF id与条件：document可见、视图可见、audio状态、开关、节点isConnected。pause/关闭/切view/账号/卸载cancel，恢复只启动一次。

### 8.1 歌词

- 复用PlaybackLyrics/LinePlayer解析与行号，底栏/详情不能分别parse；08仍通过原normalize/解析链。
- 行高/中心几何仅字体/窗口/视图变化测，逐字rAF用缓存/时间，不每帧getBoundingClientRect/查所有字符。
- 只更新活跃行/变化字符，不刷整份歌词；逐字关闭停loop。
- 自动滚动在行切换/seek必要时触发，保用户滚动锁/恢复按钮，不每帧scrollIntoView。
- 隐藏停显示、时间基准继续，恢复按当前time定位；切歌显示也核会话版本。

### 8.2 wave/visualizer

- 不可见/暂停停绘制，不关闭共享AudioContext或断必要音频节点。
- 复用TypedArray，不每帧大数组/选节点/取context；仅resize/DPR变调整Canvas，DPR上限须实测。
- 低采样/帧率可用用户低功耗模式，正常视觉保持；双组件共享analyser不互相销毁。
- 第三方wave用公开stop/destroy，不改vendor；缺能力如实列限制，别宣称已停。

### 8.3 CSS动画

隐藏状态暂停旋转/背景等装饰，视图不可见同样处理；恢复状态正确。用户开关/reduced-motion优先，不一刀切所有animation影响弹层业务完成事件。

指标每类活跃loop≤1、隐藏装饰loop=0、30分钟引用/数组有界；逐字与可视化开启成本另列，不关功能冒充相同场景收益。

## 9. 分批重活与CSS成本

### 9.1 ClientPerformance.render

保render(container,items,append,afterBatch)、cancel、boolean结果语义；每await后核job，afterBatch也算预算，不能append6ms后回调再卡50ms。

特性检测globalThis.scheduler?.yield，不支持用setTimeout Promise；MessageChannel可实验但不保证先绘制，不用微任务代替让出。先保6ms/20条，再trace调4～8ms，不直接改8ms/删行数保护。

02先限制可见DOM，分批不是全量渲染替代。隐藏可取消重建渲染，业务不能依赖后台rAF。Promise.resolve/queueMicrotask仍是微任务，不作为让出；scheduler.yield/setTimeout也不保证每次都绘制。与07b/08接点中分块发生在IDB事务外，不为了6ms预算跨任务持事务。

重活先缩范围/缓存；仍有>50ms任务才评估纯计算Worker，计入postMessage克隆与fallback，不每render spawn或无证据建多个worker。

### 9.2 CSS

- content-visibility/contain仅验证过的独立区域，查锚点/查找/辅助访问/滚动尺寸；隐藏页优先原display机制。
- paint containment可能裁菜单/阴影，layout可能影响sticky；与02协调，不全列表盲加。
- trace证实backdrop-filter/阴影成本再提局部/低功耗建议，正常视觉不擅改。
- 封面尺寸/占位归02/08，避免重复；will-change仅少量临时动画对象，用后释放，不能铺满GPU内存。

## 10. 验证、报告与回滚

沿用musicTools/dialogChrome/mobileSongMenu/playerBar/playerDetail/playbackExperience/clientPerformance定向用例；生命周期至少mount→change→unmount验证，不只源码字符串断言。新测试不在显式脚本时直接node --test指定。

功能回归歌词各模式、seek/暂停/倍速/淡出、后台锁屏、工具弹层拖拽焦点、列表编辑同步、移动断点；性能/30分钟内存/20次往返按07。

报告docs/client-runtime-test-report.md逐热点列原/新回调、时长、DOM查询/写、observer/listener/rAF、layout/paint。计数不等于体验，附场景trace。

子项可回退原更新入口一个版本周期，错显示不清用户数据。存储/WS回退归其负责人，不用关闭全部功能换指标。

验收：
- [ ] timeupdate/歌词style不触发全树增强，重复挂载不重复observer/listener。
- [ ] 相同revision侧栏无全歌单聚合，单项差量、拖拽/焦点保持。
- [ ] 播放业务不变、相同文本不写、隐藏UI不写、恢复一次同步。
- [ ] 跑马灯范围有界、读写分离、复用节点/销毁无旧job。
- [ ] 歌词/Canvas/装饰循环可暂停、唯一、恢复不重复，不破坏音频。
- [ ] 同设备/同功能场景达标或解释原因，未验证明确列出。
- [ ] 02/03/07b/08边界与00一致，范围变化同步总览。

## 11. 给 GPT 的完整提示词

~~~text
在D:\opensource\fn-lxserver执行07c。读00、07总纲、本任务及02/03/07b/08接点。只负责timeupdate/applyMarqueeChecks/renderMyLists、指定observer/事件/动画、ClientPerformance.render与小布局调度；不改列表窗口、持久层、媒体获取、WS调度。
开工同时读 docs/plans/research-evidence.md；已确定选择不重新泛化选型，执行本任务对应边界及反例验收，未实测指标不得写成结果。scheduler.yield已核官方语义但并非全面可用；能力检测+setTimeout降级，事务外分块，优先去重复工作而非增加Worker。见附件第7节。
真实trace和生命周期审计后按成本排序。music-tools/SongRowMenu/DialogChrome改显式挂载或局部addedNodes，幂等、attributes过滤、一次委托、销毁清理，保移动菜单和弹层焦点。侧栏用07b meta/revision，统计缓存、按id复用、差量和合并，切歌不全歌单aggregate，拖拽/同步/账号正确。
timeupdate区分业务/UI，保统计淡出续播保存MediaSession，缓存节点、相同文本/进度不写，拖动优先，隐藏停UI、恢复当前快照。跑马灯局部可见、批量读后写、ResizeObserver失效，保字体/文本/行复用，释放引用。
scroll/resize按生命周期注册，重活合帧；要preventDefault不可passive。歌词当前行/字更新、几何缓存、用户滚动锁不变；Canvas数组复用，可见播放才画，停显示不关音频图。rAF唯一，销毁/隐藏清理，恢复按当前time。
render保API/cancel，检测globalThis.scheduler?.yield，setTimeout降级，微任务/MessageChannel不保证绘制；保6ms/20条后实测调。CSS containment验证菜单/sticky/查找，不擅改视觉，无证据不加Worker/通用框架。
按07做定向行为验证、trace、30分钟与20次往返观察，写docs/client-runtime-test-report.md。不得关闭功能冒充收益、编造外部调研/实测。范围变化同步00，不git commit，交付实际数据/回退/未验证项。
09本地随机/漫游与projection不重写；只优化显示，不删有效播放统计，候选不是DOM当前页。
~~~

## D 组实施记录（2026-10-13）

状态：已实现待集成复测。完成分块让出、布局读写调度、timeupdate UI 节流、跑马灯局部 IO/RO、侧栏 meta/revision 复用、歌词逐字缓存、频谱唯一可停循环，以及 mobile/tools/dialog/player 生命周期清理。

验证：相关 07c 定向用例及频谱生命周期通过；浏览器 M 数据侧栏 30 次 P50 16.6ms、P95 18.5ms。仍待真实播放、iOS/锁屏、30 分钟引用观察、全部歌词模式和低配设备复测；未达到预算的启动 trace 已记录，不以局部数据替代整体验收。
