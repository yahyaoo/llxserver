# 任务 02：客户端列表懒加载与图片视口加载

> 先读 `docs/plans/00-overview.md`，特别是第 3.1 节（懒加载按数据归属区分）和第 5 节（文件归属）。
> 09随机/漫游从本地完整歌单/队列选曲，不能只从虚拟行/当前页。02仅渲染结果和维护index映射，不因分页改变本地优先编辑/随机候选范围。

> 调研已完成：[证据与确定选择](research-evidence.md)。采用原生虚拟窗口（初始每侧overscan=4）与独立真实视口图片门控；rootMargin=0，离屏共享fetch仅最后consumer释放时取消。Feishin只借鉴设计，不导入React/源码。见附件第3节。

## 1. 现状与热点（附代码位置）

| 位置 | 问题 |
|---|---|
| `client/music/app.js` `renderQueue()`（约 1729 行） | 每次渲染都对**整个**播放队列执行 `SongFiles.enrich` 或 `SongIdentity.aggregate` 再 `map(playable)`，然后通过 `ClientPerformance.render` 分批**渲染全部行**。5000 首时会生成 5000 个 DOM 行 |
| `client/music/js/songlist_manager.js` `renderDetail`（约 514 行，渲染在约 590 行） | 歌单详情全量渲染，没有分页 |
| `client/music/app.js` `renderResults`（约 4365 行，渲染在约 4430 行） | 已按 `settings.itemsPerPage` 分页，但行模板把 `JSON.stringify(item)` 内联进 onclick，体积大、解析慢 |
| `client/music/js/local_music.js` | 有 `pageSize: 60` 的客户端分页，但通过 `/api/music/custom/list`、`/api/music/cache/list` 拉取**全量**数据后在前端过滤 |
| `client/music/views/recent/RecentView.js` | 拉取全量，然后每次显示 100 条，点“加载更多”时追加 |
| `client/music/js/music_experience.js` `coverCandidates`（约 51 行） | 对每首歌遍历 `loveList`、`defaultList` 和所有 `userList` 做 `find`，复杂度 O(N×M)。还会对每个 `/api/music/` 地址执行 `new URL` 和参数重写 |
| `client/music/components/library-artwork/index.js` `bind()` | **在渲染每一行时**都会调用 `coverCandidates` 并 `JSON.stringify` 写进 `data-artwork-candidates`，即使这一行永远不会滚动到可视区 |
| `client/music/app.js` `lazyLoadImages`（约 4758 行） | 每次渲染后对作用域内所有图片调用 `getBoundingClientRect` 判断是否在视口内（强制同步布局）；rootMargin 只有 100px；没有并发上限；不会取消离屏的请求 |

## 2. 目标

1. 播放队列、歌单详情：虚拟列表只挂可见行+前后overscan；典型视口目标≤60，高视口按可见行+overscan解释，无法固定行高的独立布局允许受控分页。指标按07统一。
2. 音乐库、缓存库：改用 01 号任务的 `/api/music/custom/page`、`/api/music/cache/page`，按页请求，保留现有的分页 UI。
3. 最近播放：改用 `/api/user/recent?offset&limit`，滚动到底部或点击“加载更多”时请求下一页。
4. 搜索结果列表：保留现有分页，去掉内联 `JSON.stringify`。
5. 图片：默认只有真实进入视口（rootMargin=0）的图片才计算候选、读媒体IDB、补全、下载和解码；全局最多同时6个封面网络请求；离屏待执行请求出队，进行中可取消fetch按消费者引用释放。overscan只挂行不加载图片，当前播放器封面独立高优先。
6. `coverCandidates` 平均每次调用降到 O(1)，并且只对可见行计算。

## 3. 范围

**范围内（本任务独占的文件）**

- `client/music/js/music_experience.js`（只改 `coverCandidates` 及其相关辅助函数）
- `client/music/components/library-artwork/index.js`
- `client/music/js/songlist_manager.js`
- `client/music/js/local_music.js`
- `client/music/views/recent/RecentView.js`
- `client/music/app.js` 中的 `renderQueue`、`scrollToCurrentSongInQueue`、`playSongFromQueue`、`removeFromQueue`、`renderResults`、`lazyLoadImages`，以及这些函数使用的行模板
- 新建 `client/music/js/virtual_list.js`、`client/music/js/image_loader.js`
- 提供新script清单与前后依赖，由07a统一插入HTML；不随意末尾追加导致app.js初始化缺全局。

**范围外（禁止）**

