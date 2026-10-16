# 任务 07a：启动、样式编译与静态资源交付性能

> 先读 [00 总览](00-overview.md)、[07 测量标准](07-client-perf-storage-render.md)。本任务负责启动与交付，不负责列表、存储或运行期业务重构。以下路径和定位来自基线，开工时用函数/资源名重核。

> 调研已完成：[证据与确定选择](research-evidence.md)。本地运行时代码已确认Tailwind3.4.17；本期固定3.4.17构建期CSS，使用v3完整类名/有限safelist规则，不照搬4.x文档配置。见附件第7节。

## 1. 现状与待测量路径

- `client/music/index.html` 有大量 CSS、script 和内联初始化；按标签先后建立依赖图，不能把所有脚本统一改 async。统计同步执行耗时、关键 CSS、重复 script，以及解析期间触发的初始化。
- `client/music/assets/tailwindcss.js` 是仓库内的 Play CDN 运行时代码；`client/music/js/tailwind_setup.js` 直接给 `tailwind.config` 赋值，主题把 emerald 各级映射 CSS 变量，桌面断点 `md=1025px`、`lg=1280px`、`xl=1440px`、`2xl=1536px`。该配置必须保留。
- 当前客户端构建 `deploy/scripts/build-client.cjs` 主要将 client 复制到 dist/client；不是现成 bundler。不要把当前项目写成完全没有构建命令，也不要假设有模块打包可立即使用。
- `index.html` 有 pako 外部同步脚本，`user_sync.js` 使用压缩功能；遥测按 CONFIG.disableTelemetry 控制，优化不能悄悄更改其默认产品策略。
- `server/application/http/HttpServer.ts` 静态资源分支存在逐请求 readFile、再验证头；核对实际 ETag/304 顺序与压缩支持，不按“大文件”推断它是最大热点。
- `client/music/sw.js` 静态缓存 `lx-music-web-v28`，API/音频被跳过；activate 当前删除不在 KNOWN_CACHES 中的全部 origin 缓存。新增媒体缓存后不能全域删除其他模块的缓存。
- 独立客户端 `deploy/client/gateway.cjs` 也有交付路径；仅改 HttpServer 不代表独立静态部署受益。网关改动应独立补丁，经集成负责人确认；若未覆盖须如实列验收限制。

## 2. 目标与边界

目标：首屏不运行 Tailwind 编译器；启动依赖顺序可解释；低频功能延后加载且首次使用正常；热资源缓存有效，更新不混版本；不同部署方式均能找到资源。

独占：index.html、tailwind_setup.js、sw.js、Tailwind 配置/输入与生成 CSS、新样式生成脚本、build-client.cjs、package.json/lock 的构建依赖部分。HttpServer 只改静态文件分支，不动鉴权、分页、扫描、歌词/封面 API。管理端静态资源按现有路径复用交付策略，不重做管理 UI。

禁止：引入 Vue/React/Vite 全站迁移；拆整个 app.js；修改 03 的 WS 行为；修改 07b 数据库；改播放器视觉/主题；更改 telemetry 默认；缓存登录 HTML 或动态 config；因清理 SW 删除 08 媒体库。

## 3. 步骤 A：先预编译 Tailwind，消除运行期样式扫描

### 3.1 依赖与配置固定

1. 本次已在本地tailwindcss.js确认版本3.4.17；devDependency固定 `tailwindcss: 3.4.17` 并提交lockfile。执行前若文件已变化先核实新基线并同步总览，不擅自升4.x。构建配置依据v3官方Content Configuration，不复制Play CDN当前4.x配置。
2. 新增 `tailwind.config.cjs`、`client/music/css/tailwind.input.css` 与生成产物 `tailwind.generated.css`，扫描范围包含播放器 HTML、app.js、js、components、views 中实际模板；不要扫描 node_modules、dist、数据/测试快照制造巨大 CSS。
3. 将 tailwind_setup 中 darkMode、断点、CSS 变量映射迁到构建配置；normal 模式不再引用依赖全局 tailwind 的脚本。诊断 Play CDN 路径才注入该配置。
4. 先输出未压缩对比版本，再提交压缩产物。生成文件提交入库，普通开发/启动无需临时安装编译器；样式来源变化时显式重新生成。

### 3.2 动态 class 排查必须逐项完成

排查 classList.add/toggle、字符串模板、条件拼接、HTML 内 inline script、主题/状态切换的 class。content 扫描只能发现完整字面量，不能证明动态组合全部覆盖。

