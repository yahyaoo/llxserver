# 下拉实色背景与设置开关验证

日期：2026-10-10；分支：`dev`。

## 实现

- 新增 `client/music/css/popovers.css`：顶部主题／账号菜单、分类选择、通用选项下拉、搜索建议、播放器更多菜单／音量／模式／倍速、歌单操作和时间选择浮层使用实色主题背景，独立于页面透明度与模糊设置。
- 新增 `client/music/views/settings/SettingsToggle.js`：顶部设置按钮点击展开，再点收起，恢复进入前的页面节点、滚动位置、导航高亮；不调用普通切页的搜索／批量重置及设置回填。设置页控件与草稿复用原节点。
- 设置从右上角展开并反向收起，内容与目录依次过渡；连续点击取消旧动画，过期回调不能切错页面。减少动态效果模式直接切换。
- 在 `index.html` 加载新资源，`AccountActions.js` 接入开关按钮，`app.js` 的其他设置入口保持只打开设置，并在普通导航时取消旧动画。`settings.css` 提供动画样式。
- 新增 `test/settingsToggle.test.cjs`、`test/popoversSettings.browser.cjs`，更新单元测试入口及 HTTP 资源断言。

## 测试

| 检查 | 结果 |
| --- | --- |
| `rtk npm run test:unit` 对应的完整 Node 测试列表 | 156 / 156 通过（包含新增的 3 项设置开关测试） |
| `rtk npm run test:system` | 12 / 12 通过 |
| `rtk proxy node --test test/leaderboard.system.test.cjs` | 更新资源断言后 1 / 1 通过 |
| `test/popoversSettings.browser.cjs`，Playwright CLI | 85 项通过 |
| JS／CSS 解析、`git diff --check` | 通过 |

浏览器覆盖浅色／深色、透明度 0／0.5／1、桌面 1440 与手机 390 像素。通过真实按钮点击验证展开／收起动效、搜索与批量模式、选中数量、歌曲顺序、榜单标题、滚动位置和未提交输入保持不变；验证连续反向点击、普通导航取消动画及减少动态效果偏好。

测试使用隔离账号、临时 SQLite 数据目录与固定歌单数据，未操作现有业务数据。浏览器没有 `pageerror`；隔离实例仍存在与本轮菜单／设置开关无关的 `/api/music/file-status`、`views/downloads/DownloadOptions.js` 资源 404，未将控制台描述为完全无错误。未执行生产编译、提交或发布。

完整单元日志：[popovers-settings-unit.log](../output/popovers-settings-unit.log)。截图：

- [分类实色面板](../output/playwright/opaque-category.png)
- [顶部主题实色菜单](../output/playwright/opaque-theme.png)
