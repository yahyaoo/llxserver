# 设置与播放器外观优化验证

验证日期：2026-10-10。仓库：`D:\opensource\fn-lxserver`，分支：`dev`。

## 实现范围

- 新增 `client/music/css/interactions.css`，补齐主导航、设置导航、榜单目录、主题选项和按钮的悬停、按下与键盘焦点反馈；支持减少动态效果偏好。
- 调整 `client/music/views/settings/settings.css`，限制输入框、下拉框、数值框和滑块宽度，采用响应式分组与浅分隔线。
- 新增 `client/music/views/player-detail/appearance.css`，支持跟随页面（透明）、歌手氛围、封面虚化、纯色和黑色背景，深色图像背景使用浅色文字。
- 恢复底部频谱、频率脉冲、点阵频谱和灵动莲花选择，以及方块／连体、透明度和开关；继续复用原音频分析器、绘制调度与设置保存入口。
- 播放器现有封面布局、控件节点及进入／退出恢复流程保留。排行榜目录内部滚动、右侧页面滚动及普通页面透明内容区继续保留。
- 本轮未开发账号设置功能。共享工作区中的其他会话修改均保留，未提交或发布。

## 测试结果

| 验证 | 结果 | 内容 |
| --- | --- | --- |
| 全量单元测试（`test:unit` 对应的 Node 测试列表） | 131 / 131 通过 | 含播放器的 15 项测试，新增背景兼容、迟到图片请求、频谱间距与真实绘制器选择验证 |
| `rtk npm run test:system` | 8 / 8 通过 | 当前源码的 HTTP、SQLite、重启、下载、配置及交付包启动回归 |
| `rtk proxy node --test test/leaderboard.system.test.cjs` | 1 / 1 通过 | 补充后的新增 CSS 资源与设置选项检查，原榜单接口与歌曲数据回归 |
| `test/settingsPolish.browser.cjs` | 107 项通过 | 设置分组、三种屏宽、交互反馈、五种背景、四种实际音频驱动的效果及服务器保存／刷新恢复 |
| `test/leaderboard.browser.cjs` | 21 项通过 | 原目录滚动、页面滚动、分页、筛选、批量操作、播放入口与音源切换 |
| `test/pageSurfaces.browser.cjs` | 62 项通过 | 浅色／深色主题的透明内容区、表格、浅上下分隔线、悬停和选中反馈；最后一次使用 `local_list` 搜索范围复测通过 |
| 静态检查 | 通过 | 本轮 JS／CSS 解析、UTF-8 检查及 `git diff --check` |

浏览器合计 190 项检查通过。运行方式：

```powershell
rtk proxy node test/helpers/leaderboardRuntime.cjs
rtk proxy npx --yes --package @playwright/cli playwright-cli -s=settings-polish open <隔离实例地址>
rtk proxy npx --yes --package @playwright/cli playwright-cli -s=settings-polish run-code --filename test/settingsPolish.browser.cjs
rtk proxy npx --yes --package @playwright/cli playwright-cli -s=settings-polish run-code --filename test/leaderboard.browser.cjs
rtk proxy npx --yes --package @playwright/cli playwright-cli -s=settings-polish run-code --filename test/pageSurfaces.browser.cjs
```

## 证据与限制

- 测试使用临时数据目录和测试账号，未操作现有业务数据。榜单与外部歌单数据为固定测试响应，HTTP 服务及静态文件来自项目源码。
- 播放效果使用生成的短 WAV、原 `audio` 元素和真实音频分析器验证。图片使用浏览器生成的测试图，不注入生产代码。
- 设置通过真实 `/api/user/settings` 保存与回读，并验证刷新恢复。
- 未验证商业音源的在线音乐播放。未执行生产编译命令；系统测试按现有流程生成测试交付 ZIP 并检查启动。
- 早先并行登录改动期间的系统测试曾失败；当前完整复测已全部通过。本轮不修改其账号业务逻辑。

单元测试日志：[settings-polish-unit.log](../output/settings-polish-unit.log)。代表截图：

- [桌面设置](../output/playwright/settings-visuals-1440.png)
- [手机设置](../output/playwright/settings-visuals-390.png)
- [透明播放器](../output/playwright/player-background-theme.png)
- [封面虚化背景](../output/playwright/player-background-blur.png)
- [黑色背景](../output/playwright/player-background-dark.png)
- [频率脉冲](../output/playwright/player-visualizer-pulse.png)
- [点阵频谱](../output/playwright/player-visualizer-dots.png)
- [灵动莲花](../output/playwright/player-visualizer-flower.png)
