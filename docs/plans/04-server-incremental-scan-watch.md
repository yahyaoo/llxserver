# 任务 04：后端定时增量扫描与目录监听

> 先读 `docs/plans/00-overview.md`。本任务**独占** `CustomMusicService.ts` 的扫描部分、`MusicScanWorker.ts`、`MusicDirectoryService.ts`，以及管理端 `client/app.js` 中的音乐目录配置行（约 896～930 行）。

> 调研已完成：[证据与确定选择](research-evidence.md)。本期已确定原生fs.watch，不新增chokidar；quick是本项目目录剪枝设计，不能归因Navidrome。quick不吞dirty paths，不确定事件转受影响子树full。见附件第5节。

## 1. 现状

- **调度**：`CustomMusicService.ts` 末尾有模块级的 `setInterval(..., 60000)`（约 353 行），每分钟对所有用户调用 `ensureMusicScan`。`ensureMusicScan`（约 347 行）的触发条件：任意目录超过 `scanMinutes`（默认 30，范围 1～1440）未扫描、目录配置签名变化、距离上次完成超过 30 分钟，或 `force`。另外，`getCustomMusicList` 在**每次请求列表时**也会调用 `ensureMusicScan`（01 号任务会去掉）。
- **扫描时间只存在内存中**：`directoryScannedAt` 是内存 Map，服务重启后所有目录都会被认为到期，从而立即触发全量扫描。
- **扫描过程**（`syncCustomIndex`，约 289 行）：
  1. 同时调用 `fileCache.syncCacheIndex(username)` 扫描缓存目录。
  2. 对每个目录执行 `buildLinkedInfoMap(directory.path)`，**再递归一遍目录**读取关联信息。
  3. 在 worker（`MusicScanWorker.ts`）中：对每个目录完整递归 `readdir`，然后对每个音频文件执行 `stat` 和 `existsSync(.lrc)`；如果 size、mtime、hasLyric 都没有变化，就复用旧条目，否则用 `music-tag-native` 读取标签。
  4. 把整个旧索引通过 `workerData.previous` 传给 worker（2 万条时会产生一次大的结构化克隆）。
  5. 完成后 `customIndexManager.save(username)` 整体写入 `custom_index.json`，接着对缓存库、自定义库、下载库执行全量 `aggregateLibrary`。
- **没有目录级剪枝，也没有 watcher**。2 万首、2000 个目录的 NAS，每 30 分钟就要执行约 2000 次 `readdir`、2 万次 `stat`、2 万次 `existsSync`，会持续唤醒机械硬盘。
- **目录配置**：`MusicDirectoryService.ts` 中的 `MusicDirectory { id, path, scanMinutes }`，存储在表 `server_user_music_directory`；管理端 `client/app.js` 约 896～930 行的 `appendMusicDirectory` 为每个目录生成“路径 + 扫描间隔”输入。
- **全局调度器**：`server/music/service/task/SchedulerService.ts` 中的 `registerTask`，已有 `networkListTask` 和 `syncDownloadTask` 两个实例可供参考。
- Node 版本要求：`>= 20`（`package.json` 中的 engines）；当前没有 chokidar 依赖。

## 2. 已核实的依据与确定选择

- **本项目设计**：快速扫描比较已知目录的修改时间，只重读发生变化的目录；完整扫描定期兜底；watcher事件防抖合并。目录mtime不是所有文件内容的版本，目标文件系统必须实测。
- **已读取Navidrome固定提交**：watcher.Run合并目标、防抖、扫描忙时延后；但默认分支仍ScanAll(false)，loadDir/fullReadDir/entry.Info和folderEntry.hash读文件属性。只借鉴调度原则，不称它实现了本计划零文件stat剪枝。固定源码链接见研究附件第5节；未读Jellyfin/Plex，不作为已核实依据。
- **依赖已确定**：本期仅原生 `fs.watch`，不新增chokidar、不用逐文件 `fs.watchFile`；捕获不支持、`ENOSPC` / `EMFILE` / `EACCES` 等错误，显示降级并回定时quick+full。Node20官方明确网络盘不可靠、filename可能缺失、根重建需重核；API支持不代替fnOS可靠性实测。

