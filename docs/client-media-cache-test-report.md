# 客户端媒体缓存（E/08）验证记录

日期：2026-10-13
范围：`client/music/js/media_cache.js`、`media_cache_settings.js`、歌词入口适配、设置控件。

## 已执行

- `rtk node --test test/mediaCache.test.cjs`：5 个单测通过。覆盖账号/服务器 scope、歌词完整字段、有效命中零 loader、同请求多 consumer、全部取消、版本失效、封面 Blob 对象 URL 释放、容量/数量淘汰和禁用降级。
- `rtk node --test test/playbackLyrics.test.cjs test/lyricSettings.test.cjs test/settingsFrontend.test.cjs`：相关回归通过（26 个测试）。
- `rtk node --test test/mediaCache.system.test.cjs`：真实 HTTP 静态资源交付测试已添加；需在隔离服务静态交付恢复后重跑完整页面断言。
- Playwright MCP 真实浏览器：在已登录页面执行原生 IndexedDB 流程。歌词首次加载 `calls=1/cache=miss`，同版本再次读取 `cache=hit` 且歌词完整；刷新后仍 `cache=hit`、`calls=0`；不同账号同 resourceKey 为 `miss`；封面 Blob 返回对象 URL，调用 `release()` 后可释放；按歌词清理后统计从 1 条/92 字节回到 0。

## 数据与边界

- 数据库为独立 `lx_music_media_cache`，`media/meta/state` 三个 store；认证 token 不进入 key、payload 或 metadata。
- 默认预算为封面 128 MiB/5000 条、歌词 16 MiB/10000 条；单封面 8 MiB、单歌词 1 MiB；TTL 分别为 30 天和 7 天，负缓存 10 分钟。
- 旧 `lx_lyric_<source>_<songmid>` 带尾空格和无尾空格变体按需读取，成功结果先写新 IDB，再由新缓存路径清理精确旧键；服务器歌词缓存开关保持独立。
- IDB 不可用、事务失败、配额不足和跨域不可读时回到原有网络/内嵌歌词流程，不触碰 `lx_music_store`、歌单或 outbox。

## 未验证项

- 当前隔离服务的静态交付改动返回部分 503，设置页完整 DOM 交互和真实歌词 HTTP 接口链路需在集成分支静态资源修复后重跑。
- 尚未在真实浏览器完成多 tab `versionchange`、隐私模式配额、离线断网、跨域 CORS 图片降级和 20 次列表复用的对象 URL 上限测量。
- 图片列表的视口门控、统一六路网络调度由 02 负责；Service Worker 清理边界由 07a 负责，本组未改写其实现。
