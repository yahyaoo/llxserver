# FN LX Server

基于 [XCQ0607/lxserver](https://github.com/XCQ0607/lxserver) 的飞牛 NAS 版本。原 `lxserver-source` 自定义源码和 `lxserver` 飞牛打包工程已整合到本仓库，运行、测试、构建 FPK 都只需要这个仓库。

保留上游 Apache-2.0 协议、版权和音源实现。

[本仓库发布](https://github.com/yahyaoo/fn-lxserver/releases) · [官方原说明](README_UPSTREAM.md) · [同步服务配置](md/lxserver.md) · [官方帮助文档](https://xcq0607.github.io/lxserver/)

## 已整合的功能

- 播放器“下载与缓存”新增服务器下载，沿用现有音质选择，将音乐保存至后台指定目录。
- 歌词默认内嵌（使用 `music-tag-native`），可选择同名 UTF-8 外部 `.lrc`。不需要额外安装 ffmpeg。
- 后台配置下载目录与命名模板；模板留空时使用播放器现有“歌曲命名方式”，不再附带内部索引 ID。模板支持 `{artist}`、`{title}`、`{album}`、`{platform}`、`{quality}`、`{id}`、`{track}`。
- 已下载歌曲优先本地播放，支持分段请求、用户隔离与服务重启恢复。
- 缓存歌曲位置支持输入服务器绝对路径；后台可编辑用户自定义歌曲目录，通过底部“保存配置”统一保存。
- 更新检查默认关闭，允许修改检查服务器和可选只读令牌。默认地址为 `https://api.github.com/repos/yahyaoo/fn-lxserver/releases/latest`。旧配置中已保存的更新地址会继续保留，可在后台修改。
- 保留已定制的界面、应用图标、飞牛权限配置、安装向导、Linux 换行和执行权限修复。

## 目录

```text
src/                         TypeScript 服务源码
public/                      管理后台和播放器
test/                        源码单元测试及接口系统测试
fnos/
  levis.lxserver/             飞牛模板、图标、权限、安装向导和生命周期脚本
    app/server/              自动生成的应用载荷，不提交 Git
  scripts/                   构建、归档校验、发布工具及测试
  releases/                  按标签命名的发布说明
  md/                        原飞牛截图、图标原稿和制作说明
  dist/                      自动生成的 FPK 和 SHA256，不提交 Git
README_UPSTREAM.md           原官方说明
```

## 从源码运行

建议安装 **Node.js 24 LTS** 与 npm，以便与飞牛的 `nodejs_v24` 一致。以下命令在仓库根目录执行；构建工具无需 RTK，也不需要旁边的旧仓库。

```bash
git clone https://github.com/yahyaoo/fn-lxserver.git
cd fn-lxserver
npm ci --ignore-scripts --no-audit --no-fund
npm run build
npm start
```

`--ignore-scripts` 跳过不必要的 Electron 安装；本项目的原生依赖使用平台对应的预编译包。`npm run build` 编译到 `server/`。构建和启动不会自动查询或下载 fpcalc，普通播放和服务器下载不依赖它。

需使用歌曲指纹识别时，可联网执行 `npm run download:fpcalc`，或自行安装平台对应的 fpcalc 到系统 PATH 或 `public/music/bin/`。手动下载命令会查询 Chromaprint 发布并下载；只有主动执行该命令时才会运行。

默认访问：播放器 `http://localhost:9527/`，后台 `http://localhost:9527/admin`。示例后台密码为 `123456`，请在自己的运行配置中修改。开发时可用 `npm run dev` 直接运行 TypeScript。

推荐使用仓库之外的运行配置，避免把个人密码、音源和目录提交到 Git。PowerShell 示例：

```powershell
New-Item -ItemType Directory -Force D:\lxserver-runtime | Out-Null
Copy-Item .\config.js D:\lxserver-runtime\config.js
# 编辑复制出的配置文件，修改密码和需要的设置
$env:CONFIG_PATH = 'D:\lxserver-runtime\config.js'
$env:DATA_PATH = 'D:\lxserver-runtime\data'
$env:LOG_PATH = 'D:\lxserver-runtime\logs'
$env:DISABLE_TELEMETRY = 'true'
npm start
```

Linux 示例：

```bash
mkdir -p "$HOME/lxserver-runtime"
cp config.js "$HOME/lxserver-runtime/config.js"
# 编辑运行配置后启动
CONFIG_PATH="$HOME/lxserver-runtime/config.js" \
DATA_PATH="$HOME/lxserver-runtime/data" \
LOG_PATH="$HOME/lxserver-runtime/logs" \
DISABLE_TELEMETRY=true npm start
```

后台保存设置会写入实际运行配置和用户数据。私有音源通过现有页面导入，存放在运行数据目录，不随源码或 FPK 分发。

## 构建 FPK

目标为 **x86_64 飞牛 NAS**，依赖飞牛应用 `nodejs_v24`。先从 [飞牛开发者文档](https://developer.fnnas.com/) 获取对应构建系统的官方 **fnpack** SDK，放到 `fnos/scripts/fnpack.exe`（Windows）或 `fnos/scripts/fnpack`（Linux，需执行权限）；也可通过 `FNPACK_BIN` 指定绝对路径。SDK 二进制不提交 Git。

```powershell
# 仓库根目录，Windows PowerShell
npm ci --ignore-scripts --no-audit --no-fund
$env:FNPACK_BIN = 'C:\tools\fnpack.exe'
npm run build:fpk
```

```bash
# Linux
npm ci --ignore-scripts --no-audit --no-fund
FNPACK_BIN=/opt/fnpack npm run build:fpk
```

也可拆开执行 `npm run prepare:fpk`（编译并生成载荷）与 `npm run package:fpk`（调用 SDK、修正并校验归档）。构建仅清理本仓库的生成目录，不访问旧 `lxserver` 或 `lxserver-source`。

输出：

```text
fnos/dist/levis.lxserver-<标签>.fpk
fnos/dist/levis.lxserver-<标签>.fpk.sha256
```

打包时复制生产依赖锁文件；个人 `config.js` 不进入安装包。归档检查包含 Linux 执行权限、换行、选盘字段和服务器下载模块。

## 飞牛安装与配置

1. 在飞牛应用中心安装 `nodejs_v24`。
2. 手动安装本仓库发布的 FPK，按系统向导选择安装盘并设置后台与播放器密码。模板显式声明空 `install_type`，首次安装由飞牛系统提供存储选择；升级沿用已有安装卷，不自动迁移到其他卷。
3. 安装及升级需要联网，通过 `npm ci --omit=dev` 安装锁定的生产依赖。
4. 访问播放器 `http://<NAS-IP>:17000/music`，后台 `http://<NAS-IP>:17000/admin`。

飞牛应用 ID 和运行用户继续使用 `levis.lxserver`，共享空间由系统分配。实际配置为 `<共享空间>/config.js`，用户数据位于 `<共享空间>/data/`，日志位于 `<共享空间>/logs/`。不要把应用安装目录当作音乐保存目录。

后台“服务器下载配置”可填写例如 `/vol6/1000/音乐/洛雪` 的飞牛绝对路径；留空默认保存到 `DATA_PATH/downloads`。应用用户 **levis.lxserver** 必须对目标目录及父目录有遍历和读写权限，在飞牛文件权限页面为该应用授权。NAS 登录账号的权限不能替代应用用户权限。

播放器选择自定义缓存目录后，缓存写入该目录的 `cache/<用户>/`，原“仅下载模式”文件写入 `music/<用户>/`。缓存、自定义歌曲目录和服务器下载目录分别配置，切换位置不会自动搬移旧文件。缓存清理不会删除独立的服务器下载文件。

## 验证

在根目录安装依赖后执行：

```bash
npm run prepare:fpk
npm test
npm run test:fpk
python fnos/scripts/release.test.py
```

`npm test` 包括真实隔离服务、临时配置和本地测试音源的接口系统测试，覆盖下载队列、歌词、Range 播放、鉴权、缓存路径、配置保存、重启和更新检查，不使用个人音源或 NAS 数据。也可分别运行 `npm run test:unit` 与 `npm run test:system`。`npm run test:fpk` 覆盖归档权限与生成载荷；完成 `npm run build:fpk` 后，执行 `npm run test:fpk:system` 验证真实安装包与本仓库文件逐字节一致。实际飞牛向导、NAS 目录 ACL 和设备播放需在 NAS 上验证。

## 发布

每次发布只操作本仓库，使用附注标签关联源码与安装包。准备好发布配置及 `fnos/releases/` 中的发布说明后，执行：

```bash
npm run build:fpk
npm test
npm run test:fpk
npm run test:fpk:system
python fnos/scripts/release.test.py
git add .
git commit -m "chore: prepare release"
python fnos/scripts/release.py --check
python fnos/scripts/release.py
```

发布工具默认使用 `origin`，本仓库为 GitHub。认证优先读取 `GH_TOKEN` / `GITHUB_TOKEN`，其次读取已配置的 Git 凭据，交互运行时也可隐藏输入令牌。令牌须具备仓库代码和发布写入权限。凭据只在进程中使用，不写入源码、安装包或发布说明。

脚本核对发布配置、干净工作区、manifest 与 SHA256，创建附注标签并原子推送当前分支和标签，然后创建草稿、上传 FPK 和 SHA256、回读校验，再公开发布。任何失败都不会自动删除或覆盖远端标签、发布；附件失败留下的草稿需检查后处理。

如需继续发布到自己的 Gitea，在同一仓库配置一个 Gitea 远端，再运行 `python fnos/scripts/release.py --remote gitea --username <账号>`。不再要求两套仓库分别打标签。

原官方桌面与 ZIP 发布工作流保留为手动触发，不在本仓库的标签推送时自动运行；飞牛发布使用上述脚本，不删除历史 Release。

## 协议与上游

本项目遵循 [Apache-2.0](LICENSE)。上游项目：[XCQ0607/lxserver](https://github.com/XCQ0607/lxserver)。原功能、版权、贡献者与使用说明见 [README_UPSTREAM.md](README_UPSTREAM.md)。