- applyMarqueeChecks归07c，localStorage/歌单IDB归07b，媒体持久缓存归08。02只在新行/复用行调用登记/释放hook；不另实现持久缓存。与08冻结getCover和统一网络调度接口，02负责图片接入。
- 不改完整编辑/同步协议；歌单可能来自在线SQLite、ClientSync与IDB镜像，按07b接口读取当前歌单/meta，不能侧栏/初始打开无条件读所有歌单。编辑前需完整该歌单，不提交分页部分当作全量覆盖。
- 不改后端，不改 WS。
- 不改视觉样式（行高、间距、颜色保持不变）。如果为了做虚拟列表必须固定行高，就以现有行的实际渲染高度为准，并把它写成 CSS 变量。
- 不引入任何第三方库。

## 4. 设计

### 4.1 `virtual_list.js`（固定行高的最小虚拟列表）

本项目设计：根据scrollTop/视口高度计算区间+overscan，用占位高度生成滚动条，初始overscan每侧4行。Feishin固定提交验证行窗口/图片门控分离，具体证据见研究附件第3节；本项目自行实现，不导入React或复制GPL源码，未读TanStack源码不作已核实依据。

```js
window.VirtualList = {
  /**
   * @param {HTMLElement} container 滚动容器（overflow:auto），或者传 scrollParent
   * @param {{ count:number, rowHeight:number, overscan?:number, render:(index:number)=>HTMLElement, key?:(index)=>string, scrollParent?:HTMLElement }} options
   * @returns {{ update(count?:number):void, scrollToIndex(i:number, align?:'center'|'start'):void, refreshRow(i:number):void, destroy():void }}
   */
  create(container, options) {}
}
```

实现要点：

- DOM 结构为 `container > .vl-spacer(height = count * rowHeight) > .vl-window(transform: translateY(start * rowHeight))`。
- `scroll` 监听使用 `{ passive: true }`，在 `requestAnimationFrame` 中合并处理，同一帧最多计算一次。
- 可见区间变化时**复用**已有的行节点：按 key 做 diff，不在区间内的节点移除，新进入的节点调用 `render(index)`。不要每次都 `innerHTML = ''` 重建。
- 容器尺寸变化时使用 `ResizeObserver` 重新计算，不监听 window resize。
- 事件委托：行上只写 `data-index`；点击、双击、右键菜单、拖拽等事件统一绑定在 container 上，通过 `event.target.closest('[data-index]')` 找到行。**绝对不能**在每次渲染行时绑定新的监听器。
- `destroy()` 必须移除所有监听器和 observer。
- key必须区分重复曲目的队列条目，不能只用source:id；数据index、过滤index、聚合index、实际播放index要显式映射。节点复用更新data/key和异步generation，不能把上一首迟到封面/菜单闭包挂给新行。
- 固定行高在手机/桌面/字号/多行标题分别测；不改视觉强行固定。无法成立时该布局回退分页/可测高度方案，先说明复杂度与滚动锚点，不悄悄裁标题。
- 维持键盘焦点/aria位置，离屏多选保在数据层；拖拽跨窗口/自动滚动须有完整数据索引，不能仅排序已挂载节点。滚动时菜单/跑马灯/图片handle清理接07c/08。
- 如果列表的滚动容器是页面本身（不是内部 div），请支持传入 `scrollParent`，并用 container 相对于 scrollParent 的 `offsetTop` 计算偏移，offsetTop 只在 resize 时重新读取。

### 4.2 播放队列 `renderQueue`

- 把“聚合与 enrich”从渲染中拆出来：只有在**队列内容变化**时（替换队列、增删歌曲）才执行，用队列的版本号（每次修改时递增）做缓存。仅切歌时只更新 `currentIndex` 和两行的高亮状态（调用 `refreshRow(old)`、`refreshRow(new)`），**不重渲染整个列表**。
- `scrollToCurrentSongInQueue` 改为调用 `vl.scrollToIndex(currentIndex, 'center')`。
- 抽屉关闭时不渲染；打开时再创建或更新虚拟列表。
- 09getNextIndex/playPrev/setPlayMode与预选逻辑保持完整本地currentPlaylist；02虚拟窗口不替换它为可见slice。队列增删/重排递增revision并通知09，预选按entryId/revision失效，不能因复用DOM误播。

### 4.3 歌单详情 `songlist_manager.js`

