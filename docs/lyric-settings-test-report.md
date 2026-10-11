# 歌词显示设置迁移验证

日期：2026-10-10

歌词显示设置从设置页移至播放页“更多 → 歌词显示设置”，使用弹框配置。字号、字体、荧光、翻译、罗马音和排列顺序沿用原设置入口，修改后立即生效并保存。左侧主菜单移除“设置”，右上角设置按钮继续可用。

主要实现位于 `client/music/views/player-detail/components/LyricSettings.js`，复用原歌词控件 ID 和设置更新回调。原生对话框支持 Esc、关闭按钮、遮罩关闭以及焦点恢复；字体选择使用原生下拉框，避免已有 Portal 下拉框被对话框顶层遮挡。

验证结果：

- `npm run test:unit`：139 项通过，包含 `test/lyricSettings.test.cjs` 的迁移、弹框生命周期和实际设置更新单元测试。
- `npm run test:system`：10 项通过，使用真实 HTTP 服务和隔离数据库。
- `playwright-cli -s=lyric-settings run-code --filename test/lyricSettings.browser.cjs`：通过。验证菜单入口、六项设置即时效果、三种关闭方式、焦点恢复、真实账号设置接口回读、刷新恢复和手机横竖屏边界，无脚本异常。
- 截图人工检查：1440×900、390×844、844×390，弹框位于视口内，窄屏内容可滚动。
- 未执行前后端构建，遵循 `skip-compilation-verification` 约定。

浏览器测试使用 `test/helpers/leaderboardRuntime.cjs` 启动临时服务，播放器入口为 `/`。测试歌词仅注入隔离浏览器，使用真实解析器和渲染回调，不写入生产代码。截图位于忽略目录 `output/playwright/lyric-settings-*.png`。

整个工作区的 `git diff --check` 提示 Token 管理代码存在原有行尾空白；本次功能变更未引入行尾空白。
