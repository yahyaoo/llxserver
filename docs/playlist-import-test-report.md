# 歌单追加导入测试报告

测试日期：2026-10-10。开发分支：`dev`。

## 实现

- 歌单标题的 `+` 展开“新建 / 导入”，新建沿用原命名弹框。
- 复用现有 `parseLxConfiguration` 的洛雪 `playList_v2` 解析，兼容本站 `lxserver-playlist` v1 与服务器列表备份；单文件最大 20 MB，支持 UTF-8 BOM。
- 新接口 `POST /api/music/playlists/import` 生成新的歌单 ID 并追加，保留已有歌单、歌曲顺序、重复歌曲及扩展字段。
- 复用 `MusicConfigurationRepository` 的 SQLite 事务保存完整歌单快照，成功后更新内存和同步游标；同一用户的导入请求串行处理。
- 个人歌单限定当前账号，公开歌单需要管理员身份。导入失败不更新列表或缓存。
- 菜单使用页面浮层，支持点击外部、Escape 关闭和方向键选择，避免侧栏裁剪。
- 歌曲添加弹框的歌单名称复用现有 HTML 转义，防止导入名称被解释为标记。

## 验证结果

| 验证 | 结果 |
| --- | --- |
| `rtk npm run test:unit` | 153 项通过，包含 5 项新增导入单元测试 |
| `rtk npm run test:system` | 12 项通过，包含新增真实 HTTP + SQLite 导入系统测试 |
| 名称转义调整后的相关单元回归 | 25 项通过 |
| Playwright 浏览器验收 | 25 项通过，桌面 1440×900、手机 390×844 |
| `rtk git diff --check` | 通过 |

系统测试直接运行当前服务源码，使用临时 SQLite 库，验证导入数据实际入库、BOM 上传、用户隔离、非法文件不写入、并发追加和服务重启后的数据恢复。

浏览器脚本为 `test/playlistImport.browser.cjs`。启动 `test/helpers/accountRuntime.cjs` 的隔离服务后，在登录页执行该脚本。原生文件选择窗口及 CLI 上传已单独验证；完整自动化仅替换打开原生窗口的动作，文件输入、上传接口、数据库保存与页面刷新均走真实流程。

桌面和手机截图保存于 `output/playwright/playlist-import-desktop.png`、`output/playwright/playlist-import-mobile.png`。

未单独执行前后端构建命令；既有系统回归包含交付 ZIP 启动验证。测试未访问现有用户数据目录。保留工作区原有修改，未提交或推送。
