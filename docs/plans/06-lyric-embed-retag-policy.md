# 任务 06：自动补全内嵌歌词与重打 tag 的策略

> 先读 `docs/plans/00-overview.md`。本任务**会修改用户的音频文件**，安全边界是最重要的部分，请严格遵守第 4 节。

> 调研已完成：[证据与确定选择](research-evidence.md)。核实洛雪MP3/FLAC映射，但其所读FLAC先unlink原文件后rename不满足本计划安全目标；只复用本仓库维护管道，加暂存校验/失败保原文件，不复制桌面写流程。见附件第6节。

## 1. 现状（原框架逻辑）

- **下载时的歌词策略**：`download.lyricMode: 'embedded' | 'external'`（`server/defaultConfig.ts` 约 115 行，默认 `embedded`），在 `DownloadService.ts` 约 1156 行写入任务；`FileCacheService.ensureCachedLyrics`（约 2057 行）根据 `shouldCacheLyric` 和 `shouldEmbedLyric` 决定写外部 `.lrc` 还是写入文件。管理端配置读写在 `server/admin/service/ConfigurationService.ts` 约 35、136、145 行，导入校验在 `SystemConfigurationImportService.ts` 约 36 行。
- **手动维护任务**：`MusicTaskService.ts` 中 `maintenanceActions = ['lyrics', 'embed', 'metadata', 'delete']`；`MusicMaintenanceService.startMaintenance(username, payload, publicAdmin)` 负责：
  - 权限：自定义目录需要用户配置 `allowWriteCustomMusicDir`（写）或 `allowOperateCustomMusicDir`（删除），否则 403（约 37 行）；
  - 路径安全：拒绝符号链接、拒绝越界（`realpathSync` 比较，约 55 行）；
  - 歌词来源：`cache.getLyricFetcher()`，**未关联网络音源**（source 为 `custom`、`local`、`unknown`）的歌曲直接报错（约 62 行）；
  - 结果写回索引（`result()` 钩子）。
- `MusicMaintenanceWorker.ts`：
  - `embed`：已有内嵌歌词时跳过；否则优先使用同名 `.lrc`，没有再在线获取，写入 `tagger.lyrics`；
  - `metadata`：**无条件覆盖** title、artist、album，并在获取到封面时**替换全部图片**（`tagger.pictures = [cover]`）；
  - 最后 `tagger.save()`（原地写入）。
- 自定义目录批量操作：`CustomMusicService.batchEmbedLyric`（约 708 行）、`batchUpdateMetadata`（约 624 行）。

## 2. 目标

在后台自动化流程（04 扫描 → 05 预取）之后，按配置**可选地**：

1. **自动内嵌歌词**：为没有内嵌歌词的歌曲写入歌词（来源：同名 `.lrc`，或 05 号任务已缓存的歌词）。
2. **自动补全 tag**：只填补**空缺**的 title、artist、album 和封面，**不覆盖**已有的非空值。

两者完全复用原框架的维护任务管道（`startMaintenance` → `MusicTaskService` → `MusicMaintenanceWorker`），不另写一套写文件逻辑。

## 3. 配置项

```ts
'library.autoFix.embedLyric': 'off',     // off | follow-download | on
                                         //   follow-download：仅当 download.lyricMode === 'embedded' 时启用
'library.autoFix.retag': 'off',          // off | fill-missing（本期只提供这两种，不提供自动覆盖）
'library.autoFix.scope': 'cache',        // cache | cache+custom：custom 还要求该用户 allowWriteCustomMusicDir = true
'library.autoFix.maxPerRun': 200,        // 每轮最多处理的文件数，1～5000
'library.autoFix.quietHours': '',        // 可选，例如 "02:00-06:00"，只在该时间段执行；空字符串表示不限制
'library.autoFix.safeWrite': true,      // 自动写必须走安全暂存/校验；不支持则跳过
```

默认自动动作embedLyric/retag均off，safeWrite保护默认true（不是自动动作开关）。管理员明确开启后才处理；custom范围另确认且按用户写权限校验。关闭只能停止后续修改，不能自动还原已经写过的文件。

