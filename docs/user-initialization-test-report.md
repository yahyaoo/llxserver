# 数据库与账号默认初始化

验证日期：2026-10-10。

## 行为

- 服务启动时沿用 SQLite 仓储的自动建库、建表和系统默认配置初始化。管理库与播放库支持引导文件中配置的独立路径。
- 公共账号 `_open` 在监听前初始化默认文档；失败时启动入口报错，不继续启动未初始化的服务。
- 新账号通过 `/api/user/login` 首次成功登录时，先初始化文档并等待歌单加载完成，再签发会话。旧入口 `/api/user/verify` 同样初始化。
- 播放器设置使用现有客户端默认值，包括默认收藏入口、FLAC 音质、缓存并发 3；单元测试逐项核对服务端和客户端默认设置。
- 音效默认均衡器为零、音调倍率为 1、关闭环绕及混响；收藏及屏蔽的歌手、专辑为空数组；主题沿用粉色及系统明暗模式，最近播放默认保留 100 首。
- 已保存文档、空数组、用户修改和旧文件迁移数据保持原值及修改时间，只补齐缺失文档。播放库初始化使用事务，中途失败回滚，可重新尝试。
- 错误密码不创建默认数据。远程登录由远端初始化，本地不创建同名账号文档。初始化失败返回 HTTP 500 且不签发会话。

## 修改文件

- `server/music/service/configuration/UserInitializationService.ts`：账号默认值及文档事务初始化。
- `server/user/index.ts`：用户空间首次加载时初始化。
- `server/music/service/AuthenticationService.ts`：登录和旧认证入口等待初始化，失败不签发会话。
- `server/application/http/HttpServer.ts`：监听前初始化公共账号。
- `test/userInitialization.test.cjs`、`test/userInitialization.system.test.cjs`：默认值、幂等、迁移、回滚、认证及真实空库部署测试。
- `test/helpers/accountRuntime.cjs`：支持不导入业务配置，验证实际默认部署行为。
- `test/musicExperience.system.test.cjs`：最近播放上限的 SQL 断言限定到对应账号，兼容公共账号默认数据。
- `package.json`：将新增测试纳入现有单元和系统测试命令。

## 验证结果

| 命令或检查 | 结果 |
| --- | --- |
| `rtk npm run test:unit` | 174 项通过 |
| `rtk npm run test:system` | 15 项通过 |
| `rtk node --test test/musicExperience.system.test.cjs` | 1 项通过 |
| `rtk git diff --check` | 通过 |
| UTF-8 与新增测试命令注册检查 | 通过 |

新增测试使用临时数据目录、真实 SQLite 和源码 HTTP 服务，验证新账号创建、错误密码、首次登录持久化、修改后重启、重复登录，以及未导入业务配置的指定路径空库启动。单元测试另验证写入失败时事务回滚及远程账号隔离。

完整系统测试首次运行暴露了音乐体验测试的 SQL 查询没有限定账号，修正后整套重跑通过。未另行执行 `npm run build`、FPK 构建或实际部署、发布；完整系统测试包含自身的 ZIP 打包启动验证。