**增量边界（目标文件系统需验证）**：通常目录 mtime 反映直接子项的新增、删除、重命名，不能用它推断已有文件内容是否变化；目录未变也不能跳过所有已知子目录。时间精度和网络挂载缓存还可能影响观测。因此：
- 快速扫描（目录 mtime 剪枝）可以发现新增、删除、重命名，但**发现不了**原地修改标签的文件。
- 原地修改由 watcher 的 `change` 事件或周期性的完整扫描负责发现。

## 3. 目标

1. 扫描完全由后端调度执行，客户端请求不触发扫描。
2. 三种扫描模式：
   - **watch 增量**：watcher 事件 → 防抖 → 只处理受影响的目录（以及其中的文件）。
   - **快速扫描**（按 `scanMinutes`）：只对每个已知目录执行一次 `stat`，mtime 没有变化的目录跳过 `readdir`，也跳过其中文件的 `stat`；变化的目录才执行 `readdir`，对新增或 size/mtime 变化的文件读取标签。
   - **完整扫描**（按 `fullScanHours`，默认 24 小时，也可手动触发）：与当前逻辑一致，逐文件 `stat`。
3. 扫描状态（每个目录的上次快速扫描时间、上次完整扫描时间、目录 mtime 表）**持久化**，服务重启后不会立即全量扫描；启动时延迟 60 秒执行一次快速扫描。
4. 后台配置可修改：全局开关、默认间隔、监听开关、防抖时间、完整扫描周期；每个目录可以单独设置“扫描间隔”和“是否监听”。
5. watcher 不可用（网络文件系统、inotify 上限、权限错误）时自动降级为定时扫描，并在管理端显示原因。
6. 扫描完成后发出 `library:scan-finished` 事件，携带新增、变化、删除的文件列表（供 05 号任务和 03 号任务使用）。
7. 扫描对磁盘友好：同一时间全局只运行一个扫描任务（跨用户排队）；worker 每处理 200 个文件主动让出一次事件循环；可配置的文件读取间隔（`ioPauseMs`，默认 0）。

## 4. 范围

**范围内**

- `server/music/service/library/CustomMusicService.ts`：`syncCustomIndex`、`ensureMusicScan`、`buildLinkedInfoMap`、模块级定时器、`CustomIndexManager` 的保存方式。
- `server/music/service/library/MusicScanWorker.ts`
- 新建 `server/music/service/library/LibraryWatcher.ts`、`server/music/service/library/LibraryScanScheduler.ts`、`server/music/service/library/ScanStateStore.ts`
- `server/application/library/MusicDirectoryService.ts`（新增字段 `watch`）以及 SQLite 迁移
- `server/defaultConfig.ts` 中的 `library.scan.*` 配置块
- `server/application/http/HttpServer.ts`：新增 `GET /api/admin/library/scan/status`（管理员查看每个用户每个目录的 watcher 状态、上次扫描时间、降级原因）。现有的手动扫描接口 `POST /api/music/custom/sync` 保持不变，但改为支持 `?mode=quick|full`（默认 full，兼容旧行为）。
- 管理端 `client/app.js` 的音乐目录行和系统配置页的“音乐库扫描”区块
- `docs/system-configuration.md`、`docs/sqlite-migration.md`、`docs/backend-architecture.md`

**范围外（禁止）**

- 不改标签读取的字段映射（worker 中构造 item 的逻辑保持不变，只改“哪些文件需要读”）。
- 不改 `custom_index.json` 中条目的字段结构（只允许新增字段）。
- 不改 `FileCacheService.syncCacheIndex` 的内部实现（只调整调用时机：缓存目录由下载流程写入，不需要每次自定义目录扫描时都重新扫描；改为仅在完整扫描或手动扫描时调用）。
- 不做封面和歌词预取（05 号任务），不做写标签（06 号任务）。
- 不改 `ClientChannel.ts`（扫描进度通过 `serverEvents` 发出，由 03 号任务推送）。

## 5. 配置项

`server/defaultConfig.ts` 新增：