## 4. 安全边界（必须遵守）

1. **只通过 `startMaintenance` 执行**，从而复用其权限校验、符号链接与越界检查。调用时 `publicAdmin = false`，**不能**绕过 `allowWriteCustomMusicDir`。
2. **不覆盖已有的非空字段**：`retag = fill-missing` 时，只写入原本为空的 title、artist、album；只有在文件**没有任何图片**时才写入封面，**不能**替换已有图片。为此给 `MusicMaintenanceWorker.ts` 的 `metadata` 操作增加 `mode: 'overwrite' | 'fill-missing'` 参数，默认 `overwrite`（手动操作的旧行为保持不变）。
3. **数据来源必须可信**：tag 数据只能来自索引中已有的**平台关联信息**（已关联的歌曲，或文件名符合 `名称_-_歌手_-_source_-_id_-_...` 标准命名的歌曲）；不根据文件名猜测，不做在线模糊搜索。歌词同理，未关联的歌曲只能使用同名 `.lrc`。
4. 跳过下载中、可确认播放/被维护占用、最近修改文件；仅mtime60秒不能证明无人播放。自动custom写须有可证明的exclusive维护/安全替换能力，无可靠占用判断时保守跳过并说明；不以性能优化绕过文件保护。
5. 写前04 suppress，写后result更新fingerprint，并显式markDirty/paths重扫释放抑制；quick目录mtime不能兜底原地tag变化。05资源版本/08下一次访问失效，不能写完只改hasCover却保旧媒体缓存。
6. 06独立auto_fix_state.json（原子保存）或复用现有维护状态，记录fileSig+action+策略版本与done/skipped/failed；不直接写05的prefetch_state，避免并行旧快照覆盖。失败不无条件自动反复重试；busy/暂时资源未就绪可延后，不能标永久skipped错过将来可处理文件。
7. **格式白名单**：只处理 `music-tag-native` 已验证可安全写入的格式（执行者需要在测试中逐一验证 mp3、flac、m4a 的写入与读取；ogg、opus、ape、wav 如果没有验证通过，就加入跳过列表，并在报告中说明）。
8. 自动写使用原维护管道中的安全暂存分支：同目录复制→写tag→验证可读/时长/音频帧或等价不变证据→重核原fingerprint→安全替换。保护权限/mtime策略/磁盘空间，临时文件由04忽略，崩溃可恢复、取消前清临时而不删原件。目标格式/平台无法证明安全替换则自动跳过；safeWrite=false不能默认开放自动原地覆盖，本期拒绝或仅禁用自动写。手动已有行为仍默认不变。
9. **审计**：每次自动修改都写一条日志（用户、文件、动作、修改的字段），管理端状态接口可以查看最近 200 条。
10. 当前startMaintenance对未关联平台歌曲可能拒绝；给auto内嵌路径加仅可信本地.lrc/05已缓存结果的有限adapter，依旧权限/路径校验，不开线上模糊匹配。没有可信输入就跳过，不另写绕维护入口的文件写法。
11. 候选文件提交前重新realpath/权限/fingerprint，防选择后被替换为链接或外部编辑；日志只能权限允许用户/管理员查，不公开绝对路径给普通其他用户。

## 5. 范围

**范围内**

