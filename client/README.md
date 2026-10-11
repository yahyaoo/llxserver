# 客户端

本目录提供管理页面、音乐客户端、设置组件、PWA 和静态资源。连接配置使用应用根目录 `config.js` 的 `client.xxx` 字段，环境变量优先。

整体部署由服务端返回页面。独立部署由 `deploy/client/gateway.cjs` 转发原路由、API 和 WebSocket，读取获准的本地资源；不创建数据库，也不导入服务端源码。

独立客户端包只需要 Node.js，使用 `client.serverUrl` 或 `SERVER_URL` 指定服务端。完整示例见 [deploy/README.md](../deploy/README.md)。
