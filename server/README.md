# 服务端

本目录是 TypeScript / JavaScript 服务源码，编译输出在 `dist/server/`。

- `admin`：管理后台控制器、服务、仓储及实体、DTO、VO。
- `music`：音乐、同步、媒体、下载和配置业务，不直接依赖管理域。
- `application`：HTTP 装配、路由、SQLite 引导及静态资源交接。
- `common`：公共模型、HTTP 上下文、配置解析和持久化能力。
- `integrations`：第三方音乐 SDK、更新、WebDAV、自定义源和归档接口。
- `server`、`modules`：原模块兼容导出，保留内部调用路径。

运行和部署方式见 [deploy/README.md](../deploy/README.md)。服务端独立包无需客户端页面，使用资源目录元数据完成原路由及鉴权。原同步协议标识、Cookie 和业务数据库字段保持兼容。