建立 `docs/client-startup-class-audit.md`：源码位置、动态表达式、可能结果集合、对应 safelist/改写。使用有限完整类枚举优先，避免 `/.*/` 或全色系无限 safelist；任意值类如 translate-y-[110%]、伪类/断点/透明度组合逐项验证。无必要不修改业务模板，确需修改按文件负责人提交小补丁。

CSS 顺序保留现有 preflight/主题/组件覆盖关系；检查运行时注入 style 与新 link 的 cascade 是否一致。不要通过加入全局 !important 解决差异。

回归矩阵：浅/深色、全部现有主题、自定义主色、桌面 1024/1025 边界、手机、横竖屏、播放栏、歌词、队列、设置、弹层、多选/拖拽、禁用状态、hover/focus、首次显示的低频功能。必要时截图对比；无样式的隐藏弹层也必须打开测一次。

### 3.3 诊断回退

默认生产只加载静态 CSS。提供 `?tw=cdn` 诊断回退，明确仅排查使用，重新启用旧运行时代码与对应配置；不能先加载 CDN 再隐藏它，或两个模式同时编译/注入样式。尽量用不阻塞正常启动的小启动分支，符合现有 CSP，不用外部网络 CDN 作唯一回退。

保留旧 asset 一个版本周期；回退报告标记模式，不能混用回退 trace 宣称优化收益。确认新 CSS 生成成功后才调整 build:client/资源 manifest；失败应显式停止相关交付，不能发布只有新 HTML 没有 CSS 的目录。

## 4. 步骤 B：脚本依赖图与分阶段加载

### 4.1 先做清单

逐个 script 记录：大小、解析/执行耗时、定义的全局、使用的全局、DOM 初始化时机、是否监听 DOMContentLoaded、是否有顶层副作用、实际首次使用页面、是否重复引用。

分为认证/config、核心工具、播放引擎/状态、主界面、低频功能、第三方。按实际依赖写表，不根据文件名猜。特别核查 `getUserAuthHeaders`、MusicExperience、ListStore、ClientTransport、PlaybackLyrics、主题、组件注册和 app.js 初始化。

### 4.2 defer 改造顺序

- 一次迁一组依赖明确的 external script，保留文档先后顺序；async 只用于不依赖业务顺序的资源，不能给 app.js 加 async。
- defer 的外部脚本与普通内联 script 执行时机不同；同步读全局的内联初始化需一起移到明确入口/DOMContentLoaded 或跟随依赖。不能只改 src 标签。
- DOMContentLoaded 已触发后动态导入的模块不能只注册该事件；使用现有 init 入口或判断 readyState，确保一次初始化。
- 配置/认证尚未就绪时不得提前访问 API；错误显示沿用现有加载 UI。初始化失败不能留下一个可点却没有事件处理的首屏。
- 新模块脚本由本任务统一登记位置，07b/07c/08 只提出“需位于哪些脚本前后”，不随意追加到 app.js 后导致全局未定义。

### 4.3 低频模块按使用加载

优先评估日志、导出/导入、部分高级工具、可视化编辑等真实低频功能；音频核心、主题与立即可点交互保持可用。先做一两个 trace 中明显占启动时间的模块，不一次懒加载全部组件。

最小 `loadScriptOnce(url)`/模块已有 loader 优先复用：进行中 Promise 共用，失败清除进行中标记允许重试；只允许固定模块白名单 URL；加载后等待注册/初始化完成；进入视图显示局部加载状态，重复点击不会重复初始化。取消视图后迟到模块不得往旧容器写 DOM。

为每个延后模块写首次打开、第二次打开、加载失败重试、账号切换、离线测试；手工性能统计要包含“首次功能访问”成本，不能只把启动工作推迟到用户点击后又卡住。

### 4.4 pako 与第三方脚本

核对当前 pako 精确版本和许可证：可选固定版本的本地 vendor，或按真正启用同步压缩时再加载；两者选最小可行方案，不重复一份全局和一份懒加载。压缩/解压结果与原有同步协议兼容，普通 HTTP/离线场景都测试。

遥测仅遵循现有 disableTelemetry；如推迟加载须保留已有事件队列语义，并在报告写明行为差异。不能给遥测也造大规模缓冲队列。字体/icon 只基于实测处理；只预加载首屏确实使用资源，禁止把所有 CSS/JS 全部 preload。

## 5. 步骤 C：资源缓存、压缩与部署一致性

### 5.1 缓存头按资源类别

