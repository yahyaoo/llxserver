# 快速开始

洛洛雪音乐支持直接运行、Docker、Windows / macOS / Linux 桌面和飞牛 NAS。最新运行步骤见 [README](https://github.com/yahyaoo/llxserver/blob/dev/README.md)，所有部署与打包入口在 [deploy](https://github.com/yahyaoo/llxserver/blob/dev/deploy/README.md)。

默认客户端 `http://localhost:9527/`、后台 `/admin/`。独立客户端默认端口 9528，根目录 config.js 的 `client.serverUrl` 指定服务端，环境变量 `SERVER_URL` 优先。业务设置在后台保存到 SQLite，两个业务库独立。初始管理密码为 `123456`，首次使用请修改。
