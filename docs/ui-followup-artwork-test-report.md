# 界面与歌曲封面回归记录

作者：jingyh；日期：2026-10-11。工作目录：`D:/opensource/fn-lxserver`；分支：`dev`。

## 完成行为

- 歌单左侧拖动手柄默认宽度和边距均为零；移入时以 200 毫秒动画展开、淡入，并推动封面和名称右移；移出后平滑复位。键盘焦点和拖拽期间保留手柄；遵循减少动态效果设置。
- 收藏、最近播放、下载管理、音乐库、自定义目录、缓存抽屉、重新下载选择列表与播放栏使用统一封面候选。优先读取本地文件封面，再尝试按歌曲标识缓存和在线候选；旧记录丢失图片字段仍可命中磁盘缓存。
- 图片按账号和歌曲标识缓存到磁盘，读取成功后保存展示封面状态。封面状态与内嵌歌词、歌词文件及音频元数据判断分开；图片加载失败不会改写这些状态。
- 最近记录保留原始歌曲封面字段；封面展示不依赖当前页面的图片元素。
- 修复底栏封面尺寸、底栏宽度、整行悬停播放蒙层、最近与下载行布局、歌单菜单位置、Metro 歌单磁贴、主题色和黑白图标对比度，以及管理登录间距。

## 主要代码

- `client/music/views/main-navigation/main-navigation.css`：拖动手柄零占位及动效。
- `client/music/js/music_experience.js`、`components/library-artwork/index.js`：统一封面候选、认证和回退。
- `client/music/app.js`、`js/local_music.js`、`js/customDir.js`：列表及播放栏接入。
- `server/music/service/library/SongArtworkService.ts`：磁盘缓存、展示状态回写、图片校验和下载。
- `server/music/service/PlayCountService.ts`、`CustomMusicService.ts`、`FileCacheService.ts`：历史封面保存及本地文件封面缓存。
- `sql/music/001_initial.sql`、歌曲封面模型和仓储：封面状态持久化。

## 验证结果

| 验证 | 结果 |
| --- | --- |
| `npm run test:unit` | 244 项通过，0 失败 |
| `npm run test:system` | 21 项通过，0 失败；真实 HTTP 和临时 SQLite |
| Playwright `test/uiFollowup.browser.cjs` | 24 项通过，0 页面脚本错误 |
| 管理登录浏览器检查 | 桌面间距 17px；手机无横向溢出；登录接口 200，进入控制台 |
| `git diff --check` | 通过 |

测试日志：`output/playwright/ui-followup-unit.log`、`output/playwright/ui-followup-system.log`。

截图：`output/playwright/ui-followup-playlist-hover.png`、`ui-followup-recent.png`、`ui-followup-downloads.png`、`ui-followup-playlist-tiles.png`、`ui-followup-white-black.png`、`ui-followup-mobile.png`、`ui-followup-admin-login.png`。

浏览器使用隔离服务和测试账号；自定义目录回退用不存在的文件验证本地失败后缓存成功，预期产生图片接口 404。播放操作检查歌曲传入与封面显示，未验证外部音源的实际音频播放。在线图片网络下载的双栈和地址固定行为由单元测试模拟验证，持久缓存另由真实 HTTP 和 SQLite 验证。

按适用的跳过编译技能未运行前后端构建。工作区包含并行任务修改，保留其内容；本报告记录上述测试时的结果。
