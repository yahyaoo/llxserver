# 系统配置与数据库位置管理

作者：yahyaoo

## 配置来源

业务配置读写管理库 `admin_config`，不再加载或监听旧 `config.js` 的业务字段。原数据库中以引导文件路径保存的配置会在库内转换为固定作用域 `system-configuration.json`，不重新读取文件。

首次运行使用 `server/defaultConfig.ts` 初始化 SQL 配置；启动时仍按既有规则应用环境变量并保存生效配置。WebDAV 恢复业务文档后，从 SQL 刷新配置。修改旧文件不会改变运行配置，需要在页面显式导入。

`config.js` 使用 `server.xxx` 保存数据库引导、`client.xxx` 保存独立客户端连接配置，环境变量优先：

```js
module.exports = {
  'server.database.adminPath': 'database/admin.sqlite',
  'server.database.musicPath': 'database/music.sqlite',
  'client.serverUrl': 'http://127.0.0.1:9527',
  'client.port': 9528,
  'client.bindIP': '0.0.0.0'
}
```

独立客户端读取同一格式的配置；`SERVER_URL`、`CLIENT_PORT`、`CLIENT_BIND_IP` 和服务端 `SERVER_DATABASE_ADMIN_PATH`、`SERVER_DATABASE_MUSIC_PATH` 优先。后台迁库保存引导时保留客户端字段。详细说明见 [部署文档](https://github.com/yahyaoo/llxserver/blob/dev/deploy/README.md)。

相对数据库路径基于 `DATA_PATH`。引导文件默认位于 `DATA_PATH/config.js`，可由 `CONFIG_PATH` 指定；该文件不存在时读取项目根目录的路径配置，首次启动后写出实际位置。精简已有旧文件前保留原文为 `config.js.legacy.js`，供管理员手动导入。配置导出备份和 WebDAV 同步不会包含引导文件、旧配置副本或实际数据库文件。

## 后台设置目录

后台「系统配置」按「服务与访问」「音乐与缓存」「同步与数据」分组；点击目录只切换显示，未保存的表单内容保留。

新增可配置项包括服务端口、绑定 IP 配置值、匿名统计开关、缓存位置与命名模式、Subsonic 推荐池及转码开关、格式、并发数。其他既有配置继续使用原有控件和保存规则。主 HTTP 服务仍固定监听 `0.0.0.0`；绑定 IP 配置值保留，但不改变当前监听实现。缓存命名模式在启动时应用，播放器已保存的命名设置优先。

启动期参数需要重启，包括主端口、匿名统计、缓存基础位置、Subsonic 服务启用状态及独立端口。数据库位置切换成功后立即使用新连接。

## 导入旧 config.js

在「数据库与迁移」选择 `.js` 或 `.json` 文件，点击「导入旧配置」。最大 2 MB。接受 `module.exports = { ... }` 和 JSON 对象，可包含注释、尾逗号及代理继承开关 `undefined`；文件不能包含函数调用、环境表达式或其他可执行代码。需要先将动态表达式转换为静态值。

只覆盖文件中提供的已知业务字段；未提供字段保留，未知字段及数据库路径忽略。存在 `users` 时一并覆盖管理用户文档。解析、类型或选项校验、数据库事务失败不会部分覆盖配置和用户。导入结果不返回密码或令牌；管理员密码变化时退出旧会话，使用新密码登录。

升级前保留旧配置及数据目录副本。启动不自动导入旧业务配置；已有 SQL 配置继续使用，首次 SQL 初始化的管理员密码来自默认值或 `FRONTEND_PASSWORD`。飞牛首次安装由向导直接初始化 SQL 密码和播放器访问参数，重复安装不覆盖已保存配置。

播放器的「迁移洛雪配置」使用独立接口和播放库，说明见 [SQLite 迁移](./sqlite-migration.md)。系统配置导入不会修改播放库设置或歌单。

## 修改数据库位置

填写两个独立数据库文件路径后保存。目标目录不存在时自动创建，目标文件必须尚未使用；已存在文件会提示异常，避免覆盖或混入其他数据库内容。

1. 对当前库执行 `VACUUM INTO`，复制包含 WAL 已提交记录的一致快照。
2. 打开目标库，执行所属域建表脚本，并进行完整性检查。
3. 两个待迁移库全部准备成功后，交换连接并原子保存引导路径。
4. 关闭旧连接，删除原数据库及 WAL/SHM。文件仍被占用时返回清理警告，新库已经生效。

复制、初始化、完整性检查或引导保存失败时，关闭并清理新库，继续使用旧连接和旧引导路径。本次迁库请求修改的内存配置也恢复；WebDAV 更新和用户目录迁移在迁库成功后执行。仓储对象引用和业务数据作用域保持稳定，外部引用无需重新获取。

避免多个服务进程同时写同一数据库并执行迁库；本服务切换连接不会切换外部进程的连接。手工整体迁移数据目录时先停止使用该目录的服务。

## 接口

接口使用既有 `x-frontend-auth` 管理员认证：

| 接口 | 请求/结果 |
| --- | --- |
| `GET /api/config` | 返回业务设置、实际两库路径、补充字段元数据；不返回用户列表及更新令牌 |
| `POST /api/config` | 原配置正文，可增加 `database.adminPath`、`database.musicPath`；成功返回 `success`、`warning` |
| `POST /api/config/import` | JSON 正文 `{ "content": "module.exports={...}" }`；返回 `imported`、`ignored`、`restartRequired`、`authenticationChanged` |

未认证返回 401；旧配置解析或迁库失败返回 400 及 `message`。原配置目录校验等错误继续使用既有状态码。配置备份导出为可静态导入的业务配置文本，恢复不会改变引导路径。

## 开发验证

执行 `npm run build`、`npm run test:unit`、`npm run test:system`、`npm run test:fpk`。自动测试使用临时目录和独立端口，覆盖 SQL 唯一来源、导入事务、鉴权、两库隔离、WAL 复制、双库失败回滚、数据库路径重启持久化和备份恢复。浏览器补充验证分组草稿、真实保存、文件上传和窄屏布局。
