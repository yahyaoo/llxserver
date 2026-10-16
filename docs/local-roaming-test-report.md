# 本地随机/漫游测试报告（F/09）

日期：2026-10-13
范围：本地完整候选池、纯规则抽样、本地权重投影、确认 playbackId、预选 token。

## 实现

- `client/music/js/roaming_core.js` 提供无副作用的 `key`、`valid`、`weight`、均匀抽样和加权抽样；沿用 `min(1e9, 1 + count + extra)`，特殊 source 使用字符串前缀处理。
- `client/music/js/roaming.js` 从 `ListStore` 读取当前 scope 的权重快照和 pending 增量；有效播放立即落盘到 pending，收到 `confirmedPlaybackIds` 的新快照后只移除已确认记录。权重刷新合并为后台单请求，不阻塞本地选择。
- `client/music/app.js` 的随机/漫游预选保存 `entryId + revision + mode`，队列编辑、账号切换和模式切换会失效预选；播放统计回调只增加一次本地 projection。
- `server/music/service/RoamingService.ts` 保留历史 key 和数值规则，并移除 source 作为正则使用的歧义。

## 已执行验证

在 `D:\opensource\fn-lxserver` 执行：

- `node --test test/roamingCore.test.cjs test/localRoaming.test.cjs test/localRoaming.system.test.cjs`：6 项通过。
- `node --test test/playbackAcknowledgements.test.cjs test/browserStorage.test.cjs test/clientPerformance.test.cjs`：21 项通过。
- `git diff --check`（F 组文件）：通过。
- `node --check`：`roaming_core.js`、`roaming.js`、`app.js` 均通过。

统一全量命令也已执行：`npm run test:unit` 有 354 项通过、6 项失败，失败来自并行 D 组的 `renderMyLists`/播放体验隔离测试和既有路由哈希变更；`npm run test:system` 的 F/音乐库相关链路在修复后单独重跑全部通过，首次全量运行中的客户端性能初始化错误属于并行改动环境问题。

覆盖场景包括 5000 首完整本地候选、断网选择、慢权重接口不阻塞选择、无权重回退、pending 立即加权、确认 ID 去重、特殊 source key、有限随机边界和账号 scope。

## 尚待集成负责人验证

`client/music/index.html` 的公共脚本顺序属于 07a 归属，本组未修改；集成时需将 `roaming_core.js` 放在 `roaming.js` 之前，并验证独立客户端与服务端包均能提供该资源。真实浏览器多 tab、NAS 部署、跨设备权重合并和 07b/03 联测仍需在集成分支完成；本报告不把局部测试数据宣称为性能预算达标。