- 本地歌单（我喜欢、默认列表、自建歌单）：数据从内存中读取，使用虚拟列表渲染。搜索过滤（`ListSearch`）改为过滤出**索引数组**，再交给虚拟列表，不复制歌曲对象。
- 在线歌单详情（已经按页请求的那类）：保持现有的分页请求，但每页的行同样交给虚拟列表或分批渲染，不改请求逻辑。
- 本地没有数据时（例如首次打开新设备、`window.myPersonalListData` 为空），可以调用 01 号任务的 `/api/user/list/songs` 分页只读展示；**这种模式下禁用编辑类操作**，并在 UI 上提示“正在同步歌单”。如果实现成本过高，可以只保留现有的全量拉取，并在 PR 中说明。

### 4.4 音乐库 `local_music.js`

- 列表数据来源改为 `/api/music/custom/page` 和 `/api/music/cache/page`。`pageSize` 保持 60，搜索与排序参数交给服务端处理。
- 页面内存缓存key含scope/source/directory/q/sort/order/offset/limit/version，最近10页且有字节上限；只有该精确页body存在才发送其ETag，304无body重取，版本变化清旧视图。
- 正在请求时如果用户继续翻页或修改搜索词，使用 `AbortController` 取消前一个请求；搜索输入防抖 250ms。
- 需要“全部歌曲”的功能（例如“播放全部”、“全选后批量操作”）：按需调用旧的全量接口，或者分页循环拉取（每页 500 条），在用户点击时再执行，并显示加载状态。不能为了这些功能在打开页面时预取全量数据。
- 01 号任务尚未合并时，先写一个与第 4 节契约一致的适配层 `fetchPage()`：当新接口返回 404 时，回退为“全量拉取 + 前端 slice”。等 01 合并后仍保留这个回退，用于兼容旧服务端。

### 4.5 最近播放 `RecentView.js`

- 首次请求 `offset=0&limit=100`，点击“加载更多”或滚动到距底部 400px 以内时请求下一页。
- 排序切换（时间或次数）时重置并重新请求。
- 404 时回退到旧逻辑。
- 03默认30分钟上报后，最近播放合并本地未确认记录，按操作id去重，不重复计数；排序/总数/下一页offset使用服务端字段，本地overlay不能让offset多加。多次加载后也做虚拟窗口/分页上限，不能1000条全挂且封面不断追加。
- 只在确实接口不支持（404/版本能力缺失）时回退旧全量路径；401/403/5xx不当作不支持，回退请求由适配层只发一次且可观察。

### 4.6 图片加载器 `image_loader.js`

```js
window.ImageLoader = {
  observe(img, resolveCandidates /* () => string[] */, options?) {},   // 只登记，不计算候选
  unobserve(img) {},
  clear() {},   // 账号切换时释放observer/queue/handle
  runResourceTask(priority, signal, loader) {}, // 08/播放器共用网络限流；只在真正网络miss时占slot
}
```

- 每个实际滚动root共用**一个** `IntersectionObserver`，默认 `rootMargin: '0px'`，回调检查isIntersecting；observer数量随活动root有界，不每图创建。隐藏抽屉/视图停用、切root重建，销毁后释放。正常IO路径**禁止**全树 `getBoundingClientRect` 判断可见；初次observe由浏览器通知。
- 图片进入可视范围时才调用 `resolveCandidates()`；结果缓存在 `WeakMap<img, string[]>` 中。
- 加载队列：并发上限 6；后进入视口的图片优先（LIFO，用户快速滚动后，最终停留位置的图片先加载）；图片离开可视范围且尚未开始加载时，从队列中移除。
- 可fetch资源使用AbortController。每个行/播放器有独立consumer；行离屏释放自己的consumer，所有consumer离开才abort底层请求。跨域CORS不可读时回原img路径，不承诺已发img物理取消，但移除待执行任务、阻止迟到结果挂错行；旧版本响应不写新资源缓存。
- 失败回退链沿用 `LibraryArtwork.attach` 的逻辑（候选依次尝试，最后使用 logo 占位）。**新增失败负缓存**：`Map<url, 失败时间>`，10 分钟内不重复请求同一个失败的地址，最多保留 2000 条。
- 所有图片加上 `decoding="async"`，使用固定的 width 和 height 属性避免布局偏移。
- 账号切换事件 `music-account-changed` 触发时调用 `clear()`。
- 08存在时只在进入视口后调用MediaCache.getCover；命中IDB也不遍历全列表读取/解码。列表、播放器、背景重验证统一网络≤6；08不另起预热队列。行复用/移除调用release，对比scope+generation避免迟到结果。
- 失败缓存区分404/确实无图与超时/401/CORS；不能因鉴权或暂时断网长期遮蔽可用图片。无IntersectionObserver时降级原生loading=lazy/受控分页，可少量一次布局检测，不能无限每scroll全树测量。

