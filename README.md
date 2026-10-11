<div align="center">
  <a href="https://github.com/yahyaoo/llxserver"><img src="docs/assets/banner.png" width="100%" alt="llxserver · 洛洛雪音乐 — 让音乐，自在流动。"></a>
  <br><br>
  <a href="https://github.com/yahyaoo/llxserver/actions/workflows/verify.yml"><img src="https://img.shields.io/github/actions/workflow/status/yahyaoo/llxserver/verify.yml?branch=dev&style=flat-square&label=tests" alt="测试状态"></a>
  <img src="https://img.shields.io/badge/Node.js-%E2%89%A520-22c55e?style=flat-square&logo=nodedotjs&logoColor=white" alt="Node.js ≥20">
  <img src="https://img.shields.io/badge/storage-SQLite-38bdf8?style=flat-square&logo=sqlite&logoColor=white" alt="SQLite">
  <a href="LICENSE"><img src="https://img.shields.io/github/license/yahyaoo/llxserver?style=flat-square&color=818cf8" alt="Apache-2.0"></a>
  <br><br>
  <a href="https://github.com/yahyaoo/llxserver/stargazers"><img src="https://img.shields.io/github/stars/yahyaoo/llxserver?style=flat-square&color=fbbf24" alt="Stars"></a>
  <a href="https://github.com/yahyaoo/llxserver/network/members"><img src="https://img.shields.io/github/forks/yahyaoo/llxserver?style=flat-square&color=38bdf8" alt="Forks"></a>
  <a href="https://github.com/yahyaoo/llxserver/issues"><img src="https://img.shields.io/github/issues/yahyaoo/llxserver?style=flat-square&color=fb7185" alt="Issues"></a>
  <a href="https://github.com/yahyaoo/llxserver/commits/dev"><img src="https://img.shields.io/github/last-commit/yahyaoo/llxserver/dev?style=flat-square&color=a78bfa" alt="最近提交"></a>
  <a href="https://github.com/yahyaoo/llxserver/releases"><img src="https://img.shields.io/github/downloads/yahyaoo/llxserver/total?style=flat-square&color=34d399" alt="下载次数"></a>
  <br><br>
  <strong><a href="docs/index.md">帮助文档</a> · <a href="deploy/README.md">部署与打包</a> · <a href="docs/system-configuration.md">系统配置</a> · <a href="docs/guide/sync-server.md">同步服务</a> · <a href="changelog.md">更新日志</a> · <a href="README_EN.md">English</a></strong>
</div>

---

**洛洛雪音乐（llxserver）**是一个集音乐发现、网页播放、个人音乐库、音乐同步和管理后台于一体的开源音乐产品。通过浏览器即可搜索歌曲、浏览在线歌单和排行榜、收藏喜欢的音乐，并管理播放记录与下载任务。电脑、手机和 NAS 都可以使用；支持直接运行、Docker、飞牛 fnOS，以及 Windows、macOS、Linux 桌面打包。

服务端在 **server**，客户端在 **client**。既可整体交付，也可分别打包、独立运行。所有部署入口集中在 **deploy**。

## 客户端功能与界面预览

以下截图展示当前开发中的客户端界面；发行包的界面和功能以所安装的版本为准。

### 账号与登录

先使用管理员分配的账号密码登录。默认连接当前部署绑定的服务器；选择「远程同步」可输入远端服务器地址和账号密码。支持「记住我」，有效期在后台系统配置调整。右上角提供账号设置、修改密码和退出登录；头像与昵称可修改，用户名只读。

### 在线歌单与音乐发现

多平台搜索、歌手与专辑、在线歌单浏览和收藏，在一个客户端中发现并整理自己的音乐。在线歌单以封面卡片展示，支持按分类和平台筛选；底部播放栏让浏览与听歌同时进行。

<p align="center"><img src="md/screenshots/online-playlists.png" width="100%" alt="樱花粉主题下的在线歌单、底部播放栏与主题快捷面板"></p>