```ts
'library.scan.enabled': true,            // 是否启用后台自动扫描（关闭后只能手动扫描）
'library.scan.defaultMinutes': 60,       // 新目录默认的快速扫描间隔（分钟），1～1440
'library.scan.fullScanHours': 24,        // 完整扫描周期（小时），0 表示从不自动完整扫描，1～720
'library.scan.watch': true,              // 是否启用目录监听（全局总开关）
'library.scan.watchDebounceSeconds': 10, // 监听事件防抖时间（秒），2～300
'library.scan.startupDelaySeconds': 60,  // 服务启动后多久执行首次快速扫描，0 表示不执行
'library.scan.ioPauseMs': 0,             // 每读取一个文件标签后暂停的毫秒数（机械硬盘可设为 5～20），0～200
'library.scan.watchMode': 'auto',        // auto | native | polling | off；auto 时网络文件系统自动关闭监听
```

默认配置、config.d.ts、配置服务/导入校验、管理端字段同步登记；04/05/06各自配置key由集成负责人合并。watchMode=polling在本方案表示“低频快速/完整扫描兜底”，不是chokidar逐文件高频轮询，后台说明写清。

目录级（`MusicDirectory` 新增字段，均为可选，缺省时使用全局值）：

```ts
interface MusicDirectory { id: string; path: string; scanMinutes: number; watch?: boolean }
```

- SQLite：表 `server_user_music_directory` 新增列 `watch INTEGER NULL`（NULL 表示跟随全局）。迁移脚本参照现有迁移方式编写，并更新 `docs/sqlite-migration.md`。
- 校验：`scanMinutes` 保持 1～1440；旧数据默认值 30 保持不变（**不要**批量改成 60，只有新建目录才使用 `defaultMinutes`）。
- fullScanHours=0关闭完整兜底；watch不可靠/关闭的目录可能漏原地内容变化，管理端必须说明，不能宣称只靠quick就全量准确。新增hidden legacy配置也须纳入类型/导入，不默认启用。

## 6. 设计

### 6.1 `ScanStateStore.ts`（扫描状态持久化）

保存位置与 `custom_index.json` 相同的用户目录，文件名 `scan_state.json`（使用“写临时文件再 rename”的原子写入）：

```json
{
  "version": 1,
  "directories": {
    "<directoryId>": {
      "path": "/vol1/music",
      "lastQuickScanAt": 1739245123000,
      "lastFullScanAt": 1739200000000,
      "folders": { "": 1739245000000, "周杰伦/范特西": 1739000000000 },
      "watch": { "state": "active|disabled|failed|unsupported", "reason": "ENOSPC: inotify 上限", "since": 1739245123000 }
    }
  }
}
```

- `folders` 的 key 为相对目录路径（使用 `/` 分隔），value 为该目录的 `mtimeMs`。
- 目录路径（`path`）变化时，丢弃该目录的状态，下一次执行完整扫描。
- 文件损坏或版本不匹配时，忽略并重新执行完整扫描（记录警告日志）。

### 6.2 worker 的快速扫描模式（`MusicScanWorker.ts`）

`workerData` 新增 `mode: 'quick' | 'full' | 'paths'`、`folders`（6.1 的 mtime 表）、`paths`（watch 模式下受影响的相对路径列表）。

- **quick**：
  1. 从根目录开始，对 `folders` 中的每个已知目录执行 `stat`；若不存在 → 将该目录及其子目录下的条目全部标记为删除。
     删除判定先确认配置根/挂载可访问与本轮枚举成功；EACCES/EIO/网络失联、挂载空目录不能当真实全库删除。受影响区域保留旧索引、记录不完整/error，只有可信ENOENT/父目录成功枚举确认删除才提交。
  2. mtime 与记录相同 → 跳过该目录的 `readdir`，直接复用该目录下的旧条目（**不对其中的文件执行 stat**），但仍需继续检查它的已知子目录（子目录的 mtime 独立）。
  3. mtime 不同或新目录 → `readdir`：新增的文件读标签；已有文件执行 `stat` 比较 size/mtime；消失的文件标记删除；新的子目录递归处理（作为新目录）。
  4. 返回新的 `folders` 表。
