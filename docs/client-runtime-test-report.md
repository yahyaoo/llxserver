# 07c 运行期热点验证

`ClientPerformance.render` 使用 `scheduler.yield` 能力检测与 timer 降级；布局调度器同帧读后写。timeupdate 保留淡出、MediaSession、统计和保存业务，隐藏页只停 UI 写入。跑马灯使用单 IO/RO、局部注册和释放；侧栏使用 meta/revision、节点按 id 复用。

定向用例：`node --test test/mobileSongMenu.test.cjs test/dialogChrome.test.cjs test/playerBar.test.cjs test/playerDetail.test.cjs test/visualizerLifecycle.test.cjs test/downloadsFrontend.test.cjs test/mobileShell.test.cjs`，通过。频谱生命周期测试确认暂停、隐藏、视图关闭停止唯一循环，pageshow 恢复，destroy 移除监听。

浏览器 M 数据侧栏 30 次完整样本 P50 16.6ms/P95 18.5ms；未达到或未测的 30 分钟内存、iOS 锁屏、真实媒体解码、所有歌词模式和低配设备均标记未验证。
