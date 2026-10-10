/**
 * 修正 Windows fnpack 归档的 Linux 权限，并校验安装所需文件。
 * @author yahyaoo
 */
'use strict';
const zlib = require('node:zlib');

/** 读取 ustar 条目；拒绝损坏的长度和路径，避免处理越界归档。 */
function entries(archive) {
  const result = [];
  for (let offset = 0; offset + 512 <= archive.length;) {
    const header = archive.subarray(offset, offset + 512);
    const name = header.subarray(0, 100).toString().split('\0')[0];
    if (!name) break;
    const prefix = header.subarray(345, 500).toString().split('\0')[0];
    const filename = prefix ? `${prefix}/${name}` : name;
    const rawSize = header.subarray(124, 136).toString().replace(/\0/g, '').trim();
    if (!/^[0-7]+$/.test(rawSize)) throw new Error('无效的归档长度');
    const size = parseInt(rawSize, 8);
    if (!Number.isSafeInteger(size) || offset + 512 + size > archive.length) throw new Error('归档内容不完整');
    if (filename.startsWith('/') || filename.includes('\\') || filename.split('/').includes('..')) throw new Error('无效的归档路径');
    result.push({ filename, header, content: archive.subarray(offset + 512, offset + 512 + size) });
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  return result;
}

/** 修改权限及 manifest 换行后重算 tar 校验和；应用载荷保持逐字节一致。 */
function normalizeArchive(compressed) {
  const archive = zlib.gunzipSync(compressed);
  const blocks = [];
  for (const { filename, header, content: originalContent } of entries(archive)) {
    // Windows fnpack 会重写 manifest 为 CRLF，需要在归档生成后再次规范化。
    const content = filename === 'manifest' ? Buffer.from(originalContent.toString().replace(/^\uFEFF/, '').replace(/\r\n/g, '\n')) : originalContent;
    const directory = header[156] === 53;
    const executable = filename.startsWith('cmd/') && !directory;
    const mode = directory || executable ? 0o755 : 0o644;
    header.write(mode.toString(8).padStart(7, '0') + '\0', 100, 8, 'ascii');
    header.write(content.length.toString(8).padStart(11, '0') + '\0', 124, 12, 'ascii');
    header.fill(32, 148, 156);
    const checksum = header.reduce((sum, byte) => sum + byte, 0);
    header.write(checksum.toString(8).padStart(6, '0') + '\0 ', 148, 8, 'ascii');
    blocks.push(header, content, Buffer.alloc((512 - content.length % 512) % 512));
  }
  return zlib.gzipSync(Buffer.concat([...blocks, Buffer.alloc(1024)]));
}

/** 校验真实 FPK，避免把仅有文件名而无法执行的包交付给 NAS。 */
function validateArchive(compressed, mode = 'all') {
  const list = entries(zlib.gunzipSync(compressed));
  const map = new Map(list.map(entry => [entry.filename, entry]));
  for (const name of ['manifest', 'app.tgz', 'wizard/install', 'config/privilege', 'config/resource', 'cmd/main', 'cmd/install_init', 'cmd/install_callback']) {
    if (!map.has(name)) throw new Error(`安装包缺少 ${name}`);
  }
  if (map.get('manifest').content.includes(13)) throw new Error('manifest 必须使用 Linux 换行');
  const manifest = map.get('manifest').content.toString();
  // 飞牛由空 install_type 提供系统存储位置选择，禁止打包时省略或改成 root。
  if (!/^install_type[ \t]*=[ \t]*$/m.test(manifest)) throw new Error('manifest 必须显式声明空 install_type，允许选择安装存储位置');
  if (!/^platform[ \t]*=[ \t]*x86[ \t]*$/m.test(manifest)) throw new Error('manifest 必须声明 x86 平台');
  for (const entry of list.filter(entry => entry.filename.startsWith('cmd/'))) {
    if (!(parseInt(entry.header.subarray(100, 108).toString(), 8) & 0o111)) throw new Error(`${entry.filename} 缺少执行权限`);
    if (!entry.content.toString().startsWith('#!/bin/bash\n') || entry.content.includes(13)) throw new Error(`${entry.filename} 的脚本格式错误`);
  }
  JSON.parse(map.get('wizard/install').content.toString());
  const privilege = JSON.parse(map.get('config/privilege').content.toString());
  const resource = JSON.parse(map.get('config/resource').content.toString());
  const app = entries(zlib.gunzipSync(map.get('app.tgz').content));
  // 三种交付角色的文件名和飞牛内部身份必须一致，避免仅改名后仍安装成旧应用。
  if (!['all', 'server', 'client'].includes(mode)) throw new Error('打包模式错误');
  const appname = 'llxserver.' + mode;
  const manifestValue = key => new RegExp('^' + key + '[ \\t]*=[ \\t]*(\\S+)[ \\t]*$', 'm').exec(manifest)?.[1];
  if (manifestValue('appname') !== appname) throw new Error('安装包应用标识必须为 ' + appname);
  if (privilege.username !== appname || privilege.groupname !== appname) throw new Error('安装包应用用户必须匹配 ' + appname);
  const shares = resource['data-share']?.shares;
  if (!Array.isArray(shares) || shares.length !== 1 || shares[0].name !== appname || !shares[0].permission?.rw?.includes(appname)) throw new Error('安装包共享目录必须匹配 ' + appname);
  const launch = appname + '.Application';
  const uiEntry = app.find(entry => /^(?:\.\/)?(?:app\/)?ui\/config$/.test(entry.filename));
  const ui = uiEntry && JSON.parse(uiEntry.content.toString());
  if (manifestValue('desktop_applaunchname') !== launch || !ui?.['.url']?.[launch] || Object.keys(ui['.url']).length !== 1) throw new Error('安装包桌面入口必须匹配 ' + launch);
  if (mode === 'client') {
    if (!app.some(entry => entry.filename.endsWith('server/deploy/client/gateway.cjs'))) throw new Error('客户端安装包缺少网关');
    if (app.some(entry => entry.filename.includes('/dist/server/'))) throw new Error('独立客户端包不得包含服务端');
  } else {
    if (!app.some(entry => entry.filename.endsWith('server/dist/server/server/serverDownloads.js'))) throw new Error('安装包缺少服务器下载模块');
    if (mode === 'server' && app.some(entry => entry.filename.endsWith('/client/index.html'))) throw new Error('独立服务端包不得包含客户端首页');
  }
  return { files: list.length, applicationFiles: app.length };
}

module.exports = { entries, normalizeArchive, validateArchive };