- **full**：与当前逻辑一致，同时重建 `folders` 表。
- **paths**：只处理给定的目录或文件路径（文件：`stat` 并按需读标签；目录：按 quick 的第 3 步处理该目录，不递归已知子目录，除非是新目录）。
- paths的change/.lrc/sidecar事件必须显式刷新对应文件/媒体版本；dirty集合超过阈值不能转quick后丢原地修改提示。保留分批paths，或只对受影响子树做full，必要full兜底；空filename/监听丢事件状态需重核，不伪称增量完整。
- 符号链接/目录循环、realpath边界、临时写tag文件沿用安全策略；不得扫描出配置根、双读同一链接树。读标签前后比size/mtime，正在复制的文件延后重试，不把半文件永久写none/failed。
- `.lrc` 判断：不要对每个文件调用 `existsSync`。在 `readdir` 结果中直接查看同目录是否存在同名 `.lrc`（只在已经 `readdir` 的目录中做）；跳过的目录沿用旧条目的 `hasLyric`。
- 让出事件循环：每处理 200 个文件 `await new Promise(r => setImmediate(r))`；`ioPauseMs > 0` 时，每次读标签后 `await sleep(ioPauseMs)`。
- **减少结构化克隆**：主线程只把**被扫描目录**的旧条目传给 worker（当前已经是按 `selected` 过滤，确认这一点）；worker 返回结果时只回传“新增、变化、删除”的差异和未变化条目的 filename 列表，主线程据此合并。

### 6.3 `buildLinkedInfoMap`

这个函数每次扫描都会额外递归一遍目录读取关联信息。改为：只在 full 模式下调用；quick 和 paths 模式只对 worker 报告的**新增文件**查找关联信息（如果关联信息存放在同目录的 json 文件中，就只读取被 `readdir` 过的目录）。执行者需要先读懂它的实现，确认关联信息的存储位置，再决定具体做法，并在 PR 中说明。

### 6.4 `LibraryWatcher.ts`

- **唯一实现路径（本期零依赖）**：目标Node的 `fs.watch(root, { recursive: true })`，初始化同步异常和后续error均捕获；不支持就显示降级并启用低频quick/full，不临时换库。fnOS/Linux与Windows验新增、删除、重命名、原地修改、新子目录、空filename和根删除重建。
- filename缺失/无法安全定位时标记该根“不确定变更”，排受影响子树full；根删除重建或error后不能继续假称旧watcher有效，关闭旧handle，按重试策略重新注册。full与重试合并、防事件风暴，保原索引直到可信扫描完成。
- **网络文件系统检测**（`watchMode = auto`）：Linux 上读取 `/proc/self/mounts`，找到包含该路径的最长挂载点，文件系统类型为 `cifs`、`smb3`、`nfs`、`nfs4`、`fuse.*`（rclone、sshfs 等）、`9p` 时，不启用监听，状态记为 `unsupported`，原因写“网络文件系统，使用定时扫描”。Windows 上 UNC 路径（`\\`开头）同样处理。
- mount路径转义/容器bind mount不完整信息要处理，检测只作保守提示而非保证；auto可明确关闭网络盘事件，native用户强制选择仍需告知可靠性/完整扫描兜底。目标网络盘mtime不可靠时不能宣称quick必然发现变化。
- `watchMode = polling`：不使用 fs 事件，只依赖快速扫描，但把该目录的快速扫描间隔下限设为 5 分钟（防止被误设为 1 分钟）。
- **错误降级**：`ENOSPC`（inotify 上限）、`EMFILE`、`EACCES`、`EPERM` → 关闭该目录的监听，状态记为 `failed` 并写入原因，回退到定时快速扫描；每 6 小时重试一次。
- 防抖保留文件change与目录rename语义，dirtyPaths去重，最后事件后等配置秒数、最长5倍等待。超过500条分批paths或受影响子树full，不能quick剪枝丢原地修改。扫描中再来的dirty留下一轮，本轮成功处理的部分才清。
- **自写合并**：提供 `suppress(absolutePath, ms = 30000)` 兼容接口，06 写标签前调用；写入结束必须显式标记该文件 dirty，或抑制期结束后执行一次 paths 扫描。不能丢弃事件后等 quick 兜底，因为原地写 tag 未必改变目录 mtime；并发外部编辑仍需重核文件 fingerprint。
- 目录配置变化（新增、删除、路径修改、关闭监听）时，重建对应目录的 watcher。服务关闭时关闭所有 watcher。

