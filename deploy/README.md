# 洛洛雪音乐：部署与交付

本目录集中所有运行、部署和打包方式。命令在仓库根目录执行；源码分别在 `server/` 和 `client/`。

## 引导配置

整体部署共用根目录 `config.js`。独立包分别包含自己的文件，也可将两端 `CONFIG_PATH` 指向同一份外部文件。

```javascript
module.exports = {
  'server.database.adminPath': 'database/admin.sqlite',
  'server.database.musicPath': 'database/music.sqlite',
  'client.serverUrl': 'http://127.0.0.1:9527',
  'client.port': 9528,
  'client.bindIP': '0.0.0.0'
}
```

| 配置 | 环境变量（优先） | 含义 |
| --- | --- | --- |
| `server.database.adminPath` | `SERVER_DATABASE_ADMIN_PATH` | 管理数据库文件路径，相对 `DATA_PATH` |
| `server.database.musicPath` | `SERVER_DATABASE_MUSIC_PATH` | 音乐数据库文件路径，相对 `DATA_PATH` |
| `client.serverUrl` | `SERVER_URL` 或 `CLIENT_SERVER_URL` | 服务端 HTTP/HTTPS 地址，不带路径、凭据或查询参数 |
| `client.port` | `CLIENT_PORT` | 独立客户端端口，默认 9528 |
| `client.bindIP` | `CLIENT_BIND_IP` | 独立客户端监听地址，默认 0.0.0.0 |
| `client.staticPath`（可选） | `CLIENT_PATH` | 客户端资源目录，相对交付根目录 |

`CONFIG_PATH` 指定引导文件；客户端可用更高优先级的 `CLIENT_CONFIG_PATH` 单独指定。修改配置后重启相应进程。独立客户端的本地 `config.js` 由部署者维护，不从网页上传或远程加载。

服务端业务配置只保存在 SQLite。原 `PORT`、`DATA_PATH`、`LOG_PATH`、用户和其他业务环境变量保持原来的覆盖顺序。旧 `database.adminPath` / `database.musicPath` 引导键仅用于已有安装升级，下一次写入改为 `server.xxx`；旧 config.js 的业务字段仍不自动加载。

后台更换库路径采用一致快照复制、验证、切换连接后删除旧库。保存引导会保留共用文件的 `client.xxx` 项。数据库路径环境变量在重启后优先，要持久迁移请同步修改这些变量。

## Node 与 npm

```bash
npm ci --ignore-scripts --no-audit --no-fund
npm rebuild better-sqlite3
npm run build
npm start
```

建议 Node 24 LTS。默认客户端 `/`、后台 `/admin/`，端口 9527；数据在应用根目录 `data/`，日志在 `logs/`。初始管理密码为 `123456`，首次使用在后台修改。开发运行用 `npm run dev`；`npm run prd` 使用 [PM2 配置](node/ecosystem.config.cjs)。

可将运行数据放到交付包之外：

```powershell
$env:DATA_PATH = 'D:\llxserver-runtime\data'
$env:LOG_PATH = 'D:\llxserver-runtime\logs'
$env:CONFIG_PATH = 'D:\llxserver-runtime\config.js'
npm start
```

```bash
DATA_PATH=/srv/llxserver/data LOG_PATH=/srv/llxserver/logs CONFIG_PATH=/srv/llxserver/config.js npm start
```

## 独立部署

```bash
npm run build
npm run package:all
npm run package:server
npm run package:client
```

| ZIP | 内容 | 解压后启动 |
| --- | --- | --- |
| `output/llxserver-all.zip` | 编译服务、客户端、生产依赖清单和启动入口 | `npm ci --omit=dev` → `npm start` |
| `output/llxserver-server.zip` | 编译服务、SQL、资源目录元数据，无客户端首页 | `npm ci --omit=dev` → `npm start` |
| `output/llxserver-client.zip` | 客户端、连接配置和网关，无服务代码或数据库 | 修改 `client.serverUrl` → `npm start` |

客户端包只需要 Node.js，不需要 npm 安装第三方依赖。服务端包自动启用 `CLIENT_MODE=external`；源码或整体包拆分运行时显式设置这个变量。浏览器访问客户端地址，例如 `http://client-host:9528/`，无需 CORS 配置。同步设备可以直连服务端。

独立客户端 `config.js` 示例：

```javascript
module.exports = {
  'client.serverUrl': 'http://server-host:9527',
  'client.port': 9528,
  'client.bindIP': '0.0.0.0'
}
```

可通过环境变量覆盖：

```powershell
$env:SERVER_URL = 'http://server-host:9527'
$env:CLIENT_PORT = '8080'
npm start
```

客户端进程将请求交给服务端原路由和鉴权；获准的静态资源由客户端读取，API、音频、Cookie、SSE 与 WebSocket 原样转发。服务端只带资源目录元数据、公开版本和 PWA 模板，不读取客户端源码。两个包应来自同一次构建，同时更新，保证资源目录与内容一致。

客户端不创建数据库；服务端管理与音乐业务仍各用一个独立 SQLite 库。整体包可单进程运行，或启用外部模式后启动 `node deploy/client/gateway.cjs`。

## Docker

```bash
docker compose -f deploy/docker/compose.yaml up -d --build
docker compose -f deploy/docker/compose.split.yaml up -d --build
```

