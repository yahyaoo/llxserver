# 页面样式回归修复与巡检

日期：2026-10-11。仓库：fn-lxserver，分支：dev。

## 修复内容

- 顶部主题与账号触发按钮恢复透明、无边框样式及原尺寸；隐藏状态恢复，登录后不重复显示“账户”；长昵称省略；头像图标居中。
- 睡眠定时、Token、同步及手动索引等嵌套弹框只识别实际标题栏，正文放在标题下方。保留原关闭回调，避免重复关闭按钮。
- 桌面侧栏主菜单左对齐，收起后图标居中。底部收起按钮恢复两侧外边距，避免越界。
- 收藏与歌单行内操作按钮恢复紧凑尺寸，避免展开目录裁切最后一行。
- 手机账号头像居中；热搜长标题只在文字区域内滚动，不挤掉序号和搜索图标。
- 音乐库目录选择器保留可读宽度；窄屏目录控件独占工具栏第二行，避免按钮被挤出视口。

## 主要修改文件

- `client/music/components/dialog/DialogChrome.js`、`dialog.css`
- `client/music/components/top-bar/top-bar.css`
- `client/music/views/main-navigation/main-navigation.css`
- `client/music/views/mobile-shell/mobile-shell.css`
- `client/music/assets/element/element-controls.js`
- `client/music/css/app.css`、`page-surfaces.css`
- `client/music/index.html`：音乐库工具栏增加布局定位 ID。
- `test/dialogChrome.test.cjs`、`dialogLayout.browser.cjs`、`pageLayoutAudit.browser.cjs`
- `package.json`：增加 `test:layout` 回归入口。

## 验证结果

所有命令均通过 RTK 执行，浏览器连接本地隔离账号服务和临时 SQLite，未使用用户 NAS 数据。

| 验证 | 结果 |
| --- | --- |
| `npm run test:unit` | 225 项通过 |
| `npm run test:layout` | 6 项通过，覆盖新增弹框标题识别与手机导航行为 |
| `npm run test:system` | 17 项通过，真实 HTTP、SQLite 与部署入口验证 |
| `dialogLayout.browser.cjs` | 61 项通过：768–1920px 顶部、390px 弹框、18 个静态弹框、收藏悬停及侧栏收起 |
| `elementControls.browser.cjs` | 72 项通过：1440/1024/390px 的全部设置分区及控件交互 |
| `pageLayoutAudit.browser.cjs` | 34 项通过：搜索、在线歌单、排行榜、最近、音乐库、下载、收藏、手机独立页和播放详情 |
| `mobileShell.browser.cjs` | 50 项通过：320–1440px 手机/桌面切换、横屏、底部留白、收藏和音源弹框 |
| `git diff --check` | 通过 |

浏览器四组回归共 217 项断言通过，无脚本异常。截图逐页人工复查；热搜文本、目录控件、头像居中等只靠页面总宽度无法发现的问题已补充专门断言。

按照项目约定未运行前后端编译。本次未提交、推送或发布。

## 截图

截图位于 `output/playwright/`，包括 `dialog-fixed-1440.png`、`dialog-fixed-390.png`、`sidebar-fixed-expanded.png`、`sidebar-fixed-collapsed.png`、`audit-*.png` 及 `layout-overview-*.png`。