| 资源 | 推荐策略 | 必须确认 |
|---|---|---|
| 内容 hash 的静态 CSS/JS/字体 | public + 长 max-age + immutable | 路径里的 hash 确随内容变化，旧产物保留升级窗口 |
| 未 hash 的静态 CSS/JS | no-cache 或短缓存 + ETag/Last-Modified | 不能对同 URL 可变文件设一年 immutable |
| index.html/登录文档 | 沿用认证与重新验证要求 | 不用 SW 离线 HTML 绕过登录校验 |
| /js/config.js 等运行配置 | 保留动态策略，通常禁止陈旧重用 | 客户端独立部署指向不同服务器时仍正确 |
| 媒体封面/歌词 API | 由 05/08 定义 | 本任务不调整其 private/scope/版本规则 |

优先使用现有构建版本机制；不足时增量加 manifest/hash，不要引入完整 bundler。动态脚本 loader、SW 列表和 HTML 都从同一 manifest/版本生成，避免三个手工表漂移。hash 是对静态文件构建期生成，不能每个请求计算大文件。

### 5.2 减少磁盘读取与压缩开销

- 本期确定小型有界内存缓存，复用首次读取的静态body及协商后的编码表示，不新增预压缩产物发布流程。按路径+发布版本/mtime/size失效，未命中才异步读取/压缩，同版本inFlight去重；压缩并发初始1。缓存总预算初始16MiB（含原始与压缩表示），单文件上限2MiB，超限仍正常交付但不入缓存；开发更新及时失效。预算是本项目起点，报告内存/冷请求成本，不当已测最优值。
- ETag 匹配时在读取 body 前返回 304；若为压缩表示使用对应 ETag/长度，`Vary: Accept-Encoding` 正确，不混发压缩长度和原始体。
- 压缩只针对文本资源；图片/音频/已压缩内容不重复压缩。Range/流式音频/下载路径不走静态压缩分支。
- Accept-Encoding 要正确协商，包括客户端不支持压缩的情形；HEAD、304 无 body；Content-Type、Content-Encoding、Content-Length 一致。
- 文件路径安全/认证逻辑沿用原实现。客户端资源更新不可把用户目录文件加入静态公开目录。
- 如果静态网关/反向代理已负责压缩，不重复动态压缩；记录各部署方式实际响应头与 transfer size。独立 gateway 未覆盖的差异明确列出，不能宣称全部署达标。

## 6. 步骤 D：Service Worker 的更新和清理边界

- SW 只管理自身静态 cache 前缀；activate 仅删除该前缀的旧版本，不删除所有 origin CacheStorage。08 首选独立 IDB，但仍为未来其他缓存保留边界。
- 继续跳过 API、音频、下载、动态 config、导航/登录文档；不因为需求“本地缓存”就让 SW 缓存任意鉴权响应。
- 安装资产包含生成 CSS；必要核心资产缺失应报告安装失败，低频模块不强制首安装下载全部。检查离线 shell 可用边界与当前认证要求一致。
- 新静态资源 hash 与 SW 版本统一；更新过程中旧页不混新模块。skipWaiting/clients.claim 是否保留须评估：播放中升级不能刷新/停音频；如需提示更新，用户可在方便时应用。
- 资源失效/网络失败返回值可用；caches.match 没命中不能返回 undefined 造成隐蔽失败；沿用可解释失败 UI。
- 提供清理“静态资源缓存”的诊断方式，与 08 的“封面/歌词缓存”按钮分开，不能一键删歌单或待同步队列。

## 7. 依赖、分阶段提交与回滚

先完成 07 基线，阶段1预编译 CSS，阶段2依赖明确的 defer/一两个懒模块，阶段3静态头与压缩，阶段4 SW 更新。每阶段独立可测/可撤销，不要求一次全部上线。

07b/07c/08 的新 script 清单由本任务插入；07c 不再观察 Tailwind 运行时代码的正常启动成本；08 不改 SW 静态策略。共享 package.json 由集成负责人汇总，新增定向测试不是自动加入 test:unit。
09新增roaming_core→roaming→app依赖，使用现有浏览器/CommonJS公共资源加载方式；源码/独立服务端/独立客户端必须包含同一纯核心。不要懒加载到点击随机才发现算法全局不存在；纯核心足够小优先随基础脚本交付。

回滚：静态样式可用 tw=cdn 诊断；交付策略可恢复再验证头和旧资源路径；script 延后可恢复原顺序；保留最近一版静态资源供旧页使用。没有涉及用户存储迁移，不应通过“清空全部缓存”来回滚。

