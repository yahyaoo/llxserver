# 任务 01：服务端分页只读列表接口

> 先读 `docs/plans/00-overview.md`。本任务只负责**后端接口**，前端改造由 02 号任务完成。

> 调研已完成：[证据与确定选择](research-evidence.md)。分页身份与取消策略已按Feishin固定提交核实设计方向：本项目仍自行实现只读分页，保scope/query/page/version，禁止因此改完整编辑协议。见附件第3节。

## 1. 背景与现状

| 接口 | 现状 | 问题 |
|---|---|---|
| `GET /api/music/custom/list` | `HttpServer.ts` 约 1972 行 → `PlaylistController.getMusicCustomList` → `CustomMusicService.getCustomMusicList`（约 362 行） | 一次返回全部条目；每条都复制出一份 `songInfo`；**每次请求都会调用 `ensureMusicScan(username)`** |
| `GET /api/music/cache/list` | 约 1953 行 → `getMusicCacheList` → `FileCacheService.getCacheList`（约 1166 行） | 全量返回 |
| `GET /api/user/recent` | 约 1686 行，由 `handleExperience` 处理 | 全量返回，前端 `RecentView.js` 自己每次显示 100 条 |
| `GET /api/user/list` | 约 1559 行 → `getUserList` | 全量返回全部歌单及歌曲（客户端以此为准做编辑，**保持不变**） |
| WS bootstrap | `ClientChannel.ts` 的 `bootstrapRoutes` 包含 `/api/music/custom/list`、`/api/music/cache/list` | 连接一建立就推送全量音乐库（由 03 号任务在本任务完成后移除） |

## 2. 目标

1. 为音乐库、缓存库、最近播放提供 `offset/limit` 分页、搜索和排序，响应体只包含当前页。
2. 为歌单提供只读的“元信息列表”和“分页歌曲”接口，供本地缺数据的场景使用。
3. 所有分页接口返回 `version`，并支持 `If-None-Match` → `304`，让客户端缓存可以复用。
4. 列表接口不再触发扫描（扫描由 04 号任务的后端调度负责）。

## 3. 范围

**范围内**

- 新增接口（见第 4 节）及其服务层实现、内存索引缓存。
- `getCustomMusicList` 去掉 `ensureMusicScan` 调用，改为只读取索引；若 04 号任务尚未合并，可以保留一个“索引为空时触发一次扫描”的兜底。
- 新增单元测试和系统测试。

**范围外（禁止）**

- 不删除、不修改旧接口的返回结构（`/api/music/custom/list`、`/api/music/cache/list`、`/api/user/list`、`/api/user/recent` 的无参调用必须与现在完全一致）。
- 不改歌单的写接口，不实现基于分页的局部编辑。
- 不改 `ClientChannel.ts`（bootstrap 调整由 03 号任务负责）。
- 不改前端文件。
- 不改 Subsonic。

## 4. 接口契约

通用查询参数：

| 参数 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `offset` | int ≥ 0 | 0 | 起始位置 |
| `limit` | int 1～500 | 100 | 每页条数；超过 500 截断为 500 |
| `q` | string | 空 | 关键字，匹配歌名、歌手、专辑，不区分大小写；对中文做 `toLowerCase` 加去空格的 `includes` 匹配即可 |
| `sort` | string | 各接口默认值 | 白名单字段，非法值返回 400 |
| `order` | `asc`/`desc` | 各接口默认值 | |

通用响应：

```json
{
  "total": 20000,
  "offset": 0,
  "limit": 100,
  "version": "c-1739245123000-20000",
  "items": [ ... ]
}
```

- `version` 是数据集revision；响应ETag另包含认证scope、version、source/directory、规范化q/sort/order、offset/limit，标识当前页表示。不能给不同页/搜索结果相同ETag。鉴权通过后才判断304，响应体为空；私有列表使用private, no-cache。
- version由真实数据mutation递增（覆盖同条数的metadata修改、重排与删除），重启可带持久版本/epoch；单靠时间戳+条数可能碰撞。禁止每请求全量JSON序列化求hash。
- ETag只在有该精确页面body缓存时发送；客户端拿到304但无body应重请求。page1的ETag不能用于page2。分页之间version变化时返回新version，02清旧页/重建当前结果。
- `total` 是应用 `q` 过滤后的总数。

### 4.1 `GET /api/music/custom/page`