- 新建 `server/music/service/library/LibraryAutoFixService.ts`：监听 `library:prefetch-progress`（`running: false` 时）或 `library:scan-finished`，挑选候选文件，按 `maxPerRun` 分批调用 `startMaintenance`。
- scan只登记候选，资源ready后再提交；缺歌词/封面不因此永久skipped。全服务串行/有界auto队列，与手动维护同文件互斥，服务关闭/禁用停止新提交；任务中原文件变化跳过而非强行覆盖。
- MusicMaintenanceWorker增加fill-missing与自动origin的安全暂存/验证分支；默认manual overwrite行为保留，auto不能默认原地覆盖。
- `MusicMaintenanceService.ts`：`startMaintenance` 的 payload 允许传入 `mode`，并透传给 worker；新增来源标记 `origin: 'auto' | 'manual'`，用于审计和任务列表显示（自动任务不应该在用户的任务列表中刷屏，可以在 UI 上折叠，或者只在管理端显示）。
- `server/defaultConfig.ts` 中的 `library.autoFix.*`；`ConfigurationService.ts` 和 `SystemConfigurationImportService.ts` 中的校验（参照 `download.lyricMode` 的写法）；`server/types/config.d.ts` 的类型。
- 管理端系统配置页新增“自动修复”区块，以及开启时的确认提示。
- `HttpServer.ts`：新增 `GET /api/admin/library/autofix/log`。
- 新auto_fix_state.json归06；与04冻结自写后paths重扫、05只读资源可用/版本接口，08不直接由后端操作客户端缓存。
- `docs/system-configuration.md`。

**范围外（禁止）**

- 不改手动维护的默认行为（`metadata` 默认仍为 overwrite）。
- 不修改 `download.lyricMode` 的语义和下载流程。
- 不做自动覆盖模式，不做按歌名的在线匹配。
- 不改扫描（04）、预取（05）的内部实现；只订阅它们的事件，读取它们的状态。
- 不改 `ClientChannel.ts`。

## 6. 实施顺序

1. 为 worker 增加 `fill-missing` 模式及测试（准备带部分空 tag 的样本文件）。
2. `startMaintenance` 透传 `mode` 和 `origin`。
3. `LibraryAutoFixService`：候选挑选、跳过规则、分批、静默时段、状态记录、审计日志。
4. 配置、校验、管理端 UI、日志接口。
5. 测试与报告。

## 7. 测试

- 新增 `test/libraryAutoFix.test.cjs`：
  - fill-missing 不覆盖已有的非空 title、artist、album，不替换已有图片；
  - 未关联歌曲不会在线获取歌词；
  - 无 `allowWriteCustomMusicDir` 时 custom 文件不会被修改；
  - 正在下载或刚修改的文件被跳过；
  - 失败后不再自动重试，文件变化后重新处理；
  - `quietHours` 解析（跨午夜的时间段，例如 `23:00-05:00`）；
  - 写入后索引中的 size、mtime 已更新，下一次 quick 扫描不认为它变化；
  - 默认配置下（全部 off）不会产生任何写入。
- 更新 `test/musicTools*.cjs`、`test/songMetadata.test.cjs`、`test/configurationImport.test.cjs`、`test/systemConfiguration*.cjs`。
- 命令：`npm run test:unit`、`npm run test:system`。
- 自动安全写补故障注入：写tag/校验/替换失败、磁盘不足、并发原文件变化、symlink切换、重启临时恢复；输入权限/内嵌歌词未关联路径、完整音频可读与内容不变证据。新增测试直接node --test指定；只用空音频文件不能证明tag无损。

## 7.1 停止与回退

关闭embedLyric/retag停止新任务，活动任务在安全边界停止，未提交临时清理；已替换文件是否可恢复取决于保留原件/备份。开启前说明备份策略；如提供保留原件选项，容量/权限/保留期与恢复入口一并交付。不能把关闭配置写成撤销过去所有tag修改。格式验证失败仅跳过该格式，不修无关手动维护逻辑。

## 8. 验收标准

- [ ] 默认配置下不修改任何文件。
- [ ] 开启 `embedLyric = on` 后，缓存目录中没有内嵌歌词、但有 `.lrc` 或已缓存歌词的歌曲被写入歌词，且不出现扫描循环。
- [ ] 开启 `retag = fill-missing` 后，只有空字段被填补。
- [ ] 手动维护任务的行为与改造前一致（现有测试全部通过）。
- [ ] 报告写入 `docs/library-autofix-test-report.md`，列出各音频格式的写入验证结果。

## 9. 给 GPT 的提示词

