# 排行榜布局验证记录

日期：2026-10-10

排行榜模板提取到 `client/music/views/leaderboard/LeaderboardView.js`，榜单目录组件位于该页面的 `components/LeaderboardNavigation.js`。目录外观参考设置导航，页面与组件组织参考 qdgw 的 `system/depart` 页面。

后续样式调整：榜单目录以连续序号代替图标，目录容器及普通、悬停、选中项均使用透明背景，序号与名称为黑色，选中项只加粗；目录不应用共享外观的磨砂与阴影。

右侧标题、工具栏、歌曲和分页共用排行榜页面滚动；左侧目录固定在可视区域，榜单列表在内部独立滚动。播放栏占位放在分页之后，目录末尾也保留占位。平板和手机继续沿用目录抽屉与遮罩。

仅提取原目录渲染与选中态，原榜单加载、歌曲加载、榜单选择、播放单曲和播放全部方法保持一致，API 路径及参数不变。保留工作区已有和并行的其他修改。

## 验证结果

| 验证 | 命令 | 结果 |
| --- | --- | --- |
| 全部单元测试（含新增组件测试） | `rtk npm run test:unit` | 120 项通过 |
| 现有 HTTP 系统测试 | `rtk npm run test:system` | 5 项通过；此轮执行时新增排行榜测试尚未登记 |
| 新增排行榜 HTTP 系统测试 | `rtk proxy node --test test/leaderboard.system.test.cjs` | 1 项通过，现已登记到 `test:system` |
| 最后组件与 HTTP 回归 | `rtk proxy node --test test/leaderboardFrontend.test.cjs test/leaderboard.system.test.cjs` | 4 项通过 |
| 浏览器系统测试 | `rtk proxy npx --yes --package @playwright/cli playwright-cli -s=leaderboard-style run-code --filename test/leaderboard.browser.cjs` | 21 项通过，含连续序号、透明背景、黑色文字与悬停状态 |
| 差异空白检查 | `rtk git diff --check` | 通过 |

浏览器验证桌面 1440×900、平板 1024×768 和手机 390×844。覆盖左右独立滚动、目录固定、末尾榜单可点击、榜单和音源切换、分页顺序与回顶、搜索过滤、批量选择、播放队列参数、抽屉完全收起、遮罩关闭和无横向溢出。

浏览器截图位于 `output/playwright/leaderboard-desktop.png`、`leaderboard-1024.png` 和 `leaderboard-390.png`。

## 复现与范围

运行 `rtk proxy node test/helpers/leaderboardRuntime.cjs`，打开它输出的地址，在隔离实例完成首次访问提示，然后执行浏览器测试命令。该实例使用当前源码、真实 HTTP 路由与单独的临时数据目录，外部音源以 45 个榜单、80 首歌曲的固定测试数据替代。结束时按 Ctrl+C 关闭并清理临时数据。

播放验证观察原队列入口及参数，不发起真实音频播放；没有验证第三方音源可用性。未登录实例产生的不喜欢和自定义音源账户接口 401/403 不属于排行榜失败。未执行生产编译，本次页面脚本与 CSS 通过真实服务直接加载验证。

## 全页面透明内容区与分隔线回归

新增 `client/music/css/page-surfaces.css`，覆盖音乐前端搜索、歌单、歌单详情、排行榜、收藏、音乐库、最近、设置（含关于分组）和播放器详情。内容面板、表头与普通歌曲行透明，不使用面板模糊或阴影；保留输入框、按钮、封面、主题预览与弹出层的组件外观。共享主题选择器按完整类名匹配，避免把悬停类当成常驻面板。

主要表格、榜单目录、最近列表及设置表单面板采用 1px 上下分隔线，颜色为主题文字色的 10% 透明混色；不围四边框。排行榜目录移除右侧竖线，保持透明黑色文字与连续序号。普通行不加底色；悬停与批量选中仅保留轻量提示。透明歌单和播放器详情打开时，用 CSS 隐藏后方内容，关闭后恢复；不改变业务状态。

本轮验证：

| 验证 | 命令 | 结果 |
| --- | --- | --- |
| 全部单元测试 | `rtk npm run test:unit` | 122 项通过 |
| 全部系统测试 | `rtk npm run test:system` | 6 项通过 |
| 新增共享样式真实 HTTP 加载 | `rtk proxy node --test test/leaderboard.system.test.cjs` | 1 项通过 |
| 排行榜交互、滚动与响应布局 | `playwright-cli -s=leaderboard-style run-code --filename test/leaderboard.browser.cjs` | 21 项通过 |
| 全页面样式与浅色、深色主题 | `playwright-cli -s=leaderboard-style run-code --filename test/pageSurfaces.browser.cjs` | 60 项通过 |
| 差异与编码检查 | `rtk git diff --check`、UTF-8 读取新增 CSS | 通过，无替换字符 |

跨页面浏览器测试使用原列表和详情渲染入口，验证透明根节点、表格和普通行、上下浅色分隔线、悬停和选中提示、歌手与专辑详情、设置分组、输入框与浮层、透明详情遮蔽后方内容以及关闭后的恢复。测试歌曲来自隔离实例，第三方歌单响应仅在测试浏览器中固定返回，不写入生产代码。收藏页根节点已验证透明；隔离实例未登录，未验证真实账号收藏数据加载。

已查看动画结束后的桌面截图：`output/playwright/page-surfaces-light.png`、`page-surfaces-dark.png`、`player-surfaces-light.png`。生产编译未执行。