第一条启动整体容器，端口 9527。第二条启动两个容器，客户端端口 9528，连接配置为 `SERVER_URL=http://server:9527`。卷保存两个库及运行数据；`LLX_DATA_PATH` 可指定宿主目录。反向代理 HTTPS 时需转发 WebSocket Upgrade，并为音频与 SSE 关闭缓冲。

独立服务端和整体镜像分别使用 [Dockerfile](docker/Dockerfile) 的 `server`、`all` target。客户端见 [client.Dockerfile](docker/client.Dockerfile)。

## 桌面程序

入口 [main.js](desktop/main.js)，配置 [electron-builder.yml](desktop/electron-builder.yml)。

```bash
npm ci
npm run electron:dist
npm run electron:dist:server -- --win --x64
npm run electron:dist:client -- --win --x64
```

Windows 支持安装和便携版，macOS 支持 DMG，Linux 支持 AppImage 与 deb。独立角色也使用同一目标矩阵，可将 `--win` 换为 `--mac` 或 `--linux`，在相应系统构建。独立服务端为 API / 同步托盘程序，独立客户端为连接指定服务端的窗口程序；客户端不打包 SQLite 或服务源码。后端在随包 Node 22.22.3 子进程中运行，SQLite 保持 Node ABI；Electron 负责窗口与托盘。运行时按目标架构下载官方文件并校验 SHA256，原生依赖在目标操作系统准备，缺少预编译包时需要对应编译工具。独立角色输出在 `dist-electron/server/`、`dist-electron/client/`。跨系统签名、原生依赖与安装应在相应系统验证。

整体桌面包保留托盘、常驻播放、开机运行、存储选择和端口选择逻辑。独立服务端只提供后台托盘，独立客户端使用窗口并在关闭窗口时退出网关。原 appId 用于已有安装识别，显示名和图标统一为洛洛雪音乐。

独立桌面客户端首次启动会将默认 `config.js` 复制到 Electron 用户数据目录；修改其中 `client.serverUrl` 后重启。也可在启动程序前设置 `CLIENT_CONFIG_PATH` 或 `CONFIG_PATH`，直接使用指定的外部配置文件。服务端支持 `CONFIG_PATH`、`DATA_PATH`、`LOG_PATH` 和 `PORT`，环境变量优先；后端子进程随桌面程序退出。

## 飞牛 fnOS

目标 x86_64 飞牛 NAS，依赖 `nodejs_v24`。将官方 fnpack 放到 `deploy/fnos/scripts/fnpack.exe`（Windows）或 `deploy/fnos/scripts/fnpack`（Linux），或设置 `FNPACK_BIN`。

```powershell
$env:FNPACK_BIN = 'C:\tools\fnpack.exe'
npm run build:fpk
npm run build:fpk:server
npm run build:fpk:client
npm run test:fpk:system
```

`prepare:fpk` 编译并生成载荷，`package:fpk` 调用 SDK 和校验归档，输出 `deploy/fnos/dist/`。个人配置与数据库不进入包。安装向导初始化 SQL，不再要求填写播放器和管理端密码。

合体包、独立服务端首次安装创建播放器账号 `admin`，默认密码 `123456`；安装后可在账号设置修改密码。管理后台初始访问密码仍为 `123456`。升级保留已有账号、密码和业务配置；旧安装的账号列表为空时，升级自动补建默认播放器账号。

合体包的应用 ID、应用用户和共享空间名称统一为 `llxserver.all`，FPK 文件名使用同一标识。客户端 `http://NAS-IP:17000/music`，后台 `http://NAS-IP:17000/admin/`。共享空间 `config.js` 保存引导，`data/` 保存数据，`logs/` 保存日志。为音乐目录授权时应选择应用用户 `llxserver.all`。

旧 `levis.lxserver` 安装与新合体包属于不同应用身份，原数据不会自动迁移。已有安装应先备份配置与数据，迁移到新应用后重新核对目录权限；两个应用默认使用相同端口，不能同时监听。

独立服务端 ID 为 `llxserver.server`，默认端口 17001；独立客户端 ID 为 `llxserver.client`，默认端口 17002。客户端安装向导填写服务端 URL，写入共享空间 `config.js` 的 `client.serverUrl`。两个独立应用可同时安装，各有运行用户和共享空间；服务端管理页面通过客户端的 `/admin/` 访问。地址调整在客户端引导文件或环境变量中完成，重启客户端生效。

## 可选工具与其他部署

指纹识别工具通过 `npm run download:fpcalc` 主动下载到 `client/music/bin/`，或用 `FPCALC_PATH` 指定目录。独立服务端包可携带已有工具；客户端包不携带二进制。普通播放、服务器下载和构建无需 fpcalc。

群晖入口保存在 `deploy/packaging/synology-spk` 外部子模块；本仓库不改写第三方内容，使用前应按照新交付布局核对。

## 验证

```bash
npm run build
npm run test:unit
npm run test:system
npm run test:fpk
py deploy/fnos/scripts/release.test.py
npm run test:desktop:system
```

系统测试解压真实 ZIP，从解压目录启动两端及整体包；生产依赖从当前锁定安装复制到临时包，客户端完全不依赖 node_modules。测试仅跳过公网 SDK 预热，路由、鉴权、数据库与响应均运行真实代码。

实际 Docker、桌面安装及飞牛设备测试依赖对应环境；本次结果见 [测试报告](../docs/product-migration-test-report.md)。
