# A组服务端分页测试记录

状态：已实现待验证（2026-10-13）。

已覆盖分页参数边界、搜索与稳定排序、越界页、版本/ETag 区分、最近播放分页，以及真实服务启动后的 `/api/music/cache/page`、`/api/music/custom/page` 请求。定向测试使用 `node --test test/pagedList.test.cjs test/musicLibrary.system.test.cjs`。

2万条数据的首页/后续页性能目标来自计划（首页 <150ms，后续页 <20ms）；本次没有在固定 SSD 基准机上生成 2 万条真实索引，因此不把目标写成实测结果。合并后应在集成环境补跑冷缓存、热缓存和搜索三组测量。

合并注意：保留旧 `cache/list`、`custom/list` 和无参数 `recent` 响应；分页请求只映射当前页。04 完成后台扫描后，应确认分页请求不会触发扫描。