- `sort` 白名单：`name`、`singer`、`album`、`mtime`（默认）、`interval`；`order` 默认 `desc`。
- 额外参数 `directoryId`（可选，只看某个目录）。
- `items` 中每条结构与旧 `custom/list` 中的单条**完全相同**（包括 `songInfo`），这样前端可以复用现有渲染逻辑。另外新增两个字段：
  - `coverCached: boolean`：后端封面缓存是否已存在（只查内存或 `fs.existsSync`，不允许在分页接口里提取封面）。
  - `coverVersion: string`：可选媒体版本，供05响应再验证与08本地缓存失效；只在资产真实变化时变，不随整个库扫描变。
  - `lyricVersion: string`：可选，由05提供已有歌词缓存/外部.lrc/内嵌来源版本；不存在先省略，旧客户端兼容。分页接口不临时提取资源来计算版本。
- 额外返回 `scan: ScanStatus`（复用 `getScanStatus(username)`），前端用它显示“正在扫描”。

### 4.2 `GET /api/music/cache/page`

- 与 4.1 相同的形状；`sort` 白名单：`name`、`singer`、`album`、`time`（默认，下载时间）。
- 支持 `?user=_open` 公共歌曲，权限校验与旧 `cache/list` 一致（直接复用其鉴权代码路径）。

### 4.3 `GET /api/user/recent` 增加分页参数

- 不带 `offset`/`limit` 时行为与现在完全一致。
- 带参数时返回通用分页结构；`sort` 只支持 `time`（默认 desc）和 `count`（播放次数）。

### 4.4 `GET /api/user/list/meta`

返回当前用户全部歌单的元信息，**不包含歌曲**：

```json
{ "version": "...", "lists": [ { "id": "love", "name": "我喜欢", "count": 5231, "updatedAt": 1739245123000, "cover": "..." } ] }
```

`cover` 取歌单自身封面，没有时取第一首有 `img` 的歌曲，最多检查前 20 首。

### 4.5 `GET /api/user/list/songs?id=<listId>&offset=&limit=&q=`

返回指定歌单的分页歌曲，使用通用分页结构。歌单不存在时返回 404。

## 5. 实施步骤

1. **阅读**：`PlaylistController.ts`、`PlaylistService.ts`（`getMusicCustomList`、`getMusicCacheList`、`getUserList`）、`CustomMusicService.ts` 362～395 行、`FileCacheService.getCacheList`、`handleExperience` 中的 recent 分支，确认鉴权、`?user=_open`、`x-user-name` 的处理方式。
2. **新建** `server/music/service/library/PagedListService.ts`：
   - `pageItems<T>(items: T[], query: PageQuery, pick: { text(item): string; sort: Record<string, (item) => string|number> }): PageResult<T>`
   - `parsePageQuery(urlObj): PageQuery`，负责校验和截断参数，非法时抛出带 `statusCode = 400` 的错误。
   - **内存缓存**：原始文本索引按scope+source+directory+version；排序/过滤视图还包含q/sort/order，限制份数与估算字节（初始8份，实测调）。相同查询翻页slice，不每次排序；版本变化失效。禁止不同搜索/排序共用一份已排序数组。
3. 在 `CustomMusicService.ts` 中新增 `getCustomMusicPage(username, query)`，复用 `getCustomMusicList` 的映射逻辑，但**只对当前页的条目**构造 `songInfo`（先排序和过滤原始索引项，再映射当前页）。
4. 在 `FileCacheService.ts` 中新增 `getCacheListPage`，同样只映射当前页。如果 `getCacheList` 内部每次都读磁盘，就在本任务中为它增加按 mtime 失效的内存缓存，并在 PR 中说明。
5. 新分页URL增加独立路由/控制器；recent同URL在原分支按是否带offset/limit判断，保留无参旧行为。不能在已return的旧recent分支后追加永远执行不到的新if。
6. 去掉 `getCustomMusicList` 中的 `ensureMusicScan(username)`；为“索引从未建立过”的情况保留兜底：`if (!customIndexManager.hasIndex(username)) ensureMusicScan(username)`（如果没有 `hasIndex`，就以索引文件是否存在判断）。
7. 编写测试，更新 `docs/backend-architecture.md` 的接口清单。

补充约束：参数只接受有限整数，q长度设合理上限，非法directoryId/账号复用原权限；排序加稳定id次序，避免同值项跨页抖动。首次冷排序/搜索仍可能O(N)，记录耗时，复用版本索引；不要为一次翻页构造所有songInfo。

04合并后彻底移除请求路径的扫描触发，冷库返回空页+真实scan状态，由后端启动/调度构建。临时索引为空兜底只允许排一次后台任务，不await遍历；集成验收时删除该临时路径。

