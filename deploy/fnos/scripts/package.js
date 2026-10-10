/** 飞牛安装包构建及跨平台权限修复。 @author yahyaoo */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { normalizeArchive, validateArchive } = require('./fpk-archive');
const root = path.resolve(__dirname, '..');
const mode = process.argv[2] || 'all';
if (!['all', 'server', 'client'].includes(mode)) throw new Error('打包模式错误');
const appname = mode === 'all' ? 'levis.lxserver' : 'llxserver.' + mode;
const pack = path.join(root, appname);
const dist = path.join(root, 'dist');
fs.mkdirSync(dist, { recursive: true });
const sourceVersion = JSON.parse(fs.readFileSync(path.join(root, '../../package.json'), 'utf8')).version;
const payloadVersion = JSON.parse(fs.readFileSync(path.join(pack, 'app/server/package.json'), 'utf8')).version;
const manifestVersion = fs.readFileSync(path.join(pack, 'manifest'), 'utf8').match(/^version\s*=\s*(\S+)/m)?.[1];
if (sourceVersion !== payloadVersion || sourceVersion !== manifestVersion) throw new Error('版本不同步，请重新执行 npm run prepare:fpk');

// 飞牛在 Linux 上读取包装文件，显式消除 Windows 换行和 BOM。
for (const relative of ['manifest', ...fs.readdirSync(path.join(pack, 'cmd')).map(name => `cmd/${name}`)]) {
  const file = path.join(pack, relative);
  fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n'));
}
const fnpack = process.env.FNPACK_BIN || path.join(__dirname, process.platform === 'win32' ? 'fnpack.exe' : 'fnpack');
execFileSync(fnpack, ['build', '-d', pack], { cwd: dist, stdio: 'inherit' });
const file = path.join(dist, appname + '.fpk');
const archive = normalizeArchive(fs.readFileSync(file));
const checked = validateArchive(archive, mode);
fs.writeFileSync(file, archive);
const checksum = crypto.createHash('sha256').update(archive).digest('hex');
fs.writeFileSync(`${file}.sha256`, `${checksum}  ${appname}.fpk\n`);
const version = fs.readFileSync(path.join(pack, 'manifest'), 'utf8').match(/^version\s*=\s*(\S+)/m)[1];
if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('发布版本必须使用标准 major.minor.patch 格式');
const versionedName = `${appname}-v${version}.fpk`;
fs.writeFileSync(path.join(dist, versionedName), archive);
fs.writeFileSync(path.join(dist, `${versionedName}.sha256`), `${checksum}  ${versionedName}\n`);
console.log('安装包：' + path.join(dist, versionedName));
console.log('FPK 权限、Linux 换行及应用内容校验通过', checked);