```
你在仓库 D:\opensource\fn-lxserver（Node.js >= 20，TypeScript 后端，使用 music-tag-native 读写标签）工作。请先阅读 docs/plans/00-overview.md 和 docs/plans/06-lyric-embed-retag-policy.md，严格执行任务 06：自动补全内嵌歌词与重打 tag 的策略。
开工同时读 docs/plans/research-evidence.md；已确定选择不重新泛化选型，执行本任务对应边界及反例验收，未实测指标不得写成结果。核实洛雪MP3/FLAC映射，但其所读FLAC先unlink原文件后rename不满足本计划安全目标；只复用本仓库维护管道，加暂存校验/失败保原文件，不复制桌面写流程。见附件第6节。

要求：
1. 所有写文件操作必须通过现有的 MusicMaintenanceService.startMaintenance → MusicTaskService → MusicMaintenanceWorker 管道执行，复用其权限、符号链接与越界检查；publicAdmin 固定为 false。
2. MusicMaintenanceWorker 的 metadata 操作新增 mode: 'fill-missing'，只填补空的 title/artist/album，文件无图片时才写入封面；默认 mode 仍为 overwrite，手动维护行为不变。
3. LibraryAutoFixService按配置处理可信本地.lrc/05缓存或已关联平台，不模糊匹配；复用维护权限/路径安全，未关联本地歌词提供有限adapter。跳过忙文件/近期修改，不能用mtime证明无人播放；写前抑制、写后04 paths重扫与05资源版本更新。结果放06独立状态，不直接写05文件；busy临时原因延后，失败按fingerprint策略，审计有权限。
4. embedLyric/retag默认off，safeWrite默认true；auto经原管道安全暂存→tag→无损验证→原fingerprint重核→安全替换，格式/平台不支持则跳过，不默认auto原地写。manual默认overwrite保留。配置校验/类型/UI同步，custom确认风险/备份；关闭仅停止后续，不恢复过去文件。
5. 新增 GET /api/admin/library/autofix/log。
6. 不改 download.lyricMode 语义，不改扫描和预取的内部实现，不改 ClientChannel.ts。
7. 新增 test/libraryAutoFix.test.cjs，更新 musicTools、songMetadata、configurationImport、systemConfiguration 相关测试；运行 npm run test:unit 和 npm run test:system 全部通过。
8. 更新 docs/system-configuration.md，写 docs/library-autofix-test-report.md（包含 mp3/flac/m4a 等格式的写入验证结果）。
9. 不要 git commit。完成后列出改动文件、安全边界的实现方式和测试结果。
10. 新增测试直接指定运行，实音频格式/故障/并发/路径测试证明安全；范围/配置/自写契约同步00、04、05、08。报告未验证格式，不拿空占位文件宣称无损。
```

## B 组实现与合并记录（2026-10-13）

已实现：`AutoFixPolicy` 的默认 off 与跨午夜 quiet hours；`LibraryAutoFixService` 候选上限、串行执行、资源 ready、审计及独立 `auto_fix_state`；`MusicMaintenanceService/Worker` 自动仅 fill-missing，安全暂存→标签/时长/压缩音频载荷读回→原 fingerprint 重核→fsync/单次 rename；读取响应粗粒度 lease、写前 suppress/写后 markDirty。已验证 MP3/FLAC/M4A，custom/location=custom 和独立 Subsonic 端口保守跳过。

已验证：`test/libraryAutoFix.test.cjs`、`test/libraryAutoFixService.test.cjs`、真实 HTTP/SQLite 联测和故障注入（save、校验、rename、低空间、外部修改、无效 payload）通过，详见 `docs/library-autofix-test-report.md`。未测掉电、真实播放器并发、fnOS 和独立 Subsonic 端口联测；本期没有长期备份恢复入口，关闭开关不撤销已写。

合并顺序：先接入 05 的 resource-ready/只读缓存接口，再合并 `MusicTaskService` 的 origin/authorize/finished 钩子，随后合并维护服务/worker、主 HTTP read guard、自动配置和审计路由。保留 C 组 `task:changed` 事件，不改手动 overwrite 默认行为；custom 自动写跳过理由必须进入审计。不要覆盖 04/05 对 `CustomMusicService.ts` 的扫描或媒体 merge 代码。
