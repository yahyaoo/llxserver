# v2.1.4 发布准备验证

日期：2026-10-11；分支：dev。版本按用户要求从 2.1.3 升级为 2.1.4。

## 发布改动

- 纳入手机播放页、歌曲行菜单、独立歌词/均衡器/评论页、音效会话保存、封面缓存回退及设置布局改动。
- package.json、package-lock.json、网页配置和三个飞牛模板统一为 2.1.4。
- 正式发布流程只接受已合并至 main 的标准版本标签，复用桌面构建并收集三种 ZIP 与三种 FPK；草稿附件经过 SHA256 摘要和实际下载回读校验后才公开。
- 更新检查系统测试读取实际项目版本，并动态构造下一补丁版本，避免每次版本升级导致固定测试夹具失效。

## 本次本地验证

| 检查 | 结果 |
| --- | --- |
| npm run build:fpk；同一编译结果生成 server/client FPK | 三种实际 FPK 构建及内部标识校验通过 |
| npm run test:unit | 247 项通过 |
| npm run test:system | 21 项通过；真实 HTTP、SQLite、三种 ZIP 启动及重启恢复 |
| npm run test:fpk | 9 项通过 |
| npm run test:fpk:system | 3 项通过；实际载荷安装生产依赖并启动 HTTP |
| py deploy/fnos/scripts/release.test.py | 8 项通过 |
| YAML、工作流 Bash 与内嵌 Python 语法 | 通过 |
| UTF-8 替换字符及 git diff --check | 通过 |

首次系统测试在更新检查的固定版本夹具处失败；改为跟随 package.json 后，完整系统测试重跑通过。代码业务行为不因该测试修改而改变。

此前页面浏览器验证见 mobile-player-redesign-test-report.md 和 ui-followup-artwork-test-report.md；本次版本与发布配置修改未重跑页面浏览器测试。实际 NAS 安装和外部音源播放未在本机验证。

正式发布由 PR 合并后的 main 提交构建；GitHub 构建与附件校验结果以对应 Actions run 和 BUILD_INFO.txt 为准。

## 发布附件修复

首次正式构建的 ZIP/FPK 和九个桌面构建均通过。GitHub 上传会移除中文附件名，使不同角色的桌面附件变成相同名称，导致草稿上传返回 422。发布流程改为从 artifact 名称生成包含角色、平台和架构的 ASCII 附件名；未公开的部分草稿可清理后重试。独立发布入口核对原 run 的提交、标签和十个成功构建任务，复用其产物并按 Release ID 回读草稿附件，不覆盖正式标签或已公开版本。
