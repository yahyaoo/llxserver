# 07 基线与实测记录

测试时间：2026-10-13；Windows，HeadlessChrome 154，1365×900，DPR 1，4× CPU，隔离本地静态服务；数据来自固定种子 20261013 的 M 数据（5000 首队列、20000 首库、1000 条最近播放），不含音频。

## 结果

`perf=1` 才启用探针；默认页面无 PerformanceObserver。启动页实际加载 `css/tailwind.generated.css`，`window.tailwind` 为 `undefined`，本地 pako 可完成中文 gzip/ungzip 往返，隔离页未捕获运行时异常。

侧栏重复渲染采用同一口径（调用到 `whenMyListsRendered()` 完成），30 次样本 P50 **16.6ms**、P95 **18.5ms**、最大 **19.4ms**；节点复用成立，30 次没有 fallback aggregate。仅同步 `applyMyLists` 的 DOM 更新为 P50 0.1ms、P95 0.3ms，不代表完整首屏。

跑马灯真实 DOM 测试覆盖长文本、变短、节点复用、容器变宽和释放；未跑 30 分钟内存观察。初始启动 trace 在 4× CPU 下 LCP 8.829s，包含隔离服务启动与大量原有初始化；长任务最大 2264ms，不能写成达到预算，需集成负责人在统一登录/缓存条件下复测。

## 原始证据与限制

- 定向命令：`node --test test/clientPerfProbe.test.cjs test/clientPerformance.test.cjs test/browserStorage.test.cjs test/deferredWritesIdb.test.cjs test/staticDelivery.test.cjs test/staticWorker.test.cjs test/visualizerLifecycle.test.cjs test/mobileSongMenu.test.cjs test/dialogChrome.test.cjs test/playerBar.test.cjs test/playerDetail.test.cjs`；D 相关风险用例通过（分组补充测试见各报告）。
- 生成器只产生元数据，未验证音频解码、真实封面/歌词网络和低配实体设备。
- 浏览器隔离 mock 曾发现并修正数组响应与缺少 `setMode`；仍不能替代真实账户、iOS、独立网关生产流量。