### 6.5 `LibraryScanScheduler.ts`

- 使用 `SchedulerService.registerTask` 注册一个 `libraryScanTick`，每 60 秒运行一次（只做判断，不做 IO），替换 `CustomMusicService.ts` 中的模块级 `setInterval`：
  - 对每个用户的每个目录：`now - lastFullScanAt >= fullScanHours` → 排入 full；否则 `now - lastQuickScanAt >= scanMinutes` → 排入 quick。若 watcher 处于 active 状态，快速扫描间隔可以自动放宽为 `max(scanMinutes, 360)`（watcher 正常时不需要频繁快速扫描）——这条规则需要在配置说明中写清楚。
- **全局串行队列**：同一时间只运行一个扫描任务；同用户/目录合并，full可覆盖quick与其实际成功扫描范围内的paths。quick不能覆盖文件change/sidecar dirty；可以同批执行quick+paths，或保留下一批paths，只有成功处理对应fingerprint才清dirty。full失败/仅扫描子树不能清掉其余dirty。
- `library.scan.enabled = false` 时，只响应手动扫描。
- 启动后延迟 `startupDelaySeconds` 秒执行一次 quick（不是 full）。
- 扫描开始和结束分别发出 `library:scan-started`、`library:scan-finished` 事件（契约见 00 号文档第 4 节），`reason` 分别为 `startup`、`schedule`、`watch`、`manual`。
- `aggregateLibrary`：只有在 added、changed、removed 任一非空时才执行；如果它支持增量（只处理变化的条目），就使用增量方式，否则保持全量调用，但在 PR 中记录耗时。
- 配置变更取消/释放旧watcher，已有扫描结果提交前核配置generation，旧路径结果不能覆盖新目录索引。服务停止等待可终止的任务/原子保存，调度器注销；scan.enabled=false时自动定时/watch/startup全部停止，manual仍可用。

### 6.6 索引写入

- `customIndexManager.save` 改为原子写入（临时文件 + rename），且只有在内容有变化时才写入。
- 不改为 SQLite 表（超出范围），但在 PR 中给出“2 万条时 save 的耗时和文件大小”，供后续决策。
- 05封面/歌词状态更新与扫描合并使用同一用户索引写序列/revision，不能两份旧快照各rename覆盖。04提供按filename合并dirty更新与原子保存接口，05合并2秒内状态，06通过维护result/paths重扫更新。

### 6.7 管理端 UI（`client/app.js`）

- 音乐目录行：在现有“路径 + 扫描间隔（分钟）”的基础上，新增“监听变化”下拉框（跟随全局 / 开启 / 关闭），以及只读的状态标签（监听中 / 已降级：原因 / 网络盘：定时扫描 / 上次扫描时间）。状态通过新接口 `GET /api/admin/library/scan/status` 获取，页面打开时请求一次，不轮询。
- 系统配置页新增“音乐库扫描”区块，对应第 5 节的全局配置项，每项附简短说明。
- 保存逻辑沿用 `appendMusicDirectory` 所在区域的现有方式；`normalized()`（约 930 行）在比较时需要包含 `watch` 字段。
- 不改其他配置区块的布局。

## 7. 实施顺序

1. `ScanStateStore` + worker 的 quick 模式 + 单元测试（最核心，收益最大）。
2. `LibraryScanScheduler` 替换模块级定时器，接入持久化，消除重启后的全量扫描。
3. `LibraryWatcher`（先在 Linux 上验证 `fs.watch` recursive）。
4. 配置项、SQLite 迁移、管理端 UI、状态接口。
5. 事件发送（`library:scan-*`）。
6. 文档和报告。

## 8. 风险与回滚

