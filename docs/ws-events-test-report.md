# C 组 / 03 WS 通道交付与验证报告

日期：2026-10-13。基线：`7fd44a1`。本报告只归属 C 组，工作目录包含其他组并行修改，完整回归结果不等于 C 组独立分支结果。

## 交付结论

已实现事件驱动的下载/任务/library 推送、轻量下载摘要、通知有界补发、协议心跳与背压；ClientSync 改为 dirty deadline，state 默认 30 分钟、data 最多 2 秒、command 立即。播放确认持久 ledger 和可选 confirmedPlaybackIds 已增加。协议与合并清单见 [03 计划](plans/03-ws-channel-events.md) 和 [通道文档](client-channel.md)。

C 组定向回归和最新全项目类型检查通过。完整 unit/system 当时仍有失败，因此不能宣称全项目验收通过。全量 bootstrap 移除、F 组投影与真实浏览器验收仍待联测。

## 环境与证据

- Windows，工作目录 `D:\opensource\fn-lxserver`。
- 验证使用 `D:\Program Files\nodejs\node.exe`，Node 22.22.3。系统默认 Gush runtime Node 24.19.0 与现有 SQLite 原生模块 ABI 不兼容，改用已安装 Node22，未重建或更换依赖。
- 所有测试使用临时账号/临时数据库；无生产服务构建、打包、commit 或 push。
- 日志目录：`C:\Users\yuhon\AppData\Roaming\cc.gush.desktop\sessions\88887716-7003-41ad-b157-f9d8118d71e4\tmp`。以下日志均在此目录，文件名可直接核查；它们是本机会话产物，不随仓库合并。

## 实际执行结果

| 命令 / 范围 | 结果 | 日志 |
| --- | --- | --- |
| `node --test test/wsEvents.test.cjs test/stateScheduling.test.cjs test/downloadEvents.test.cjs test/playbackAcknowledgements.test.cjs`（较早版本） | 12/12 | c-group-direct.log |
| `node --test test/wsEvents.test.cjs test/stateScheduling.test.cjs test/downloadEvents.test.cjs test/playbackAcknowledgements.test.cjs test/clientTransport.test.cjs test/clientPerformance.test.cjs test/clientChannel.test.cjs test/downloadsFrontend.test.cjs test/userInitialization.test.cjs test/userInitialization.system.test.cjs test/clientChannel.system.test.cjs` | 66/66，包含后续调度/07b适配修正与新增WS安全项 | c-group-final-targeted.log |
| `node --test test/wsEvents.test.cjs`（新增实例重建/公告权限/入站队列测试后） | 6/6 | c-group-final-ws.log |
| `node --test test/stateScheduling.test.cjs test/clientPerformance.test.cjs test/clientChannel.test.cjs`（最后远程模式/租约广播兼容修正） | 35/35 | c-group-final-scheduling.log |
| `node --test test/playbackAcknowledgements.test.cjs test/musicExperience.test.cjs test/clientChannel.system.test.cjs`（最后确认快照时序修正） | 17/17 | c-group-final-confirmation.log |
| `npm run test:unit` | 351 项，339 通过、12 失败；随后 C 组默认设置一致性失败已定向修复验证 | c-group-unit.log |
| `npm run test:system` | 31 项，27 通过、4 失败 | c-group-system.log |
| `node node_modules/typescript/bin/tsc --noEmit --project tsconfig.json` | 最新通过，exit 0，无输出；中途曾遇共享CustomMusicService类型错误，随后其他组修正，C未改该文件 | c-group-final-typecheck.log |

66 项定向包含真实 HTTP/WS/SQLite：订阅快照、3 秒空闲零 invoke/业务消息、进度 600ms 内/完成立即、旧异步快照丢弃、摘要权限、通知 3 条补发/50 条溢出、2 万 ID 仅摘要、慢连接、close 释放；fake clock 验证 30 分钟首次 deadline、持续 data 最多 2 秒、data/command 不带 state、配置/用户覆盖/0/阈值、hidden、失败重试不紧循环及等待 07b ack 落盘/租约释放；下载速度、可见页 HTTP 兜底、resolver 通知、暂停/旧代理快照防护；播放 A→B→A、清 history、重启、账号隔离。

第二次 WS 六项还实际创建新 ClientChannel 实例检查 epoch 变化，确认浏览器伪造公告不能发布，以及路由阻塞期间上行超过 64 条关闭 1013。

