# 弹框与手机导航改版验证

验证日期：2026-10-11。开发分支：dev。作者：jingyh。

## 已实现

- 弹框统一紧凑标题栏、左侧蓝条、关闭按钮及 10px 外层内容内边距，覆盖静态弹框、动态输入/确认框、Element 消息框和原生对话框。
- 音源管理移除“上传到”提示；平台编辑标题附带源名和版本，宽屏三列（五个平台两行）、普通窗口两列、手机单列。
- 来源标签保留洛雪平台色，QQ 为绿色；无损采用既有蓝色系，平台色不随主题改成粉色。搜索列表、缓存列表和播放栏使用一致的音质颜色。
- 各歌曲列表移除表头井号，保留排序入口。
- 767px 及以下使用独立手机首页、音乐库、在线搜索、设置与账号页面。顶部右侧搜索与底部搜索 tab 共用原在线搜索页面。
- 手机音乐库复用原菜单节点：常规入口一张卡片、收藏和不喜欢各一张卡片、歌单原地展开。窗口变宽后节点返回原侧栏，不复制业务数据。
- 手机原顶部栏和浮动播放栏隐藏，底部固定导航及当前封面入口进入原播放详情；控制按钮居中。滚动区预留顶部、底部和设备安全区。

## 主要文件

- `client/music/views/mobile-shell/MobileShell.js`、`mobile-shell.css`：手机页面、菜单节点移动与还原、导航选中态、设置入口、封面同步。
- `client/music/components/dialog/DialogChrome.js`、`dialog.css`：统一弹框装饰及响应式平台布局。
- `client/music/index.html`、`app.js`：组件接入、源标题信息、删除上传文案、标签配色、页面切换。
- `client/music/views/leaderboard/LeaderboardView.js`、`views/recent/RecentView.js`：删除表头井号。
- `test/mobileShell.test.cjs`、`test/mobileShell.browser.cjs`：单元与真实浏览器回归。

## 验证结果

| 检查 | 结果 |
| --- | --- |
| `rtk npm run test:mobile` | 新增单元测试 2 项通过 |
| `rtk proxy node --test test/mobileShell.test.cjs test/navigationBehavior.test.cjs test/playerBar.test.cjs` | 相关回归 14 项通过 |
| `rtk npm run test:unit` | 曾通过 204/204；工作区并行增加后端功能后，最新结果为 207/208 |
| `rtk npm run test:system` | 真实 HTTP 与 SQLite 系统测试 15 项通过 |
| `playwright-cli -s=mobile-final run-code --filename test/mobileShell.browser.cjs --raw` | 浏览器 50 项通过，页面脚本异常 0 项 |
| `rtk git diff --check` | 通过 |

最新全量单元测试的唯一失败为 `test/sqliteFileManager.test.cjs` 中“每张 SQL 表都能找到对应实体、DTO 与 VO，公共字段映射完整”：工作区并行新增 `client_favorite_song` 表尚缺少对应实体映射。独立重跑可以复现，未修改该后端开发内容。

浏览器使用 `test/helpers/accountRuntime.cjs` 创建的隔离账号与真实 SQLite，不使用原数据目录。真实接口导入并回读 18 个测试歌单；验证最后一项滚动到固定底栏上方。

覆盖宽度 320、390、767、768、1024、1440px，以及 667×390 手机横屏。验证手机直接刷新、收藏展开与子列表、右上角搜索、底部 tab、账号设置与返回、改密弹框清理、播放详情、菜单节点还原、单个平台开关、全部启用/关闭、动态确认框取消回调。

依据 skip-compilation-verification 技能未运行前后端构建。没有提交或发布。

## 截图

- `output/playwright/source-modal-desktop.png`
- `output/playwright/source-platforms-desktop.png`
- `output/playwright/source-platforms-mobile.png`
- `output/playwright/mobile-library-390.png`
- `output/playwright/mobile-settings-390.png`
