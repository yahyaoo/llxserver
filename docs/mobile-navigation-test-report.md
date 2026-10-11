# 手机排行榜与主导航修复验证

日期：2026-10-10；工作分支：`dev`。

## 修改

- 排行榜小屏目录改为在歌曲区上方展开，透明目录不再覆盖歌曲表格。目录限高并内部滚动，选择后收起；桌面保持目录固定、歌曲随页面滚动。
- “不喜欢”父级只控制展开／收起，保留当前页面、选中的子项和操作状态。桌面导航收起时，点击该入口会展开导航与子树。
- 收藏分组恢复排序实例，支持鼠标拖拽和手机长按手柄拖拽。收藏与歌单排序合并保存到原 `favoriteSidebarOrder` 设置，避免两组覆盖彼此；默认歌单仍固定在首位。
- 修改文件：`client/music/app.js`、`client/music/views/leaderboard/leaderboard.css`、`client/music/views/main-navigation/main-navigation.css`。
- 新增回归测试 `test/navigationBehavior.test.cjs` 与 `test/navigationBehavior.browser.cjs`；扩充 `test/leaderboard.browser.cjs`，将新单元测试加入 `package.json` 的 `test:unit`。未修改后端业务、提交或发布。

## 验证结果

| 验证命令／脚本 | 结果 |
| --- | --- |
| `rtk npm run test:unit` | 156 / 156 通过 |
| `rtk npm run test:system` | 12 / 12 通过 |
| `test/leaderboard.browser.cjs`（Playwright CLI） | 40 项通过 |
| `test/navigationBehavior.browser.cjs`（Playwright CLI） | 8 项通过 |
| JS／CSS 解析与本轮 `git diff --check` | 通过 |

新增三个行为单元测试先复现失败，修复后通过。榜单浏览器测试验证 320、375、390、768、1024 像素：展开时目录与歌曲区不重叠、目录内部滚动、无横向溢出、选择后收起，并回归桌面滚动、分页、筛选及播放队列入口。

主导航浏览器测试使用真实鼠标拖动和 CDP 触摸长按拖动；通过真实 `/api/user/settings` 回读确认排序保存，再刷新确认恢复。验证手机“不喜欢”展开保留最近页面及高亮、选择歌手后再次展开仍保留歌手子项，以及桌面导航收起后的展开行为。

测试实例采用临时账号、临时 SQLite 数据目录和固定榜单音源数据，未操作现有业务数据。未执行生产编译；现有系统测试生成临时测试交付 ZIP 并验证启动。浏览器初次被使用声明弹窗阻挡，完成隔离账号初始化后全部复测通过。

## 截图

- [390 像素目录展开](../output/playwright/leaderboard-open-390.png)
- [320 像素目录展开](../output/playwright/leaderboard-open-320.png)
- [390 像素目录收起](../output/playwright/leaderboard-390.png)
- [手机收藏拖拽后](../output/playwright/navigation-sorted-mobile.png)