最后两组定向与66项有重叠，不能相加作为独立覆盖数量。35项补验远程模式仍遵守state/data/command，普通sender失败不阻止持久事件提交，并模拟07b领取/释放租约的变更广播；提交中不重新排自动flush。17项使用真实SQLite补验等待extras期间新增播放不出现在旧counts的确认ID中；确认ID在读取counts之前捕获。C仅在PlayCountService/ExperienceController接入，不改F的RoamingService文件。

## 完整回归未通过项目

这些失败取自运行时的共享工作区，没有隔离重现基线，不能统一称作“历史问题”。C 组未修改其他组代码来消除它们。

unit 失败涉及：

| 文件 | 失败数量 / 现象 |
| --- | --- |
| mobileSongMenu.test.cjs | 3；观察器 mock 缺 disconnect（其他组随后有修改，未重新全套验证） |
| navigationBehavior.test.cjs | 2；sidebarGeneration fixture 缺失 |
| playbackExperience.test.cjs | 3；audio listener fixture / 截取脚本语法 |
| routeRefactor.test.cjs | 1；ConfigurationService 跨业务域依赖 |
| settingsFrontend.test.cjs | 1；用户目录草稿数量不符 |
| systemConfigurationFrontend.test.cjs | 1；library.prefetch.pauseWhilePlaying 元数据/UI 断言 |
| userInitialization.test.cjs | 1；C 新客户端设置未同步服务端默认，已修复并在最后定向中通过 |

system 的 4 项：

| 文件 / 位置 | 现象 |
| --- | --- |
| clientPerformance.system.test.cjs 导入阶段 | DiscoveryService→user 导入读取未初始化的 global.lx；测试未开始 |
| musicLibrary.system.test.cjs:34 | scannedAt 毫秒精确断言不符 |
| musicTools.system.test.cjs:18 | 预期 30 文件但得到 0 |
| serverDownloads.system.test.cjs:259 | 后台保存的用户自定义目录未被播放器读取 |

中途类型检查曾报 `server/music/service/library/CustomMusicService.ts:337:131`：Type `number | undefined` is not assignable to type `number`。该文件由 A/B 组负责，C 未改；最后同一检查已通过。完整unit/system未因其他组后续修改再次重跑，合并负责人应统一重跑全部回归。

## 空闲调用与 CPU 受控比较

临时脚本 c-group-idle-benchmark.cjs 以 esbuild 加载基线和当前 ClientChannel，模拟一个已认证用户、一个 downloads 订阅、空队列、路由与 socket。每段约 60050ms，初始快照排除，测 process.cpuUsage 和队列 invoke。单次运行未做多样本统计，不是完整进程真实部署或浏览器 M 数据测量。

| 实现 | 实际时长 ms | invoke / 每分钟 | 业务消息 | CPU ms | CPU / 墙钟 |
| --- | ---: | ---: | ---: | ---: | ---: |
| 基线 7fd44a1 | 60059.4 | 59 / 58.94 | 0 | 141 | 0.2348% |
| C 事件路径 | 60056.5 | 0 / 0 | 0 | 31 | 0.0516% |

证据：c-group-idle-benchmark.json。旧实现即使签名相同不发消息仍采样；当前无事件零 invoke。CPU 有单样本噪声、mock 与进程环境限制，不报告真实性能提升倍率。后续入站限制/客户端适配未改变事件路径的空闲采样逻辑，但本表不是最终源码再次测得的数据。

## 未验证与合并注意

- 未执行真实浏览器播放 10 首/持续 30 分钟、移动端关闭 keepalive、真实网络下载失败与速度、NAS/fnOS、M 数据全服务 CPU/主线程测量；fake clock 不替代这些验证。
- bootstrap 保留 custom/list、cache/list，只有 A 确认前端分页消费者迁移后才能移除。
- F 的 snapshot+pending 投影仍须按 confirmedPlaybackIds 联测；幂等 ledger 保留 30 天最多 10000 ID，并非永久去重。
- 07b 已提供 prepareBatch/异步 ack/release；C 等待落盘，但真实多 tab 长请求/租约续期仍需联合验证。
- legacyProgressPolling 默认关；仅缺失事件源时显式开启，限订阅且活动任务。HTTP 上报模式仍接收 WS；仅断线且下载页可见有 5 秒 HTTP 兜底。
- 新增测试未改 package.json 的枚举脚本，合并负责人登记或直接运行上表定向命令。未构建与打包，属于 C 任务验证边界。