## 8. 验证和验收

- 样式生成与动态 class 覆盖、断点/主题截图；依赖缺失、DOM ready 后懒加载、加载失败重试、重复 init 定向验证。
- 静态 HTTP 测试：首次/304/HEAD/不同编码/非 hash 更新/Range 不受影响/认证页面无缓存旁路；SW 新旧升级与缓存前缀清理。
- 在现有 test/deployment、theme、accountLogin、clientPerformance 等相关测试中选择覆盖风险的用例；新增模块直接 node --test 指定文件。因改变构建产物，实施阶段应运行必要样式生成及 build:client；不强制构建无关后端或打包安装包。
- DevTools 冷/热启动各测，记录主线程执行、样式重算、传输量、关键资源瀑布和首功能访问。性能指标沿用 07，不凭资源减少百分比判通过。

验收表：
- [ ] 正常启动没有 Tailwind 浏览器编译器或该编译器的全局 DOM observer。
- [ ] 所有动态类、主题和 1024/1025 断点行为一致；tw=cdn 回退能单独使用。
- [ ] 核心可交互定义真实，低频首次使用正常，无重复注册/全局未定义。
- [ ] 静态 304 避免重复读取 body，压缩/更新有效，各部署方式差异已记录。
- [ ] 播放中 SW 升级不停止播放、不混版本、不误删媒体/用户缓存。
- [ ] 报告 `docs/client-startup-test-report.md` 有真实前后对比与未验证项；子任务变更已同步 00。

## 9. 给 GPT 的完整提示词

```text
在 D:\opensource\fn-lxserver 执行07a。先读 docs/plans/00-overview.md、07-client-perf-storage-render.md、本文件，核对当前代码；只负责启动和静态交付。
开工同时读 docs/plans/research-evidence.md；已确定选择不重新泛化选型，执行本任务对应边界及反例验收，未实测指标不得写成结果。本地运行时代码已确认Tailwind3.4.17；本期固定3.4.17构建期CSS，使用v3完整类名/有限safelist规则，不照搬4.x文档配置。见附件第7节。
先给全部script/CSS列实际依赖、副作用和耗时清单，记录冷/热启动。将本地Tailwind Play CDN换为固定3.4.17构建期CSS，保留theme变量、darkMode与md=1025断点，扫描动态class并有限safelist，提交生成CSS；默认无运行时编译，提供仅诊断tw=cdn回退。
按依赖组迁defer，内联初始化同步迁移；低频模块仅在测量证明有收益时按需加载，复用进行中Promise、可重试、一次init、DOM ready后仍初始化。pako核版本/许可证后本地化或按需，保持协议；遥测默认不改。
只在HttpServer静态分支优化再验证、hash缓存与压缩：本期有界内存body/编码表示缓存（总16MiB、单文件2MiB、压缩并发1，版本/stat失效），不新增预压缩发布链；非hash不immutable，304早返回，Vary/encoding/length/HEAD正确，不改音频Range或认证。兼顾独立gateway，未覆盖列限制。SW只清自己前缀，保持API/音频/导航排除、更新不断播放、不删08媒体库。
本任务拥有index.html/sw.js/tailwind配置/build-client构建依赖；接收其他组新script清单统一登记。禁止全站框架/bundler迁移、app.js大拆分、存储或WS重写、视觉改版。
09公共roaming_core必须先于roaming/app可用、独立服务端资源路径可找到；只管交付，不改本地抽样/权重算法。
分阶段验证样式/启动顺序/静态HTTP/SW升级风险，必要时运行样式生成和build:client，不打包无关安装包。按07复测，写docs/client-startup-test-report.md与class审计。不伪造性能或外部调研。范围/接口变化同步00总览；不要git commit，交付改动/数据/回退/未验证项。
```

## D 组实施记录（2026-10-13）

状态：已实现待部署环境复测。新增 Tailwind 3.4.17 构建配置/生成脚本、静态 CSS、`?tw=cdn` 诊断入口；pako 2.1.0 本地化并保留许可证；脚本依赖组按顺序 defer；HttpServer/独立 gateway 使用有界静态 body/编码缓存；SW 只管理自身前缀并排除导航、config、API、音频。

验证：`npm run build:client`、静态交付/SW/deployment/theme 定向测试通过。合并时保留 `build:styles`→`build-client` 顺序，若其他组新增脚本须由此页统一登记；生产代理压缩、全主题截图、真实播放升级及独立网关压缩流仍待集成复测。回退可用 `?tw=cdn`，不清理用户 IDB。