- quick 模式漏掉原地修改的文件：依靠 watcher 和 full 扫描兜底，这是已知且可接受的权衡，需写入配置说明。
- 部分文件系统目录mtime不可靠：切polling仅停事件，不提高quick准确性；应把fullScanHours调小或显式手动full，并说明仍可能延迟。fullScanHours=0且无可靠watch时会漏原地变化，不以“降级成功”掩盖；目录级禁用quick另立变更提案。
- 回滚：`library.scan.fullScanHours = 0` 且把目录 `scanMinutes` 设小，并新增隐藏开关 `library.scan.legacy = true`，恢复为旧的全量扫描逻辑（旧代码路径保留一个版本周期）。
- 回退先停新scheduler/watcher再恢复旧调度，禁止双套同时扫；旧间隔必须管理员主动选择，不能为回滚自动调到1分钟频繁唤盘。状态文件保持可读，不删除音乐/现有索引。

## 9. 测试

- 新增 `test/libraryScan.test.cjs`：
  - 构造临时目录树（3 层、50 个目录、300 个占位音频文件——可以使用空文件或现有测试样本，读标签失败时 worker 已有兜底）。
  - quick 模式：没有变化时，`readdir` 次数为 0、文件 `stat` 次数为 0（通过注入计数的 fs 包装或统计 worker 返回的计数字段实现）；新增文件、删除文件、新增子目录、删除子目录、重命名目录都能被发现；原地修改文件内容**不会**被 quick 发现，但会被 full 发现。
  - 状态持久化：重启（重新创建调度器）后不会立即触发 full。
  - 调度：多个用户的任务串行执行；同一目录的 full 覆盖 quick。
  - `scan-finished` 事件的 added、changed、removed 正确。
- 新增libraryWatcher测试：防抖/最长等待、dirtyPaths超阈值paths/subtree-full不漏change、suppress后paths刷新、ENOSPC降级、mount解析。
  补网络失联/权限错误不误删、复制中延后、配置generation、扫描期间新dirty保留、自写结束paths刷新、sidecar版本与05索引并发。
- 更新 `test/musicLibrary.test.cjs`、`test/musicLibrary.system.test.cjs`、`test/systemConfiguration*.cjs`、`test/sqliteMigration.system.test.cjs`。
- 命令：`npm run test:unit`、`npm run test:system`。

## 10. 验收标准

- [ ] 2 万首、2000 个目录的库在没有变化时，一次快速扫描只产生约 2000 次目录 `stat`，没有文件级 `stat`，耗时在 SSD 上 < 2 秒。
- [ ] 服务重启后不会立即全量扫描。
- [ ] 本地磁盘上新增一首歌，在 `watchDebounceSeconds + 5` 秒内出现在音乐库中，并收到 `library:scan-finished` 事件。
- [ ] 网络挂载目录自动显示“网络盘：定时扫描”，监听不启用。
- [ ] 管理端可以修改全部配置并立即生效（不需要重启服务）。
- [ ] 报告写入 `docs/library-scan-test-report.md`，包含改造前后的 IO 次数和耗时对比。

## 11. 给 GPT 的提示词