### 搜索与排行榜

顶部搜索框可查找音乐库中的歌曲、歌手和专辑，并提供在线搜索入口。排行榜按平台与榜单切换，展示歌曲、歌手、专辑、时长及音质信息，支持播放全部、收藏和下载。

<p align="center"><img src="md/screenshots/search-suggestions.png" width="829" alt="音乐库搜索建议：歌曲、专辑与在线搜索入口"></p>
<p align="center"><img src="md/screenshots/rankings.png" width="100%" alt="排行榜页面：榜单切换、音质标签与歌曲操作"></p>

### 最近播放与个人音乐库

通过歌单、收藏和音乐库整理歌曲；最近播放页面展示播放次数与最近播放时间，方便回听。支持播放全部和清空记录，最多保留 100 条最近播放记录。

<p align="center"><img src="md/screenshots/recently-played.png" width="100%" alt="最近播放页面：歌曲、播放次数与最近播放时间"></p>

### 歌单与播放

歌单详情、拖拽排序、播放队列、多种播放模式、音质选择和倍速。播放详情页将专辑封面、播放控制与同步歌词集中展示，并提供频谱视觉效果。

<p align="center"><img src="md/screenshots/lyrics-player.png" width="100%" alt="播放详情页：专辑封面、同步歌词、播放控制与频谱效果"></p>

睡眠定时提供 15、30、45、60、90 分钟和自定义时长，倒计时结束后自动停止当前音乐。

<p align="center"><img src="md/screenshots/sleep-timer.png" width="467" alt="睡眠定时弹窗：预设时长与自定义入口"></p>

### 下载与缓存

客户端浏览器下载、服务器下载、缓存管理和本地音乐。下载管理集中展示下载位置、音质、进度和状态，提供批量暂停、继续、重试、补全歌词及清理任务入口。服务器下载支持可配置目录、文件名模板，以及内嵌歌词或同名 UTF-8 LRC；已下载歌曲支持分段播放和重启恢复。

<p align="center"><img src="md/screenshots/download-manager.png" width="100%" alt="下载管理页面：服务器下载、音质、任务状态与批量操作"></p>

### 主题与外观

支持明亮、暗黑、纯白、纯黑和跟随系统的外观模式，提供樱花粉、森之韵、深海谧、雾青等多种主题配色及自定义主题入口。可从右上角快捷切换，也可在设置中调整界面布局、播放背景与视觉特效；同时提供音效、歌词卡片分享、自定义源管理及分组设置。

<p align="center"><img src="md/screenshots/dark-theme-settings.png" width="100%" alt="暗色主题设置：外观模式、主题配色与自定义主题"></p>

### 同步与开放协议

支持兼容的音乐同步客户端与 Subsonic 客户端。管理后台提供用户、音源、下载任务、系统配置、日志及备份入口；管理数据和音乐数据分别保存在两个 SQLite 数据库中。

## 选择运行方式

