# B 组 05：封面与歌词预取测试报告

日期：2026-10-13。运行时为 Windows、Node v22.22.3，状态与缓存目录隔离到临时目录。定向命令：

```text
node --test test/libraryPrefetch.test.cjs test/libraryMediaCache.test.cjs test/libraryBackground.system.test.cjs
```

结果：预取队列/扫描暂停/用户轮转/资源指纹迟到保护/限速与禁用取消/退避、完整歌词字段与 sidecar 版本、账号隔离、缓存 miss 复核、配额只清理哈希媒体文件、真实 HTTP 图片 ETag/304/鉴权均通过。

本期网络预取默认允许，但只对已有稳定平台关联的记录调用注入 fetcher；本地 LRC 与内嵌歌词优先，歌词写用户隔离的只读媒体缓存，不写音乐目录或音频。`pauseWhilePlaying` 没有可靠播放状态来源，未实现且未进入默认配置。配额清理允许批次内短暂超预算，不删除音频、sidecar、索引或用户数据。

未测：真实源站 P95、fnOS/NAS、长时间网络错误恢复以及客户端 08 独立缓存联测。媒体版本和 HTTP 缓存头只做了本地端到端验证。