```
你在仓库 D:\opensource\fn-lxserver（Node.js >= 20，TypeScript 后端）工作。请先阅读 docs/plans/00-overview.md 和 docs/plans/04-server-incremental-scan-watch.md，严格执行任务 04：后端定时增量扫描与目录监听。
开工同时读 docs/plans/research-evidence.md；已确定选择不重新泛化选型，执行本任务对应边界及反例验收，未实测指标不得写成结果。本期已确定原生fs.watch，不新增chokidar；quick是本项目目录剪枝设计，不能归因Navidrome。quick不吞dirty paths，不确定事件转受影响子树full。见附件第5节。

要求：
1. 引用00冻结的ServerEvents，创建权归03/集成负责人；未合并用测试mock，不与其他组同时创建/覆盖。04先冻结索引保存、自写后paths重扫接口。
2. 新建 ScanStateStore.ts（scan_state.json 原子写入，保存目录 mtime 表和上次扫描时间）、LibraryScanScheduler.ts（通过 SchedulerService.registerTask 每 60 秒判断一次，全局串行队列，任务合并，启动延迟快速扫描）、LibraryWatcher.ts（本期只用原生fs.watch，不加chokidar；fnOS/Windows定向实测；网络盘定时兜底；初始化/运行错误降级；空filename/根重建转受影响子树full并重建handle；防抖与最长等待；自写抑制结束后显式paths重扫）。
3. MusicScanWorker.ts 增加 quick / full / paths 三种模式：quick 按目录 mtime 剪枝，未变化的目录不 readdir、不 stat 文件；.lrc 通过 readdir 结果判断，不逐个 existsSync；每 200 个文件让出事件循环；支持 ioPauseMs。
4. 删除 CustomMusicService.ts 中的模块级 60 秒 setInterval；buildLinkedInfoMap 和 fileCache.syncCacheIndex 只在 full 或手动扫描时调用；索引保存改为“有变化才写 + 原子写入”；扫描前后发出 library:scan-started / library:scan-finished 事件，带 added/changed/removed。
5. 不改 worker 中构造条目的字段映射，不改 custom_index.json 条目结构（只能新增字段），不做封面歌词预取，不写标签，不改 ClientChannel.ts。
6. 新增 library.scan.* 配置项（见文档第 5 节），MusicDirectory 新增可选字段 watch 并编写 SQLite 迁移；管理端目录行增加“监听变化”和状态显示，系统配置页增加“音乐库扫描”区块；新增 GET /api/admin/library/scan/status；POST /api/music/custom/sync 支持 ?mode=quick|full（默认 full）。
7. 保留隐藏开关 library.scan.legacy 用于回滚到旧扫描逻辑。
8. 新增 test/libraryScan.test.cjs、test/libraryWatcher.test.cjs，更新相关测试；运行 npm run test:unit 和 npm run test:system 全部通过。
9. 更新 docs/system-configuration.md、docs/sqlite-migration.md、docs/backend-architecture.md，写 docs/library-scan-test-report.md。
10. 不要 git commit。完成后列出改动文件、配置项说明、IO 对比数据和遗留问题。
11. 目录mtime只剪枝枚举，quick不可覆盖paths，dirty文件change超阈值不可退quick丢更新；full只清成功覆盖范围，扫描中新增dirty留下一批。网络/权限错误不能当删除，复制中延后，配置变更核generation，自写抑制结束paths重扫。04拥有索引串行/原子保存，05状态合并复用同接口；配置类型/导入同步，新增测试直接指定运行，范围变化更新00总览。
```

## B 组实现与合并记录（2026-10-13）

已实现：`MusicScanWorker` 的 full/quick/paths、目录 mtime 剪枝、已知子目录检查、sidecar 指纹、空根保旧索引、路径安全和分批让出；`ScanStateStore` 持久化扫描水位；`LibraryWatcher` 使用原生 `fs.watch`、防抖、overflow/不确定事件转 full、网络盘提示和失败重试；`LibraryScanScheduler` 全局串行调度；CustomMusicService 使用唯一 Promise 队列、SQLite 文档事务保存与媒体状态 merge。目录新增 nullable `watch`，管理端提供跟随/开/关三态和一次状态读取。增加 `library.scan.legacy` 隐藏兼容开关：显式启用时关闭 watcher 并把 quick 转 full。

已验证：`test/libraryScan.test.cjs`、`test/libraryScanScheduler.test.cjs`、`test/libraryBackground.system.test.cjs` 及 B 组联合定向回归通过；20,000 个临时占位文件单次 benchmark：full 2001 次目录 stat、2001 次 readdir、20000 次文件 stat；unchanged quick 2001 次目录 stat、0 次 readdir/文件 stat，约 803ms。该数据不代表 fnOS/NAS 或真实媒体性能，详见 `docs/library-scan-test-report.md`。

未完成验收：真实网络挂载和 fnOS watcher、真实媒体 2 万索引长期压力、掉电恢复。fullScanHours=0 且 watcher 不可靠时仍可能延迟发现原地修改，管理端需保留提示。

合并顺序：先合并 `ServerEvents` 契约和 `SchedulerService.unregisterTask`，再合并 `ScanStateStore`/worker/CustomMusicService 扫描段，随后合并 watcher/scheduler、目录 SQL nullable `watch`、HttpServer 路由与管理端目录行。与 05 合并时保留 `customIndexManager.merge` 和同一索引串行保存；与 06 合并时保留 `suppress/markDirty` paths 重核。不要整文件覆盖 `CustomMusicService.ts`、`HttpServer.ts` 或 `client/app.js`，按函数合并。
