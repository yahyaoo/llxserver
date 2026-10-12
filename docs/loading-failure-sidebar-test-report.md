# 加载失败展示与侧栏加载状态验证

日期：2026-10-12

## 最终行为

- 最近播放、在线搜索、排行榜、音乐库和音乐库搜索的加载失败使用中文提示、主题图标及重新加载按钮，不将底层异常文本插入页面。
- 最近播放加载中或失败时，列表刷新不覆盖加载提示或重试入口；旧账号和旧请求的结果仍被忽略。
- 侧栏歌单加载提示移到歌单标题下方。
- 收藏在初始加载、空数据和正常数据时均保留收藏歌曲、收藏歌手、收藏专辑入口，初始数量为零。

## 本次修改文件

- `client/music/components/loading-state/index.js`
- `client/music/components/loading-state/loading-state.css`
- `client/music/views/recent/RecentView.js`
- `client/music/views/main-navigation/MainNavigation.js`
- `client/music/components/top-bar/SearchBox.js`
- `client/music/js/leaderboard_manager.js`
- `client/music/js/local_music.js`
- `client/music/app.js`
- `test/loadingState.test.cjs`
- `test/navigationBehavior.test.cjs`
- `test/loadingFailure.browser.cjs`

## 验证结果

- `rtk proxy node --test test/loadingState.test.cjs test/navigationBehavior.test.cjs test/musicExperienceFrontend.test.cjs`：22/22 通过。包括文本转义、重试防重入、失败后恢复、旧账号/旧请求忽略、加载状态保护以及收藏固定入口。
- `rtk npx --yes --package @playwright/cli playwright-cli -s=load-errors run-code --filename test/loadingFailure.browser.cjs`：15/15 通过。使用临时账号、独立服务及真实 SQLite，验证四种外观、手机端无横向溢出、歌单提示位置、收藏三项以及重试后真实最近接口返回 HTTP 200。
- 最近播放、音乐库、排行榜对应的真实接口系统测试均通过；排行榜一次复跑遇到 Windows 临时目录清理 EBUSY，单独重试通过。
- JavaScript 使用 Acorn 解析通过；UTF-8 替换字符检查通过。
- `rtk git diff --check`：通过。

## 全量测试限制

工作区存在并持续更新其他未提交改动，本次未调整后端逻辑或数据断言。

- `rtk npm run test:unit` 最近一轮结果为 299/300 通过；剩余失败为 `test/playlistImport.test.cjs` 的重复歌曲保留断言。日志：`output/playwright/loading-failure-unit.log`。
- `rtk npm run test:system`：21/23 通过；`playlistImport.system.test.cjs` 和 `sqliteMigration.system.test.cjs` 的重复歌曲保留断言失败。

页面截图保存在 `output/playwright/loading-failure-desktop.png` 和 `output/playwright/loading-failure-mobile.png`。