## 6. 性能要求

- 2 万首的自定义库：第一页（排序 + 过滤）首次请求 < 150ms，后续翻页 < 20ms（本地 SSD、Node 20）。
- 单页响应体（100 条）< 150KB。
- 不允许在请求路径上执行同步磁盘遍历。

## 7. 测试

- 新增 `test/pagedList.test.cjs`：
  - 参数校验：limit 截断、offset 越界返回空 items 且 total 正确、非法 sort 返回 400。
  - 排序与搜索：中文、大小写、空格。
  - version稳定/同数量内容变化更新；精确页If-None-Match→304，不同page/q/sort/账号的ETag不能误命中，304无body重取。
  - 旧接口无参调用的响应与改造前一致（快照比对字段集合）。
- 在 `test/musicLibrary.system.test.cjs` 中补充系统测试：启动服务，创建临时目录放入少量音频样本（复用已有测试样本的方式），调用 `/api/music/custom/page`。
- 命令：`npm run test:unit`，`npm run test:system`。

## 8. 验收标准

- [ ] 4.1～4.5 的接口全部可用，鉴权与旧接口一致（未登录 401，越权 403）。
- [ ] 旧接口行为不变，现有测试全部通过。
- [ ] 列表请求不再触发扫描（日志或测试中可以验证 `ensureMusicScan` 未被调用）。
- [ ] 达到第 6 节的性能指标，结果写入 `docs/paged-list-test-report.md`。

## 9. 依赖与协作

- 02依赖分页与ETag；05提供媒体状态，08读取可选媒体版本。契约变化同时更新00及02/05/08，不能只改接口任务书。
- 05 号任务会读取 `coverCached`、`coverVersion`；本任务先提供基于 `fs.existsSync(cachePath)` 的实现，05 号任务可以替换为内存索引。
- 03 号任务会在本任务合并后，把 `custom/list`、`cache/list` 从 WS bootstrap 中移除。

## 10. 给 GPT 的提示词

```
你在仓库 D:\opensource\fn-lxserver（Node.js + TypeScript 后端，原生 JS 前端）工作。请先阅读 docs/plans/00-overview.md 和 docs/plans/01-server-paged-list-api.md，严格按照文档执行任务 01：服务端分页只读列表接口。
开工同时读 docs/plans/research-evidence.md；已确定选择不重新泛化选型，执行本任务对应边界及反例验收，未实测指标不得写成结果。分页身份与取消策略已按Feishin固定提交核实设计方向：本项目仍自行实现只读分页，保scope/query/page/version，禁止因此改完整编辑协议。见附件第3节。

要求：
1. 只修改文档第 3 节允许的范围；不改任何前端文件，不改 ClientChannel.ts，不改 Subsonic，不改旧接口的返回结构。
2. 新建 server/music/service/library/PagedListService.ts，实现参数解析、排序、搜索、LRU 缓存和 version 计算；分页只映射当前页的条目。
3. 新增custom/page、cache/page、list/meta、list/songs独立路由；recent原同URL分支加分页参数判别，无参旧行为不变，不追加在return后的不可达if。
4. 数据集version与页面ETag区分，ETag含scope/query/sort/page；鉴权后304，单页映射，LRU包含查询与字节上限，排序稳定。提供可选coverVersion/lyricVersion，不能提取媒体计算。
5. 列表不执行扫描，04合并后全部由后端调度；临时未建索引兜底最多排一次后台任务且集成删除。新增测试直接node --test指定，不只跑漏新文件的显式test:unit。
6. 新增 test/pagedList.test.cjs，并在 musicLibrary 系统测试中补充用例；运行 npm run test:unit 和 npm run test:system，全部通过。
7. 写 docs/paged-list-test-report.md，记录 2 万条数据下首页和翻页的耗时。
8. 不要 git commit。完成后列出改动文件、接口示例（请求和响应）和测试结果。
9. 范围/协议/版本变化同步00总览和02/05/08；性能按07同环境报告，目标不是已测结果。
如果遇到文档与代码不符的情况（例如函数名不同），以代码为准，做最小改动，并在总结里说明。
```


### A组交付记录（2026-10-13）

已新增 PagedListService、缓存库/自定义音乐库/歌单元信息与歌曲分页路由，并在 recent 原路由按参数切换分页结构；旧接口无参行为保留。定向单元和音乐库系统测试已通过。当前状态为已实现待验证，2万条性能数据和与04后台扫描的集成验收待补。