`lazyLoadImages(root)` 保留函数名（其他地方有调用），内部改为对 `root` 下的 `img[data-src]` 逐个调用 `ImageLoader.observe`。`LibraryArtwork.bind(image, song)` 改为：**不再立即计算候选**，只把 `() => coverCandidates(song)` 交给 `ImageLoader.observe`。

### 4.7 `coverCandidates` 降复杂度

- 新增 `coverIndex`：`Map<"source:id", 包含封面字段的歌曲对象>`，基于 `myPersonalListData` 一次性构建。构建时机为**首次需要时惰性构建**。数据变化时失效：监听现有的歌单保存或同步事件（查找 `myPersonalListData` 被重新赋值的位置，以及 `lx_list_data` 写入的位置）。如果没有统一的事件，就用一个简单的版本号：每次赋值 `window.myPersonalListData` 时递增，构建索引时记录版本号，调用时比较即可。
- `coverCandidates` 中“遍历所有歌单 find”的部分替换为 `coverIndex.get(key)`。
- 鉴权URL只在内存短期缓存，scope/认证generation变化失效，不存入08持久key；避免Map长期保留旧token，原始资源身份与实际请求URL分离。
- 结果缓存：`WeakMap<item, string[]>`，同一个对象重复调用直接返回。注意：如果 item 是每次 map 新建的对象，WeakMap 不会命中，此时依赖 coverIndex 即可。
- **行为必须保持不变**：候选的顺序和内容与改造前完全一致。请为此编写对比测试。
- coverIndex构建也可能O(M)卡首屏，按07b元信息/revision增量维护，首次大构建分块且可取消；WeakMap结果要关联数据/认证版本，原地metadata变化不能永远旧候选。

### 4.8 去掉内联 `JSON.stringify(item)`

- `renderResults` 中的行模板改为 `data-index`，事件委托在列表容器上，通过当前页数组 `pageList[index]` 取得歌曲对象。
- 内联对象序列化只在本范围替换，事件委托含当前scope/视图版本检查；其余交07c审计，不能扩大改动范围。

## 5. 实施顺序

1. 编写 `image_loader.js`，替换 `lazyLoadImages` 和 `LibraryArtwork.bind`（收益最大，风险最小）。
2. 改造 `coverCandidates`，并补充对比测试。
3. 编写 `virtual_list.js`，先接入播放队列，再接入歌单详情。
4. 改造音乐库和最近播放的分页请求（依赖 01，先写适配层）。
5. 改造 `renderResults` 的事件委托。
6. 性能测量，填写报告。

## 6. 风险与回滚

- 虚拟列表会影响拖拽排序、多选（Shift 连选）、右键菜单、“定位当前播放”、键盘导航。请逐项回归，多选状态必须保存在数据层（按索引或 key 的 Set），不能保存在 DOM 上。
- 在设置中增加隐藏开关 `settings.virtualList`（默认 `true`），为 `false` 时走旧的渲染路径，便于出问题时回滚。旧路径代码在本期保留。
- 移动端（`mobileShell`）行高可能不同，需要分别读取 CSS 变量。

## 7. 测试

- 新增 `test/virtualList.test.cjs`：使用现有测试中模拟 DOM 的方式（参考 `test/clientPerformance.test.cjs`、`test/musicExperienceFrontend.test.cjs` 的写法）验证区间计算、overscan、`scrollToIndex`、`update(count)`、`destroy` 后不再响应事件。
- 新增 `test/imageLoader.test.cjs`：并发上限、优先级/LIFO、离开视口出队、负缓存、`clear()`；覆盖overscan挂载不计算候选/读IDB/发请求，同图列表与播放器共享时行释放不abort、最后释放才abort，root切换/隐藏释放、快速复用迟到结果护栏。
- 浏览器5000首首次打开后不滚动观察5秒：除当前播放器外，非可见行候选计算、媒体IDB读、补全、fetch、decode计数均为0；冷/热数据分别测，不能只检查Network而漏全库本地解码。
- 更新musicExperience新旧候选对比，覆盖重复id/原地更新/账号token变化；用查找/遍历计数验证复杂度，真实耗时按07浏览器trace测，不用随机耗时断言造成脆弱测试。
- 回归：`test/songActions*.cjs`、`test/playerBar.test.cjs`、`test/mobileSongMenu.test.cjs`、`test/musicLibrary*.cjs`。
- 命令：`npm run test:unit`、`npm run test:system`。
- 手工测试清单（写进报告）：5000 首歌单打开、快速滚动、搜索、多选、拖拽、右键菜单、定位当前歌曲、切歌高亮；音乐库翻页和搜索；最近播放加载更多；移动端以上操作各一遍。

