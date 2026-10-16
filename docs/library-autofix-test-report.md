# B 组 06：自动修复与安全写测试报告

日期：2026-10-13。运行时为 Windows、Node v22.22.3，使用临时目录的真实测试音频：Taglib `bladeenc.mp3`、`sinewave.flac`，以及固定提交的 `id4.m4a`。定向命令：

```text
node --test test/libraryAutoFix.test.cjs test/libraryAutoFixService.test.cjs test/libraryBackground.system.test.cjs
```

结果：MP3、FLAC、M4A 的自动嵌入/填空读取、压缩音频载荷 SHA256 与字节数保持、时长和标签读回均通过；取消、外部修改、写 tag 失败、音频校验失败、rename 失败、低磁盘空间、无效/空 payload 均保留原文件并清理暂存。私有缓存自动服务验证了本地可信 LRC、审计、索引回写、状态持久化和 24 小时前孤儿暂存清理。

音频载荷校验排除了已知 tag 区：MP3/FLAC/MP4 mdat；不代表完整解码、听音或所有编码器兼容性。自动动作默认关闭；custom 与 location=custom、独立 Subsonic 端口因无法证明外部独占而记录跳过。关闭开关不撤销已经写入的文件，本期没有长期备份恢复入口。

未测：电源故障、真实并发播放器与独立 Subsonic 端口联测、fnOS 文件系统和长期低磁盘压力。手动维护默认 overwrite 路径仍由原测试覆盖。