| 方式 | 入口 | 默认端口 |
| --- | --- | --- |
| Node.js / npm 整体运行 | `npm run build` → `npm start` | 9527 |
| Docker 整体部署 | [compose.yaml](deploy/docker/compose.yaml) | 9527 |
| 服务端与客户端独立部署 | [分离部署说明](deploy/README.md#独立部署) | 服务端 9527、客户端 9528 |
| Docker 两容器部署 | [compose.split.yaml](deploy/docker/compose.split.yaml) | 客户端 9528 |
| Windows / macOS / Linux 桌面 | [桌面打包](deploy/README.md#桌面程序) | 自动选择可用端口 |
| 飞牛 fnOS | [飞牛打包与安装](deploy/README.md#飞牛-fnos) | 17000 |

两端各自提供 Node、Docker、桌面和飞牛入口：`electron:dist:server` / `electron:dist:client` 生成独立桌面程序，`build:fpk:server` / `build:fpk:client` 生成独立飞牛应用。平台和架构参数见部署文档。

### 从源码运行

安装 Node.js（建议 24 LTS）和 npm，在仓库根目录执行：

```bash
git clone https://github.com/yahyaoo/llxserver.git
cd llxserver
npm ci --ignore-scripts --no-audit --no-fund
npm rebuild better-sqlite3
npm run build
npm start
```

打开客户端 `http://localhost:9527/`、管理后台 `http://localhost:9527/admin/`。初始管理密码为 `123456`，首次使用请在后台修改。开发运行使用 `npm run dev`。

业务配置在后台保存到 SQLite。根目录 `config.js` 只提供服务端数据库位置和独立客户端连接配置；环境变量优先。旧业务配置需在后台显式导入，不会自动执行或加载。

```javascript
module.exports = {
  'server.database.adminPath': 'database/admin.sqlite',
  'server.database.musicPath': 'database/music.sqlite',
  'client.serverUrl': 'http://127.0.0.1:9527',
  'client.port': 9528,
  'client.bindIP': '0.0.0.0'
}
```

数据库相对路径基于 `DATA_PATH`，默认是应用根目录的 `data/`。使用 `CONFIG_PATH` 可让两端共用仓库外的引导文件；`CLIENT_CONFIG_PATH` 可单独指定客户端文件。

### Docker

```bash
docker compose -f deploy/docker/compose.yaml up -d --build
# 两个独立容器：
docker compose -f deploy/docker/compose.split.yaml up -d --build
```

### 打包

```bash
npm run build:bundle       # 整体 ZIP
npm run package:server     # 独立服务端 ZIP（先 build）
npm run package:client     # 独立客户端 ZIP（先 build）
```

产物位于 `output/llxserver-{all,server,client}.zip`。解压后分别运行各包中的 `npm start`；服务端包需先安装生产依赖，客户端包只需要 Node.js。设置独立客户端 `config.js` 中的 `client.serverUrl` 指向服务端即可连接。详细步骤见[部署文档](deploy/README.md)。

## 工程目录

```text
server/                 服务端源码：管理、音乐业务、应用装配、公共能力、第三方接口
client/                 客户端：管理页面、音乐界面、PWA、网页静态资源
deploy/                 Node、Docker、桌面、飞牛及第三方部署入口与构建工具
sql/                    管理库与音乐库建表语句
test/                   单元测试与隔离系统测试
docs/                   使用、架构、配置、迁移文档和品牌资源
dist/                   构建输出，不提交
output/                 整体及独立 ZIP 交付包，不提交
config.js               server.xxx / client.xxx 引导配置
```

## 配置与数据迁移

- [系统配置](docs/system-configuration.md)：分组设置、旧 config.js 导入、数据库路径迁移。
- [SQLite 迁移](docs/sqlite-migration.md)：原 JSON 导入、实体与表、双库隔离。
- 客户端设置中的配置迁移可上传兼容 JSON，将歌单及相关数据覆盖写入音乐库。
- 音源、密码、用户数据库和音乐文件属于运行数据，不包含在安装包中。
- 歌曲指纹识别是可选功能，通过 `npm run download:fpcalc` 主动下载，或设置 `FPCALC_PATH` 指向工具所在目录；普通播放、构建和服务器下载无需 fpcalc。

## 测试与贡献

```bash
npm run build
npm run test:unit
npm run test:system
npm run test:fpk
```

系统测试创建临时 SQLite 数据与隔离服务，并解压真实 ZIP 验证整体包、独立服务端包及独立客户端包；不使用个人音源或已有实例。架构说明见 [backend-architecture.md](docs/backend-architecture.md)，贡献约定见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 开源协议

遵循 [Apache-2.0](LICENSE)，保留第三方版权与协议声明。项目继承来源和致谢见程序设置中的“关于”；历史说明保存在 [README_UPSTREAM.md](README_UPSTREAM.md)。
