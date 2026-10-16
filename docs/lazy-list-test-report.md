# A组客户端列表与图片测试记录

状态：已实现待验证（2026-10-13）。

自动测试覆盖虚拟列表窗口、overscan、更新/销毁，图片进入视口后才计算候选，以及清理后重新观察；音乐库系统测试覆盖分页接口。定向命令：`node --test test/pagedList.test.cjs test/virtual_list.test.cjs test/imageLoader.test.cjs test/musicLibrary.system.test.cjs`。

计划要求的 5000 首歌单首屏 P50/P95、DOM 行数和网络并发数尚未在真实浏览器性能环境测量，不能视为已达标。集成验收需手工检查快速滚动、搜索、加载更多、多选、拖拽、右键菜单、定位当前歌曲和移动端行高；重点确认 6 路图片调度及非可见行不触发候选计算。

合并注意：`image_loader.js` 与 `virtual_list.js` 需在使用它们的页面脚本前加载；07a 若调整 script 顺序，只保留一个加载入口。
