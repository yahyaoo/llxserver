# B 组 04：扫描与监听测试报告

日期：2026-10-13。运行时为 Windows、Node v22.22.3，测试目录和音频均在会话临时目录。新增定向测试命令：

```text
node --test test/libraryScan.test.cjs test/libraryScanScheduler.test.cjs test/libraryBackground.system.test.cjs
```

结果：扫描 worker、状态持久化、原生 watcher、调度合并、失败 dirty 重试及真实 HTTP/SQLite 联测均通过。另做一次 2000 目录×10 文件（20000 文件）临时基准，使用 fake tagger 只测扫描 IO：full 目录 stat/readdir/file stat/tags 为 2001/2001/20000/20000，耗时约 3029ms；未变化 quick 为 2001/0/0/0，耗时约 803ms。索引 JSON 约 13.38MB，首次 save 约 596ms，未变化 save 约 88ms。

该基准是单次 Windows 本地临时盘测量，标签读取为模拟实现，没有 NAS、fnOS、掉电、真实 2 万首媒体或前后版本对照，不能宣称计划中的 SSD/NAS 性能目标已经验收。

已覆盖：空根/挂载异常保旧索引、可信删除、越界与链接边界、quick 检查已知子目录、paths 原地标签与 sidecar、watch suppression 后显式 dirty、配置代际、全局串行、quick 不吞 paths、失败 paths 下一轮重试、重启保留水位。未覆盖：目标 fnOS 网络盘事件实测和 2 万条真实索引提交长期压力。
