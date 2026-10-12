#!/usr/bin/env node
/** 从当前仓库编译并生成飞牛应用载荷。 @author yahyaoo */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const ROOT = path.resolve(__dirname, '../../..');
const PACK = path.join(ROOT, 'deploy/fnos/llxserver.all');

/** 递归复制应用文件，不依赖旁边的源码仓库。 */
function copyDir(source, destination) {
  fs.mkdirSync(destination, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const src = path.join(source, entry.name);
    const dst = path.join(destination, entry.name);
    if (entry.isDirectory()) copyDir(src, dst);
    else if (entry.isFile()) fs.copyFileSync(src, dst);
    else throw new Error(`应用文件不应包含链接：${src}`);
  }
}

/** 仅清理模板中的生成目录；个人配置不进入安装包。 */
function preparePayload(root, pack, mode = 'all') {
  root = path.resolve(root);
  pack = path.resolve(pack);
  if (!['all', 'server', 'client'].includes(mode) || pack !== path.join(root, 'deploy/fnos', 'llxserver.' + mode)) throw new Error('打包目录必须位于当前仓库指定飞牛模板');
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
  if (!/^\d+\.\d+\.\d+$/.test(pkg.version)) throw new Error('源码版本必须使用标准 major.minor.patch 格式');
  if (lock.version !== pkg.version || lock.packages[''].version !== pkg.version) throw new Error('package.json 与锁文件版本不一致');
  for (const relative of mode === 'client' ? ['dist/client'] : mode === 'server' ? ['dist/server', 'index.js', 'deploy/node/start.cjs'] : ['dist/server', 'dist/client', 'index.js', 'deploy/node/start.cjs']) {
    if (!fs.existsSync(path.join(root, relative))) throw new Error(`缺少 ${relative}，请先编译当前仓库`);
  }
  const payload = path.join(pack, 'app/server');
  fs.rmSync(payload, { recursive: true, force: true });
  fs.mkdirSync(payload, { recursive: true });
  if (mode !== 'client') {
    copyDir(path.join(root, 'dist/server'), path.join(payload, 'dist/server'));
    copyDir(path.join(root, 'deploy/node'), path.join(payload, 'deploy/node'));
    fs.copyFileSync(path.join(root, 'index.js'), path.join(payload, 'index.js'));
  }
  if (mode !== 'server') copyDir(path.join(root, 'dist/client'), path.join(payload, 'client'));
  // 独立服务端不携带界面，但歌曲聚合必须使用同一构建的共享规则。作者：jingyh
  if (mode === 'server') {
    fs.mkdirSync(path.join(payload, 'client/music/js'), { recursive: true });
    fs.copyFileSync(path.join(root, 'dist/client/music/js/song_identity.js'), path.join(payload, 'client/music/js/song_identity.js'));
  }
  if (mode === 'client') copyDir(path.join(root, 'deploy/client'), path.join(payload, 'deploy/client'));
  // NAS 的业务配置由安装向导初始化到 SQL；载荷不包含开发机的密码或数据库路径。
  fs.writeFileSync(path.join(payload, 'config.js'), '/** SQLite 路径由共享空间引导文件保存。 @author yahyaoo */\nmodule.exports = {};\n');
  const distPkg = { name: mode === 'client' ? 'llxserver-client' : pkg.name, version: pkg.version, private: true, engines: pkg.engines, dependencies: mode === 'client' ? {} : pkg.dependencies };
  fs.writeFileSync(path.join(payload, 'package.json'), JSON.stringify(distPkg, null, 2) + '\n');
  // 保留生产依赖的锁定版本，让 NAS 安装与本地验证使用同一依赖树。
  lock.packages[''] = distPkg;
  fs.writeFileSync(path.join(payload, 'package-lock.json'), JSON.stringify(lock, null, 2) + '\n');
  const manifestPath = path.join(pack, 'manifest');
  const manifest = fs.readFileSync(manifestPath, 'utf8').replace(/\r\n/g, '\n');
  if (!/^version\s*=/m.test(manifest)) throw new Error('manifest 缺少版本');
  fs.writeFileSync(manifestPath, manifest.replace(/^version\s*=.*$/m, `version         = ${pkg.version}`));
  return payload;
}

/** 使用本地 Node 编译，构建工具无需安装 RTK。 */
function main(mode = 'all') {
  if (!fs.existsSync(path.join(ROOT, 'node_modules/typescript/bin/tsc'))) throw new Error('请先在仓库根目录执行 npm ci --ignore-scripts');
  fs.rmSync(path.join(ROOT, 'dist/server'), { recursive: true, force: true });
  for (const args of [
    ['deploy/scripts/update-build-hash.js'],
    ['node_modules/typescript/bin/tsc', '--project', 'tsconfig.json'],
    ['node_modules/tsc-alias/dist/bin/index.js', '-p', 'tsconfig.json'],
    ['deploy/scripts/copy-sql.js'],
    ['deploy/scripts/client-metadata.cjs'],
    ['deploy/scripts/build-client.cjs'],
  ]) {
    console.log('[build] node ' + args.join(' '));
    execFileSync(process.execPath, args, { cwd: ROOT, stdio: 'inherit' });
  }
  const pack = path.join(ROOT, 'deploy/fnos', 'llxserver.' + mode);
  console.log('[build] 应用载荷生成完成：' + preparePayload(ROOT, pack, mode));
}

if (require.main === module) main(process.argv[2] || 'all');
module.exports = { ROOT, PACK, preparePayload };
