# 手机播放页与桌面按钮修复验证

日期：2026-10-11。开发分支：`dev`。

## 本轮修改

- 手机歌曲行默认显示爱心和“···”；菜单移动原操作按钮，下载、加入歌单、不喜欢和删除的事件、权限保持原入口。菜单支持外部点击、Esc、方向键，列表重渲染和尺寸变化时清理并归还节点。
- 手机播放页按封面、标题及原音源品质标签、歌手－专辑、六个操作入口、进度和播放控制布局。封面透明度为 0.78，频谱和已有动效在背景全屏绘制。长标题在标签前缩小可用宽度，保留原截断或滚动处理。
- 歌词入口切换全屏同步歌词，使用当前封面的模糊背景；点击任意歌词位置返回播放页，不触发原歌词跳转。拖动保留浏览行为，进入和退出有动效，支持浏览器返回。
- 均衡器与评论交由 `PlayerFeaturePages.js` 独立呈现。手机页面顶部固定返回，均衡器优先展示 EQ 与预设；桌面仍使用原弹框。关闭动画结束后恢复原内容节点与业务事件。
- 通用 Element 控件适配器不再覆盖播放器图标和菜单按钮，桌面更多菜单恢复左对齐、无边框；均衡器和评论入口恢复图标样式。
- 音效同步改用现有登录会话判断，消除对旧浏览器密码字段的依赖；账号开启保存后可以通过原接口保存和回读。

主要文件：`client/music/views/player-detail/{PlayerDetailView.js,PlayerFeaturePages.js,mobile-player.css,player-detail.css,appearance.css}`、`client/music/views/mobile-shell/SongRowMenu.js`、`client/music/assets/element/element-controls.js`、`client/music/js/sound-effects.js`。页面加载与历史返回入口接在 `index.html` 和 `app.js`；新增单元测试接入 `package.json` 的 `test:unit`。

## 验证

| 验证 | 结果 |
| --- | --- |
| `rtk npm run test:unit` | 247 项通过 |
| `rtk npm run test:system` | 21 项通过 |
| `test/mobilePlayer.browser.cjs`，Playwright CLI + Chrome | 40 项通过 |
| JS Acorn 解析、CSS PostCSS 解析、UTF-8 替换字符检查 | 通过 |
| `rtk git diff --check` | 通过 |

新增单元测试覆盖：移动和还原原按钮、桌面不插入菜单、手机标签位置、面板节点复用、返回栈、关闭动效、歌词拖动与点击、尺寸切换清理，以及音效会话鉴权。手机标签位置用例先复现失败，再修复通过。

浏览器检查 320、375、390、767 像素和 667×390 横屏，以及 1440×900 桌面。真实隔离服务保存喜欢歌曲到 SQLite，并通过真实音效接口回读 EQ 调节值。频谱测试在浏览器生成短 PCM 音频，驱动原分析器和画布；分析器之后接零增益输出，避免发出测试声音。

外部评论平台对虚构测试歌曲返回错误，成功渲染、类型切换与分页使用明确的固定评论响应验证；不把这项结果作为外部平台可用性证明。测试封面使用项目占位图片。没有生产构建或发布，测试服务及数据均隔离于现有数据目录；系统测试生成的临时交付 ZIP 不作为发布产物。

本轮未改动工作区中其他正在进行的歌曲封面、导航或设置变更，保留其内容。

## 截图

- [手机播放界面](../output/playwright/mobile-player-390.png)
- [全屏歌词](../output/playwright/mobile-fullscreen-lyrics.png)
- [手机歌曲操作菜单](../output/playwright/mobile-song-actions.png)
- [手机均衡器](../output/playwright/mobile-equalizer.png)
- [手机评论](../output/playwright/mobile-comments.png)
- [桌面更多菜单修复](../output/playwright/desktop-player-menu-fixed.png)

## 后续播放页与导航调整

本节记录 2026-10-11 后续八项调整及桌面重复歌词修复，以上初版说明和测试数量保留为历史记录。

- 手机播放页隐藏滚动条，按可用高度缩小封面；竖屏控制区完整显示，短横屏仍能滚动访问控制区。
- 手机频谱画布移入封面容器，底边随封面下沿对齐；现有同步歌词节点放在封面与标题之间，继续使用原时间轴和行切换动画。
- 桌面独立播放页隐藏左侧两行歌词，只保留右侧歌词；底部迷你播放器的歌词维持原行为。
- 音量点击和拖动共用方向计算：底部播放器横向、独立播放页竖向；触摸禁止页面滚动，取消触摸时结束拖动，手机竖向触摸区域扩至 44px。
- 手机隐藏放大按钮、收藏和歌单导航的拖拽及下载图标，禁用这两组排序；切回桌面自动恢复排序。
- 收藏与不喜欢的子项使用相同图标尺寸、文字间距和行高；手机设置不生成后台管理入口。

实现文件：`app.js`、`components/player-bar/player-bar.css`、`views/player-detail/{PlayerDetailView.js,mobile-player.css,player-detail.css}`、`views/mobile-shell/{MobileShell.js,mobile-shell.css}`。新增 `test/volumeDrag.test.cjs`，扩展播放页与导航测试，并将音量及手机导航单元测试接入 `package.json`。

| 验证 | 最终结果 |
| --- | --- |
| `rtk npm run test:unit` | 254 项通过 |
| `rtk npm run test:system` | 21 项通过，真实 HTTP 与临时 SQLite |
| `test/mobilePlayer.browser.cjs`，Playwright CLI + Chrome | 66 项通过 |
| JS/CSS 解析、UTF-8 检查、`rtk git diff --check` | 通过 |

新增单元测试先复现竖向鼠标、触摸音量方向错误及手机排序未禁用，再修复通过。浏览器验证手机与桌面实际鼠标拖动，并通过 Chrome 原生触摸事件验证连续调节。尺寸覆盖 320/375/390/767×844、320×568/667/740、667×390、1440×900；尺寸断言在封面动画完成后执行。真实 PCM 音频继续驱动频谱绘制，验证不同高度下频谱底边与封面一致。

评论使用固定测试响应验证页面与分页；封面使用项目占位图。未执行生产构建或发布，保留工作区其他修改。

- [调整后的手机播放页](../output/playwright/mobile-player-390.png)
- [收藏与不喜欢对齐](../output/playwright/mobile-library-refined.png)
- [手机设置](../output/playwright/mobile-settings-refined.png)
- [桌面仅右侧歌词](../output/playwright/desktop-player-menu-fixed.png)