## 8. 验收标准

- [ ] M数据首屏P50≤300ms/P95≤500ms，典型视口行≤60，高视口/分页按07口径解释；首屏后5秒无延后全量冻结。
- [ ] 快速滚动时，同时进行的图片请求 ≤ 6，Network 面板中不出现非可视区封面的批量请求。
- [ ] 打开播放列表时不会对整张列表发起封面补全请求。
- [ ] 切歌时不重渲染整个队列（Performance 面板中切歌操作的脚本耗时 < 16ms）。
- [ ] 音乐库每次翻页只请求一页数据。
- [ ] 所有现有测试通过，新增测试通过；报告写入 `docs/lazy-list-test-report.md`，包含改造前后对比。

## 9. 给 GPT 的提示词

```
你在仓库 D:\opensource\fn-lxserver 工作。前端为原生JS script，无运行时框架，build:client当前复制静态文件，07a负责样式交付。先读00总览和本文件，执行02列表/图片懒加载。
开工同时读 docs/plans/research-evidence.md；已确定选择不重新泛化选型，执行本任务对应边界及反例验收，未实测指标不得写成结果。采用原生虚拟窗口（初始每侧overscan=4）与独立真实视口图片门控；rootMargin=0，离屏共享fetch仅最后consumer释放时取消。Feishin只借鉴设计，不导入React/源码。见附件第3节。

要求：
1. 只修改文档第 3 节列出的文件和函数；不改 applyMarqueeChecks、idb_store.js、deferred_writes.js、download_manager.js、client_performance.js 中的 ClientSync，不改后端。
2. 最小virtual_list/image_loader，初始每侧overscan=4，固定行高先测不同布局，行key复用/委托/resize/destroy正确；默认rootMargin=0，每活动scroll root共用observer，overscan不触发候选/IDB/补全/fetch/decode。6路封面网络共享、播放器优先；离屏释放consumer、最后consumer才abort可取消fetch，img降级仅保证出队/迟到护栏；能力缺失可受控分页/原生lazy回退并报告限制。脚本依赖交07a统一插入。
3. 播放队列和本地歌单详情改用虚拟列表；切歌时只刷新新旧两行；聚合与 enrich 仅在队列内容变化时执行。
4. coverCandidates 改为基于 Map 索引的 O(1) 查找，候选结果与改造前逐项一致，并写对比测试。
5. LibraryArtwork.bind 不再在渲染时计算候选，改为进入视口后再计算。
6. 音乐库、最近播放改用 /api/music/custom/page、/api/music/cache/page、/api/user/recent?offset&limit（契约见 01 号文档），并实现 404 时回退旧接口的适配层；翻页使用 AbortController 取消旧请求，搜索防抖 250ms。
6a. 分页缓存含scope/query/sort/page，精确ETag才304，鉴权/网络失败不回全量；最近播放合本地未确认overlay，offset不按overlay加，多页DOM有上限。
6b. 与08冻结MediaCache.getCover/runResourceTask，仅视口触发缓存，播放器/列表/重验证共用≤6；节点复用校验generation，release对象URL。稳定key区分重复队列条目，播放/过滤/聚合index映射正确，拖拽/键盘/多选完整回归。
7. renderResults 的行模板去掉内联 JSON.stringify，改为 data-index 加事件委托。
8. 增加 settings.virtualList 开关（默认 true）用于回滚。
9. 新增 test/virtualList.test.cjs、test/imageLoader.test.cjs，更新 musicExperience 测试；运行 npm run test:unit 和 npm run test:system，全部通过。
10. 写 docs/lazy-list-test-report.md，包含 5000 首歌单在改造前后的首屏耗时、DOM 行数、并发请求数。
11. 不改视觉样式，不引入第三方库，不 git commit。完成后列出改动文件、手工回归清单的结果和遗留问题。
12. 按09边界随机/漫游读完整本地缓存，不用当前页/DOM选曲；列表先本地变更再上报，02只更新显示与索引/revision接点。script清单交07a，新增测试直接node --test覆盖。接口/范围变化同步00和关联任务书。
```


### A组交付记录（2026-10-13）

已新增 virtual_list.js 与 image_loader.js，音乐库和最近播放接入分页适配，图片默认真实视口门控并发目标为6；相关定向测试已通过。当前状态为已实现待验证，真实浏览器5000首性能、移动端行高和完整交互回归待集成验收。
